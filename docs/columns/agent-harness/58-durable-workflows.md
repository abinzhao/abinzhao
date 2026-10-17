---
title: 第 58 章：脚本工作流、结果重放与失败语义
description: 区分脚本编排与耐久工作流，按步骤身份和副作用状态决定结果复用、重试或人工协调。
date: '2026-10-17'
category: 智能体工程
tags: [Agent Harness, 工作流, 幂等]
series:
  order: 58
---

# 第 58 章：脚本工作流、结果重放与失败语义

## 58.1 能运行脚本不等于能从崩溃恢复

脚本工作流把多个步骤、条件分支和并行任务写成程序；耐久工作流还需要在进程退出后恢复合法状态，判断哪些步骤已经完成，哪些结果可以复用，哪些动作必须先协调。持久保存一份脚本文本只能恢复定义，不能恢复执行；保存最终输出也不能说明中间副作用发生了几次。

DeepSeek 固定 workflow 是可选 capability，不是基础 agent loop 的一部分。它接收脚本及独立 JSON meta，后者在执行前校验，不能通过运行脚本求取身份。`phases` 只是观察者使用的进度词汇，不构成 DAG 或执行事务。工具层保存的开始、成员结算和结束记录支持展示中断证据，不能由此推导任意脚本可以跨崩溃自动续跑。

原第 1–12 章没有耐久步骤工作流。扩展 `labs/workflow.mjs` 独立实现 DAG、步骤预算、任务修订与磁盘检查点恢复，没有接入基础循环。README 明确它采用临时文件后 rename，没有 `fsync`、跨进程锁、结果签名或代码哈希；所以实验可以从磁盘恢复，不保证断电耐久性或多实例安全。

## 58.2 给步骤稳定身份和明确状态

步骤身份应包含工作流定义版本、task ID、实现 revision 和相关输入。仅用步骤序号缓存结果，在插入新步骤或修改输入后会复用错误产物。实现语义变化必须更新 revision；若代码哈希未纳入契约，不能假设缓存自动知道代码已改。恢复前先验证整个 DAG 和检查点版本，再判定结果是否符合当前任务。

| 状态 | 可以如何恢复 | 必须保留的事实 |
| --- | --- | --- |
| pending | 尚未开始，可按策略启动 | 输入与 revision |
| running | 纯计算可重算，副作用先协调 | 已启动但结果未知 |
| completed | 校验身份后复用结果 | 完整结果与提交版本 |
| failed | 分类后决定重试或阻塞 | 失败阶段与副作用确定性 |

“失败”不足以判断是否可重试。参数错误、权限拒绝和定义错误通常不应重复；临时服务不可用可能允许有限重试；外部动作后的连接中断则可能已经生效。结果为 null 也可能是合法 JSON，不能用 truthy 判断完成。重复使用结果应是显式分支，不是跳过执行后伪造一条新成功日志。

## 58.3 自包含的检查点重放实验

下面的 Node.js 22 示例用内存 Map 表示检查点，不写文件、不调用远程服务。外部动作只增加本地计数，用故障注入展示“效果已发生而完成记录未提交”的窗口。它不依赖扩展 labs 的 API。

```js
import assert from 'node:assert/strict';

const checkpoint = new Map();
let effects = 0;
let calculations = 0;
async function step(task) {
  const saved = checkpoint.get(task.id);
  if (saved && saved.revision !== task.revision) throw new Error('REVISION_MISMATCH');
  if (saved?.status === 'completed') return saved.value;
  if (saved && ['running', 'failed'].includes(saved.status) && !task.replaySafe) {
    throw new Error('SIDE_EFFECT_UNKNOWN');
  }
  checkpoint.set(task.id, { revision: task.revision, status: 'running' });
  try {
    const value = await task.run();
    checkpoint.set(task.id, { revision: task.revision, status: 'completed', value });
    return value;
  } catch (error) {
    checkpoint.set(task.id, { revision: task.revision, status: 'failed' });
    throw error;
  }
}
const compute = { id: 'compute', revision: '1', replaySafe: true,
  run: async () => { calculations += 1; return { answer: 42 }; } };
assert.deepEqual(await step(compute), { answer: 42 });
assert.deepEqual(await step(compute), { answer: 42 });
assert.equal(calculations, 1);
await assert.rejects(step({ ...compute, revision: '2' }), /REVISION/);
const external = { id: 'external', revision: '1', replaySafe: false,
  run: async () => { effects += 1; throw new Error('CONNECTION_LOST'); } };
await assert.rejects(step(external), /CONNECTION_LOST/);
await assert.rejects(step(external), /SIDE_EFFECT_UNKNOWN/);
assert.equal(effects, 1);
console.log(JSON.stringify({ calculations, effects, blockedReplay: true }));
```

