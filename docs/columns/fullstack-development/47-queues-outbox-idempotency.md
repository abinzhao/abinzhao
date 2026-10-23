---
title: "第 47 章：队列、Outbox 与幂等"
description: "把发布与事件写入同一事务，用可恢复租约转发 BullMQ，并用数据库幂等收件箱处理重试与崩溃窗口。"
date: '2026-10-23'
category: 后端开发
tags: [BullMQ, Outbox, 幂等, 队列]
series:
  order: 48
---

# 第 47 章：队列、Outbox 与幂等

文章发布后发送通知、生成搜索索引和处理图片，不必都堵在 HTTP 请求里。异步任务缩短请求关键路径，却增加重复、延迟、失败与恢复问题。本章以“发布后创建站内通知”为例，先保证事件不会在数据库提交与入队之间丢失，再保证重复消费不重复产生业务效果。

## 47.1 为什么不能直接双写

先更新数据库再 `queue.add()`，进程可能在两者之间退出，文章已发布但永远没有任务。先入队再提交数据库，worker 可能读到未发布状态，或者事务回滚却已经发通知。数据库与 Redis 是两个事务域，普通 try/catch 无法把它们变成同一原子提交。

Transactional Outbox 把业务变化和事件记录放进同一 PostgreSQL 事务。relay 独立读取 Outbox 并投递队列，失败就重试；worker 需要接受重复，因为 relay 投递成功后、标记 sent 前也可能崩溃。通常能建立的是至少一次投递和幂等效果，不应宣称天然 exactly-once。

2026-10-23 核验队列库 **BullMQ 6.4.0**。它使用自身的 Redis 连接机制，不接受上一章 node-redis 客户端当作直接替换。安装固定版本：

```bash
npm install --save-exact bullmq@6.4.0
```

