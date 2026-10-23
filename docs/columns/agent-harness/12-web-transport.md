---
title: 第十二章：把 Harness 接到可取消的 Web 界面
description: 用同源 POST 与 SSE 展示运行事件，建立 Host 校验、并发锁、文本渲染和慢消费者中止边界。
date: '2026-10-23'
category: 智能体工程
tags: [Node.js, Web 运输层]
series:
  order: 12
---

# 第十二章：把 Harness 接到可取消的 Web 界面

CLI 已经能运行，但浏览器入口会带来新的失败方式：用户关闭页面，服务器还在生成；重复点击开始，两个请求同时写同一会话；模型输出包含标签，页面误把它当作 HTML；客户端读得太慢，服务端持续积压发送缓冲。把文字显示到页面上，只完成了运输层的一小部分。

本章的核心知识点是**运输层如何承接同一个 Harness，同时守住连接生命周期和浏览器边界**。服务器不重新实现 Agent 循环，页面不直接请求模型；它们通过结构化事件连接，把开始、取消、完成和失败映射成可观察状态。

参考基线核验于 **2026-10-17**，固定为 DeepSeek Harness `0.2.1-alpha.5`、提交 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`。上游采用 TypeScript 与 Cordis 插件架构，拥有更丰富的远程会话能力；本例是独立 Node.js 22 ESM 实现，不是上游 Web SDK，也不实现其远程订阅协议。

## 一、浏览器请求的是运行，不是模型

页面提交 `POST /api/run`，JSON 中只有 `prompt`。服务器把 prompt 和 signal、emit 交给 CLI 提供的 `run()`，再经同一 `runAgent()` 调用 provider、工具和 session。模型地址、工作区权限、会话目录都留在本机服务侧，不由浏览器请求随意改写。

这条路径中有两层流。模型到 provider 的 SSE 是模型协议，包含 `choices`、工具增量和 `[DONE]`；本机服务器到页面的 SSE 是 Harness 事件，包含 `text.delta`、`tool.end`、`run.end` 等类型。页面无需解析模型工具参数，也不会把模型 `[DONE]` 当成自己的完成事件。

两层流的结算条件同样不同。provider 收到 `[DONE]` 只是模型回复完整；runner 还要执行工具、追加消息并完成运行，才能发出 `run.end: completed`。所以用户界面必须依据运行事件，而不能因为模型连接结束或出现文字就显示“任务完成”。

## 二、先读完整服务器，而不是只看成功路由

服务器的全部实现包括请求校验、运行锁和发送边界：

<<< @/../examples/agent-harness/src/web.mjs{js}

`startWeb({ run, port = 8787 })` 在 loopback 地址 `127.0.0.1` 上监听，并返回真实 Node HTTP server。测试传入 `port: 0` 获取随机端口；CLI 使用默认端口，当前没有 `PORT` 环境变量或 Web 命令行端口开关。

HTTP 路由很小：GET `/` 返回随包 HTML，POST `/api/run` 发起运行，其余方法和路径返回 404。没有静态资源路由、会话列表、上传接口或账号体系。完整页面的样式和脚本都内联在 HTML 中，因此它不需要额外安装前端框架或构建工具。

HTML 由模块相对路径读取，与启动命令所在目录无关。服务器启动失败、页面文件缺失或端口被占用，会在入口暴露错误。不能把这些问题归为模型不可用，因为此时可能还没有任何模型请求。

## 三、本机监听还需要 Host 与 Origin 检查

本机端口不是天然可信边界。恶意网页可能诱导浏览器访问 loopback 服务，或通过域名解析变化让请求到达本机。只设置监听地址，不足以解释哪些浏览器请求被接纳。

当前先检查 Host 白名单：实际监听端口对应的 `127.0.0.1:端口` 和 `localhost:端口`。若请求携带 Origin，还要求它严格等于 `http://${host}`。因此外部网页的 Origin、错误 Host，或不匹配的本机来源会被拒绝为 403。

