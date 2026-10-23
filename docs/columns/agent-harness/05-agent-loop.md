---
title: 第 05 章：构建有终止条件的 Agent 循环
description: 用有限步骤连接模型结算、工具执行和完整结果提交，解释成功、工具拒绝、失败与取消的不同语义。
date: '2026-10-23'
category: 智能体工程
tags: [Node.js, 有限循环]
series:
  order: 5
---

# 第 05 章：构建有终止条件的 Agent 循环

本章只讨论一个核心概念：**Agent 循环的每一次继续都必须有明确原因，每一次运行都必须有可观察的终止条件。** 能再次请求模型，不代表应该无限请求模型。

真实问题是助手第一次只返回“读取 guide.md”的工具调用，读到文件后仍需再请求一次模型，才能形成回答。但模型也可能不断重复相同调用；工具被拒绝时，它可能继续尝试；用户中途取消时，程序不能仍把下一步排进队列。循环要分清这些状态，而不是简单地写 `while (true)`。

[下载完整项目](/downloads/agent-harness.zip)。命令从 `agent-harness/` 示例根执行，使用 Node.js 22 原生 ESM，无新依赖。生产运行调用真实 Ollama；已有 provider 替身是测试装置，不是自动代答机制。本章不会以测试字符串证明模型推理质量。

## 5.1 先把 step、运行和消息组分开

本项目一个 step 是一次 `provider.complete()` 加上该回复请求的全部工具执行。一次用户运行可能需要多个 step：模型先请求工具，工具结果进入消息，再由下一次模型请求解释证据。

session 的 `turn` 记录则保存一个已结算 assistant 与其全部 tool 结果，它不是本项目一次完整用户运行的同义词。完整运行用同一 `runId` 下的 begin、若干 turn 和 end 表达。明确术语，才能正确理解“已经写入工具组”和“整次运行成功”不是同一个事实。

继续原因只有一个主要分支：已结算 reply 含有工具调用，需要把相应结果送回模型。终止成功的分支是 reply 不含工具调用，此时内容成为最终答案。模型说“我完成了”没有特殊控制权，真正判定来自回复结构。

失败和取消也不是成功的变体。步数耗尽、模型流失败、上下文超限、持久化失败应抛错；signal 被中止时标记取消。自然语言输出看起来完整，也不能覆盖这些程序状态。

## 5.2 完整 agent 核心代码

所有核心控制流位于 `src/agent.mjs`：

<<< @/../examples/agent-harness/src/agent.mjs{js}

`SYSTEM` 限定助手只读、要求路径证据、声明文件内容不可信，并要求证据不足时说明缺口。这是模型行为指引，不是执行权限实现。实际可执行能力仍来自第四章的固定工具。

`runAgent()` 接收 provider、tools、session、prompt、signal 和事件回调。默认 `maxSteps = 8`，允许安全整数一到三十二；prompt 必须是非空白字符串，UTF-8 字节不超过八千。输入不合格或开始前已取消时，不会先建立一次运行再去请求模型。

循环内部没有直接使用 `fetch` 或 `readFile`。它消费服务契约，控制执行顺序，因此可以用确定性依赖核对状态，而不依赖某个模型能否稳定选择工具。

## 5.3 运行先获得身份和输入事实

通过参数检查后，代码创建随机 `runId`，记录起始时间，将完成的历史与当前 user 消息组合。随后等待 begin 追加成功，再发布 `run.start`。如果最初会话写入失败，不应继续发起模型请求。

`send()` 给每个运行事件加入同一 runId，使终端或 Web 能把文本、工具和最终状态关联起来。这个 id 是运行关联标识，不是模型工具调用 id；后者仍用 provider 回复中的 `call.id` 与 `tool_call_id` 配对。

事件属于观测层，不是模型消息。`text.delta` 可频繁发布，但不逐条进入 session；`tool.end` 表达执行情况，不作为模型角色发送。模型收到的是已结算 assistant 与对应 tool 内容。

当前 `emit` 是可信同步回调，应该快速且不抛错。代码没有把任意观察者异常隔离成独立告警，也不等待异步回调。扩展日志或 UI 时，应保持这个调用约定，不让展示层成为隐式执行策略。

## 5.4 每一步的顺序不能随意调整

循环先检查取消，再扣除工具定义占用的字节预算，由 `selectContext()` 选择消息。选择成功后发布 step.start，调用 provider，并用 onDelta 将可见文本转成 text.delta 事件。provider 返回以后，再检查取消。

```js
const reply = await provider.complete(selected, tools.definitions, {
  signal, onDelta: (text) => send({ type: 'text.delta', text, step }),
});
signal?.throwIfAborted();
const settled = [reply];
```

