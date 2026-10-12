---
title: Node.js 与 PostgreSQL：参数化查询、事务和并发约束
description: 从数据库约束出发，用 pg 实现可回滚的库存预留并验证并发行为。
type: tutorial
topic: node-fullstack
section: platform
order: 20
level: intermediate
status: published
tags: [Node.js, PostgreSQL, SQL, 事务]
prerequisites: [/tutorials/node-fullstack/http.html]
comments: true
---

# Node.js 与 PostgreSQL：参数化查询、事务和并发约束

把内存数组换成数据库，并不是把 `push` 改成一条 SQL 就完成了。数据库连接可能失败，两条语句可能只成功一条，多个请求还可能同时修改同一行。本篇通过库存预留这个小场景，学习参数化查询、数据库约束和事务的职责分工。实验使用 Node.js 22 与 PostgreSQL 17 的常规能力，不依赖某个框架，也不把演示数据库当成正式数据环境。

## 前置条件与实验隔离

先完成[原生 HTTP 教程](/tutorials/node-fullstack/http.html)，理解请求校验与错误映射。准备本机 PostgreSQL、`psql` 客户端以及独立实验数据库。数据库安装方式依操作系统不同，按 PostgreSQL 官方下载入口选择发行包；确认 `psql --version` 后再继续。

在本机管理身份下创建专用角色和数据库，以下名称只是实验名称。`\password` 会交互读取密码，避免把密码直接写进脚本或命令历史。不要对已有业务数据库执行这些操作，也不要把示例身份授予超级用户权限。

```sql
CREATE ROLE tutorial_app LOGIN;
\password tutorial_app
CREATE DATABASE tutorial_inventory OWNER tutorial_app;
```

在独立 Node 实验目录执行下面的初始化和安装。这里的 `pg` 是明确声明的额外依赖，只安装到实验项目，不要求你修改网站项目依赖。通过安全的本机会话提供 `PGPASSWORD`；不要将其输出、提交或写进教程文件。

```bash
npm init -y
npm install pg
export PGHOST=127.0.0.1
export PGPORT=5432
export PGDATABASE=tutorial_inventory
export PGUSER=tutorial_app
```

本篇按本机连接讲解。远端连接必须使用部署平台规定的 TLS 与证书校验配置，不能为了绕过报错设置 `rejectUnauthorized: false`。应用凭据与迁移凭据应分开，拥有数据库的实验角色并不适合作为生产应用身份。

## 核心原理：把不变量交给正确的一层

用户输入的商品编号、数量先由应用检查，数据库仍应保留非空、外键和范围约束。应用校验提供友好的错误，数据库约束防止其他脚本、后台任务或未来代码破坏数据。唯一约束也是并发下的最终裁判，不能用“先查询是否存在，再插入”的两步检查替代它。

参数化查询把 SQL 结构与值分开发送。`$1` 表示第一个值，数据库不会把值里的引号当作新的 SQL 语法。占位符不能代替表名、列名或排序方向；如果需要动态排序，应把输入映射到代码内固定白名单，不能拼接客户端提供的片段。

事务把多个数据库操作组成一个原子单位，提交时全部生效，回滚时全部撤销。`pg` 连接池中的 `pool.query` 每次可能使用不同连接，所以事务必须先 `pool.connect()`，然后始终用同一个 `client` 执行 `BEGIN`、业务语句和 `COMMIT`。释放连接放在 `finally`，否则少数异常请求就可能耗尽连接池。

并发预留时，“读到库存 10，再写成 9”会产生丢失更新。这里使用一条条件更新：只有剩余量足够才扣减，并通过 `RETURNING` 判断成功。PostgreSQL 会对被更新行加锁，在常用的 Read Committed 隔离级别下重新检查更新条件，从而避免仅靠应用检查带来的竞态。

## 实操一：建立可验证的数据模型

把下面内容放入 `schema.sql`，使用实验角色执行 `psql -v ON_ERROR_STOP=1 -f schema.sql`。此脚本只用于空实验数据库，不是可重复执行的迁移系统。它故意不使用删除表语句，避免读者复制时销毁已有数据。

```sql
CREATE TABLE products (
  sku text PRIMARY KEY,
  stock integer NOT NULL CHECK (stock >= 0)
);

CREATE TABLE reservations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE,
  sku text NOT NULL REFERENCES products(sku),
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO products (sku, stock) VALUES ('BOOK-01', 10);
```

