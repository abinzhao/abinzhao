---
title: "第 49 章：SSE、WebSocket 与实时状态"
description: "从可丢失的状态通知开始，实现有鉴权、连接上限、背压与清理的 SSE，理解 WebSocket、重连和持久重放的边界。"
date: '2026-10-23'
category: 后端工程
tags: [SSE, WebSocket, 背压, 实时通信]
series:
  order: 50
---

# 第 49 章：SSE、WebSocket 与实时状态

作者在另一窗口发布文章，管理列表应提示更新，但这不意味着每次编辑都要通过 WebSocket 写数据库。普通 HTTP 保留校验、CSRF、事务与错误契约，实时通道只通知“状态可能改变”，浏览器再读取可信快照。把写入与通知分开，可以在连接断开时继续保存，也可以在丢失一条通知后恢复一致状态。

## 49.1 先决定实时意味着什么

轮询适合更新不频繁、可以接受几秒延迟的后台；SSE 适合服务端向浏览器单向推送；WebSocket 适合确实需要双向低延迟消息的协作或游戏。连接建立成功不代表消息可靠交付，更不代表业务事务提交。TCP 保证连接内字节顺序，不替应用保证跨重连的业务顺序、去重与持久保存。

博客首先选择 SSE。浏览器原生 `EventSource` 支持事件类型、重连间隔与事件 ID，但没有任意自定义请求头接口。同域 HttpOnly Session Cookie 可以用于身份解析，不要把 Session、JWT 或 CSRF 放进 URL。URL 会进入访问日志、历史与监控；实时 GET 不执行业务写入，状态改变仍走带 CSRF 的 HTTP 接口。[EventSource 说明](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)

本章实现“有界延迟的失效通知”，不是消息队列：数据库仍是事实来源；连接建立立即通知客户端刷新；每五秒重新查询授权和状态摘要；断线期间的通知允许丢失。它适合小规模学习，不能把每连接查询的方案直接扩展到十万连接，也不能声称已有持久事件重放。

## 49.2 为流定义独立安全边界

沿用第 43 章的 Session 表、第 45 章的成员表与第 40 章文章字段。`@fastify/cookie` 必须先注册。以下模块接收现有连接池、固定站点 Origin 和 Cookie 名，不另建数据库连接。连接池需要配置查询超时；应用账号只访问学习数据库。所有流共享全局上限，单 Session 也有上限，多实例时还需网关或共享额度。

```ts
// src/realtime.ts
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { sessionDigest } from './security.js';

export function registerEvents(
  app: FastifyInstance, pool: Pool, origin: string, cookieName: string,
) {
  const closers = new Set<() => void>();
  const counts = new Map<string, number>();
  app.addHook('onClose', async () => {
    for (const close of [...closers]) close();
  });

  app.get<{ Params: { tenantId: string } }>(
    '/api/tenants/:tenantId/events',
    { schema: { params: {
      type: 'object', additionalProperties: false,
      required: ['tenantId'], properties: {
        tenantId: { type: 'string', format: 'uuid' },
      },
    } } },
    async (request, reply) => {
      if ((request.headers.origin && request.headers.origin !== origin) ||
          request.headers['sec-fetch-site'] === 'cross-site') {
        return reply.code(403).send({ code: 'ORIGIN_DENIED' });
      }
      const token = request.cookies[cookieName];
      if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
        return reply.code(401).send({ code: 'AUTH_REQUIRED' });
      }
      const digest = sessionDigest(token);
      const tenantId = request.params.tenantId;
      async function fingerprint(): Promise<string | null> {
        const found = await pool.query<{ fingerprint: string }>(
          `SELECT md5(COALESCE((
             SELECT string_agg(p.id::text || ':' || p.revision::text,
                               ',' ORDER BY p.id)
             FROM posts p WHERE p.tenant_id=m.tenant_id
           ), '')) AS fingerprint
           FROM sessions s JOIN memberships m ON m.user_id=s.user_id
           WHERE s.token_hash=$1 AND s.expires_at>now()
             AND m.tenant_id=$2`, [digest, tenantId],
        );
        return found.rows[0]?.fingerprint ?? null;
      }
      let previous = await fingerprint();
      if (previous === null) {
        return reply.code(404).send({ code: 'NOT_FOUND' });
      }
      if (closers.size >= 500 || (counts.get(digest) ?? 0) >= 4) {
        return reply.code(429).send({ code: 'STREAM_LIMIT' });
      }
      counts.set(digest, (counts.get(digest) ?? 0) + 1);
      reply.hijack();
      const response = reply.raw;
      response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Accel-Buffering': 'no',
      });
      let closed = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = setTimeout(() => stop(), 300000);
      function stop() {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        clearTimeout(deadline);
        closers.delete(stop);
        const remaining = (counts.get(digest) ?? 1) - 1;
        if (remaining === 0) counts.delete(digest);
        else counts.set(digest, remaining);
        response.end();
      }
      function send(frame: string) {
        if (closed) return;
        if (!response.write(frame)) {
          stop();
          response.destroy();
        }
      }
      response.once('close', stop);
      response.once('error', stop);
      closers.add(stop);
      send('retry: 3000\nevent: invalidate\ndata: {"kind":"posts-changed"}\n\n');
      async function tick() {
        try {
          const current = await fingerprint();
          if (closed) return;
          if (current === null) return stop();
          if (current !== previous) {
            previous = current;
            send('event: invalidate\ndata: {"kind":"posts-changed"}\n\n');
          } else {
            send(': heartbeat\n\n');
          }
        } catch {
          stop();
        }
        if (!closed) timer = setTimeout(() => void tick(), 5000);
      }
      if (!closed) timer = setTimeout(() => void tick(), 5000);
    },
  );
}
```