为什么返回后还检查？signal 可能在网络调用即将结束时触发；若只在调用前检查，后续工具仍可能启动。边界上的检查降低取消与执行之间的窗口，但不意味着普通文件系统操作可被任意时刻抢占。

`settled` 首项是完整 assistant，不是 delta。工具循环只遍历结算回复中的 `tool_calls`，所以流式参数没有形成合法调用之前不会执行。顺序是“请求、结算、执行、提交”，不是“收到名字、马上执行、之后再拼参数”。

上下文预算的精度与裁剪政策在第七章展开。本章只需知道，预算失败会终止当前运行，不通过随意丢弃半条工具消息继续请求，有限步骤也不替代输入大小约束。

## 5.5 工具拒绝如何成为下一步证据

每个调用先发布 tool.start，再解析 arguments，调用工具 execute。成功时保存工具返回的字符串；参数或工具失败时生成统一错误内容，同时用 `ok: false` 发布 tool.end。

```js
settled.push({ role: 'tool', tool_call_id: call.id, content });
send({ type: 'tool.end', name: call.function.name, ok, step });
```

配对的核心是 id，而不是工具名称。一个 assistant 可以连续请求同名工具读取不同文件，每个调用仍需要自己的结果。session 后续校验结果数量、顺序和调用 id，不允许只把“某工具成功了”作为模糊记录。

普通拒绝可以交给模型修正，因此不会立即结束整次运行。例如 path 拼错，下一步模型可以根据错误重新请求；越界路径被拒绝后，模型也可以改为解释权限不足。工具边界不会因为需要继续而放宽。

取消不能按普通拒绝处理。catch 内再次检查 signal，已取消时重新抛出，不构造一条让模型继续纠错的工具结果。否则用户停止操作后，循环可能仍消耗模型资源，甚至继续执行工具。

当前两个工具串行执行，便于理解取消顺序和完整组提交。它没有并行调用调度器，也没有把 maxSteps 当成总工具次数：一步可能包含多个调用。增加并行策略时必须重新定义结果配对、取消和错误收集，不只是把 for 改成 Promise.all。

## 5.6 完整组提交后才决定继续

工具循环结束后，代码将 settled 一次追加为 turn，等待持久化，再把相同消息加入内存 messages。这保证下一步模型请求只依赖已经提交的完整工具组，而不是“先使用，稍后再保存”。

```js
await session.append({ type: 'turn', runId, messages: settled });
messages.push(...settled);
if (!reply.tool_calls?.length) {
  await session.append({ type: 'end', runId, status: 'completed' });
  send({ type: 'run.end', status: 'completed', steps: step + 1,
    durationMs: Math.round(performance.now() - start) });
  return reply.content;
}
```

没有工具调用时，必须再等待 completed end 记录成功，才返回内容。在途文本可能此前已显示，但返回 Promise 与 completed 记录代表更强的成功边界。入口不能只依据“有 text.delta”判断完成。

若工具执行中途取消，本组还没追加，已发生的读取不会变成下一次历史；若早先步骤已经追加而后来运行失败，这些事实可能仍在磁盘，但整次运行被 history 过滤。持久日志保留了发生过的内容，模型历史只采用符合恢复策略的内容。

这个策略不是外部副作用事务。当前工具只读，取消后不需要还原文件；若未来加入写工具，已经写入的文件不会因为 run 失败就自动回滚。应另行设计授权、幂等键、结果未知与恢复策略，不能延用“过滤历史”就声称撤销了操作。

## 5.7 有限步数与时间限制分别解决什么

for 循环最多执行 maxSteps 次 provider 调用。最后一步若仍有工具调用，执行并保存结果后，循环耗尽，抛出 `Agent step limit reached`。它不会为了让状态好看，伪造一个无需工具的最终答案。

步数限制防无限推理循环，不能防一次 provider 永远等待。调用方还需要传入有时间边界的 signal。随包 CLI 使用九十秒超时，并组合 SIGINT；直接调用 `runAgent()` 时，函数不会自行创建超时控制器。

异常分支尝试记录 failed 或 cancelled end，发布最终状态，再重新抛错。如果记录异常结束也失败，返回 AggregateError 保留运行原因与持久化原因。不能保证磁盘故障下总能写出结束记录，也不能把“尝试写入”描述为持久化成功。

输入检查、最初 begin 追加以及 run.start 位于 try 之前，因此不是任意调用都一定产生 run.end。正常运行生命周期和启动前失败需要分开观测。这一实际边界比“无论如何只有一个终止事件”的笼统承诺准确。

