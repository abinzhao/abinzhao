---
title: '第28章：MCP OAuth 与远程授权'
description: 按 2026-07-28 授权规范解释资源服务器、发现、PKCE、受众与增量 scope，并标出静态 headers 与 OAuth 实现的区别。
date: '2026-10-17'
category: 智能体工程
tags: [MCP, OAuth, 授权, 凭据隔离]
series:
  order: 28
---

# 第28章：MCP OAuth 与远程授权

给远端 MCP 请求加上 `Authorization` 头，只是携带一个凭据，不等于实现 OAuth。完整授权还涉及资源身份、授权服务器发现、用户同意、回调校验、Token 受众和刷新。缺少这些环节时，应准确称为静态凭据接入，而不是自动认证系统。

本章以 MCP `2026-07-28` 授权规范为准，所有域名和字符串都是不可用的教学占位，不发起请求、不交换真实凭据。原本地教程只连接 loopback 模型，没有远程 MCP OAuth；DeepSeek 固定版本的 HTTP transport 配置 headers，也不能据此声称实现了 OAuth 浏览器流程。

## 28.1 两层授权不能互相代替

MCP Server 是 OAuth 资源服务器，Client 代表资源所有者访问它，授权服务器与用户交互并签发凭据。授权服务器可以与 MCP 服务同站部署，但两个角色不同。登录用户身份也不自动意味着每个工具操作获得许可。

OAuth 回答的是“这个凭据代表谁，可以访问哪些服务范围”；Host 审批回答的是“当前模型提出的具体动作能否执行”。读 scope 不等于批准把数据交给另一个服务器，写 scope 也不等于批准某次发布。工具参数仍需运行时校验。

| 机制 | 约束对象 | 不能替代 |
| --- | --- | --- |
| OAuth resource / audience | 凭据目标服务器 | 具体工具参数审批 |
| scope | 服务允许的操作集合 | 数据出域决定 |
| Host 工具政策 | 本次请求 | 服务端 Token 验证 |
| 进程环境最小化 | 本地凭据暴露 | HTTP OAuth 流程 |

规范授权主要面向 HTTP；stdio 不应照搬浏览器 OAuth transport 流程，通常从环境获得凭据。即使使用环境，也必须限制继承，不能把 Host 所有密钥交给每个子进程。

## 28.2 授权发现必须从资源身份出发

资源服务器通过 Protected Resource Metadata 指明关联授权服务器；Client 再取得授权服务器元数据。请求遇到 401 时，可以通过 `WWW-Authenticate` 的资源元数据地址和 scope 提示进入流程，而不是猜测把 MCP URL 加上 `/oauth`。

```text
访问目标 MCP -> 401 / 资源元数据 -> 验证资源与授权服务器
                                          |
                                取得 client 身份与授权参数
                                          |
                          用户同意 + PKCE -> 回调校验
                                          |
                          Token 请求含 resource -> 安全存储
                                          |
                         每个 HTTP 请求携带目标凭据
```

发现地址也是网络输入。需要 HTTPS、目的地政策、重定向限制和元数据验证，防止服务把客户端引向内部地址或攻击站点。获取到一份 JSON 不等于它对应当前资源；issuer 与 endpoint 的关系应按规范验证。

现代规范推荐 client ID metadata documents，动态注册是可选且保留兼容性的机制，不能描述成所有服务必须支持动态注册。客户端需要按官方优先级与具体服务能力取得 client ID，不在教程里臆造一个万能自动注册请求。

## 28.3 一份不含 Token 的授权事务夹具

下面代码只验证回调与本地事务记录的绑定。它不是 OAuth 客户端，不实现 PKCE 生成或 Token 交换；占位 state 仅用于观察比较，可在 Node.js 22 直接运行。

