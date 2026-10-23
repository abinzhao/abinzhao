---
title: "第 41 章：迁移、事务与并发一致性"
description: "用版本与校验和执行数据库迁移，正确管理同一连接上的事务，并用 revision、锁与有限重试处理并发。"
date: '2026-10-23'
category: 数据库
tags: [迁移, 事务, MVCC, 并发控制]
series:
  order: 42
---

# 第 41 章：迁移、事务与并发一致性

两个人同时编辑文章，两个进程同时执行迁移，发布成功后任务发送失败，都不是单个 SQL 语句的语法问题。它们要求明确一组操作什么时候一起生效、谁可以并发修改、失败后如何再次执行。本章把这些保证落实到数据库连接、约束和条件更新。

## 41.1 数据迁移是有版本的程序

迁移不等于手工在数据库里执行一次 SQL。它需要从空库重建、识别已经执行的步骤、拒绝篡改历史，并在失败后留下可理解状态。第 40 章的 `001_initial.sql` 一经执行就不再修改；增加字段时创建 `002_...sql`，不能直接改历史文件后指望线上自动补齐。

迁移元数据至少记录文件名、内容校验和和执行时间。文件名决定顺序，校验和发现“相同名字不同内容”。它不能证明 SQL 安全，所以迁移仍需代码审阅、备份与学习库演练。生产中运行迁移的账号与 API 账号分开：迁移可改结构，API 只获必要读写权限。

不要让每个 API 实例启动时并行创建表。一个显式迁移任务先完成兼容结构变更，API 再接流；第 52 章讨论扩展、回填、收缩的发布顺序。本章执行器适合事务内的小型 SQL 迁移，不作为能处理任意生产 DDL 的通用框架。

## 41.2 最小事务迁移执行器

在独立项目创建 `src/migrate.ts`，从项目根目录执行：

```ts
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString, connectionTimeoutMillis: 3000 });
pool.on('error', () => console.error('DB_POOL_ERROR'));

try {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('SELECT pg_advisory_lock($1)', [741001]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const previous = await client.query<{ name: string; checksum: string }>(
      'SELECT name, checksum FROM schema_migrations',
    );
    const applied = new Map(previous.rows.map(row => [row.name, row.checksum]));
    const directory = new URL('../migrations/', import.meta.url);
    const names = (await readdir(directory))
      .filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();

    for (const name of names) {
      const sql = await readFile(new URL(name, directory), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      if (applied.has(name)) {
        if (applied.get(name) !== checksum) {
          throw new Error(`Applied migration changed: ${name}`);
        }
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query("SET LOCAL lock_timeout = '3s'");
        await client.query("SET LOCAL statement_timeout = '30s'");
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
          [name, checksum],
        );
        await client.query('COMMIT');
        console.info(`Applied ${name}`);
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          discard = true;
          throw new AggregateError([error, rollbackError], 'Migration and rollback failed');
        }
        throw error;
      }
    }
  } finally {
    if (!discard) {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [741001]);
      } catch {
        discard = true;
      }
    }
    client.release(discard);
  }
} finally {
  await pool.end();
}
```

目录 URL 相对源文件定义，不依赖当前终端路径；开发使用 `npx tsx src/migrate.ts`。如果编译后迁移入口位于 `dist/`，上述 `../migrations/` 仍指向项目根的迁移目录，部署时必须携带这些 SQL 文件，不能只复制 JS。

会话级 advisory lock 防止多个课程执行器并行修改，锁持有者断开后由数据库释放。这个编号只协调使用同一约定的执行器，并不能阻止手工 DDL。生产还应为取得迁移锁设置有限等待与明确超时，不无限挂住发布流水线。

失败回滚时保留原错误；回滚本身也失败，则丢弃连接，不把状态未知的客户端放回池中。已有迁移 checksum 不一致应停止，不偷偷更新元数据“修复”。`CREATE INDEX CONCURRENTLY` 等不能放在事务中的命令必须走单独的、明确记录执行阶段的迁移流程，不能直接塞进本执行器。

## 41.3 事务必须绑定同一条连接

`pool.query()` 每次可能借到不同连接：

```ts
// 错误：三条命令不保证使用同一客户端。
await pool.query('BEGIN');
await pool.query('UPDATE posts SET title = $1 WHERE id = $2', [title, id]);
await pool.query('COMMIT');
```

这可能让 UPDATE 自动提交，另一个连接却停留在空事务中。正确方式是先借 client，再在同一个 client 上执行所有语句，最后一定释放：

```ts
import type { Pool, PoolClient } from 'pg';

export async function inTransaction<T>(
  pool: Pool, work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    const value = await work(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      discard = true;
      throw new AggregateError([error, rollbackError], 'Transaction and rollback failed');
    }
    throw error;
  } finally {
    client.release(discard);
  }
}
```

事务中不要调用等待几十秒的对象存储、邮件或第三方 API：会长期占连接和锁，也无法回滚已经发送的外部邮件。数据库事务只协调本数据库中的状态；跨系统交付通过 Outbox 与幂等处理，不声称“一次 COMMIT 就原子完成全球所有操作”。

