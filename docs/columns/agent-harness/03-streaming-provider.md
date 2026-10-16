---
title: 第 03 章：把模型增量结算成完整回复
description: 用 Node.js Web Streams 解码 SSE，组装分片工具参数，并明确显示增量与可执行回复的边界。
date: '2026-10-17'
category: 智能体工程
tags: [Agent Harness, Node.js, 流式结算]
series:
  order: 3
---

# 第 03 章：把模型增量结算成完整回复

本章只讲一个核心概念：**流式增量可以立即显示，但只有完成结算的回复才能进入工具执行和会话历史。** 网络读到了字节、界面显示了文字、模型形成了合法工具调用，是三个不同的事实。

真实问题是一个分片工具请求：模型先发来 `{"path":`，下一帧才发 `"guide.md"}`。如果收到第一片就解析参数，会错误地判定 JSON 损坏；如果界面出现“正在读取”就执行工具，会在工具名、调用编号尚未完整时越过授权边界。网络中断后，把已显示前缀当成完整回答，也会污染下一次模型请求。

[下载完整项目](/downloads/agent-harness.zip)，从 `agent-harness/` 根目录运行文中命令。示例使用 Node.js 22 原生 `fetch`、Web Streams 和 ESM，无额外依赖。provider 真正请求本机 Ollama 的 OpenAI 兼容接口，不会以固定回答替代推理；自动测试中的响应替身只用于验证协议。

## 3.1 先明确三个层次

第一层是字节传输：`reader.read()` 返回一段 `Uint8Array`。它可能只包含一个汉字的部分 UTF-8 字节，也可能同时包含多条 SSE 事件。网络 chunk 没有应用语义，不能对每个 chunk 单独调用 `JSON.parse()`。

第二层是 SSE 帧：连续 `data:` 行在空行处组成事件，多行 data 用换行连接；注释可以出现，但不构成模型数据。SSE 解码器的责任止于返回完整帧文本，不解释工具、消息角色或模型终止状态。

第三层是模型回复：帧内 JSON 的 `choices[0].delta` 提供文本和工具增量，特殊帧 `[DONE]` 表示本适配器接受的流结束。provider 把增量组装成 assistant，完成额外验证后才返回。agent 消费这个返回值，不消费网络帧。

这种分层让显示与执行分开。`onDelta(text)` 只发布可见文本，没有工具执行权限。即使收到很多增量，`complete()` 最后仍可能拒绝，例如缺少 `[DONE]`、模型报告截断、调用编号重复。用户看见部分文字，不代表运行成功。

## 3.2 完整 provider 源码

当前 `src/provider.mjs` 的实现如下：

<<< @/../examples/agent-harness/src/provider.mjs{js}

它包含地址校验、SSE 解码和回复组装三个部分。把它们放在同一文件是因为目前只有一种传输适配器，并不意味着 SSE 帧格式就是 Harness 的通用模型契约。公开服务契约仍是 `complete(messages, tools, { signal, onDelta })`。

`createProvider()` 创建服务时要求非空模型名，将 base URL 拼成 `/chat/completions` 端点。默认 base 是 `http://127.0.0.1:11434/v1`。它只接受 HTTP loopback 主机名、拒绝 URL 用户信息、query 和 hash，请求还设置 `redirect: 'error'`。

这个限制缩小了教学运行的网络范围，但不等于完整网络沙箱。它校验 URL 的语法与主机名单，没有建立操作系统网络隔离，也没有实现任意兼容服务的认证方案。不要为连接云模型删掉检查后仍声称请求只发送到本机。

## 3.3 UTF-8 必须在分行之前解码

关键顺序是先用持久 decoder 解码，再寻找换行：

```js
const decoder = new TextDecoder('utf-8', { fatal: true });
buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
```

`stream: true` 保留还没收齐的字符字节，避免一个汉字被拆成多个替换字符。流结束时再调用无参数 `decode()`，刷新剩余状态。`fatal: true` 让非法 UTF-8 成为显式失败，不默默更改模型实际提供的数据。

`buffer` 保存尚未处理的文本。遇到 `\n` 才取出一行，并移除结尾的 `\r`，所以 LF 和 CRLF 都能处理。把 `\r\n` 当作唯一换行格式会漏掉常见的 LF；只按 chunk 拆行会丢失跨 chunk 的半行。

读取循环设有缓冲上限，防止对方持续发送不带换行的巨大文本。这里限制使用 JavaScript 字符串长度，不是 UTF-8 字节数；检查发生在新解码文本加入 buffer 之后，因此它也对瞬时缓冲总量施加限制，不应描述成一个精确的网络字节配额。

