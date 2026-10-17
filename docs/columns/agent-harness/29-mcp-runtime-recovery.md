---
title: '第29章：MCP 缓存、订阅与故障恢复'
description: 区分协议缓存提示、资源更新订阅和宿主连接代际，用确定性实验验证过期、授权隔离与迟到结果处理。
date: '2026-10-17'
category: 智能体工程
tags: [Agent Harness, MCP, 缓存, 订阅, 故障恢复]
series:
  order: 29
---

# 第29章：MCP 缓存、订阅与故障恢复

工具目录曾经发现成功，不意味着当前连接可用；缓存未过期，也不意味着内容不会变化。MCP 的恢复设计需要同时处理协议新鲜度、授权范围和 Host 资源代际。把这些状态都压成一个 `connected` 布尔值，故障时无法判断应该重读、重连还是停止执行。

本章协议基线是 `2026-07-28`。DeepSeek 固定版本支持工具目录更新和有限连接恢复，但不支持资源订阅；不要因 SDK 能建立某种通知流，就把产品资源读取说成自动实时更新。原教学项目及 labs 没有 MCP 缓存或连接 supervisor。

## 29.1 缓存提示不是完整性证明

现代规范为部分完成结果定义 `ttlMs` 与 `cacheScope`。TTL 是收到结果后多久可合理视为新鲜，不是服务器承诺字节绝不变；private 缓存只能复用到相同授权上下文，不能跨用户或不同凭据共享。

| 状态 | 可以做什么 | 不可推导 |
| --- | --- | --- |
| TTL 内新鲜 | 按政策减少重读 | 内容永远未变 |
| 收到更新通知 | 立即失效并按需重取 | 通知携带完整新正文 |
| private 缓存 | 同授权上下文复用 | 同服务器所有账号共享 |
| 工具目录仍在 | 展示最后已知能力 | 当前调用一定成功 |
| RPC 连接中断 | 记录不确定结果 | 副作用必定未发生 |

缓存键要包含服务器身份、方法和影响结果的参数，例如 URI 和 cursor。授权上下文需要稳定但不泄密的内部身份；不能把 Token 明文放进日志键，也不能只用用户显示名。重试中带 `inputResponses` 或 `requestState` 的结果按该版规范不缓存。

## 29.2 订阅通知是失效信号

现代 `subscriptions/listen` 用请求建立长通知流，Server 首先发送 acknowledged，说明实际接受的过滤集合。Client 必须检查请求与确认的差异；请求订阅不代表 Server 支持全部通知。后续消息通过 subscription id 关联到对应流。

```text
首次读取 -> TTL 缓存 -> 按需访问时判断新鲜
                            |
订阅确认 -> 更新通知 -------> 立即失效
                            |
                       重新读取与校验
                            |
                   更新当前视图，保留旧历史
```

资源正文更新不应回写旧工具结果。历史记录表达“当时读到了什么”，当前缓存表达“现在可以复用什么”。把新正文覆盖旧会话，会使之前的模型请求无法重建，也会把旧推断伪装成建立在新证据上。

连接重建后需要重建订阅，不能假设旧 subscription id 仍有效。现代机制替代旧 `resources/subscribe` 和 HTTP GET 通知路径；这一迁移规则与第二十七章一致，不能在现代 Client 中只发旧订阅方法。

## 29.3 一个授权隔离与代际实验

下面完整 Node.js 代码只是内存缓存和代际检查器，不实现 MCP wire 或通知解析。时间由夹具控制，方便观察 TTL 边界，不会访问真实凭据。

```js
import assert from 'node:assert/strict';

let now = 100;
const cache = new Map();
const key = (server, authContext, uri) =>
  JSON.stringify([server, authContext, 'resources/read', { uri }]);
function put(server, authContext, uri, value, ttlMs) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 0) throw new Error('Invalid TTL');
  cache.set(key(server, authContext, uri), { value, expiresAt: now + ttlMs });
}
function get(server, authContext, uri) {
  const item = cache.get(key(server, authContext, uri));
  return item && now < item.expiresAt ? item.value : undefined;
}

put('docs', 'account-a-v1', 'guide://limits', 'read-only', 50);
assert.equal(get('docs', 'account-a-v1', 'guide://limits'), 'read-only');
assert.equal(get('docs', 'account-b-v1', 'guide://limits'), undefined);
now = 150;
assert.equal(get('docs', 'account-a-v1', 'guide://limits'), undefined);

let generation = 1;
const observedGeneration = generation;
generation++;
function acceptResult(sourceGeneration, result) {
  if (sourceGeneration !== generation) throw new Error('Stale generation');
  return result;
}
assert.throws(() => acceptResult(observedGeneration, 'late reply'), /Stale/);
assert.equal(acceptResult(generation, 'current reply'), 'current reply');
console.log('cache isolation and generation checks passed');
```