数据库提交时网络断开，客户端可能不知道 COMMIT 是否生效。无条件重试会产生重复操作，需用业务键查询结果或第 47 章的幂等记录恢复，而不是把每个连接错误都当作“肯定未写入”。

## 41.4 用 revision 防止丢失更新

用户读取 revision 3，保存时提交 revision 3：

```sql
UPDATE posts
SET title = $4, body = $5,
    revision = revision + 1, updated_at = now()
WHERE tenant_id = $1 AND id = $2 AND revision = $3
RETURNING id, title, body, revision;
```

如果两个编辑都提交版本 3，只有先完成者会更新成版本 4，另一条条件已不匹配，应得到冲突而非覆盖。这个保证来自原子 WHERE 条件，不是 JS 先 SELECT 版本再无条件 UPDATE。

零行结果可能意味着不存在、无权限或 revision 冲突。先按统一租户与资源授权策略判断存在性，再决定返回 404 或 409；不能为非法用户泄漏“真实版本是 4”。前端遇到 409 保留本地草稿，展示重新加载与人工合并，不自动覆盖或盲目重发旧内容。

发布状态同样使用条件更新，并同时写 `status`、`published_at`、revision。重新发布是否保留最初发布时间是产品决策；课程在首次发布写入时间，后续编辑保留，回到草稿则清空，不能出现 published 但时间为空的状态。

## 41.5 理解 MVCC、隔离级别与锁

PostgreSQL 默认 Read Committed：每条语句读取开始时已经提交的快照，同一事务连续两次 SELECT 可能看到不同数据。Repeatable Read 使用事务快照，但并不自动保证全部跨行业务不变量；Serializable 可以拒绝有序列化异常风险的事务，应用必须准备重试整个事务。

| 问题 | 优先手段 |
|---|---|
| 单行计数增加 | `SET count = count + 1` |
| 避免旧版本覆盖 | revision 条件更新 |
| 唯一地址 | UNIQUE 约束 |
| 多行共同满足业务不变量 | 明确锁顺序或 Serializable |
| 并行 worker 领取任务 | 短事务 + `FOR UPDATE SKIP LOCKED` |

`FOR UPDATE` 不是“锁住整个服务”，它针对选中的行；锁等待有成本，需要明确截止时间。多行操作按稳定顺序取得锁，减少死锁。即使设计良好仍可能发生 `40P01` 死锁或 `40001` 序列化失败，对这些错误可以有限退避重试整个事务，不能只重试最后一句 SQL。

重试回调必须没有不可重复的外部副作用。发送邮件、生成带业务含义的新 ID、扣第三方账户等不应在可自动重跑的回调中随意执行。普通约束错误和鉴权失败不属于自动重试范围；否则会放大数据库压力并延长用户等待。

## 41.6 双会话实验与恢复演练

在两个 `psql` 学习会话中对同一篇文章执行带 revision 的 UPDATE，记录哪个更新一行、哪个零行。再让会话 A `BEGIN` 并更新一行但不提交，会话 B 尝试更新同一行，观察等待；A 回滚后 B 才能继续。只在学习库实验，并用 `lock_timeout` 避免无限等待。

迁移验证按以下顺序：

1. 从空库执行所有迁移，检查表、约束与元数据。
2. 再执行一次，应跳过，不能重复写初始数据。
3. 同时启动两个执行器，确认一个等待，最终不重复。
4. 添加只在学习库使用的失败迁移，确认其 DDL 和版本记录不残留。
5. 修改已执行文件，确认 checksum 检查拒绝；恢复原文后才能继续。
6. 在新建的第二个学习库重放，比较结构与关键查询行为。

这组步骤是验收计划，不是已经运行的数据库证据。出现 `current transaction is aborted` 先回滚，不继续执行十条查询再猜错误；连接池耗尽先查未释放 client 和长事务；迁移卡住先查锁等待，不随意终止其他业务进程。

练习为文章更新加入 revision，在两个浏览器标签页触发冲突；把“发布文章 + 写事件”放到同一数据库事务，事件表在第 47 章定义；写出数据库提交结果未知时的恢复策略。完成标准是迁移可重放、历史不可篡改、事务必释放、并发修改不静默覆盖、异常不会伪装成成功。

## 官方参考

- [node-postgres：事务必须使用同一 client](https://node-postgres.com/features/transactions)。
- [PostgreSQL：事务隔离](https://www.postgresql.org/docs/18/transaction-iso.html)。
- [PostgreSQL：显式锁与 advisory locks](https://www.postgresql.org/docs/18/explicit-locking.html)。
- [PostgreSQL：错误码](https://www.postgresql.org/docs/18/errcodes-appendix.html)。
- [PostgreSQL：CREATE INDEX 的并发限制](https://www.postgresql.org/docs/18/sql-createindex.html)。

下一章：[查询性能、索引与游标分页](./42-query-performance-pagination)。
