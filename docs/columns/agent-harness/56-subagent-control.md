---
title: 第 56 章：子 Agent 消息、等待与取消
description: 区分消息接纳、任务结算与资源静止，建立可等待且不越权的子任务控制协议。
date: '2026-10-23'
category: 智能体工程
tags: [取消, 子任务控制]
series:
  order: 56
---

# 第 56 章：子 Agent 消息、等待与取消

## 56.1 三种回执不能互相替代

子任务控制至少需要消息回执、执行结果和清理结果。消息回执说明目标 inbox 已接纳输入，不表示模型读过或执行了它；执行结果说明本次任务为何结束，不保证后台资源已释放；清理结果说明所拥有的进程和子任务已经停止，不表示已发生副作用被撤销。一个统一的 done 布尔值会把这些事实混在一起，产生提前交付和资源泄漏。

消息也需要真实发送者身份。不能相信 payload 内的 senderId，而应由宿主从调用通道或精确 live Agent 得到身份，再验证目标关系。普通父子委派可限定相邻 Agent；Team 消息则有另一套成员关系。知道会话 ID 不等于有权向它发送输入或取消工作，旧的同名对象也不能取得新 activation 的控制权。

## 56.2 持久身份与活跃执行分开

DeepSeek 固定 subagent 文档区分持久 child Session 与一次活跃 activation。本地 child 同时最多拥有一个 live activation，后续输入可以继续或从持久记录恢复；外部 provider 只拥有单次执行，不支持 follow-up。管理器通过 exact identity、父子关系和启动容量控制操作，不能根据看见历史记录就推断目标仍可运行。

| 操作 | 返回意味着什么 | 不意味着什么 |
| --- | --- | --- |
| send message | inbox 接纳了输入 | 模型完成该输入 |
| wait | 观察到指定结果或变化 | 自动唤醒或批准任务 |
| interrupt | 发出了取消请求 | 目标已经静止 |
| dispose 或 drain | 所拥有资源清理已结算 | 外部副作用被回滚 |

`running`、`inactive` 是活动状态，不是业务任务完成状态。一个 inactive 子会话可以等待新输入，也可能刚因错误停下。界面应分别显示 activation、结束原因与产物验证结果。等待应限定对象、超时和取消范围，避免父任务等待自己，或多个子任务互相等待形成控制层死锁。

## 56.3 自包含的取消结算实验

以下 Node.js 22 示例只有一个协作式异步任务，不启动真实 Agent、不创建进程、不写文件。`AbortController` 发出请求，`result` 等待任务进入 finally 并完成清理；输出演示的是状态顺序，不是操作系统进程终止保证。

```js
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

const controller = new AbortController();
const trace = [];
let state = 'running';
let cleaned = false;
const result = (async () => {
  trace.push('started');
  let outcome;
  try {
    await delay(1000, undefined, { signal: controller.signal });
    outcome = 'completed';
  } catch (error) {
    if (error.name !== 'AbortError') throw error;
    outcome = 'aborted';
  } finally {
    trace.push('cleanup');
    await Promise.resolve();
    cleaned = true;
    state = 'settled';
  }
  return { outcome, cleaned };
})();
function interrupt() {
  if (state !== 'running') return;
  state = 'cancelling';
  trace.push('cancel-requested');
  controller.abort();
}
interrupt();
assert.equal(state, 'cancelling');
assert.equal(cleaned, false);
const settled = await result;
assert.deepEqual(settled, { outcome: 'aborted', cleaned: true });
assert.deepEqual(trace, ['started', 'cancel-requested', 'cleanup']);
interrupt();
assert.equal(state, 'settled');
console.log(JSON.stringify({ state, trace }));
```

取消调用返回时，任务还没有完成 finally，因此立即显示“所有资源已释放”是错误的。示例只有可响应 signal 的 timer；如果函数不观察 signal，取消不会自动打断它。真实 subprocess 还需要管理进程组或平台终止范围、终止升级与输出管道，并确认子孙进程收敛，而不是只给顶层进程发一个信号。

等待超时也不等于取消底层任务。若用 Promise.race 让父任务先得到超时，另一个 Promise 仍可能继续执行；调用者必须按契约决定继续观察、请求取消或移交所有权。不能在超时后丢弃句柄，然后以没有看到新输出为由判定任务已停止。

## 56.4 真实失败案例：中断父子之一，其他子孙仍运行

固定 DeepSeek tool catalog 对 `interrupt_agent` 明确说明，它不等待目标停下，目标启动的子 Agent 仍会运行。本地待处理 inbox 也可以保留，之后由新输入唤醒。若父任务只调用 interrupt，随后立即释放隔离实例或报告整个任务树停止，就会遗漏仍有工作与资源所有权的子孙。