预留记录保存请求编号，为重试识别提供基础。它不表示本例已经实现了完整幂等协议：如果同一个编号被重复调用，当前实现明确报冲突；真正幂等接口还应比较请求内容并返回原结果，不能给不同商品复用同一个键。

时间使用带时区的时间戳来表达绝对时间，展示时再按用户所在时区格式化。库存使用整数，因为数量不需要浮点表示。如果后续涉及金额，应考虑最小货币单位或数据库精确数值类型，不要把浮点运算误差带进账务规则。

## 实操二：完整的事务模块

保存为 `inventory.mjs`。连接池使用前面提供的 PostgreSQL 环境变量，最大连接数和超时是本地实验预算。数量、编号和请求键都显式校验；SQL 错误不会被悄悄吞掉。

```javascript
import pg from "pg";

export const pool = new pg.Pool({
  max: 4,
  connectionTimeoutMillis: 3000,
  idleTimeoutMillis: 10_000,
  statement_timeout: 5000,
});
pool.on("error", (error) => {
  console.error("idle database connection failed", { code: error.code });
});

export class InventoryError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function validate(sku, quantity, requestId) {
  if (typeof sku !== "string" || !/^[A-Z0-9-]{1,32}$/.test(sku)) {
    throw new InventoryError("invalid_sku");
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    throw new InventoryError("invalid_quantity");
  }
  if (typeof requestId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        .test(requestId)) {
    throw new InventoryError("invalid_request_id");
  }
}

export async function reserve(sku, quantity, requestId) {
  validate(sku, quantity, requestId);
  const client = await pool.connect();
  let begun = false;
  let releaseError;
  try {
    await client.query("BEGIN");
    begun = true;
    const updated = await client.query(
      `UPDATE products SET stock = stock - $2
       WHERE sku = $1 AND stock >= $2 RETURNING stock`,
      [sku, quantity],
    );
    if (updated.rowCount !== 1) {
      throw new InventoryError("missing_or_insufficient_stock");
    }
    const inserted = await client.query(
      `INSERT INTO reservations (request_id, sku, quantity)
       VALUES ($1, $2, $3) RETURNING id, sku, quantity`,
      [requestId, sku, quantity],
    );
    await client.query("COMMIT");
    begun = false;
    return { ...inserted.rows[0], remaining: updated.rows[0].stock };
  } catch (error) {
    if (begun) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        releaseError = rollbackError;
      }
    }
    if (error.code === "23505") {
      throw new InventoryError("duplicate_request");
    }
    throw error;
  } finally {
    client.release(releaseError);
  }
}
```

回滚本身也可能失败，例如连接已经断开。把失败错误传给 `release` 会移除不可用连接，避免下个请求复用损坏连接。保留原始业务异常有助于定位首次失败；正式日志还应分别记录回滚异常的类别，但不能记录 SQL 参数中的敏感数据。

`COMMIT` 遇到连接丢失时，客户端可能不知道服务器是否已经提交。这是分布式系统中的结果不确定性，不能简单认为回滚成功并无限重试。请求编号、状态查询接口和明确的重试策略应共同处理这类情况。事务只能约束数据库内部操作，不能把已经发送的邮件或外部付款自动撤销。

## 预期检查：用真实数据库验证回滚和竞争

保存下面的 `inventory.test.mjs`，执行 `node --test inventory.test.mjs`。它会修改唯一的实验商品，必须只连专用实验数据库。测试主动检查数据库名，防止连接环境误配到其他数据库；不要把这个守卫当作唯一的数据保护机制。

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool, reserve } from "./inventory.mjs";