```js
import assert from 'node:assert/strict';

function validateCallback(pending, incoming) {
  const url = new URL(incoming);
  const target = `${url.origin}${url.pathname}`;
  if (target !== pending.redirectURI) throw new Error('Redirect mismatch');
  if (url.searchParams.get('state') !== pending.state) {
    throw new Error('State mismatch');
  }
  const issuer = url.searchParams.get('iss');
  if (pending.issuerAdvertised && !issuer) throw new Error('Missing issuer');
  if (issuer !== null && issuer !== pending.issuer) {
    throw new Error('Issuer mismatch');
  }
  const code = url.searchParams.get('code');
  if (!code) throw new Error('Missing authorization code');
  return { resource: pending.resource, accepted: true };
}

const pending = {
  resource: 'https://mcp.example.invalid/mcp',
  redirectURI: 'http://127.0.0.1:43123/callback',
  issuer: 'https://auth.example.invalid',
  issuerAdvertised: true,
  state: 'fixture-state-not-for-production',
};
const callback = new URL(pending.redirectURI);
callback.search = new URLSearchParams({
  state: pending.state, iss: pending.issuer, code: 'fixture-code',
}).toString();
assert.equal(validateCallback(pending, callback).accepted, true);
callback.searchParams.set('iss', 'https://other.example.invalid');
assert.throws(() => validateCallback(pending, callback), /Issuer mismatch/);
callback.searchParams.set('iss', pending.issuer);
callback.searchParams.set('state', 'other-state');
assert.throws(() => validateCallback(pending, callback), /State mismatch/);
console.log('authorization transaction binding verified');
```

真实事务需要不可预测、一次性且有期限的关联状态，以及 PKCE verifier 的保密存储。这个函数不会验证 HTTPS 元数据、重放、多个查询参数或授权错误；不能拿它替代官方 SDK 和完整安全实现。

规范要求对回调中出现的 issuer 做与记录值的精确比较；当授权服务器声明会返回 issuer 而实际缺失时拒绝。不能在比较前随意删除尾斜杠或折叠地址大小写，避免把不同发行者身份合并。目标 resource URI 的规范化与 issuer 比较是不同规则。

## 28.4 resource、scope 与凭据使用

Client 的授权请求和 Token 请求都必须携带目标 `resource`，让凭据绑定到 MCP Server。Server 验证凭据确实为自己签发，不能接受其他服务的 Token 再转交下游。Token passthrough 会把一个信任边界变成多个服务共享的隐式凭据链。

访问凭据通过 Authorization 头携带，不放在查询串、日志或模型消息。刷新凭据也需要保密，不应假设服务一定签发 refresh token。配置界面可以展示引用和有效状态，但不能把“便于调试”的明文值发给会话或诊断插件。

运行中权限不足可能返回 403 和 `insufficient_scope`。此时应按目标操作请求增量授权，向用户说明新范围；不能把服务提示的 scope 当成用户已经同意，也不能每次失败都请求全部管理员范围。

## 28.5 失败案例与实现边界

第一种失败是授权码回调没有绑定原事务，攻击者替换 issuer 或 state。第二种是把资源 A 的 Token 用于资源 B，两个服务即使属于同一公司也不应未经授权互换。第三种是把 401 当网络错误无限重试，既不能完成授权，也可能持续泄漏头部。

DeepSeek `transport.ts` 给 HTTP SDK transport 传入配置 headers，没有提供这里的发现、浏览器回调、Token 存储和刷新流程。静态 Bearer 可以作为已经取得凭据的接入方式，但它的生成和生命周期由外部可信系统负责。文档应明确这个分工。

stdio transport 从 scrubbed parent env 叠加显式 env；显式配置仍会传给子进程，不应理解成“任何密钥绝不继承”。环境 scrub 是减少意外暴露，不是进程沙箱，也不能阻止已授权插件主动读取其他本机材料。

## 28.6 实验与可观察验收

运行夹具应看到合法绑定通过，issuer 和 state 改动拒绝。删除 issuer 且保持 `issuerAdvertised: true`，应出现缺失错误。验收只说明本地比较规则成立，不代表 OAuth 成功；没有真实授权服务器和受保护 Server 时，网络发现与交换均未验证。

完整测试还需覆盖用户取消、授权错误、过期事务、错误 audience、scope 提升、刷新失败和退出清理。日志中应只有资源身份与结果类别，没有 code、verifier 或 Token。授权测试不能依赖模型是否“愿意保密”，必须检查实际请求与记录。

## 28.7 固定官方来源

标准依据 [MCP 2026-07-28 authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)。DeepSeek `0.2.1-alpha.5` 的[transport 源码](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/mcp/mcp-client/src/transport.ts)、[client 配置](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/config-catalog.md)和[凭据契约](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/credentials.md)用于核对实际支持范围。

[Claude Code MCP](https://code.claude.com/docs/en/mcp)的远程授权是厂商 Host 功能，2026-10-17 核验，不表示任何 MCP SDK 或原教程自动具有相同 OAuth UI。

---

上一篇：[第27章：MCP 传输与协议版本迁移](./27-mcp-transports-versions.md) · 下一篇：[第29章：MCP 缓存、订阅与故障恢复](./29-mcp-runtime-recovery.md)
