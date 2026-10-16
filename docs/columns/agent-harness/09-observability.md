---
title: 第九章：用结构化事件观察运行
description: 从 runId、step 和工具结果重建运行路径，区分临时输出、持久化事实与隐私边界。
date: '2026-10-17'
category: 智能体工程
tags: [Agent Harness, Node.js, 可观测性]
series:
  order: 9
---

# 第九章：用结构化事件观察运行

助手没有给出答案时，用户只知道“卡住了”。维护者却需要区分：模型请求还没有开始，模型正在生成，工具校验失败，步数已经耗尽，还是用户关闭页面导致取消。若日志只有一串文字，既难关联同一次运行，又容易把文件内容和用户输入原样留在长期日志中。

本章只建立一种能力：用结构化事件观察一次运行的路径与结局。不是接入一个遥测平台，也不是给每个函数加日志。我们让业务循环报告少量稳定事实，让 CLI 和 Web 决定如何展示，并把这些临时报告与 session 的持久化记录区分开。

参考基线为 **2026-10-17** 核验的 DeepSeek Harness `0.2.1-alpha.5`、固定提交 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`。上游是 TypeScript 与 Cordis 的插件框架，拥有多类事件和遥测扩展；这里的 `emit()` 是独立 Node.js 22 ESM 示例的回调，不是上游事件总线 API。

## 一、先定义要回答的运维问题

一个事件字段是否值得保留，要看它能回答什么问题。运行编号让我们关联同一请求；step 让我们定位模型循环的位置；工具名和 `ok` 让我们区分执行成功与请求被拒绝；结束状态和总耗时让我们知道运行是否完成以及等了多久。

这些事实已经足以重建最基本的路径。它们没有记录真实输入 token、模型费用、首字延迟、每个工具的耗时，也没有自动收集主机指标。需要那些能力时可以另行设计，但不能把当前事件描述成“完整分布式追踪”或“自带性能仪表盘”。

普通成功路径是运行开始、步骤开始、若干文字增量或工具事件，再到运行结束。一次工具失败可以仍然让整体运行完成，因为模型收到错误结果后有机会修正。观察者不能看到 `tool.end.ok === false` 就立刻把整个 run 标成失败，应等待最终运行状态。

## 二、事件从循环发出，不由界面猜测

完整事件生产逻辑就在 runner 中：

<<< @/../examples/agent-harness/src/agent.mjs{js}

`runId` 使用 `randomUUID()`，同一运行发送的事件由 `send()` 统一补上编号。它不是 session ID，也不是 HTTP 请求 ID。一个 session 会容纳多次运行；用户重试一个问题，应当出现另一个 runId，不能以相同提示词推断它们是同一生命周期。

```js
const runId = randomUUID();
const start = performance.now();
const send = (event) => emit({ ...event, runId });
```

这样业务代码只写事件本身，不必在每个分支重复编号逻辑。CLI、Web、测试都调用同一个 `runAgent()`，所以观察的是同一套状态转换。界面无需通过“文字多久没变化”猜测工具是否正在执行，入口也不应自己制造一个与 runner 相冲突的完成事件。

目前的事件集合如下，字段以实际源码为准：

| 类型 | 核心字段 | 能说明什么 |
| --- | --- | --- |
| `run.start` | `runId` | begin 记录已追加，开始运行 |
| `step.start` | `runId`、`step` | 准备进入这次模型请求 |
| `text.delta` | `runId`、`step`、`text` | 可临时展示的文字增量 |
| `tool.start` | `runId`、`step`、`name` | 开始处理一个工具调用 |
| `tool.end` | `runId`、`step`、`name`、`ok` | 工具调用成功或被拒绝 |
| `run.end` | `runId`、`status`、`durationMs` | 运行完成、失败或取消 |

成功的 `run.end` 还包含 `steps`，值为完成时的 `step + 1`。失败和取消没有这个字段。step 索引从零开始，成功 steps 是次数，两者不能混用。当前也没有 `step.end`、`retry` 或 `tool.durationMs`，读取日志时应接受这些字段不存在。

工具事件还没有 tool call ID，同一步里连续调用同名工具时，观察者只能按当前串行执行顺序配对开始和结束，不能凭工具名独立区分所有调用。会话中保存的调用 ID 才承担消息配对责任。将来若改成并行工具，必须先扩充观测契约，不能照搬这套按顺序理解的方法。

runId 解决关联，不提供认证、保密或传输顺序保证。当前发送来自一个进程的同步回调，CLI 和 Web 也没有事件重排与断线补发机制。把这些事件存入外部系统时，应保留原类型与字段语义；看到相同编号并不意味着已经拥有可恢复的完整会话或访问该会话的权限。

## 三、总耗时为什么使用 performance.now

`durationMs` 是 `Math.round(performance.now() - start)`。这个时钟适合衡量进程内经过的时间，不使用墙上时钟的日期差值。它包括模型等待、工具执行和本次测量区间内的持久化等待，不等于“模型推理耗时”。

起点在生成 runId 后、追加 begin 前；终点在完成或失败的 end 记录成功追加后。因而慢磁盘也可能拉长 duration。若只想分析模型速度，当前这个字段不足以拆分瓶颈，不能拿它直接比较两种模型的生成性能。

事件没有时间戳。`performance.now()` 也不是 Unix 时间，不能把它直接解释成日期，或拿两个不同进程的数值对齐。需要日历时间、跨进程关联或阶段耗时时，应明确增加相应契约和测试，而不是把不存在的值从现有日志中推算出来。

状态边界比耗时更重要。预算失败发生在 `step.start` 之前；provider 报错可能发生在 `step.start` 之后、任何工具之前；达到步数上限则可能已有多组工具结束事件。先定位阶段，再讨论耗时，通常比先调超时参数更有效。

## 四、临时事件与持久化事实分工

`text.delta` 让用户立即看见增量，却没有逐字写入 session。session 保存 begin、成组的 turn、end，只有已经结算的消息才被追加。一次断流出现的半段文字可能在终端上可见，但不能因此宣称会话已有一个完整回答。

上游也明确区分活跃 Agent 事件与持久化 Session 事实，不过上游会保存更完整的 compact stream 和失败尝试。本例只借鉴这层区分，没有实现那些记录类型。不要把本例不持久化文字增量，写成上游同样永远不保存流的结论。

成功 `run.end` 在成功 end 记录追加之后发出，观察者看到它时，当前运行已经走完提交路径。失败分支也先追加结束记录再发事件；若持久化失败，则可能直接抛出聚合错误。事件通道不负责修复 session，也不能保证任何故障下总有一个结束帧。

输入验证和已经取消的入口检查发生在 runId、begin 之前，这些错误没有 `run.start`。begin 本身追加失败也发生在主 try 外，未必有 `run.end`。排障时不能把“没找到结束事件”一律判成模型卡死，应先确认运行是否真正被接纳以及事件消费者是否正常。

当前 `emit` 是同步调用的回调，runner 不 await 它返回的 Promise。回调应轻量，并自行明确错误处理责任。若观察回调抛错，它可能影响业务循环；这里没有日志故障隔离层。把事件接到复杂外部系统前，应先设计缓冲、失败策略和测试，不能悄悄添加网络发送。

## 五、没有提示词字段，不代表没有隐私风险

常规结构化运行事件不包含 prompt 原文或工具结果内容，工具事件只报告名称、步骤和成功标记。但 `text.delta` 本身包含模型输出，模型输出可能引用用户问题或文件内容。因此准确说法是“结构日志默认不写原始输入和工具正文”，不是“所有事件都不含敏感内容”。

CLI 将文字增量写入 stdout，其他运行事件以 JSON 行写入 stderr：

```js
if (event.type === 'text.delta') process.stdout.write(event.text);
else process.stderr.write(`${JSON.stringify(event)}\n`);
```

这方便把回答和结构事件分开处理。stderr 还会包含异常文案，不能把它无条件当作纯 NDJSON 解析。stdout 则是回答流，可能含工作区证据；即使没有 prompt 字段，把两个流上传外部平台也仍然需要明确授权和数据范围。

更直接的风险来自本地 session。它保存用户输入、assistant 消息、工具参数和工具结果，读取私密文件时这些内容可能进入 NDJSON。新建目录和文件使用受限权限并不等于加密，也不自动修正既有目录权限。应像保护工作区一样保护 `DATA_DIR`，不要提交到版本库或共享给无关读者。

Web 在“运行事件”区域排除了文字增量，把它们放入回答区域，但整个页面仍在本机显示模型内容。渲染使用 `textContent` 能减少脚本执行风险，不会把敏感文字变成公开数据。安全渲染与隐私存储是两条不同的边界。

## 六、在 example 根目录验收

下载[完整源码](/downloads/agent-harness.zip)后，在 example 根目录运行确定性测试：

```sh
node --version
node --test --test-name-pattern="agent executes tools" test/harness.test.mjs
node --test --test-name-pattern="cancellation and maximum" test/harness.test.mjs
```

工具循环测试使用 provider 替身：先返回 `read_file` 调用，再检查工具结果确实包含临时文件里的证据，然后发送文字增量并返回完成回复。它断言出现 `tool.end`、最后一个事件是 `run.end`，还检查持久化文件没有 `text.delta`。

这同时验证了事件经过真实 runner，以及持久化层与临时事件分开。替身回答是预先确定的字符串，不是模型判断。测试通过只能说明这条控制流正确，不能说明真实模型引用质量、解释准确率或生成速度合格。

现有用例没有逐一断言所有事件都拥有同一个 runId，也没有验证 durationMs 的范围或日志故障隔离。理解代码不等于这些边界已经全部自动覆盖。以后修改事件字段时，应先补充精确失败断言，避免测试仅检查“出现过一个事件”却遗漏关联关系。

具备 Ollama 后，可以把真实运行结果分流保存：

```sh
ollama list
MODEL=qwen3:4b npm start -- "阅读 guide.md，解释工具边界并引用路径" > answer.txt 2> events.ndjson
```

模型名应以本机已安装且支持 tools 的模型为准。文件是本地验收产物，不应公开其私密内容。当前核验环境没有 Ollama 服务，没有执行这条模型命令，也没有声称 answer.txt 中的真实回答质量通过。

## 七、用事件定位三个典型失败

第一种是开始后马上结束失败，且没有 `step.start`。应先查看上下文预算、工具定义占用和会话持久化，而不是以为模型已经收到请求。预算选择在步骤事件之前，这是一个由源码顺序确定的排查线索，不是靠时间长短猜测的结论。

第二种是有 `tool.start`、`tool.end.ok: false`，随后仍有下一步。这表示工具请求被拒绝后，runner 将安全错误作为工具结果交给模型。检查名称、参数和允许路径即可，不应把任意宿主异常完整回传模型。结构日志刻意不提供全部参数，必要时在受控本地调试器查看。

第三种是已经看到文字却以 failed 或 cancelled 结束。此前文字只是临时显示；最终状态才决定本轮能否加入完成历史。若缺少结束事件，还需检查连接和持久化故障。不要把“页面有内容”作为成功判据，也不要用最后一段文字推断 session 已成功提交。

当前项目没有遥测导出器、metrics API、trace span 或事件订阅总线。它提供的最小能力是回调式结构观测，既可用于界面，也可用于确定性测试。可靠的可观测性首先来自字段语义和状态顺序，而不是平台数量。

本章完成时，你应该能从事件解释运行进入了哪个阶段、最终是否完成，并知道哪些信息必须通过 session 或本地调试才能获得。尤其要守住两条结论：总耗时不是模型耗时，日志不含 prompt 字段不意味着会话没有私密内容。

## 固定来源

- [DeepSeek Harness：事件分类与 turn flow](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/architecture.md)：对照活跃事件、持久化事实和结算顺序。
- [DeepSeek Harness：Session 持久化契约](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/session.md)：上游记录能力更丰富，不与示例的 begin/turn/end 混同。
- [DeepSeek Harness：compact assistant streams](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/llm-streaming.md)：对照实时输出与已结算回复。
- [Node.js 22：performance.now](https://nodejs.org/docs/latest-v22.x/api/perf_hooks.html#performancenow)：确认进程内高精度经过时间语义。

上一章：[第八章：取消与受限重试](./08-cancellation-retry) · 下一章：[第十章：行为测试](./10-behavior-tests)
