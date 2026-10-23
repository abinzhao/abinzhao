---
title: '第26章：MCP 工具、资源与提示模板'
description: 以 2026-07-28 协议区分工具执行、资源读取与提示模板选择，展示完整请求元数据和结果投影边界。
date: '2026-10-23'
category: 智能体工程
tags: [MCP, Tools, Resources, Prompts]
series:
  order: 26
---

# 第26章：MCP 工具、资源与提示模板

工具、资源和提示模板都能向模型提供信息，但控制权和调用含义不同。把它们统一叫“上下文接口”，会忽略执行副作用、资源来源和用户选择。正确的适配器可以统一承载结果，却不能抹掉这些差异。

本章所有 wire JSON 使用 MCP `2026-07-28`，包含该版逐请求 `_meta`。旧版请求不要混入这些字段后继续按 initialize 会话解释。原教程没有 MCP 能力，DeepSeek 固定版本则支持工具和按需资源，不支持 MCP prompt templates。

## 26.1 三种原语解决不同问题

工具代表可调用行为，通常由模型根据任务选择；资源是可寻址数据，由应用决定如何纳入上下文；prompts 是服务器提供的模板，设计上供用户选择。规范并不强制一种界面，但这些默认控制关系有助于设计授权。

| 原语 | 发现与取得 | 结果含义 |
| --- | --- | --- |
| Tools | `tools/list`、`tools/call` | 一次执行的结果 |
| Resources | `resources/list`、`resources/read` | URI 指向的内容 |
| Templates | `resources/templates/list` | 参数化资源地址，不是正文 |
| Prompts | `prompts/list`、`prompts/get` | 供宿主使用的消息模板 |

资源读取不等于用户授予后续写操作，模板也不等于 Skill 激活。资源 URI 是服务器命名空间内的身份，即使使用 `file://`，也不一定对应 Host 的本地文件。把它直接交给 Node `readFile()`，会改变执行世界和权限含义。

### MCP 工具发现

MCP 工具发现是客户端通过 `tools/list` 取得服务器当前工具目录及其输入契约的过程。目录可以分页并随授权或服务状态变化；发现结果用于选择与展示工具，不能代替执行时的权限检查。

2026-10-23 核验的推荐路径以固定 `2026-07-28` 修订为准，分为**服务器能力发现、工具目录发现、变化订阅和执行准入**四层，不能用一个方法名概括全部行为。

1. 现代 Server 必须实现 `server/discover`，返回 `supportedVersions`、`capabilities` 和可选的服务器身份。现代 Client 可以先调用它，也可以直接请求并处理 `UnsupportedProtocolVersionError`；双代 stdio Client 应先用它探测年代。它不是 `initialize` 的新别名，不建立旧式握手会话。
2. Client 在每个请求的 `_meta` 声明版本、身份和能力，再调用 `tools/list` 获取当前授权可见的工具及 `inputSchema`。完成结果有 `resultType: "complete"`；返回 `nextCursor` 时继续分页，直到没有下一游标。`nextCursor` **仍是现代规范字段**，不是废弃 API。
3. 需要动态更新时，Client 显式发送 `subscriptions/listen`，在 `params.notifications` 设置 `toolsListChanged: true`。Server 的第一条消息必须是 `notifications/subscriptions/acknowledged`，确认实际接受的过滤条件；每条订阅消息通过 `_meta["io.modelcontextprotocol/subscriptionId"]` 关联原请求。
4. `notifications/tools/list_changed` **也仍有效**，但只对已请求且获确认的订阅接收相应变化通知；收到后失效目录缓存并重新分页。目录发现不授予执行权，真正的 `tools/call` 仍校验参数、当前权限与目标身份。

下面是完整的现代订阅请求，能与第 27 章的逐请求元数据一起学习；它是静态协议样本，不是已经建立的真实连接：

```json
{
  "jsonrpc": "2.0",
  "id": "tools-sub-1",
  "method": "subscriptions/listen",
  "params": {
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": {
        "name": "tutorial-client",
        "version": "1.0.0"
      },
      "io.modelcontextprotocol/clientCapabilities": {}
    },
    "notifications": {"toolsListChanged": true}
  }
}
```

正常验收应分别观察 discover 结果、完整分页目录、订阅确认及关联正确的变化通知，再确认更新后的工具集合。异常验收包括确认未接受 `toolsListChanged`、首条消息不是确认、subscriptionId 错配、重复 cursor、授权变化导致缓存失效和未知工具调用。排错时先查请求版本与订阅确认，不把“没有通知”直接判为 Server 没有工具。练习可将目录拆成两页，再撤销一项授权，确认旧目录不能继续当作能力凭证。