队列 Redis 需要持久化、容量监控和 `noeviction`，不能与允许淘汰的普通缓存混用。即便 AOF 每秒刷盘，也存在故障丢失窗口，最终恢复还要靠数据库事件与重放政策。[BullMQ 生产指南](https://docs.bullmq.io/guide/going-to-production)

## 47.2 Outbox schema 与原子发布

新增迁移：

```sql
CREATE TABLE outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  event_type text NOT NULL CHECK (event_type = 'post.published.v1'),
  payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','sent','dead')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  leased_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX outbox_pending_idx ON outbox(available_at,created_at,id)
WHERE state='pending';
```

event_type 带版本，payload 只放 postId、authorId 与 revision 等必要标识，不塞邮箱、密码、Session 或整篇私有正文。消费者需要正文时重新按租户与资源查询。事件表示已发生的事实，任务表示要执行的动作，二者可以映射，但不要为了方便随意改写历史 payload。

在第 41 章发布事务中：

```ts
const changed = await db.query<{
  id: string; author_id: string; revision: number;
}>(
  `UPDATE posts SET status='published',published_at=now(),
     revision=revision+1,updated_at=now()
   WHERE tenant_id=$1 AND id=$2 AND status='draft' AND revision=$3
   RETURNING id,author_id,revision`,
  [tenantId, postId, revision],
);
const post = changed.rows[0];
if (!post) throw new AppError(409, 'PUBLISH_CONFLICT', '请检查文章最新状态');
await db.query(
  `INSERT INTO outbox(tenant_id,event_type,payload)
   VALUES($1,'post.published.v1',$2::jsonb)`,
  [tenantId, JSON.stringify({
    postId: post.id, authorId: post.author_id, revision: post.revision,
  })],
);
```

调用前仍要同事务授权。重复发布不能新增第二个事件；如果产品支持重新发布或撤回，每个状态转换需有独立事件语义。客户端 Idempotency-Key 与消费幂等也不同：前者处理 HTTP 重试，后者处理队列重投，不应共享一个全局“已处理”布尔值。

## 47.3 relay 用短租约，不持锁等网络

先在短事务里认领一条事件，提交后再访问 Redis。网络调用期间不长时间占用数据库行锁：

```sql
WITH candidate AS (
  SELECT id FROM outbox
  WHERE state='pending' AND available_at <= now()
    AND (leased_until IS NULL OR leased_until < now())
  ORDER BY created_at,id
  FOR UPDATE SKIP LOCKED LIMIT 1
)
UPDATE outbox o
SET lease_token=$1,leased_until=now()+interval '30 seconds',
    attempts=attempts+1
FROM candidate c WHERE o.id=c.id
RETURNING o.id,o.tenant_id,o.event_type,o.payload,o.lease_token;
```

`SKIP LOCKED` 让多个 relay 分工，不保证全局严格顺序。租约过期后另一个 relay 可以认领，因此确认 sent 必须匹配 lease_token，旧 relay 不能覆盖新认领者。系统时钟与超时也需管理；租约不是“任务只运行一次”的保证。

```ts
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';

const queue = new Queue('blog-events', {
  connection: { host: '127.0.0.1', port: 6379, maxRetriesPerRequest: 1 },
  defaultJobOptions: {
    attempts: 5, backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { age: 86400 }, removeOnFail: { age: 604800 },
  },
});

async function relayOne() {
  const lease = randomUUID();
  const row = await claimOutbox(pool, lease);
  if (!row) return false;
  try {
    await queue.add(row.event_type, {
      eventId: row.id, tenantId: row.tenant_id, ...row.payload,
    }, { jobId: row.id });
    await pool.query(
      `UPDATE outbox SET state='sent',sent_at=now(),
       lease_token=NULL,leased_until=NULL
       WHERE id=$1 AND lease_token=$2`, [row.id, lease],
    );
  } catch {
    await pool.query(
      `UPDATE outbox SET state=CASE WHEN attempts>=10 THEN 'dead' ELSE 'pending' END,
       available_at=now()+interval '5 seconds',lease_token=NULL,leased_until=NULL
       WHERE id=$1 AND lease_token=$2`, [row.id, lease],
    );
    logger.warn({ code: 'OUTBOX_DELIVERY_FAILED', eventId: row.id });
  }
  return true;
}
```

claimOutbox 是上述认领 SQL 的参数化查询函数，返回 null 或对应显式列；实际项目要校验 payload 字段，不信任任意历史 JSON。示例 connection 只用于本机无公网学习实例，生产必须加入 ACL/TLS 与可信配置。循环无任务时等待，关闭信号后停止认领并等待当前调用，不忙循环烧 CPU。

固定 jobId 可以在任务保留期间抑制重复入队，但完成任务清理后同 ID 可以重新加入，所以业务幂等仍必需。入队成功不等于消费成功，sent 是 relay 状态；worker 失败有另一套重试和死信状态，两者不能混成一个“成功”字段。

## 47.4 消费幂等要和效果同事务

创建收件箱与站内通知：

```sql
CREATE TABLE processed_events (
  consumer text NOT NULL,
  event_id uuid NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(consumer,event_id)
);
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  post_id uuid NOT NULL,
  event_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,post_id) REFERENCES posts(tenant_id,id)
);
```

worker 的核心：

```ts
import { Worker } from 'bullmq';
const worker = new Worker('blog-events', async job => {
  const event = parsePublishedEvent(job.name, job.data);
  await transaction(pool, async db => {
    const accepted = await db.query(
      `INSERT INTO processed_events(consumer,event_id)
       VALUES('author-notification-v1',$1) ON CONFLICT DO NOTHING
       RETURNING event_id`, [event.eventId],
    );
    if (!accepted.rowCount) return;
    const post = await db.query(
      `SELECT 1 FROM posts WHERE tenant_id=$1 AND id=$2
       AND author_id=$3 AND status='published'`,
      [event.tenantId, event.postId, event.authorId],
    );
    if (!post.rowCount) throw new Error('Published event does not match resource');
    await db.query(
      `INSERT INTO notifications(tenant_id,user_id,post_id,event_id)
       VALUES($1,$2,$3,$4)`,
      [event.tenantId,event.authorId,event.postId,event.eventId],
    );
  });
}, {
  connection: { host: '127.0.0.1', port: 6379, maxRetriesPerRequest: null },
  concurrency: 4,
});
```

parsePublishedEvent 必须验证固定类型、UUID、正整数 revision 和字段上限，可用前章 Zod 的严格对象实现；不能直接将 job.data 当 TypeScript 类型。示例针对从未撤回的首次发布，若允许删除或撤回，需要定义“历史通知是否仍创建”的政策，不能让合法历史事件永远失败。

收件箱插入与通知插入同事务，效果失败时收件箱也回滚；重复事件同时消费会由唯一键串行判定。通知创建提交后 worker 未 ACK 而重试，第二次不再产生通知。外部邮件不在数据库事务里，必须使用提供方幂等键或额外发送状态机；不能用这段代码宣称邮件 exactly-once。

## 47.5 重试、积压与重放

瞬时网络失败适合指数退避与抖动，非法 payload 不会因为重试五次就变合法。为永久错误定义隔离队列和告警，禁止无限重试占用全部 worker。并发数取决于数据库、外部 API 和 CPU，不用机器核数直接决定所有任务吞吐。

监控最老 pending 事件年龄、队列等待量、失败数、重试次数、处理时长与 dead 状态，不只看进程是否活着。关机顺序先停止认领、停止 worker 接新任务、等待当前任务、关闭队列与连接池；强制超时后允许下次重投。

Redis 丢失已入队任务时，Outbox sent 不能自动证明完成。保留事件与消费者收件箱，按事件范围审计未完成效果后重放；重放沿用原 eventId，不生成新 ID。保留期限要覆盖恢复窗口，删除收件箱前考虑历史重放导致重复，不能只为减小表就每天清空。

## 47.6 崩溃实验与练习

在隔离 PostgreSQL/Redis 中分别在事务提交前、提交后入队前、入队后标记前、通知提交后 ACK 前终止对应进程。预期分别为没有发布、恢复后能转发、可能重复入队但一条通知、重投仍一条通知。只让 handler 返回成功不能证明这些窗口。

停止 Redis 时发布应能提交 Outbox，relay 重试不丢事件；恢复后积压消退。投递损坏 payload 应进入失败隔离，不创建跨租户通知。相同 eventId 并发消费只能一条效果，死信人工重放要可追溯且不改 ID。

练习实现有限轮询、退出钩子、失败事件列表与按范围重放命令。完成标准是“数据库事实可追溯、投递可恢复、效果幂等、死信可见”，并明确邮件等外部效果仍需独立策略。第 54 章最小项目未集成队列，不能把这里的预期实验写成项目已实测。

## 47.7 HTTP 幂等与事件顺序的补充约束

对于付费、发送或创建资源等可重试接口，可以要求客户端提供一次操作的幂等键。服务器以租户、调用者、动作和键建立唯一记录，同时保存规范化输入摘要与结果；同键同输入返回原结果，同键不同输入返回冲突。不能只缓存一个“成功”标志，否则网络中断后客户端不知道资源 ID，也不能辨认重复键是否代表不同内容。保存结果与业务写入必须处于同一事务。

幂等记录有保留期限，超过期限重试可能被视为新操作，因此需要对客户端说明可安全重试窗口。外部系统的幂等键也可能只在有限时间有效，恢复演练不能默认永久去重。键不应由邮箱或正文构成，不允许无限长度或无限新键耗尽数据库。

多个 worker 与 SKIP LOCKED 不保证同一文章事件按顺序完成。消费者维护已处理 revision，可拒绝过旧更新；需要逐实体顺序时按资源分区或在数据库锁定实体后比较版本。序号只能帮助识别顺序，不自动填补缺失事件。对于“发布后撤回”，先完成业务状态机与旧事件政策，再选择队列排序机制。

## 官方参考

- [BullMQ 生产配置](https://docs.bullmq.io/guide/going-to-production)、[重试](https://docs.bullmq.io/guide/retrying-failing-jobs)、[幂等任务](https://docs.bullmq.io/patterns/idempotent-jobs)。
- [BullMQ jobId](https://docs.bullmq.io/guide/jobs/job-ids)与[registry](https://registry.npmjs.org/bullmq)。
- [PostgreSQL 锁与 SKIP LOCKED](https://www.postgresql.org/docs/18/sql-select.html)。

下一章：[文件与对象存储](./48-files-object-storage)。