摘要中的 MD5 仅用于检测变化，不保护密码、不签名、不作为授权依据。所有内容修改、发布和撤回都必须递增 revision，删除也会改变集合。哈希理论上可能碰撞，这不是强一致同步协议；需要严格增量同步时改为事务内维护空间版本或持久事件序号。文章很多时计算摘要会越来越贵，应比较空间版本、共享通知与普通轮询的成本。

初始授权在写响应头前完成。流开始后不能再返回 JSON 401；过期或成员被移除时关闭连接，客户端重新读取 Session 和列表。权限撤销在本示例中有最多一个轮询周期加查询耗时的窗口；需要立即撤销时增加主动关闭信号。原始响应由 `hijack()` 接管，普通序列化和 `onSend` 不能当成自动安全保障，所以这里明确写缓存和内容类型头。[Fastify Reply](https://fastify.dev/docs/latest/Reference/Reply/)

## 49.3 客户端刷新与编辑冲突分离

下面函数运行于已登录的同域页面。每次连接与失效通知都重新读取快照，刷新请求失败显示离线状态，不把旧数据清空。回调返回 Promise，让当前刷新期间的通知合并成一次追加刷新；退出、切换空间和组件卸载时必须调用清理函数。

```ts
export function watchPosts(
  tenantId: string,
  reload: () => Promise<void>,
  report: (state: 'connected' | 'reconnecting' | 'failed') => void,
) {
  const source = new EventSource(
    `/api/tenants/${encodeURIComponent(tenantId)}/events`,
  );
  let disposed = false;
  let loading = false;
  let dirty = false;
  async function refresh() {
    dirty = true;
    if (loading) return;
    loading = true;
    try {
      while (dirty && !disposed) {
        dirty = false;
        await reload();
      }
    } catch {
      if (!disposed) report('failed');
    } finally {
      loading = false;
    }
  }
  source.onopen = () => { report('connected'); };
  source.addEventListener('invalidate', () => { void refresh(); });
  source.onerror = () => { report('reconnecting'); };
  return () => { disposed = true; source.close(); };
}
```

清理阻止后续刷新，正在进行的 HTTP 请求还应由页面的数据层通过 AbortController 取消。管理页面不要在通知后无条件覆盖用户尚未保存的正文。列表可以刷新，编辑器则提示“服务器版本已改变”，保留本地文本；保存时仍携带 revision，用第 41 章的条件更新拒绝冲突。广播不能替代并发控制。

`EventSource.onerror` 不可靠地提供 HTTP 状态；认证失败时应通过独立 Session 请求判断并关闭流，避免永久重连。网络异常保留自动重连，鉴权过期显示重新登录。服务器的五分钟连接期限防止永不结束的流，客户端重连后立即收到失效通知，因此状态恢复不依赖漏掉的旧帧。

## 49.4 背压、代理与资源释放

Node `write()` 返回 false 表示内部缓冲到达阈值，并非消息已经失败，也不是客户端已经消费。通用流通常暂停生产、等待 drain；本例只发送可丢失的失效通知，选择关闭慢连接，再通过重连快照恢复。若无限积压消息，慢客户端可以耗尽服务内存。连接数、写缓冲、心跳频率与最大存活时间都应进入容量预算。[Node 流背压](https://nodejs.org/api/stream.html)

代理缓冲可能让服务器五秒发送的数据几十秒后才显示。需要检查反向代理响应缓冲、压缩、空闲超时和负载均衡连接策略；`X-Accel-Buffering` 只是部分代理识别的提示，不是通用网络保证。不要手写 HTTP/1.1 的 Connection 头来“修复”所有平台，HTTP/2 不使用这些连接级头。多标签页还会消耗浏览器同源连接资源。

每连接占一条 HTTP 连接，不应占一个长期 PostgreSQL 客户端或数据库事务。示例通过池短查询，不把事务持有到浏览器关闭。定时器采用查询完成后再排下一轮，避免数据库变慢时 setInterval 叠加。服务停止时关闭所有流，之后才结束连接池；长查询需有服务器侧 statement timeout，否则清理函数不自动取消已经发出的 SQL。

## 49.5 何时增加 WebSocket 与持久事件

双向协作需要 WebSocket 时，课程插件版本为 `@fastify/websocket@11.3.4`，先注册插件再注册 websocket 路由。握手阶段核验 Session、精确 Origin 与资源权限；Cookie 会自动发送，因此跨站 WebSocket 劫持仍需防护。连接后的每类消息还需 JSON schema、长度上限、频率上限和实时授权，不以“握手时已经登录”永久放行。

消息处理器必须在异步工作前同步绑定，避免等待数据库时丢消息。限制 `maxPayload`，默认不启用有额外资源成本的压缩，捕获 message 回调内部的异常；发送前检查 `bufferedAmount`，达到阈值关闭或丢弃可替代状态。使用 ping/pong 检测失活并清理计时器。业务写入继续沿用 CSRF HTTP，或为 socket 消息单独设计同等强度的操作协议。[官方插件](https://github.com/fastify/fastify-websocket)

若要求断线后补齐所有发布通知，把事件与文章事务一起写入第 47 章 Outbox，再建立有保留期限的投递记录。SSE `id` 与 `Last-Event-ID` 只是游标传输：服务器还须验证游标格式、所属空间、序号范围、保留窗口与访问权限。游标过旧时发送 reset 后读快照，不能假装从不存在的历史重放；客户端按事件 ID 去重，不能将“收到两次”变成“发布两次”。

## 49.6 验证、排错与练习

在隔离数据库开启两个已登录窗口，一边保存文章，另一边五秒左右收到通知并刷新列表；关闭流后保存仍成功；重新连接立即拉到当前状态。撤销 Session 和移除成员后连接应在检查窗口内结束；其他空间不能订阅，超过连接上限应在握手前返回 429。用开发者工具限速模拟慢连接，观察内存不能随发送次数持续增长。

分别经过本地直连与真实代理验证帧到达时间，不将 Fastify inject 的一次响应当成长连接验证。连接不断重建时查 Cookie、Origin、代理超时与服务重启；只收到心跳不刷新时查事件名、revision 递增和客户端监听器；退出后还有查询时查卸载与 close 清理。日志只记路由模板、错误类别和连接数，不记录 Session 摘要、完整 URL 或正文。

练习把每连接摘要查询改为空间级共享版本，每次写入事务递增版本；再设计断线重放的保留窗口与 reset 协议。完成标准是通知丢失可恢复、编辑输入不被覆盖、权限撤销有明确上界、慢连接不无限占内存、服务停止无残留计时器，并写清哪些功能仍只有方案而未通过真实代理和负载验证。

## 官方参考

- [MDN：使用服务端发送事件](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)。
- [WHATWG：Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html)。
- [Node.js：Stream](https://nodejs.org/api/stream.html)。
- [Fastify：WebSocket 插件](https://github.com/fastify/fastify-websocket)。
- [OWASP：WebSocket 安全](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)。

下一章：[集成与合约测试](./50-integration-contract-testing)。
