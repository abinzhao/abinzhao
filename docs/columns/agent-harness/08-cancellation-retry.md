---
title: 第八章：取消传播与受限重试
description: 把取消信号传到 fetch 和工具，只重试指定的流前 HTTP 拒绝，避免重放部分回答。
date: '2026-10-17'
category: 智能体工程
tags: [Agent Harness, Node.js, 取消与重试]
series:
  order: 8
---

# 第八章：取消传播与受限重试

用户按下取消，页面不再显示文字，但后台模型仍在生成，工具仍在读取文件，进程也迟迟不能退出。另一种问题恰好相反：连接断开后程序自动重试，用户收到两段重叠回答，已经发生的工具操作却被执行了第二遍。取消和重试看似是提高体验的选项，实际上都在改变运行的生命周期。

本章的核心知识点是**明确一次运行何时停止，以及什么时候仍可以安全再请求一次**。取消要传播到真正执行工作的地方；重试则必须有确定的准入条件，不能把所有异常都包装成“再来一次”。本例宁可暴露失败，也不把未结算的流伪装成成功回答。

参考资料核验于 **2026-10-17**，固定为 DeepSeek Harness `0.2.1-alpha.5`、提交 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`。上游使用 TypeScript 与 Cordis 插件框架。本章讲解的 `AbortSignal` 调用链属于独立 Node.js 22 ESM 示例，不是上游 SDK 的取消或重试 API。

## 一、取消不是修改一个状态字符串

“已取消”应当是运行事实的结果，而不是按钮点击时先写下的文案。如果只令前端 `loading = false`，服务器和模型仍不知道用户已离开。可靠取消需要一个由入口拥有的信号，并把它交给每个等待点和执行点，让这些组件共同结束当前工作。

Node.js 的 `AbortController` 发出取消，`AbortSignal` 表示取消状态。取消不是线程强杀；它要求被调用组件遵守协议。`signal.throwIfAborted()` 是同步检查点，传给 `fetch` 则能中止请求和响应体读取。一个完全忽略 signal 的自定义 provider，不能因为上层有控制器就自动停止。

当前 CLI 有一个进程级控制器，监听一次 `SIGINT`；单次运行另有 90 秒超时。入口通过 `AbortSignal.any()` 合并两者，任何一个先取消，都能让该运行看到同一个最终信号。Web 模式则把进程信号与每个 HTTP 请求自己的取消、超时组合起来。

这里的九十秒是整个运行的期限，不是每次模型调用都重新获得九十秒，也不是连接重试预算。工具循环和等待都消耗同一运行时间。CLI 的单次模式创建超时信号，Web 请求在运输层创建超时信号，不能因为两种入口共享 runner 就把超时来源说成完全相同。

## 二、沿真正的调用链传递 signal

runner 每一步开始前检查取消，调用 provider 时传入 signal，执行每个工具前再次检查，调用工具时也传入 signal。模型返回之后还有一次检查，防止“收到完整结果”和“用户已经取消”之间的时序差让程序继续提交成功。

```js
const reply = await provider.complete(selected, tools.definitions, {
  signal, onDelta: (text) => send({ type: 'text.delta', text, step }),
});
signal?.throwIfAborted();
```

provider 内部把相同 signal 放进 `fetchImpl()` 参数，并在消费每个 SSE 帧时检查它。解析器结束或失败后会取消 reader、释放锁。控制请求、控制消费和释放读取资源是三个环节，只加一个入口检查不能覆盖请求已经进行中的情况。

完整 provider 同时包含取消、响应验证和受限重试，需按实际位置阅读：

<<< @/../examples/agent-harness/src/provider.mjs{js}

文件工具也接收 signal，但不能把这种接收等同于所有文件系统调用都原生支持中止。`createTools().execute()` 在入口检查，`read_file` 在有界读取后再次检查；`realpath`、`open` 和 `handle.read` 本身没有传入 signal。取消可能要等当前文件操作返回，之后才停止继续使用结果。

文件句柄在 `finally` 中关闭，不依赖运行是否成功。读取上限限制了正常情况下的工作量，但它不是硬实时取消保证；底层文件系统卡住时，signal 不会强行杀死操作。替换工具时应沿用检查和清理责任，而不是只让参数列表看起来支持取消。

普通工具校验错误会变成安全的 tool 错误结果，供模型修正请求；取消不能被这个兜底吞掉。runner 的工具 `catch` 会先执行 `signal?.throwIfAborted()`，信号已取消时立即退出整轮，而不是发送“工具参数错误”后继续请求模型。

## 三、取消后的历史与屏幕可以不同

用户已经看见的 `text.delta` 是临时输出，不等于已经完成的模型消息。只有 provider 收到完整结算、工具组配齐，并且运行最终完成，历史投影才会纳入这一轮。取消时屏幕可能仍留着半段文字，磁盘也可能保留 begin 或已结算 turn，但下一次正常历史不包含这次取消的运行。

runner 捕获错误后，以 `signal.aborted` 区分 `cancelled` 和 `failed`，追加 end 记录，再发出 `run.end`。超时也是由 signal 导致的停止，因此会话状态按取消处理；CLI 的错误退出码又会区分是否由进程 `SIGINT` 控制器触发，不能只看一个状态就推断所有出口行为。

如果连失败结尾也写盘失败，代码会抛出 `AggregateError`，同时保留原始运行错误和持久化错误。这时不能声称取消已经可靠落盘，也可能没有正常的结束事件。清理、状态提交、通知用户是有先后顺序的，文件系统故障不能靠一句“已取消”盖过去。

取消还有与成功结算竞争的临界窗口。runner 在模型返回后检查 signal，但不会在每次磁盘等待结束后再次检查；若取消发生在最后的 turn 或 completed 记录追加期间，当前实现仍可能结算为 completed。不能承诺任意时刻按取消都能撤销已经进入最终提交阶段的成功。

验收取消时，应安排一个明确仍在等待模型或工具的运行，再观察信号和结束状态；不要用“回答刚结束后点了取消”推断整条信号链无效。需要更严格的完成竞争规则时，先定义提交边界并写对应失败用例，再调整状态机，而不是让界面自行覆盖磁盘事实。

本例没有回滚已经发生的外部副作用。现在工具只有只读文件能力，因此风险较小；以后加入写文件或发送消息，取消也不能撤销此前已经完成的操作。那类工具必须另行设计幂等、确认和恢复策略，不能借用这里的取消链宣称具备事务回滚。

## 四、重试条件必须收窄到代码事实

当前策略只重试**已经收到的 HTTP 429、502、503、504 响应**，而且位于开始读取模型 SSE 之前。第一次符合条件时取消错误响应体，等待 200 毫秒，再发送一次相同请求；总共最多两次尝试，即一次重试。

```js
if (![429, 502, 503, 504].includes(response.status) || attempt === 1) break;
await response.body?.cancel();
await delay(200, undefined, { signal });
```

429 通常表示限流，几个网关或服务不可用状态可能是短暂拒绝。这里不是判断这些请求“必然没在服务端做过任何工作”，而是采用很窄的协议边界：尚未接纳一个可消费的成功流，也尚未触发本地工具执行，因此不会重放已显示的模型流和本地工具副作用。

第一次收到 401、400、500 等其他状态，不重试；第二次即使仍是 503，也不再尝试。代码没有读取 `Retry-After`，没有指数退避、抖动或重试事件，也没有环境变量调整重试次数。固定等待只是教学实现，不能描述成完整限流控制系统。

更重要的是，`fetchImpl()` 自己抛出的网络异常不在重试 `catch` 中。连接拒绝、请求中断、重定向错误都直接向上传播。不能因为测试名里出现 transient，就把正文写成“所有网络错误自动重试”。资格依据是实际收到的状态，不是异常听起来是否临时。

等待的 `delay()` 也收到 signal。若用户在两次尝试之间取消，等待会被中止，不应在取消后继续发起第二个模型请求。取消优先于重试，这使“再尝试一次”仍然属于同一运行，而不是悄悄启动一个脱离用户控制的新任务。

## 五、成功响应之后为什么不重放

一旦获得可读取的成功 SSE 响应，后续解析不再进入那段重试循环。缺少 `[DONE]`、JSON 损坏、模型错误帧、回复被截断或工具调用结算不合法，都属于当前尝试失败。即使恰好尚未向用户显示文字，当前代码也不会自动再次请求。

因此“未开始流”比“尚未看到文字”更准确。模型可能先输出工具增量或其他帧，暂时没有文字；这并不让该流重新获得重试资格。协议状态不能靠 UI 有没有内容来判定，更不能靠 `reply.content.length === 0` 决定是否安全重放。

收到部分文字后断流，程序保留临时显示但拒绝返回一个已结算 reply，runner 随之结束失败。用户可以显式发起新运行，不过那是新的生命周期，应有新的 runId，不是自动拼接旧流。本例也没有续传位置、断点恢复或“从上一 token 继续”的协议。

不要在 runner 外再加一层无条件重试来“提高成功率”。runner 包括模型调用、工具执行和会话追加，重做整个函数可能重复多步行为，也会改变日志结构。需要重试时，首先明确重试的是一次尚未接纳的模型请求，还是一个已经产生事实的工作过程。

## 六、无需模型的可观察验证

下载[完整源码](/downloads/agent-harness.zip)，在 example 根目录执行：

```sh
node --version
node --test --test-name-pattern="transient HTTP|truncated SSE|cancellation and maximum" test/harness.test.mjs
node --test --test-name-pattern="disconnect cancels" test/web.test.mjs
```

现有测试让第一次 HTTP 返回 503，第二次返回含 `[DONE]` 的 SSE，断言尝试次数为二。截断流测试让响应只有部分文字，断言 provider 拒绝结算。runner 测试覆盖步数上限和开始前已取消；Web 测试用真实本机 HTTP 连接证明断开会使运行信号取消。

这些测试各有范围。开始前取消不证明文件读取中的实时中止；503 用例不等于四种状态都逐一覆盖；HTTP 断开用例也不是浏览器按钮点击的 DOM 测试。它们是确定性协议与状态验证，不是模型效果评测，不能从中得出真实模型没有重复回答的统计结论。

还可以直接验证网络异常不重试，下面只调用注入的失败函数：

```sh
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { createProvider } from './src/provider.mjs';
let attempts = 0;
const provider = createProvider({
  model: 'fixture',
  fetchImpl: async () => {
    attempts++;
    throw new Error('fixture connection failure');
  },
});
await assert.rejects(provider.complete([], []), /fixture connection failure/);
assert.equal(attempts, 1);
console.log('网络异常没有被重试');
JS
```

该实验观察的是当前控制流，不需要向真实端点发送请求。扩展取消策略时，应先为“等待期间取消后不得第二次请求”等规则写失败用例，再修改实现，避免单靠正常路径日志误判行为。

## 七、真实运行与调试边界

具备本机 Ollama 服务和支持工具调用的已安装模型后，在 example 根目录运行：

```sh
ollama list
MODEL=qwen3:4b npm start -- "阅读 guide.md，解释运行边界并引用路径"
```

在生成期间按 Ctrl+C，观察进程能否退出、终端是否报告取消、后续同 session 是否排除了该运行。默认 `DATA_DIR` 会保存私密内容，查看时不要把整个 NDJSON 复制到共享日志。当前核验环境没有 Ollama，真实生成速度、工具选择和取消体验仍需在具备模型的机器上验证。

如果取消不生效，沿入口控制器、组合信号、provider fetch 参数、工具检查点逐层排查。若只是输出停止而进程不结束，要检查是否仍有忽略 signal 的等待或未释放句柄。不要通过强制退出来证明协作取消正常完成，进程被杀和运行结算是两件事。

如果看见重复请求，先确认响应状态和是否真的进入第二次尝试。当前事件没有 `retry` 类型，也没有 attempt 字段，不能凭空从 `run.end` 读出请求次数。可用本地 HTTP fixture 记录请求，或在调试器查看 `attempt`；不要把未实现的遥测字段写进排障步骤。

本章的完成标准是：取消能到达请求与工具检查点，失败不进入完成历史，只有列明的流前 HTTP 状态允许一次重试，部分流永不自动重放。它不是通用网络容错框架，也不是工具副作用的撤销系统。

## 固定来源

- [DeepSeek Harness：流式协议与重试契约](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/llm-streaming.md)：上游有独立失败分类和 retry policy，本例不直接实现这些类型。
- [DeepSeek Harness：运行与结算顺序](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/architecture.md)：对照取消与消息提交边界。
- [DeepSeek Harness：子运行取消所有权](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/subagent.md)：取消属于明确生命周期；当前示例没有子 Agent。
- [Node.js 22：AbortController 与 AbortSignal](https://nodejs.org/docs/latest-v22.x/api/globals.html#class-abortcontroller)：确认信号组合、超时和检查点语义。

深化阅读：[PTY 与后台任务](./45-pty-background-jobs)、[子 Agent 控制](./56-subagent-control)、[工作流恢复](./58-durable-workflows)。取消必须继续传递到进程、委派任务与耐久状态。

上一章：[第七章：上下文预算](./07-context-budget) · 下一章：[第九章：结构化运行事件](./09-observability)
