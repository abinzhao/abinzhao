---
title: "第 46 章：Redis 缓存与限流"
description: "用版本化 cache-aside 避免失效竞态，以原子 Lua 实现共享限流，明确 Redis 故障、TTL、内存与隐私策略。"
date: '2026-10-23'
category: 后端开发
tags: [Redis, 缓存, 限流, 一致性]
series:
  order: 47
---

# 第 46 章：Redis 缓存与限流

Redis 不应该成为“查询慢就加一个”的遮挡层。先用第 42 章修好查询，再判断重复读取是否值得缓存。数据库仍是文章事实来源；缓存允许有界陈旧、可以丢弃与重建。认证限流则是安全控制，故障时的策略可能与公开文章缓存完全不同。

## 46.1 服务端与客户端版本不是同一件事

核验日 2026-10-23，Node 客户端 `redis` 为 **6.3.0**，要求 Node >=20；课程仍选受维护 Node 24.22.1，而不是兼容最低版本。Redis 服务端采用官方 Redis 8 系列，但本次未确认精确补丁和镜像摘要，第 51 章给出核验步骤，不能把 `redis:8` 当成固定生产依赖。

```bash
npm install --save-exact redis@6.3.0
```

Redis 需要独立实例、密码/ACL、受限网络与远程 TLS。不要开放到公网，不将 URL 放进前端环境变量。缓存实例可以淘汰数据；保存队列、锁或认证状态的实例不能随意使用同一淘汰策略，这些职责应分开评估。

```ts
import { createClient } from 'redis';
const redis = createClient({
  url: process.env.REDIS_URL,
  socket: { connectTimeout: 3000, reconnectStrategy: false },
  disableOfflineQueue: true,
});
redis.on('error', () => logger.warn({ code: 'REDIS_UNAVAILABLE' }));
await redis.connect();
```