还要区分继续和重试。工具请求被拒绝后，把错误结果送给模型，是携带新消息的下一步；provider 遇到短暂 HTTP 错误而重新发送同一请求，则是本步内部的有限重试。二者输入、状态和计数不同。maxSteps 约束 complete 调用次数，不直接等于底层 HTTP 请求次数。

沿着正常时间线核对，第一步的 assistant 带读取调用，工具结果随后加入完整组；第二步请求末尾应能看见这条 tool 内容，第二个 assistant 不含工具调用，于是运行完成。如果第二步没有结果却仍能给出答案，应该先查消息组是否正确追加，而不是立刻调大模型参数。

沿着拒绝时间线核对，工具失败也有配对结果，下一步模型可以解释无法读取或改正参数。若它反复提交同一个越界路径，边界继续拒绝，最终由步数限制终止。程序不需要判断模型主观上是否“有进展”，也不能为了完成率自动扩大权限。

有限循环也不是正确性证明。模型完全可能在第一步就给出不带工具的无依据回答，程序仍按结构结束。系统提示要求收集证据，行为测试验证工具链路，而真实模型验收检查它有没有真的收集证据。结构上的可终止与内容上的可信必须分别成立。

## 5.8 与固定版本上游对照

参考提交为 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`，根包版本 `0.2.1-alpha.5`，核验日期 2026-10-17。[上游架构的 Turn flow](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/architecture.md#turn-flow) 定义 step 为一次模型请求加工具执行，turn 可以包含多个 step。

上游 [agent-loop 源码入口](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/core/agent-loop/src/index.ts) 创建 scoped agent，管理 agent/session 注册和 teardown；[Agent 实现](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/core/agent-loop/src/agent.ts) 属于这一完整运行体系。教学项目没有 live agent registry、inbox、waterfall 拦截和持续运行的 handle。

上游模型请求有准备、路由绑定、冻结输入和会话事件记录，工具通过 guarded pipeline 执行。教学循环保留“结算后执行、结果后继续”的主要顺序，但以普通 JSON 消息和三个事件类型表达，并未实现完整请求重建。

尤其不能把本项目的 `turn` 存储组当成上游 `turn/start` 到 `turn/end`。两套词汇的粒度不同。理解职责关系可以帮助阅读上游，混用术语则会让测试和恢复策略全部失真。

### 终止与交付增加独立验证门

2026-10-23 对照 [Claude Agent SDK TypeScript result 契约](https://platform.claude.com/docs/en/agent-sdk/typescript)，SDK 的结束消息仍需区分成功与错误。本章的 `return reply.content` 只是最小循环的结构性终止，不证明任务完成、引用正确或文件保持不变。

扩展练习：为只读任务设置一个独立 verifier，检查回答引用是否属于实际读过的文件，并比较任务前后的工作区摘要；分别输入合法终态、无依据终态和中途失败的部分文本。后两者不能通过交付门。验证器只检查所声明的业务不变量，不让模型自报“成功”替代外部证据；四产品终态映射见[第 73 章](./73-version-governance)。

## 5.9 验证循环而不是猜测回答

从示例根运行已有确定性测试：

```sh
node --test --test-name-pattern="agent executes|cancellation and maximum" test/harness.test.mjs
```

一个用例让 provider 第一次请求真实文件工具，第二次检查工具内容已进入消息，再返回测试文本；断言历史角色是 user、assistant、tool、assistant，并核对事件与持久化。另一个让 provider 持续请求工具，确认两步耗尽后失败且没有完成历史，也检查预取消拒绝。

这些替身验证的是循环状态，不是模型回答。工具读取是真实文件操作，但固定 provider 的选择不会证明 Ollama 在同样问题上一定调用工具。也没有覆盖所有取消时刻或磁盘故障，不能把基础断言推广成完整故障矩阵。

真实模型准备后可以运行：

```sh
ollama list
SESSION_ID=loop MODEL=qwen3:4b npm start -- "读取 guide.md，结合文件给出运行边界"
```

排错时先看最终状态。步数超限检查工具是否重复请求；工具拒绝检查参数和文件政策；模型连接失败检查服务是否启动。验收需确认每次继续有工具结果依据、最终成功消息无需工具、取消后不开始新步骤。实际模型未启动时，不能声称这条真实生成路径已经验证。

---

深化阅读：[控制策略与验证门](./14-agent-control-patterns)、[Inbox 与 Steering](./42-input-concurrency)、[长任务与 Goal](./59-long-running-goals)。有限循环之外还需明确定义目标、阶段与中途输入的影响。

上一篇：[第 04 章：工具边界](./04-tool-boundaries.md) · 下一篇：[第 06 章：会话回放](./06-session-replay.md)