`replaySafe` 必须由可信任务适配器根据真实行为确定，模型不能自报安全。程序只展示 completed 的复用和未知副作用阻塞，未实现 DAG 调度、并发锁、持久提交或服务端幂等查询。即使同一键只在内存执行一次，重启、存储故障和多实例仍会破坏这个局部结论。

## 58.4 真实失败案例：动作成功，结果提交前崩溃

DeepSeek 固定 schedule 文档给出具体的跨存储崩溃窗口：Session inbox 已持久化，但 task receipt 尚未写入，重启后可能再次投递。这个事实同样说明一般工作流的“调用外部系统，再保存完成记录”无法自然获得 exactly-once。若把两步反过来，先保存完成再调用，则可能记录成功但动作从未发生。

对于发送通知、创建发布单或支付一类动作，正确方案是服务端幂等键与结果查询，或可靠 outbox、事务协调及业务去重。幂等键必须绑定稳定业务身份，相同键不同请求应报冲突，不能每次重试生成新键。即使采用 at-least-once 投递加去重，也应说明去重保留窗口与服务端契约，不能笼统宣称整个系统 exactly-once。

无法确认的副作用应进入 blocked 或 unknown，保留操作 ID、目标和安全诊断，交给人工或服务端查询协调。补偿操作是新的业务动作，可能失败，也需要授权；取消不能撤销已经发出的请求。真实系统中错误归类比重试次数更重要，把所有异常都放进循环会重复扩大损害。

## 58.5 脚本错误与成员失败分开

固定 DeepSeek workflow 对错误参数、未支持选项、上限触发和启动故障采用 fatal 错误，组合器必须重新抛出，不能全部转换成 null。否则拼错一个字段会在结果数组里静默消失，最终报告仍声称审查全部文件。成员运行失败与脚本契约错误应分别统计，输出必须记录未完成项。

workflow result 区分 completed、cancelled、error，消费者必须调用 dispose 等待脚本与子资源清理。该固定 PTC 引擎没有整个运行的 elapsed deadline，不能假设默认会在指定时间结束。进度事件为只读观察，不应给监听者隐式 cancel 或 dispose 权限；日志展示也不能决定实际执行是否完成。

## 58.6 实验与可观察验收

1. 运行示例，确认纯计算只执行一次且结果复用，revision 变化被拒绝。
2. 观察外部动作计数为一，第二次调用被未知副作用门禁阻止；不能把阻塞写成业务成功。
3. 从示例项目运行 `npm run labs`，按 README 将检查点读回，确认已完成步骤不重做、修订变化不接受旧记录。
4. 注入“动作发生后连接丢失”，恢复应阻塞；随后通过业务查询或人工判断解决，不直接重置检查点。
5. 分别检查定义错误、预算耗尽、成员失败、取消与清理异常，最终报告完整保留每类未完成事实。

完成标准是恢复与当前定义匹配、只复用可信完成结果、不确定副作用不盲目重放。实验只具备 README 声明的单进程恢复能力，既不是完整耐久工作流引擎，也不保证 exactly-once 或断电后数据不丢失。

## 58.7 官方来源与边界

DeepSeek Harness 参考固定为 `0.2.1-alpha.5`、提交 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`，不得从事件持久化推导未承诺的执行恢复功能。

- [固定 workflow 请求与失败语义](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/workflow.md)
- [固定 schedule 跨存储重复窗口](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/schedule.md)
- [固定 workflow 工具目录](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/tool-catalog.md)
- [固定持久化架构](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/architecture.md)

上一章：[第 57 章：Teams、任务 DAG 与工作树隔离](./57-teams-worktrees)

下一章：[第 59 章：长任务、Goal 与跨窗口交接](./59-long-running-goals)