这里选择启动失败即失败、命令不离线堆积，便于学习明确故障；生产是否自动重连、缓存故障是否允许降级由组件职责决定。不能在请求 handler 中反复创建连接，也不能无限 Promise.race 超时而让原始命令在后台积压。客户端重连、请求期限和应用容量应一起设计。[Node Redis 指南](https://redis.io/docs/latest/develop/clients/nodejs/)

## 46.2 Cache-aside 的真实边界

读取流程是缓存命中直接返回，未命中查数据库，再写缓存。缓存值要带格式版本、TTL，key 带租户与查询维度；正文、草稿、用户 Session 和公开摘要不能共用一个“posts”键。

先只缓存第一页已发布摘要，减少 cursor、排序与标签组合带来的复杂度。即使 key 带 userId，也不要缓存任意授权结果数分钟后才撤销成员权限。本课程不缓存成员鉴权，不将密码摘要或私有正文放进 Redis。

简单“写库后 DEL”有竞态：请求 A 读到旧数据库值，请求 B 更新并删除缓存，A 又把旧值写回。先 DEL 再写库同样有窗口；延迟双删可以降低部分概率，但不是严格一致性保证。课程采用数据库版本化 key，让旧读只能写旧版本的 key。

新增迁移：

```sql
ALTER TABLE tenants
ADD COLUMN public_revision bigint NOT NULL DEFAULT 1;
```

发布、修改已发布内容或删除公开文章时，在同一数据库事务内执行：

```sql
UPDATE tenants SET public_revision=public_revision+1 WHERE id=$1;
```

读取先查数据库 revision，再查对应 key。虽然多了一次轻查询，却避免每次生成复杂列表。bigint 按字符串保留，不强转不安全 Number；读到新版本就不会使用旧 key，旧值由 TTL 自行淘汰。数据库副本延迟仍可能读旧版本，要求强新鲜度的入口应读主库。

## 46.3 版本化缓存实现

```ts
type Summary = { id: string; slug: string; title: string; summary: string };
function isSummaries(value: unknown): value is Summary[] {
  return Array.isArray(value) && value.length <= 20 &&
    value.every(row => typeof row === 'object' && row !== null &&
      ['id', 'slug', 'title', 'summary'].every(key =>
        typeof (row as Record<string, unknown>)[key] === 'string'));
}

async function publicFirstPage(tenantId: string): Promise<Summary[]> {
  const version = (await pool.query<{ public_revision: string }>(
    'SELECT public_revision FROM tenants WHERE id=$1', [tenantId],
  )).rows[0];
  if (!version) throw new AppError(404, 'NOT_FOUND', '空间不存在');
  const key = `blog:public:v1:${tenantId}:${version.public_revision}:page1`;
  try {
    const cached = await redis.get(key);
    if (cached) {
      const parsed: unknown = JSON.parse(cached);
      if (isSummaries(parsed)) return parsed;
      logger.warn({ code: 'CACHE_SHAPE_INVALID' });
    }
  } catch {
    logger.warn({ code: 'CACHE_READ_FAILED' });
  }
  const rows = (await pool.query<Summary>(
    `SELECT id,slug,title,summary FROM posts
     WHERE tenant_id=$1 AND status='published'
     ORDER BY published_at DESC,id DESC LIMIT 20`, [tenantId],
  )).rows;
  try {
    await redis.set(key, JSON.stringify(rows), { EX: 45 });
  } catch {
    logger.warn({ code: 'CACHE_WRITE_FAILED' });
  }
  return rows;
}
```

这里读取缓存失败后明确降级数据库，并保留错误计数，不吞掉全部系统异常。数据库失败仍应向上传递，不能用空列表冒充成功。缓存解析也需要运行时边界，因为历史版本、人工写入或其他服务可能产生不匹配值。TTL=45 秒是学习选择，不是性能测量结论。

revision 与查询之间出现更新时，可能把较新结果写入旧版本 key，但不会污染新版本 key；下一请求获取新 revision 后走新地址。要求单请求精确快照时，将版本与列表读放进合适隔离级别的事务。缓存仅最终一致，文章编辑成功页可以直接使用数据库返回的对象。

热点未命中会导致多个请求同时查库，即缓存击穿。先保证数据库与连接池可承受降级，再考虑进程内 single-flight、预热或带所有者令牌的短租约；锁过期后工作可能仍继续，不把它当业务互斥锁。TTL 抖动能减少同时过期，但不解决无限 key 或大对象问题。

## 46.4 原子限流与窗口边界

多个 API 实例需要共享计数。分别执行 INCR 与 EXPIRE，进程在两条命令间崩溃可能留下永不过期的 key。Lua 在 Redis 内原子执行两步：

```ts
const fixedWindow = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {count, redis.call('PTTL', KEYS[1])}
`;

async function assertLoginRate(subjectKey: string) {
  let result: unknown;
  try {
    result = await redis.eval(fixedWindow, {
      keys: [`blog:limit:login:v1:${subjectKey}`],
      arguments: ['60000'],
    });
  } catch {
    throw new AppError(503, 'AUTH_UNAVAILABLE', '认证服务暂时不可用');
  }
  if (!Array.isArray(result) || result.length !== 2 ||
      !result.every(v => typeof v === 'number') || result[1] < 0) {
    throw new AppError(503, 'AUTH_UNAVAILABLE', '认证限流状态异常');
  }
  if (result[0] > 10) {
    throw new AppError(429, 'RATE_LIMITED', '请求过于频繁，请稍后重试');
  }
}
```

在响应侧将剩余 TTL 转成 Retry-After 秒数，客户端尊重而非快速重试。固定窗口可能在边界允许连续两批请求，不是严格“任意一分钟最多十次”；如果需求严格，选择滑动窗口或令牌桶并验证数学语义。多 key 的 Lua 在 Redis Cluster 需同一 hash slot，否则 CROSSSLOT；不为了省事把所有租户塞进一个热点 slot。

subjectKey 使用服务端秘密 HMAC 派生的 IP/账户标识，限制长度，不直接保存邮箱和原始 IP。它仍可能属于可关联个人数据，需保留期限和访问控制。账号限流防分布式撞库，但也可能被用来锁定受害者；结合 IP、全局容量与渐进挑战，不把“限流通过”等同于完整防攻击。

## 46.5 故障政策、指标与排错

公开列表缓存故障可以 fail-open 到数据库，但认证限流故障不能默认为无限放行。本章选择 fail-closed 返回 503；实际业务可结合本地保守限流降级，但要明确多实例局限。不要让缓存服务故障把登录变成 401“密码错误”，这会误导用户与监控。

缓存观察命中率、请求延迟、回源量、evicted keys、内存和连接数；只看命中率可能掩盖大量无效对象或陈旧内容。Redis 快不代表网络免费，单次大 JSON 序列化也可能阻塞 Node。停止时按当前客户端接口关闭连接，不照抄旧版本已弃用 quit/disconnect 调用。

排错先核对 key 的租户、格式版本和 revision，再查 TTL、淘汰策略、ACL 与连接。发布不刷新时检查是否在同事务递增 public_revision；跨租户结果先查 key 缺失维度。不要运行生产 KEYS * 或 FLUSHALL 排查，使用受限 SCAN 与特定前缀。

## 46.6 实验与完成标准

在隔离 Redis 上读取两次，第二次应命中；数据库发布后 revision 增加，新请求应看见新内容。故意写损坏 JSON，系统回源并记录错误；停止 Redis，公开列表应可回源，而登录限流应 503。不能只 mock redis.get 返回值就声称共享计数已验证。

两个 API 实例并发发送同一限流标识，合计允许量应符合固定窗口。窗口过期后恢复；带 query 的登录路由不能绕过。构造 A/B 租户同文章 slug，缓存仍隔离；模拟旧读在新发布后回填，确认新版本 key 不被覆盖。

练习增加分页缓存 key、有限 TTL 抖动、缓存命中指标和限流 Retry-After。完成标准是可说明一致性窗口、Redis 故障行为、共享实例计数与隐私策略，并保留真实服务实验记录；第 54 章最小项目仍使用单进程限流，不冒充已集成 Redis。

## 46.7 HTTP 缓存与 Redis 缓存各自负责什么

Redis 缓存的是后端计算结果，HTTP 缓存决定浏览器或 CDN 是否重新请求。管理接口即使使用 Redis，也应禁止共享缓存；公开摘要可以使用明确的新鲜度策略与 ETag，但必须确保响应不混入登录用户字段。不要一边响应 Vary: Cookie，一边给所有请求同一个没有身份维度的缓存对象。

文章修改后 Redis 的版本化 key 生效，不代表 CDN 立即刷新。公开内容可以接受短期陈旧时记录最大窗口；删除涉及隐私的内容时，需要同步失效 CDN 与派生资源，不能只等一个长 TTL。错误响应也要区别处理，短期缓存不存在结果可能降低穿透，但授权拒绝不能跨用户共享。

在压测中同时观察 Redis 命中、数据库回源与浏览器实际请求。刷新页面看到“很快”可能只是浏览器没有联网，不能证明后端缓存命中；强制关闭浏览器缓存后再比较服务指标。验证不同租户、不同语言与不同分页条件不会共享错误响应，才是正确性证据。

## 官方参考

- [Redis Node 客户端](https://redis.io/docs/latest/develop/clients/nodejs/)、[官方仓库](https://github.com/redis/node-redis)与[registry](https://registry.npmjs.org/redis)。
- [Redis：INCR 限流模式](https://redis.io/docs/latest/commands/incr/)、[Lua 脚本](https://redis.io/docs/latest/develop/programmability/eval-intro/)。
- [Redis 淘汰策略](https://redis.io/docs/latest/develop/reference/eviction/)、[安全](https://redis.io/docs/latest/operate/oss_and_stack/management/security/)。

下一章：[队列、Outbox 与幂等](./47-queues-outbox-idempotency)。