正确清理需要明确区分中断当前 turn 与销毁整棵拥有的 activation 树。固定管理器的 drain 操作会关闭相关 admission、等待启动中的资源并 child-first 释放；这个保证不能从普通 interrupt 回执推导。原基础教程的单进程取消与本章 timer 实验都没有实现这样的真实任务树，必须保留能力限制。

另一种真实失败是消息刚被接纳后发送者就断开，调用方因为没有收到回执而重复发送。固定 Team 文档说明新消息没有 outbox 重发去重；消息接纳成功与处理完成不是一个原子事件。外部业务若需要避免重复，应提供消息身份、持久入队与消费语义，不能因看到 MessageId 就宣称 exactly-once。

## 56.5 不让错误输出伪装成成功

子结果的结束原因至少区分 completed、aborted、error、预算耗尽和拒绝；部分输出可以保留，但不应升级为成功。结构化结果捕获失败与普通文本输出是不同事实。清理错误也应独立报告：保留已经取得的任务结果，同时让资源释放的失败对宿主可见，避免一个异常把另一项证据覆盖掉。

固定 DeepSeek subagent 诊断要求避免工具输入、文件内容、环境值和原始协议 payload，并限制大小。控制日志因此适合记录 activation 身份、状态和稳定原因码，不适合复制整个 child stderr。消息中的“用户同意”仍是内容，不能作为新的 approval；父任务的 steering 也只能在子任务既有权限内生效。

预算同时控制总启动数、并发数、深度、输出与等待时间。并发上限只限制活跃容量，不能阻止一万个连续的小任务；深度上限也不能替代总量预算。一个任务失败时，不应无条件取消所有兄弟任务，除非父工作流事先规定失败联动；共享 mutable controller 容易误伤独立工作。

## 56.6 实验与可观察验收

1. 运行示例，确认取消之后先是 cancelling，等待 result 后才成为 settled，且 cleanup 只出现一次。
2. 在相同协作式任务中把 interrupt 放到完成之后，确认它不复活任务或修改已有结果。
3. 对真实 provider 分别验收启动前取消、运行中取消和清理失败，记录每个阶段的资源所有者。
4. 消息测试分别检查接纳、处理和最终结果，不把超时自动解释成消息未入队；重试规则需另行定义。
5. 检查父任务退出后是否还有子孙与后台 job，只有 drain 或相应平台证据才能支持任务树静止结论。

完成标准是回执语义准确、控制权限明确、所有句柄有人等待或释放。`npm run labs` 的独立实验不创建真实子 Agent，此章自包含代码只验证协作式取消；操作系统终止、产品续传与多 Agent 消息仍需目标运行时验证。

## 56.7 当前消息发送与重新激活的边界

2026-10-23 复核 [Claude Agent Teams](https://code.claude.com/docs/en/agent-teams)：消息报告 sent 以写入接收者 mailbox 文件成功为界，写入失败返回错误；sent 仍不是接收者已经处理。当前进程内消息可以重新激活已停止的 in-process teammate 并恢复其保存会话，但 `/resume` 后不按同一路径恢复旧 teammates。定义来自未信任目录时还可能不重新应用，不能由旧名称推断完整工具和指令已经恢复。

对照 [DeepSeek rc.2 Team](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/subsystems/agent-team.md)，新消息仍没有 outbox 重发去重，历史 mailbox 记录只用于可读 replay，不自动重新投递。操作练习将原 trace 拆成 accepted、processed、settled、cleaned 四项；正常验收是一次取消请求和一次清理，异常验收是接纳后断线、旧 activation 控制与清理失败均不伪造结果。排错先核对消息及 activation 的准确身份，再判定是否可恢复，不能因 wait 超时重新创建未知效果的任务。

## 56.8 官方来源与边界

DeepSeek Harness 固定 `0.2.1-alpha.5`、提交 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`；下面契约属于该版本，不代表所有 provider 都支持继续会话。

- [固定 subagent 消息与生命周期](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/subagent.md)
- [固定控制工具与中断范围](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/tool-catalog.md)
- [固定 Team 消息边界](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/agent-team.md)
- [Claude Code 子任务运行与恢复](https://code.claude.com/docs/en/sub-agents)
- [Codex multi-agent 控制](https://developers.openai.com/codex/multi-agent/)

上一章：[第 55 章：子 Agent 委派与上下文继承](./55-subagent-delegation)

下一章：[第 57 章：Teams、任务 DAG 与工作树隔离](./57-teams-worktrees)
