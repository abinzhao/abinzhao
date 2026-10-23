---
title: '第27章：MCP 传输与协议版本迁移'
description: 对照现代逐请求协议与旧初始化协议，解释 stdio、Streamable HTTP、版本探测和取消的不同契约。
date: '2026-10-23'
category: 智能体工程
tags: [MCP, stdio, Streamable HTTP, 协议迁移]
series:
  order: 27
---

# 第27章：MCP 传输与协议版本迁移

MCP 的日期版本不是文档更新时间，而是线上语义选择。同样叫 Streamable HTTP，`2025-11-25` 和 `2026-07-28` 的初始化、会话和通知方式已经不同。把新字段加到旧握手示例里，会得到一个双方都不承诺支持的混合协议。

本章分别标注两个时代：现代为 `2026-07-28` 及其逐请求模型，旧版以 `2025-11-25` 初始化生命周期为比较基线。原教学项目的 SSE provider 属于模型 Chat Completions，不是 MCP Transport；能解析 SSE 不等于已经实现 MCP。

## 27.1 传输与协议分开选

stdio 通过 Client 启动的子进程标准流交换 JSON-RPC；Streamable HTTP 通过 MCP endpoint 传递请求和结果。传输定义字节怎样装帧、元数据怎样携带和取消怎样表达，协议定义请求的含义。二者都需要版本一致。

| 契约 | 2025-11-25 旧版 | 2026-07-28 现代 |
| --- | --- | --- |
| 初始化 | `initialize` 后 `notifications/initialized` | 无初始化握手，逐请求版本和能力 |
| 服务发现 | 初始化结果含能力 | `server/discover`，Client 可提前取得 |
| HTTP 会话 | 可有协议会话标识 | 移除协议级会话 |
| 长通知流 | 旧资源订阅及 HTTP GET 机制 | `subscriptions/listen` 请求流 |
| 服务端请求 | 可主动发起请求 | 交互嵌入 `input_required` 结果 |

旧版并没有因为新的版本发布而从所有服务消失。双时代 SDK 需要探测和回退；只支持现代的客户端不能假设旧服务器收到 `tools/call` 就按现代语义处理。协议时代应绑定到服务器配置或进程生命期，失败后按官方规则重新判断。

## 27.2 一份现代 stdio 发现请求

下面 JSON 是完整现代请求，可序列化为单行并追加换行。文本中的换行必须在 JSON 字符串里转义，不能用 pretty-print 多行 JSON 当 stdio 消息。它不启动进程，也不实现服务器。

```json
{
  "jsonrpc": "2.0",
  "id": "discover-1",
  "method": "server/discover",
  "params": {
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

stdio 的 stdout 只能输出协议消息，日志走 stderr；stderr 中的日志不自动意味着工具失败。把 `console.log('ready')` 放在服务器启动处，会破坏 JSON-RPC framing。Client 也不能往 stdin 插入 shell 命令或非协议控制文本。

现代 stdio 取消通过 `notifications/cancelled` 引用请求标识；关闭整个进程管道则影响全部请求。每条请求需要单独结算，不能因为关闭一个等待者就把其他调用标成功。停止 Server 还需等待进程退出，必要时使用平台终止手段。

## 27.3 现代 HTTP 不是旧 SSE endpoint

现代 Streamable HTTP 每条请求独立 POST 到同一个 endpoint，接受 JSON 或请求级 SSE 响应。Client 必须接受两种响应类型，并将版本等元数据与要求的 HTTP 头一致携带。普通 `tools/call` 的 `Mcp-Method` 和 `Mcp-Name` 也属于该版头部契约。

```text
现代 Client -> POST RPC + _meta + 对应 headers -> Server
              <- JSON 完成结果 或 请求级 SSE <-/

旧版 Client -> initialize -> 协商版本 -> initialized
              -> 按旧版会话与通知规则继续

双时代 Client -> 官方探测 -> 现代 / 旧版分支
              不把两个分支的状态和字段混合