## 3.4 空行才是事件边界

解码器维护 `data` 数组，每遇到 `data:` 行就取出冒号后的内容，并只移除一个可选前导空格。空行到来时，非空 data 数组才会被连接并 yield。注释、其他 SSE 字段不会进入模型 JSON。

```js
if (line === '') {
  if (data.length) yield data.join('\n');
  data = [];
  frameSize = 0;
} else if (line.startsWith('data:')) {
  const part = line.slice(5).replace(/^ /, '');
  frameSize += part.length;
  if (frameSize > 1_048_576) throw new Error('SSE frame exceeds limit');
  data.push(part);
}
```

这个实现处理的是当前模型接口所需的 SSE 子集，不提供 EventSource 的自动重连、event id、`retry:` 状态或命名事件路由。忽略这些字段不表示实现了完整浏览器 SSE 客户端。

EOF 到来时，如果 buffer 或 data 仍有未结算内容，解析器抛出 `Incomplete SSE event`。这条策略比“连接结束就交付尾帧”严格：缺失空行可能就是被截断的数据。即使 SSE 帧都完整，provider 仍需确认 `[DONE]`，两层结束条件分别保证帧边界和模型完成。

生成器的 `finally` 会取消 reader 并释放锁。provider 在 `[DONE]` 处退出 `for await`，同样触发资源清理。否则提前结束消费时，底层响应可能仍持有连接或 reader 锁。

## 3.5 工具参数一直保持原始字符串

一个 assistant 可能请求多个工具，各调用的增量交错出现。不能把所有 arguments 放进同一字符串，必须按 `call.index` 建立状态。当前实现允许索引零到十五，每个索引保存 id、name 和 arguments。

```js
const current = calls.get(call.index) ?? {
  id: '', type: 'function', function: { name: '', arguments: '' },
};
current.id += call.id ?? '';
current.function.name += call.function?.name ?? '';
current.function.arguments += call.function?.arguments ?? '';
calls.set(call.index, current);
```

按索引累计后，终止时排序形成 `reply.tool_calls`。arguments 不在这里解析，provider 只确保调用身份非空且不重复、工具名非空；参数是否合法，由下一层工具执行边界决定。这样不完整参数、未知工具和越界路径可以分别归因。

这段代码接受的是字段按片段追加的兼容协议。若某服务在每帧重复完整 id 或完整 name，简单拼接不会自动去重；不能宣称支持所有“OpenAI 兼容”实现。更换服务时，应以线级测试确认其增量约定，不靠一次正常回答判断兼容。

文本和工具增量还共同受回复长度限制。`131_072` 是当前累计字符串长度及工具增量 JSON 长度的阈值，不是输出 token 上限，也不是发送给模型的 `max_tokens`。它主要防止客户端持续积累响应导致内存增长。

## 3.6 结算不只是看见终止标记

provider 对 HTTP 状态和响应类型先检查，再进入帧循环。错误状态会取消响应 body 并抛出 `Model HTTP ...`；非 `text/event-stream` 响应会被拒绝。普通 JSON 响应不能因为含有文字就当作 SSE 成功。

帧内若存在 `error`，立即失败；第一 choice 的 `finish_reason` 是 `length` 或 `content_filter`，同样失败。一个流即使出现了工具参数，在截断情况下也不能执行。没有 choice 的帧被跳过，兼容 usage-only 事件，但本实现不保存 token usage。

收到 `[DONE]` 后还要验证调用身份，以及回复是否完全为空。当前空判断不是“必须有非空白文字”：只含空格的字符串仍可能通过；没有文字但有工具调用也合法。把实现说成“自动过滤所有无意义回答”会超出代码能力。

结算失败时 `complete()` 抛错，agent 不会获得可执行 assistant。已经发布的 `onDelta` 不会自动从 UI 撤回，所以入口需要展示失败状态，让用户知道可见前缀不是完成答案。这是流式产品不可省略的状态语义。

可以沿着一条失败时间线检查边界：HTTP 返回成功，第一帧显示“我将读取文件”，第二帧只给出半个 arguments，随后连接关闭。文本显示是已经发生的事实，工具执行却不该发生；provider 因缺少终止标记拒绝，agent 结束失败运行。若把三件事混成一个“响应成功”，就会错误执行或保存残缺数据。