#### 旧代兼容路径

`2025-11-25` 及更早修订先 `initialize`，再 `notifications/initialized`，从握手结果取得能力；其 `tools/list` 也可返回 `nextCursor`，声明 `listChanged` 的 Server 使用同名 `notifications/tools/list_changed`。旧代不使用上述现代 `subscriptions/listen` 契约，不能把两代的握手、元数据和通知关联方式混发。资源旧代的 `resources/subscribe` 与旧 HTTP GET 通知流同样应单独兼容，现代则使用显式订阅。

依据：[固定版本能力发现](https://modelcontextprotocol.io/specification/2026-07-28/server/discover)、[订阅及确认规则](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions)、[现代工具与分页](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)和[旧代 tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)。服务器自报 `name` 不保证全局唯一，聚合工具仍使用 Host 配置的稳定服务器身份。

## 26.2 完整现代工具请求

下面是一对静态协议夹具，服务器工具假定只读取教学文本。请求与响应均为完整 JSON-RPC envelope；真实网络传输还需要对应的 HTTP 头或 stdio framing。

```json
{
  "jsonrpc": "2.0",
  "id": "read-1",
  "method": "tools/call",
  "params": {
    "name": "read_guide",
    "arguments": {"topic": "boundaries"},
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": {
        "name": "tutorial-fixture",
        "version": "1.0.0"
      },
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "read-1",
  "result": {
    "resultType": "complete",
    "content": [
      {"type": "text", "text": "The fixture permits read operations only."}
    ],
    "structuredContent": {
      "source": "guide://boundaries",
      "mode": "read-only"
    },
    "isError": false
  }
}
```

`structuredContent` 是服务器结果数据，不是模型结构化生成。若工具声明 output schema，客户端应按该 schema 验证结果；即使 schema 合法，里面的内容仍不是权限证明。`isError: true` 应表示工具执行失败，不能因为 HTTP 200 就把结果标成功。

协议错误与执行错误不同。未知 RPC 方法属于协议层错误；一个工具识别了请求但读取失败，可以用工具错误结果反馈。Host 应保留区分，使模型知道应该修正参数、换一种已授权观察，还是停止等待服务恢复。

## 26.3 资源和模板的按需链路

```text
资源目录 / URI 模板 -> 选择具体 URI -> resources/read
                                            |
                                   文本或二进制内容
                                            |
                       校验大小、来源、模态 -> 上下文或附件

提示模板目录 -> 用户选择 -> prompts/get -> 校验消息 -> 请求装配
```

资源列表通常只带名称、URI、描述等元数据，不应误当资源正文。URI 模板需要按其模板语义展开，不能简单字符串替换未编码参数；真正访问前仍检查服务器、授权和地址合法性。分页 cursor 属于原服务器，不应拿到其他连接继续请求。

现代 `resources/read` 完成结果包含 `contents` 和缓存提示。返回链接并不自动触发下载，也不保证该 URI 会出现在资源目录。Host 应按需读取、保留来源，避免工具结果诱导无界跨服务抓取。

Prompts 返回 user 或 assistant 消息内容，宿主仍要校验并按目标模型协议装配。不能把返回模板提升成部署 system 指令，也不能把模板中“请运行某命令”当作审批。Prompt 的用户控制描述指选择时机，不意味着内容由用户编写或天然可信。

## 26.4 结果的三种表面

工具结果可能同时有完整 JSON、模型可读内容和 UI 展示。程序需要结构化数据做后续计算，模型需要有限且可解释的观察，UI 可以展示更多细节。它们必须关联到同一执行结果，而不是三个互不一致的版本。

DeepSeek 固定版本保留 canonical MCP JSON，并准备普通工具文本和受支持图片。图片需要当前路由能力及附件链路证明；音频和 embedded resources 不会自动成为模型输入，而是保留程序数据并提供明确诊断。资源二进制也不会因 base64 可解析就当图片上传。

把未知 rich content 悄悄丢掉会隐藏证据不足。应告诉模型哪些内容未能投影，同时让程序调用者保留原始结果。反过来，把全部 base64 拼进文本历史会浪费预算，并可能泄漏或导致模型误解；格式与模态需要独立处理。

## 26.5 失败案例与实验

一个常见失败是把 annotations 中的 `readOnlyHint` 当作硬权限，允许工具无审批执行。它是服务器声明，应结合可信来源和具体政策，不等于操作系统限制。另一个失败是只验证 input schema，却对超大或 malformed 输出无界保存和渲染。

输出 schema 与内容投影也要分别验收。服务器可以返回结构化对象供程序计算，同时提供文本解释供模型阅读；如果二者矛盾，宿主不能随意选择较像成功的一面。应保留原结果、报告校验失败，并避免让后处理补上一段文字就制造“协议成功”的假象。

静态实验可以用 `JSON.parse()` 解析上述两段，断言请求 id 与响应 id 一致、请求版本正确、完成类型明确、文本和结构化值同时保留。把 `isError` 改为 true 后，适配测试必须返回失败；不能靠内容里包含“成功”修正错误标记。

真实资源实验应验证列表、模板、分页和按需读取次数。仅连接时不应读取全部正文；读不存在 URI 应返回明确错误，不能用空内容假装资源存在。若没有真实 Server，本章只完成协议形状核对，不宣称端到端工具执行通过。

还应测试资源读取结果的 URI 和请求所属服务器。内容里自带一个文件路径，不表示它属于 Host 的工作区；服务器返回另一个 URI 时，需要按具体响应规范核对来源和用途。界面可以显示路径帮助理解，但本地读取权限不能从这段文本反向生成。

`npm run labs` 不包含 MCP 协议客户端，不能拿其确定性机制测试当作 MCP 互通证据。原项目也没有 prompt 选择 UI、资源缓存或多模态 MCP 结果适配器。

## 26.6 用当前 SDK 注册只读工具

2026-10-23 核对官方 v2 README 与迁移指南：新服务从 server 分包导入，使用 `registerTool()` 与完整 Standard Schema 对象，不继续使用旧 `.tool()` 的重载或散落的 Zod shape。下面服务只返回内存中的授权教学文本，没有网络或文件访问。

在独立实验目录安装依赖后，将代码作为 `server.mjs` 运行。安装会下载并执行包管理流程，需要先批准来源；不要使用浮动 `npx -y` 代替固定服务身份：

```sh
npm install --save-exact @modelcontextprotocol/server@2.3.1 @modelcontextprotocol/client@2.3.1 zod@4
```

```js
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

const server = new McpServer({ name: 'evidence-server', version: '1.0.0' });
server.registerTool('read_guide', {
  description: 'Read the permitted in-memory guide',
  inputSchema: z.object({ topic: z.literal('boundaries') }),
}, async () => ({
  content: [{ type: 'text', text: 'Only read operations are permitted.' }],
  isError: false,
}));
await server.connect(new StdioServerTransport());
```

stdio Server 的 stdout 不能打印启动日志；该进程等 Client 启动和关闭，第 27 章给出对应客户端。这里返回的是 SDK handler 结果，wire 的 `resultType` 和元数据由 SDK 按其契约处理，不要把前面的完整 JSON-RPC envelope 再塞进 handler 返回值。

正常验收：发现恰好一个工具，调用 `topic: "boundaries"` 得到文本且不是错误。异常验收：`topic: "other"` 必须在 handler 前被 schema 拒绝，未知工具属于协议错误，不能转成空成功。练习是在内存 handler 加执行计数，确认无效参数计数仍为零；排错区分导入入口、schema 注册、协议错误和工具 `isError`，不以 HTTP / 进程退出码替代工具结算。

依据：[v2 SDK 服务示例](https://github.com/modelcontextprotocol/typescript-sdk#getting-started)与[迁移指南](https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2)。代码展示公开 API，实际 SDK 与 Host 的互通需要运行后记录，不把静态类型核对当成端到端结果。

## 26.7 固定官方来源

协议依据 [2026-07-28 tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)、[resources](https://modelcontextprotocol.io/specification/2026-07-28/server/resources)和[prompts](https://modelcontextprotocol.io/specification/2026-07-28/server/prompts)。这些固定版本页与第十九章的 Skill 文件规范不是同一个标准。

DeepSeek `0.2.1-alpha.5` 的[MCP 子系统](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/mcp.md)、[资源工具目录](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/tool-catalog.md)和[结果适配源码](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/mcp/mcp-client/src/tools.ts)用于核对其支持范围。协议具备 prompts，不代表该实现已经提供相应调用路径。

---

上一篇：[第25章：MCP Host、Client 与 Server](./25-mcp-architecture.md) · 下一篇：[第27章：MCP 传输与协议版本迁移](./27-mcp-transports-versions.md)
