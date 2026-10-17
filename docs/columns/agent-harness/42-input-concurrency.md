---
title: 第四十二章：Inbox、Steering 与并发调度
description: 用输入身份、claim 边界和独占调度区分排队、纠正与上下文注入，避免重复消费和误判单条任务完成。
date: '2026-10-17'
category: 智能体工程
tags: [Agent Harness, Inbox, 并发调度]
series:
  order: 42
---

# 第四十二章：Inbox、Steering 与并发调度

Agent 正在执行工具，用户又发来“先停下，改查另一个文件”。新消息应该立即取消工具、进入下一步，还是等待下一轮？把所有输入追加到一个数组并不能回答这些问题。输入有身份、投递边界与唤醒语义，claim 后的请求也需要保持不可变。本章建立队列的状态契约，要求新要求不丢失、不重复消费，也不假装能修改已经发出的模型请求。

## 概念与数据流

Follow-up 表示后续普通输入，Steering 是对近邻 step 的纠正，Inject 是材料注入。是否唤醒 driver 与投递到哪个边界是两种选择，不能从一句“添加上下文”推断必须开始新 turn。输入进入 inbox、被 claim、被准入、形成 user/message、产生回答，是不同事件。排队函数返回成功只说明收件，不说明任务完成，更不能用会话整体 idle 直接代表某条消息的业务结果。

```text
输入 id -> next-turn 或 next-step 队列 -> driver claim 批次
        -> pre-step 接受/改写/拒绝 -> 日志准入 -> 冻结请求
claim 后的新输入 -> 留在队列 -> 后续边界消费
cancel -> 活跃请求中止 + 按明确策略保留或丢弃 pending
```

Claim 必须原子移除当前候选批次，随后任何新输入都不能被旧批次的清理覆盖。拒绝的消息如何处理需要明确：可以结束本次 claim，不进入模型，也不自动重入队列；否则同一条被拒绝消息会形成无限循环。替换或删除队列项应按 messageId 定位，不能依靠 UI 显示行号，因为并发插入会改变位置。

## 自包含 Node.js 22 实验