另一条时间线是收到完整工具 arguments 和普通 finish_reason，但没有收到特殊终止帧。当前代码仍拒绝，因为它采用的完成条件是 DONE，而不是仅凭 finish_reason。反过来，收到 DONE 而没有普通 finish_reason，只要回复通过内容与身份检查，当前实现可以接受。测试和排错必须按实际适配器规则判断，不能想当然增加另一个完成条件。

多行 data 的支持也有边界。解析器只是用换行连接各行文本，得到的结果仍须是有效 JSON；它不会修复被切进字符串内部的非法 JSON，也不会删除模型数据中的换行来“帮助解析”。帧错误应该显式暴露，让服务端协议问题与工具参数错误保持可区分。

当前 provider 只消费第一条 choice，忽略其他候选，也没有 reasoning 输出通道。这是单答案工作区助手的设计范围，不是普遍的聊天生成接口。若服务返回不同的专用推理字段，不能因为文本为空就把它强行当作 content；需要明确设计、线级测试和结算语义之后才能支持。

对于只发 keepalive 注释、不交付模型内容的连接，SSE 解码本身可以继续等待。内存上限不能解决时间上限，CLI 的运行超时才会中止等待；直接调用 provider 而不传有时限的 signal，则没有同样的时间保障。流式协议、内存边界和取消边界各自解决不同问题。

## 3.7 重试只发生在可见输出之前

本项目对 HTTP `429`、`502`、`503`、`504` 最多再请求一次，等待二百毫秒并响应取消。网络异常、非法帧、部分输出之后的中断不会被这里自动重试。这样避免把已经显示的增量重复推给用户。

限制重试范围还有工具层原因：重放一次模型请求可能产生不同调用，未来若有写工具，更可能重复副作用。本章只读工具虽降低了风险，仍不能把“可以再试”混同于“继续原来的流”。取消与重试的完整设计在第八章展开。

`onDelta` 是同步调用约定，当前 provider 不等待异步回调完成。CLI 用它写标准输出，agent 用它发布事件。若消费者需要背压或异步持久化，必须另行设计，不能直接传入异步回调后以为 provider 已等待处理。

## 3.8 与固定版本上游对照

参考版本是提交 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`，根包 `0.2.1-alpha.5`，2026-10-17 核验。[流式子系统文档](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/llm-streaming.md) 定义 provider-neutral `StreamChunk`，包含 block start/end、文本、reasoning、工具增量、usage 和 finish。

上游 [类型源码](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/llm/llm/src/types.ts) 要求工具 arguments 保持原始 JSON 字符串；这个原则与教学实现一致。但上游 adapter 产出规范化 chunk，再由公共 assembler 组装；本项目在一个 provider 中直接解释兼容 SSE，两者不是可互换接口。

上游 [BlockAssembler 源码](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/llm/llm/src/assembler.ts) 在 max-token 截断时丢弃工具块，并同步裁剪回放元数据；取消时可提取安全文本和 reasoning 前缀，不保留未执行工具。教学项目更简单：截断或中断直接失败，不提交部分回复，也不保存精确增量时序。

上游还把一次 adapter 调用定义成一次 provider attempt，重试策略位于更外层。教学 provider 自己执行一次有限 HTTP 重试，只适合这里的固定组合，不应称为照搬上游重试架构。

## 3.9 运行与失败验收

先验证帧解析和结算，不需要启动模型：

```sh
node --test --test-name-pattern="SSE|local provider|truncated" test/harness.test.mjs
```

已有测试把中文逐字节分片，覆盖 CRLF、注释和完整帧；另一个本地 HTTP 测试验证工具 arguments 增量组装及请求中的 `stream: true`；截断测试确认没有 `[DONE]` 的回复被拒绝。HTTP 服务是真的，响应内容是确定性测试数据，不是模型推理结果。

准备好本机模型后，从同一目录运行：

```sh
ollama list
MODEL=qwen3:4b npm start -- "读取 guide.md，并根据文件说明项目能做什么"
```

若遇到 `Model did not return SSE`，检查 endpoint 和服务返回类型；`Incomplete model stream` 说明模型完成标记缺失，不能靠删掉判断解决；`Invalid settled tool calls` 应检查工具增量身份是否符合约定。模型未启动导致连接失败，也不证明 SSE 实现有缺陷。

验收应分别确认中文没有乱码、工具参数完整后才执行、中断不会产生成功历史。真实模型的工具选择、引用准确性与自然语言质量尚需实际模型运行检查；确定性协议测试通过不能替代这些验收。

---

上一篇：[第 02 章：插件生命周期](./02-plugin-lifecycle.md) · 下一篇：[第 04 章：工具边界](./04-tool-boundaries.md)