这份代码只演示 private 缓存，没有实现 public 共享、通知失效或容量上限。生产缓存还需限制条目数与结果大小，验证 URI 来源，并避免授权变化后继续复用旧条目。整数 TTL 检查也不能替代远端结果 schema 验证。

## 29.4 连接恢复与目录同步是两个事务

DeepSeek supervisor 串行化初次同步、通知同步和重连同步，避免两个操作交错拆除与登记。发现完整新目录前不触碰旧工具；网络发现失败保留旧代际。这样模型仍知道曾经的工具，但连接中断时实际调用会失败。

源码还有一个重要边界：新定义构造成功后，swap 先撤回旧登记，再登记新集合；若新登记与其他贡献冲突，会回滚本次已登记条目，使该服务器零工具，而不是恢复旧集合。文档泛称“更新失败保留旧工具”时，应区分发现失败与注册阶段冲突，以源码为准。

恢复退避由宿主配置控制，固定版本默认从五百毫秒增加到三万毫秒，并有每次故障的有限尝试预算。稳定连接达到规定窗口后才重置计数，短暂连上又崩溃不能无限复活。预算耗尽会撤回工具并停止重连，需重新加载或重启。

卸载要取消定时器、关闭当前或正在协商的 transport，等待连接尝试与同步链静止，再撤回工具。旧 generation 的迟到回调不能更新新连接状态。请求取消也不能由新 generation 接手继续，否则用户以为停止的动作可能重新执行。

## 29.5 失败案例：恢复了连接，重放了写操作

客户端在发送写请求后断线，Server 可能已执行但结果丢失。自动重连只恢复通信，不确认业务是否完成。若再发同一写操作，会重复创建、发送或发布。恢复策略需要工具自身的幂等键或状态查询，不能从“RPC 无状态”推导 exactly-once。

另一个失败是把 TTL 当轮询间隔，成千上万 Client 同时过期并后台刷新。规范把 TTL 视为访问时的新鲜度提示；主动轮询需要 jitter 和 backoff，不是每个条目自动启一个周期定时器。

分页也没有天然跨页快照保证。第一页与第二页之间目录变化，可能出现重复或遗漏；Client 需要校验重复和 cursor 链，要求一致视图时从头重取。把每页缓存当完整目录缓存，会让缺失项被误认为删除。

## 29.6 实验与可观察验收

运行夹具应确认 private 内容不能跨授权上下文读取，恰好到期即不可复用，旧代际结果被拒绝。将 now 设为一百四十九应仍取得内容；同一 URI 换服务器应不命中。这些断言证明局部缓存键和时间边界，不证明 Server 订阅正确。

真实恢复验收需故障注入：发现中断、重复目录、注册冲突、连续崩溃、稳定后再次断线、卸载时迟到结果。观察目录、调用错误与进程数，不能只看“已重连”日志。本文未启动 Server，资源订阅和真实网络恢复仍未验证。

## 29.7 固定官方来源

协议依据 [2026-07-28 caching](https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching)、[subscriptions](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions)和[resources](https://modelcontextprotocol.io/specification/2026-07-28/server/resources)。

DeepSeek `0.2.1-alpha.5` 的[supervisor 源码](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/mcp/mcp-client/src/connection.ts)、[同步源码](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/mcp/mcp-client/src/tools.ts)及[MCP 限制](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/mcp.md)用于区分标准能力与产品实现。标准支持资源订阅，不代表这个固定版本已启用它。

---

上一篇：[第28章：MCP OAuth 与远程授权](./28-mcp-authorization.md) · 下一篇：[第30章：MCP Apps、Tasks 与 Skills 扩展](./30-mcp-extensions.md)