```js
if (!expected.has(host) || (req.headers.origin && req.headers.origin !== `http://${host}`)) {
  res.writeHead(403).end('Origin rejected'); return;
}
```

这是同源浏览器访问边界，不是身份认证。没有 Origin 的本机命令行请求，只要 Host 正确仍可被接纳；本机其他进程也可能访问服务。不要把它宣称成多用户鉴权或能阻挡任意本机恶意程序的隔离系统。

页面还设置 `no-store`、`nosniff` 和内容安全策略，限制连接来源、禁止被嵌入 frame 等。不过脚本和样式使用内联许可，CSP 含 `unsafe-inline`，并非严格 nonce 策略。当前用途是受控的本机页面，不应直接搬到公网作为完整安全方案。

## 四、请求校验与运行锁是两条边界

请求内容类型必须以 `application/json` 开头，否则返回 415。请求体累计不能超过 16,384 字节，否则返回 413；解析后只允许一个字段 prompt，要求非空字符串且 UTF-8 不超过 8,000 字节，否则返回 400。外层请求字节与内层提示词字节是不同上限。

页面 textarea 的 `maxlength="2000"` 只是浏览器字符长度限制，不是服务器的字节校验。直接调用接口仍需服务器验证；中文、表情和 JSON 转义也使字符数与请求体大小不同。不能依赖前端输入框替代协议准入。

`busy` 在读取请求体之前设置，覆盖请求解析与实际运行。重叠请求返回 409，异常和正常退出都在 finally 释放锁。读取阶段也必须响应超时：signal 取消时调用 `req.destroy()`，唤醒等待下一块数据的异步迭代；读取完成后移除这条监听，再把 signal 交给 run。否则客户端只发送一个 JSON 前缀并保持连接，就可能永远占住 busy。测试把默认九十秒期限缩到 50ms，确认慢请求结束后下一次合法请求得到 200。

它是拒绝并发，不是排队。页面禁用按钮能减少误操作，服务器锁才负责拦住第二个标签页或直接 HTTP 客户端。它也不是跨进程文件锁：同时另开 CLI 或另一个 Web 进程写相同 DATA_DIR、SESSION_ID，仍超出 README 的单进程写入约定。

## 五、为什么使用 fetch 读取 SSE

这里要发送 POST JSON，所以页面使用 `fetch()` 和 `response.body.getReader()`，没有使用仅靠 URL 建立连接的 `EventSource`。服务器以 `text/event-stream` 返回，每个事件编码成一段 `data: JSON` 加空行，再立即让响应头发出。

```js
const frame = `data: ${JSON.stringify(event)}\n\n`;
```

页面使用流式 `TextDecoder` 先还原字节，再在缓冲区查找 `\n\n`。一个网络 chunk 可能含多个事件，也可能只包含半个事件；不能把每次 reader.read 的结果直接交给 JSON.parse。只有完整帧才解析，并把剩余部分留给下一次读取。

这个页面解析的是本服务器生成的简单 data 帧，不是完整通用 SSE 客户端。它没有多行 data 合并、事件 ID、重连或历史续传；服务器也没有发心跳和断线恢复标识。需要跨代理或长时间订阅时，应重新设计协议，而不是默认本机实现已覆盖那些需求。

## 六、完整页面与文本渲染

实际 HTML 包含表单、取消按钮、状态、回答和事件区域，不依赖省略的 UI 组件：

<<< @/../examples/agent-harness/web/index.html

开始提交时清空上次展示，创建新的 AbortController，禁用开始并启用取消。文字增量追加到回答区域，其他事件显示到 details 中；`run.end` 设置 settled 并更新状态。finally 取消并释放 reader，恢复按钮，使正常、失败和取消都回到可再次操作的状态。

关键渲染使用文本 API：

```js
if (data.type === 'text.delta') answer.textContent += data.text;
else events.textContent += `${JSON.stringify(data)}\n`;
```

即使模型输出 `<script>`、链接或文件里的标签，也只作为文字展示，不调用 `innerHTML`。这意味着本例不渲染 Markdown、可点击引用或代码高亮；不能为了美观把这行直接改成 HTML 注入，而不重新考虑净化和测试。

状态区域具有 `role="status"`，回答用 pre 保留换行并允许长文本换行，按钮有可操作尺寸。它是一页基础可用界面，不是已经完成全部键盘、屏幕阅读器和移动端验收的产品。源码中的属性需要实际浏览器验证，不能仅靠编译或读取 HTML 得出完整可访问性结论。

流结束时，页面要求已经收到 `run.end`，且缓冲区没有未消费的非空帧。如果连接只有半段回答便结束，即使 HTTP 状态原来是 200，也显示连接未完成。SSE 一旦发出响应头，后续业务失败不能再改回 HTTP 500，应通过运行状态或 `run.error` 表达。

调试时要看浏览器到本机服务器的事件，而不是把它与模型到 provider 的帧混读。前者若收到工具结束但没有完成，可能是后续模型步骤失败；后者即使已经出现完成标记，也只证明一次模型回复结束。两层日志的结算对象不同，事件数量也没有一一对应关系。

页面的 settled 标记目前表示“收到运行结束事件”，不专指成功；真正成功仍取决于 data.status。失败或取消的结束帧会显示运行未完成。若以后增加进度条或通知，同样要保留这个区分，不能把 reader 正常结束或 settled 为真直接映射为成功提示。

## 七、取消如何穿过连接

取消按钮调用 active 控制器的 abort，终止页面 fetch 和读取。服务器响应的 `close` 事件再取消请求控制器；该 signal 与本请求九十秒超时组合，交给 run。CLI 还把进程 SIGINT 合并进来，最终到达 provider fetch 和工具检查点。

因此页面关闭、主动取消、单次请求超时和进程退出，都有通向同一运行的停止途径。但这仍是协作取消，不是强行撤销所有工作；文件工具在有限检查点停止，已发生的持久化审计也不会被取消删除。

部分回答可以留在页面上，状态显示未完成；当前 cancelled 或 failed 运行不会成为后续完成历史。提示文案的“部分回答未保存为历史”不是说磁盘完全没有记录，session 仍可能有 begin 或已结算工具组，应区分展示、审计和模型可回放历史。

服务器 catch 在已发送 SSE 头后给出通用 `run.error`，不把任意宿主错误消息传到页面。页面也会把网络错误显示为失败。当前没有错误代码映射或自动重发机制，用户重新点击开始是新运行，不是恢复上一条连接。

## 八、慢消费者采用中止，而不是无限缓存

每个 emit 累计已编码 SSE 的 UTF-8 字节数，超过 1,048,576 字节就取消运行。若 `res.write(frame)` 返回 false，表示 Node 发送缓冲达到背压条件，也立即取消。两种限制分别处理总输出过大和客户端消费跟不上。

```js
if (outputBytes > 1_048_576 || !res.write(frame)) {
  controller.abort(new Error('Web stream consumer too slow or output too large'));
}
```

这不是等待 `drain` 后继续发送的完整流控方案。因为 runner 的 emit 是同步回调，当前选择快速停止，避免引入一个没有明确所有权的无限事件队列。正常网络下也可能因短时缓冲压力触发取消，这是简单、可解释策略的体验成本。

总输出计量包括所有事件框架和 JSON，不只计算回答文字。慢消费者取消后，provider 和 runner 必须遵守 signal 才会结束；发送端的限制不能自动停止一个不合作的 run 替身。页面也没有实现巨大回答的虚拟化，本例不适合无限输出。

## 九、在 example 根目录验证

下载[完整源码](/downloads/agent-harness.zip)后，先做不依赖模型的运输层验证：

```sh
node --version
node --test test/web.test.mjs
node --test test/harness.test.mjs test/web.test.mjs
```

Web 测试使用真实本机 HTTP server 和确定性 run 替身，证明实际 HTML 可取得、SSE 事件可读取、跨 Origin 被拒绝、错误内容类型被拒绝、重叠请求得到 409，以及客户端断开会取消运行信号。它不是假的 HTTP 返回值，但返回的“回答”仍不是模型生成。

现有 Node 测试没有在浏览器执行 DOM，也没有自动覆盖输出慢消费者、错误 Host 和所有请求体边界；已覆盖请求体停滞后的超时与锁释放。应把剩余边界作为明确待验项。不能因为 fixture 发出一段 script 字符串，就宣称已在浏览器验证脚本不会执行；文本安全结论仍需浏览器验收补充。

具备本机 Ollama 和支持 tools 的已安装模型后，运行：

```sh
ollama list
MODEL=qwen3:4b npm run web
```

打开 `http://127.0.0.1:8787`，提交默认问题，查看工具事件与 `guide.md` 引用；生成中取消，确认状态改变；另开标签页重叠提交，确认第二个请求被拒绝。按 Ctrl+C 关闭服务，检查连接和活动运行都结束。当前核验环境没有 Ollama，真实回答和生成期间 UI 体验没有被宣称为通过。