test("reservation is atomic and cannot oversell", async (t) => {
  t.after(() => pool.end());
  const db = await pool.query("SELECT current_database() AS name");
  assert.equal(db.rows[0].name, "tutorial_inventory");
  await pool.query("DELETE FROM reservations");
  await pool.query("UPDATE products SET stock = $1 WHERE sku = $2",
    [10, "BOOK-01"]);
  const key = randomUUID();
  const first = await reserve("BOOK-01", 3, key);
  assert.equal(first.remaining, 7);
  await assert.rejects(reserve("BOOK-01", 2, key),
    (error) => error.code === "duplicate_request");
  const afterRollback = await pool.query(
    "SELECT stock FROM products WHERE sku = $1", ["BOOK-01"]);
  assert.equal(afterRollback.rows[0].stock, 7);
  const outcomes = await Promise.allSettled([
    reserve("BOOK-01", 5, randomUUID()),
    reserve("BOOK-01", 5, randomUUID()),
  ]);
  assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1);
  const final = await pool.query(
    "SELECT stock FROM products WHERE sku = $1", ["BOOK-01"]);
  assert.equal(final.rows[0].stock, 2);
});
```

预期是重复请求的扣减被回滚，两个并发大额预留只有一个成功，最终库存为 2。这些数字是输入数据推导出的断言，不是性能或效果宣传。若断言失败，应查看数据和事务执行顺序，不要把允许成功数从 1 改成 2。

## 排错与 HTTP 集成

认证失败先检查角色、目标数据库和本机认证策略，不能通过全面开放 `pg_hba.conf` 来解决。连接超时要区分数据库不可达与连接池等待；连接池最大值不是越大越好，每个应用实例都会占用连接，多实例总数必须符合数据库容量。

事务里某条语句失败后，PostgreSQL 通常把事务标记为失败状态，后续普通语句不会恢复它，应回滚。唯一冲突对应 SQLSTATE `23505`，序列化失败通常是 `40001`，死锁通常是 `40P01`。重试这些错误时要重新执行完整事务，并限制次数、增加退避，不能只重试最后一条语句。

接回 HTTP 时，参数校验错误映射到 422，库存不足与重复请求可以映射到 409，数据库不可用可按服务契约返回 503。公开响应不要附带数据库连接字符串、SQL 文本或内部表名。先完成身份验证再决定用户是否有权操作商品；参数化 SQL 防注入，不会自动完成授权。

生产迁移要版本化、审查和演练，应用启动不应自动执行破坏性建表。对大表新增索引、字段约束和锁定操作需要评估阻塞风险。备份的存在也不等于可恢复，必须在隔离环境实际执行恢复检查，并明确能接受的数据丢失窗口。

## 查询与事务的预算

连接池等待、SQL 执行和整个 HTTP 请求各有时间预算。SQL 超时不应长于请求允许的处理期限，否则客户端早已放弃，数据库却还在工作。取消客户端连接也不保证数据库语句自动取消，正式集成需要结合驱动能力和服务政策处理，不能只靠前端取消按钮释放所有资源。

查询优化先看实际计划和数据规模，而不是给每个字段都建索引。索引能减少某些读取成本，也会增加写入、存储和维护成本。实验表很小，执行计划不能代表生产规模；应在脱敏的代表数据上观察扫描方式、返回行数与锁等待，并避免将包含敏感参数的诊断直接复制到公共日志。

事务内不应等待人工确认或无界网络调用。持有连接和行锁时停留太久，会阻塞其他请求，导致连接池耗尽。需要外部消息时可以设计提交后的可靠发送流程，让数据库状态与发送任务在同一事务中落地，再由受控工作进程发送；这仍需要幂等、重试和失败恢复，不是事务自动保证外部世界一致。

## 练习与工程边界

练习一：将重复请求改为返回原结果，要求相同请求键但不同数量时仍报冲突。先设计并发下的查询与插入顺序，再补两个同时使用相同键的测试。练习二：增加取消预留，保证库存归还与状态改变在同一事务，并防止重复取消导致多次归还。

练习三：为查询接口增加排序白名单，测试输入 `created_at desc;` 被拒绝。不要试图用值占位符解决标识符问题。练习四：让一个事务故意违反约束，确认连接被释放后下一次查询仍然可用。

到这里应形成三层检查：HTTP 格式与预算、业务权限与规则、数据库约束与事务。继续阅读[会话安全与部署](/tutorials/node-fullstack/production.html)，把这些规则放进可监管的服务生命周期；本篇不包含公网数据库配置、完整迁移系统或生产容量结论。

## 官方来源

- [PostgreSQL 17 事务教程](https://www.postgresql.org/docs/17/tutorial-transactions.html)：原子提交与回滚。
- [PostgreSQL 17 事务隔离](https://www.postgresql.org/docs/17/transaction-iso.html)：并发可见性与条件更新。
- [PostgreSQL 17 约束](https://www.postgresql.org/docs/17/ddl-constraints.html)：唯一、检查和外键约束。
- [node-postgres 参数化查询](https://node-postgres.com/features/queries)与[事务](https://node-postgres.com/features/transactions)：客户端调用方式。
- [OWASP SQL 注入防护](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)：参数化和白名单边界。