以下程序通过确定性队列模拟验证投递与 claim，不运行并发线程、不发模型请求。教学字段不是上游 Inbox 方法签名。插入发生在两个同步 claim 之间，代表真实实现需要保护的边界；程序不会假称已经实现跨进程消息队列。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
const inbox = { nextTurn: [], nextStep: [], awake: false };
function send(message, target, wake) {
  assert.ok(['nextTurn', 'nextStep'].includes(target));
  assert.ok(![...inbox.nextTurn, ...inbox.nextStep].some(x => x.id === message.id), 'duplicate pending id');
  inbox[target].push(structuredClone(message));
  inbox.awake ||= wake;
}
function claim(firstStep) {
  const batch = inbox.nextStep.splice(0);
  if (firstStep && inbox.nextTurn.length) batch.push(inbox.nextTurn.shift());
  return batch;
}
send({ id: 'context', text: 'fresh file facts' }, 'nextStep', false);
assert.equal(inbox.awake, false);
send({ id: 'user', text: 'inspect' }, 'nextTurn', true);
assert.throws(() => send({ id: 'user' }, 'nextStep', true));
const first = claim(true);
send({ id: 'correction', text: 'read another file' }, 'nextStep', true);
assert.deepEqual(first.map(x => x.id), ['context', 'user']);
assert.deepEqual(inbox.nextStep.map(x => x.id), ['correction']);
const rejected = claim(false);
assert.equal(rejected.length, 1);
assert.equal(inbox.nextStep.length, 0);
assert.equal(claim(false).length, 0);
console.log('inbox claim boundary: passed');
NODE
```

程序的 awake 是简化标记，不包含真实 driver 状态、唤醒合流、取消与 receipt 映射。并发实现应避免“检查空队列之后、设置 idle 之前”新输入到达却没有再次唤醒的竞态。可以用单 owner 调度与边界后复查实现，但不能依赖任意 setTimeout 解决。结果归属也要按 id 与 claim 记录追踪，不能把最近一条 assistant 输出自动分配给最近插入的消息。

## 已确认的上游机制

DeepSeek Harness `0.2.1-alpha.5` 固定提交将 send 暴露投递边界与唤醒选择，followup、steer、inject 是固定预设别名。Inbox 的两个 pending 列表以 MessageId 为身份，拒绝跨列表重复 id；结构变更有耐久 spliced 事实。driver 在 step 边界移除 next-step 输入，首步再取一个 next-turn 消息，之后经过 pre-step 决策，不是多个线程直接改写模型 messages。

已确认的 inject 不主动唤醒 idle driver，正在运行时会在后续可 claim 的边界进入；已 claim 的请求可能不会看到后来注入。Steering 进入近邻 step，但不是强行重写 in-flight 请求。用户若明确要求停止正在进行的操作，需要取消机制而非仅发 steer；取消仍不能撤销外部已接受动作。文案应让用户知道消息排队与停止执行的区别。

上游 whenIdle 观察整个 Agent，包括维护任务以及其后释放的唤醒工作；running 也可跨多个连续 turn。因此 followup 返回或 agent/status idle 不天然构成单条任务 receipt。调用者只有明确拥有从投递到 idle 的区间，才能把它当一次运行。并发客户端需要专门结果关联，不能把共享 idle 当“我的那条消息已经正确完成”的依据。

## 失败案例与调度取舍

失败案例之一是读取队列快照之后 await 模型，再执行 queue.length = 0。期间用户插入的新消息被清空，界面已经显示发送成功，执行端却永久丢失。应在等待前 claim 自己拥有的批次，结束时只结算那批身份。另一种失败是 pre-step 拒绝后自动原样重排队，下一次又拒绝，形成不消耗模型却持续占用 driver 的热循环。

工具并发也要有所有权边界。两个只读工具可能允许重叠执行，但两个修改父会话状态的工具通常不能。是否 concurrency-safe 由实现契约决定，不能只靠工具名称含 read 推断。输出可以按完成顺序到达，最终日志或模型结果顺序仍应符合调度协议。Cancellation 必须传给所有已启动任务，尚未启动项则记录明确未执行状态，不能伪造成功结果。

维护任务与普通输入需要协调。手动压缩可能运行在 idle 维护阶段，新用户消息应留在 inbox，维护完成后再开始，不与选中表面范围并发覆盖。长期独占也会造成饥饿，必须设置时间与批次数量限制。原教学项目的 Web busy 是直接拒绝重叠请求，不是这种输入排队系统；两种产品行为需要分别解释与测试。

投递界面应展示 pending、claimed、rejected、cancelled 与 settled，而不是所有状态都叫“处理中”。如果新要求只影响下一 step，界面可以说明当前操作仍在进行；如果用户取消并保留 inbox，也要说明下一次唤醒可能继续消费旧 pending。明确状态能减少用户重复点击，却不代替服务端去重。MessageId 也只代表输入身份，不证明内容一样或外部业务幂等。

队列容量也属于收件契约。达到上限时应明确拒绝并让客户端知道未收件，不能先回成功再丢弃最旧消息。客户端重发应使用稳定输入身份，服务端可以区分重复投递与内容修订；如果用户确实修改问题，应创建新身份或显式替换，而不是悄悄复用旧结果。这样才能让消息去重与用户最新要求同时成立。

## 实验验收与实现边界

完整命令应证明不唤醒注入留在队列，用户消息唤醒，重复 pending id 拒绝，claim 后新纠正留待后续消费。继续实验可删除一个特定 id，要求不影响其他 pending；拒绝一个批次后不能自动重跑；在 idle 转换边界插入输入，要求最终仍被执行。真实验收还需多客户端、取消竞态、饥饿与资源清理，内存程序不覆盖这些运行问题。

原 1–12 章 `local-harness-tutorial` 是单进程有限循环，Web 入口采用 busy 拒绝并发，没有全部上游 Inbox、Steering 与 maintenance 语义。本章自包含程序检验消息调度契约；下载包 `labs/workflow.mjs` 只包含顺序 DAG 与检查点机制，不包含 Inbox 或 Steering。生产消息系统还需要容量、背压、访问控制与结果关联，不能由一个数组实验推断完整并发功能已经实现。

## 官方固定来源

- [DeepSeek Harness：Agent 与 Inbox 契约](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/core.md)。
- [DeepSeek Harness：claim 与准入生命周期](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/agent-lifecycle.md)。
- [DeepSeek Harness：工具并发分类源码](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/core/tools/src/index.ts)。

上一章：[第四十一章：格式迁移](./41-format-migrations) · 下一章：[第四十三章：文件编辑](./43-file-editing)