排障时先区分 HTTP 准入失败与 SSE 内运行失败。403 看 Host、Origin，415 看内容类型，400 看 prompt，409 看活动运行；HTTP 200 后出现 run.error，应检查模型、预算、取消和服务端日志。不要把全部错误归为“前端连接问题”。

本章的完成标准是同一个 Harness 被正确运输，用户看见的是运行结算，连接取消能传回执行端，并发与输出有上限，文本不会作为 HTML 执行。至此，从模块契约到本机 CLI 与 Web 的参考实现闭环成立；真实模型效果仍需独立验收。

## 固定来源

- [DeepSeek Harness：实时流与会话结算](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/architecture.md)：对照远程实时展示与持久化事实，本例不是上游会话订阅协议。
- [DeepSeek Harness：模型流式契约](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/llm-streaming.md)：区分模型 SSE 与 Web 运行事件。
- [DeepSeek Harness：Session 事件与远程边界](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/session.md)：上游会话能力不与本例两条 HTTP 路由混同。
- [Node.js 22：HTTP response.write](https://nodejs.org/docs/latest-v22.x/api/http.html#responsewritechunk-encoding-callback)：确认返回 false 与发送缓冲背压的关系。

## 2026-10-23：流式 Web 与 MCP Apps 是两种宿主

对照[现代 MCP HTTP 规范](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)和 [MCP Apps 官方实现](https://github.com/modelcontextprotocol/ext-apps)，本章 POST / SSE 页面不具备 MCP 请求元数据、Apps UI 资源、隔离消息桥或扩展协商。不能只因使用 iframe、SSE 或浏览器就把它命名为完整 MCP Host。

练习：在目标浏览器用纯教学输出检查标签、长行、emoji、键盘取消、连接截断与第二标签页并发；在服务器确认取消信号和锁释放，再对照最终运行状态。Node HTTP 夹具验证协议，浏览器验证 DOM 与操作体验，真实模型验证回答，三层分别记录。浏览器与真实模型的验收需要独立运行证据，不能由本文代码片段推导通过。

## 从基础项目进入完整工程体系

本章完成基础助手的运输闭环。继续学习时，先在第 13–18 章厘清 Agent、模型和指令边界，再进入 Skills、插件和 MCP；上下文、沙箱、多 Agent、SDK 与真实评测在后续单元逐一展开。基础项目和扩展实验的实现范围分别记录，新增知识不会自动赋予本机助手更高权限。

下载包新增 `labs/`，可用 `npm run labs` 在不启动模型的情况下观察技能发现、一次性审批、完整工具组裁剪、DAG 恢复和评测统计。它们是独立机制实验，具体步骤与局限见包内 `labs/README.md`。

上一章：[第十一章：CLI 组合入口](./11-cli-composition) · 下一章：[第十三章：Agent、Workflow 与 Harness 的边界](./13-agent-foundations)