```

现代取消请求级 SSE 通过关闭响应流表达；资源通知通过 `subscriptions/listen` 的响应流承载，不是另外 GET 一个永久事件流。规范明确不支持以 `Last-Event-ID` 恢复现代 SSE 流，不能把一般 SSE 技巧直接作为 MCP 恢复保证。

HTTP endpoint 还必须检查 Origin，尤其是本机服务的 DNS rebinding 风险。绑定 localhost、授权校验和 Origin 校验解决不同问题，不能仅凭监听地址就忽略浏览器来源。代理缓冲也可能延迟事件，需要在真实网络链路测试而不只在内存流测试。

请求体与头部应来自同一个已绑定请求，而不是分别读取可变配置。若头部版本与 `_meta` 版本不同，现代规范要求拒绝；错误地接受这种请求，会使代理按一种协议路由，Server 却按另一种语义执行。验收需要检查实际发送字节，而不只检查配置对象。

## 27.4 回退由错误形状决定

双时代 stdio Client 应先 `server/discover`：取得发现结果或可识别现代错误，表明对方属于现代；版本不支持时选择双方支持版本，不能退回 initialize。其他错误或合理探测超时则按旧版分支处理，不应只匹配一个固定未知方法错误码。

HTTP 探测必须同时判断状态与响应体：400、404、405 且不含可识别的现代协议错误，才考虑旧协议回退。现代 UnsupportedProtocolVersionError、HeaderMismatch 或现代 method-not-found 不是切回 initialize 的依据。401 / 403 属于授权或来源问题，不允许回退到无认证旧接口。协议回退必须保持端点身份、出域政策和授权边界。

DeepSeek 固定版本依赖 `@modelcontextprotocol/client` `2.2.0`，源码使用自动版本选择，由官方 SDK 负责时代探测和协议验证；没有一个产品配置字段强制任意协议 revision。不要在 YAML 中发明 `protocolVersion` 并声称已生效。

## 27.5 失败案例：重试不等于重放安全

Server 重启后，协议可以重新请求，但工具可能已经产生副作用。连接无状态不意味着业务无状态，丢失响应也不等于操作没执行。读操作可以按政策重取，写操作应有幂等标识或结果查询，不能自动无条件重发。

另一个失败是把 Content-Type 为 SSE 的全部行当 JSON。SSE 包含注释和事件边界，网络 chunk 也不等于一条完整消息；stdio 又是换行分隔 JSON。两种 framing 不能共用一个“读到换行就 parse”的简化器。

还要区分 SDK 包版本和协议版本。SDK 2.2.0 不等于 MCP 2.2.0，日期协议也不承诺所有 SDK 扩展已经实现。升级时应分别记录包版本、支持的协议时代、Host 暴露能力和真实互通结果。

## 27.6 实验与可观察验收

把现代发现对象执行 `JSON.stringify(request) + '\n'`，检查只生成一个消息行；给 JSON 字符串加入换行内容，仍应被转义。然后分别建立现代和旧版静态夹具，断言现代有逐请求 `_meta`，旧版只在 initialize 阶段协商，不把两套状态混用。

真实互通验收需要现代、旧版和双时代 Server，覆盖发现错误、版本不支持、无认证、部分响应、取消和重启。对写工具还需要观察服务端副作用次数；仅 Client 返回失败不能证明外部动作未发生。本章不启动这些 Server，也不宣称网络兼容测试已完成。

## 27.7 当前 HTTP 元数据与头部编码

2026-10-23 复核现代 transport：版本、方法和适用的名字分别放入 `MCP-Protocol-Version`、`Mcp-Method`、`Mcp-Name`，并与 body 一致。`Mcp-Name` 对应 tools / prompts 的 `params.name` 或 resources 的 `params.uri`，不是 Host 加前缀后的公共名。缺失、格式错误或不一致，Server 应返回 HTTP 400 和 JSON-RPC `-32020` HeaderMismatch。

非 ASCII 或不能安全表示的值用 `=?base64?{UTF-8字节的Base64}?=`；即使纯 ASCII，只要本身匹配此 sentinel 形状，也必须编码，避免歧义。不是 URL 百分号编码，Server 应先解码再比较。以下只演示编码函数，不是完整 HTTP 校验器：

```js
import assert from 'node:assert/strict';
const encodeName = value => {
  if (/^[\x20-\x7e]+$/.test(value) &&
      !(value.startsWith('=?base64?') && value.endsWith('?='))) return value;
  return `=?base64?${Buffer.from(value, 'utf8').toString('base64')}?=`;
};
assert.equal(encodeName('read_guide'), 'read_guide');
assert.equal(encodeName('读取'), '=?base64?6K+75Y+W?=');
assert.notEqual(encodeName('=?base64?YWJj?='), '=?base64?YWJj?=');
```

如果工具 schema 还声明了自定义 `Mcp-Param-*` 头，Client 要按对应参数契约生成，代理不能随意删改。头部不一致时先刷新 schema 并重建合法请求，不能在代理里修改 body 让检查通过；写操作重试仍需确认此前没有执行。

## 27.8 对接第 26 章的 v2 客户端

在与 `server.mjs` 相同的独立实验目录运行下面 `client.mjs`。它从本机已安装的固定依赖导入，用当前 Node 启动服务，不临时下载执行器，不调用模型：

```js
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const client = new Client({ name: 'evidence-client', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath, args: ['server.mjs'],
});
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, 'read_guide');
  const result = await client.callTool({
    name: 'read_guide', arguments: { topic: 'boundaries' },
  });
  assert.notEqual(result.isError, true);
  assert.ok(result.content.some(block =>
    block.type === 'text' && block.text.includes('Only read')));
  const invalid = await client.callTool({
    name: 'read_guide', arguments: { topic: 'other' },
  });
  assert.equal(invalid.isError, true);
} finally {
  await client.close();
}
```

正常验收是发现、只读调用与进程清理都完成；异常参数返回 `isError`，连接或未知方法抛错则保持原错误。练习：终止服务、写入非 JSON stdout、取消等待，以及模拟旧版对端，记录实际协议分支和存活进程数。编码断言不能证明真实代理正确转发，stdio 测试不能证明 HTTP / OAuth 成立。

SDK 契约依据[官方 first-client](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/get-started/first-client.md)；该页旧 initialize 措辞的冲突见第 25 章。协议选择由 SDK 和固定 wire 规范验收，不用注释代替观察。完整迁移门禁见[第 73 章](./73-version-governance.md)。

## 27.9 固定官方来源

现代依据 [versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)、[stdio](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio)和[Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)；旧版依据 [2025-11-25 lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)。

DeepSeek `0.2.1-alpha.5` 的[依赖清单](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/mcp/mcp-client/package.json)、[传输源码](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/mcp/mcp-client/src/transport.ts)和[连接 supervisor](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/mcp/mcp-client/src/connection.ts)提供宿主实现依据。协议标准、SDK 行为和产品配置分别核对，不互相代称。

---

上一篇：[第26章：MCP 工具、资源与提示模板](./26-mcp-tools-resources.md) · 下一篇：[第28章：MCP OAuth 与远程授权](./28-mcp-authorization.md)
