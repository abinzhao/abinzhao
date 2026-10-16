---
title: 接口幂等与事务 Outbox：从唯一约束到可靠投递
description: 用 PostgreSQL 唯一约束绑定请求键与请求摘要，在一个事务中提交业务数据和 Outbox，并明确重试、租约与 exactly-once 的边界。
date: "2026-10-17"
category: 后端工程
tags: [PostgreSQL, 接口幂等, Outbox, 事务, 分布式系统]
featured: true
---

# 接口幂等与事务 Outbox：从唯一约束到可靠投递

客户端没有收到响应，不等于服务端没有完成操作。创建订单的事务可能已经提交，只是在响应返回前连接断开；客户端重试之后，若服务端再次创建订单，就把一次业务意图放大成了两次写入。与此同时，服务端即使避免了重复订单，也可能在数据库提交后、消息发送前崩溃，让下游永远不知道订单存在。

这两个故障分别需要请求幂等与事务 Outbox 处理。它们有交集，但不是同一个问题：前者绑定重复请求与已保存结果，后者绑定业务提交与待投递事件。本文使用 PostgreSQL 16 兼容的 SQL 与 Node 22 标准库示例，讨论单数据库创建操作。示例不实现库存、计价、支付或真实 HTTP 服务，也不假定存在跨数据库事务。

## 先定义一次业务意图

幂等键由客户端为一次操作生成，超时重试时复用，新的业务意图使用新键。不能每次重试都生成新键，也不能把商品编号当成幂等键：同一用户可能合法地购买相同商品多次。

服务端应将键放在明确作用域内，例如“已认证租户 + 创建订单版本 + 请求键”。租户必须来自认证上下文，而不是直接相信请求体。某租户的键不应读取另一租户的结果，不同操作也不应因为键相同而互相冲突。

还要绑定请求内容。相同键、相同规范化内容可以回放结果；相同键、不同内容必须冲突，而不是悄悄返回旧订单。这里有两个摘要：请求键摘要避免在存储与日志里直接传播原始键，请求内容摘要识别语义变化。哈希不是加密，也不替代授权；可猜测的低熵键仍可能被枚举，因此客户端应使用足够随机的键。

## 请求摘要必须建立在确定的输入规则上

直接对原始 JSON 字符串计算哈希，会把不同属性顺序和空白误判为不同请求；直接对任意对象调用 `JSON.stringify`，又会继承调用方的属性插入顺序。更简单的方案不是写通用 JSON 规范化框架，而是先校验业务字段，再按固定顺序构造有限的对象。

下面的 `fingerprint.mjs` 是真实可执行的输入边界。它只接受 SKU 与数量，拒绝额外字段；SKU 按契约去除首尾空白并转为大写，数量必须为整数。若业务区分大小写，就应删除该归一化规则，而不是盲目复用。

```javascript
import { createHash } from 'node:crypto';

const sha256 = (value) =>
  createHash('sha256').update(value, 'utf8').digest('hex');

export function fingerprint(key, body) {
  if (typeof key !== 'string' ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(key)) {
    throw new Error('invalid idempotency key');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).sort().join(',') !== 'quantity,sku') {
    throw new Error('expected exactly sku and quantity');
  }
  if (typeof body.sku !== 'string') throw new Error('invalid sku');
  const sku = body.sku.trim().toUpperCase();
  if (!/^[A-Z0-9-]{1,40}$/.test(sku)) throw new Error('invalid sku');
  if (!Number.isSafeInteger(body.quantity) ||
      body.quantity < 1 || body.quantity > 100) {
    throw new Error('invalid quantity');
  }
  const normalized = { sku, quantity: body.quantity };
  return {
    normalized,
    keyHash: sha256(key),
    requestHash: sha256(JSON.stringify({
      operation: 'create-order:v1',
      ...normalized
    }))
  };
}
```

配套的 `fingerprint-check.mjs`：

```javascript
import assert from 'node:assert/strict';
import { fingerprint } from './fingerprint.mjs';

const key = 'checkout_20261017_0001';
const first = fingerprint(key, { sku: 'book-ark', quantity: 2 });
const reordered = fingerprint(key, { quantity: 2, sku: ' BOOK-ARK ' });
assert.equal(first.requestHash, reordered.requestHash);
assert.notEqual(first.requestHash,
  fingerprint(key, { sku: 'BOOK-ARK', quantity: 3 }).requestHash);
assert.throws(() => fingerprint(key, { sku: 'BOOK-ARK', quantity: 1.5 }));
assert.throws(() => fingerprint(key, { sku: 'BOOK-ARK', quantity: 2, price: 1 }));
console.log(JSON.stringify(first, null, 2));
console.log('fingerprint: ok');
```

执行 `node fingerprint-check.mjs`，预期输出规范化后的 `BOOK-ARK`、数量 `2`、两个真实计算的十六进制摘要，以及 `fingerprint: ok`。金额不在输入里，是为了避免把客户端金额当成价格真相，不表示完整订单可以忽略计价。

## 唯一约束是并发仲裁者

“先查询有没有，再插入”不是幂等实现。两个事务都可能读到不存在，然后分别创建订单。锁进程内的 Map 也无法覆盖多实例和进程重启。

以下 `schema.sql` 可在一次性测试数据库执行。请求记录、订单和事件写入同一个数据库；请求表的复合主键承担并发仲裁。示例使用内置 `gen_random_uuid()`，无需另外安装哈希扩展。

```sql
CREATE TABLE api_requests (
  tenant_id uuid NOT NULL,
  operation text NOT NULL,
  key_hash bytea NOT NULL CHECK (octet_length(key_hash) = 32),
  request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
  response_status integer,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, operation, key_hash),
  CHECK (
    (response_status IS NULL) = (response_body IS NULL)
    AND (response_status IS NULL OR response_status BETWEEN 200 AND 299)
  )
);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  sku text NOT NULL CHECK (sku ~ '^[A-Z0-9-]{1,40}$'),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbox (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_id uuid NOT NULL REFERENCES orders(id),
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  available_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_until timestamptz,
  sent_at timestamptz,
  dead_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX outbox_pending
  ON outbox (available_at, event_id)
  WHERE sent_at IS NULL AND dead_at IS NULL;
```

响应只保存业务状态与响应体，不保存 Cookie、访问凭证或整套敏感请求头。实际 HTTP 层还应稳定回放约定的响应头，例如资源地址；追踪标识可以每次请求新建。不要为“完整回放”把所有认证材料复制进数据库。

## 一次事务同时留下三份事实

下面的函数是核心真实实现，接续放入 `schema.sql`。调用方必须先执行同样的业务校验与摘要计算，并由服务端认证上下文提供租户。它返回 HTTP 状态语义与业务 JSON，但并不是一个自行监听端口的 HTTP 接口。

```sql
CREATE FUNCTION create_order(
  p_tenant uuid,
  p_key_hash bytea,
  p_request_hash bytea,
  p_sku text,
  p_quantity integer
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  inserted integer;
  saved api_requests%ROWTYPE;
  order_id uuid;
  body jsonb;
BEGIN
  INSERT INTO api_requests (
    tenant_id, operation, key_hash, request_hash
  ) VALUES (
    p_tenant, 'create-order:v1', p_key_hash, p_request_hash
  )
  ON CONFLICT (tenant_id, operation, key_hash) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;

  SELECT * INTO saved
  FROM api_requests
  WHERE tenant_id = p_tenant
    AND operation = 'create-order:v1'
    AND key_hash = p_key_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '40001',
      MESSAGE = 'request record unavailable; retry transaction';
  END IF;
  IF saved.request_hash <> p_request_hash THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'idempotency key reused with different request';
  END IF;
  IF inserted = 0 THEN
    IF saved.response_status IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '40001',
        MESSAGE = 'incomplete request record';
    END IF;
    RETURN jsonb_build_object(
      'status', saved.response_status, 'body', saved.response_body
    );
  END IF;

  INSERT INTO orders (tenant_id, sku, quantity)
  VALUES (p_tenant, p_sku, p_quantity)
  RETURNING id INTO order_id;

  body := jsonb_build_object(
    'orderId', order_id, 'sku', p_sku, 'quantity', p_quantity
  );
  INSERT INTO outbox (aggregate_id, event_type, payload)
  VALUES (
    order_id, 'order.created.v1',
    body || jsonb_build_object('tenantId', p_tenant)
  );
  UPDATE api_requests
  SET response_status = 201, response_body = body
  WHERE tenant_id = p_tenant
    AND operation = 'create-order:v1'
    AND key_hash = p_key_hash;

  RETURN jsonb_build_object('status', 201, 'body', body);
END;
$$;
```

在默认 Read Committed 下，并发重复插入会由唯一约束等待并仲裁。随后使用独立的查询语句读取已提交记录，是有意的：不要把 `INSERT ... ON CONFLICT DO NOTHING` 和回读塞进同一个“更漂亮”的 CTE，然后假定冲突行必然出现在同一个语句快照中。PostgreSQL 官方[事务隔离文档](https://www.postgresql.org/docs/current/transaction-iso.html)说明了冲突判断与当前查询快照之间的特殊关系。

函数内部 SQL 分步执行，且保留回读失败时的重试错误。示例没有清理线程；真实系统若同时清理幂等记录，需要单独设计保留窗口与清理协调，不能把并发删除当成不可能发生。

任一步失败，整个事务回滚，不留下半个订单或没有响应的已提交请求记录。应限制应用账号的写权限，避免别的代码绕过函数直接提交空响应记录。若调用方在外层开启事务，只能在外层 `COMMIT` 成功之后向客户端确认成功。

## 用真实摘要调用，而不是写死测试结果

以下命令只应指向独立的一次性数据库，`PG_SOCKET`、`PG_PORT` 是该实例的 Unix socket 目录与端口。不得把它们设置成现有业务数据库。先执行 `schema.sql`，再生成 `invoke.sql`，内容为：

```sql
SELECT create_order(
  '11111111-1111-4111-8111-111111111111',
  decode(:'key_hash', 'hex'),
  decode(:'request_hash', 'hex'),
  'BOOK-ARK', 2
);
SELECT count(*) AS order_count FROM orders;
SELECT count(*) AS event_count FROM outbox;
```

调用命令：

```bash
KEY_HASH=$(node --input-type=module -e \
  "import {fingerprint} from './fingerprint.mjs'; console.log(fingerprint('checkout_20261017_0001',{sku:'BOOK-ARK',quantity:2}).keyHash)")
REQUEST_HASH=$(node --input-type=module -e \
  "import {fingerprint} from './fingerprint.mjs'; console.log(fingerprint('checkout_20261017_0001',{sku:'BOOK-ARK',quantity:2}).requestHash)")
psql -X -h "$PG_SOCKET" -p "$PG_PORT" -U tutorial -d postgres \
  -v ON_ERROR_STOP=1 -f schema.sql
psql -X -h "$PG_SOCKET" -p "$PG_PORT" -U tutorial -d postgres \
  -v ON_ERROR_STOP=1 -v key_hash="$KEY_HASH" \
  -v request_hash="$REQUEST_HASH" -f invoke.sql
```

再次执行最后一条调用命令，预期仍然是状态 `201`、同一个数据库生成的 `orderId`，订单数与事件数都为 `1`。换成数量 `3` 后必须重新计算请求摘要，保持同一个键；预期发生键复用冲突，HTTP 适配层应将该特定业务错误映射为 `409`。

这些数量是这个确定输入的验收条件，不是吞吐量实验结果。代码也不能防御恶意调用者故意将错误摘要传给函数，因此函数必须在受信的服务端调用边界内使用。

## HTTP 契约不能藏在数据库异常里

参数校验、授权、幂等仲裁和业务执行有明确顺序。先拒绝结构非法的请求，再取得认证作用域，随后计算规范摘要并进入事务。示例中，校验失败不会保存请求记录，因此修正非法输入后仍可使用原键；一旦成功记录提交，同键内容就不可变。这是需要向客户端说明的协议，而不是实现细节。

若业务需要缓存确定的失败结果，例如同一业务意图被规则拒绝，也应为失败结果设计可保存的状态和响应类型。不能一边抛异常回滚请求记录，一边宣称该失败已经可以稳定回放。是否保存失败还影响后续规则变化：今天被拒绝的请求，明天用同键重试究竟回放旧拒绝，还是重新判断，必须提前约定。

示例把请求作用域限定到租户，适合租户内具有相同读取权限的教学场景。若订单只允许创建者查看，作用域还应包含可信主体标识，或回放前重新核对资源权限。幂等键不是授权令牌；知道键或者拥有同租户身份，并不当然意味着可以读取任意响应。

原响应也可能随着数据生命周期变得敏感或过时。创建时的响应回放表达“当时这次操作的结果”，而详情查询表达“资源现在的状态”。两者不应混在一起。需要即时敏感信息的接口，不宜不加分析地把完整响应永久缓存。

数据库中的唯一约束负责重复请求，但不能防止不同键表达同一业务禁令。例如“一个预约时段只能被占用一次”，应有独立的业务唯一约束或锁定逻辑。请求幂等键处理传输重试，领域约束处理真实业务冲突；用一个机制替代另一个，会留下漏洞。

## 批量领取与投递容量存在耦合

Worker 一次领取十条事件，不代表十条都能在租约内执行完。若实际并发为一，后面的任务可能尚未开始就已过期，其他 Worker 会重新领取。领取数量应与可用并发、请求耗时和租约策略协调，或者为执行中的任务安全续租。

租约续期必须同样携带栅栏值，并确认当前任务仍未发送或终止。即使续租成功，也不能让外部发送无限持续；需要取消与超时上限。部署暂停、网络分区和进程退出时，未确认任务会回到可恢复状态，而不是被从队列里直接删除。

退避不能只看重试次数，还要识别失败分类。暂时不可达可以延后，结构非法应进入人工处理，鉴权失败则需要修复配置。对所有失败使用立即重试，会把外部故障放大成压力；对所有失败直接终止，又会丢失本来可恢复的事件。

运维检查更应关注最老待发送事件的年龄、可领取数量、有效租约数量、终止事件和消费者落后情况。它们描述可靠性状态，不等同于吞吐量结论。保存终止事件时保留原事件标识，人工重放继续使用同一标识；否则消费者 Inbox 会把它当成全新事件。

## Outbox 把发送失败变成可恢复状态

数据库事务内只能提交待投递事件，不应在事务里等待消息代理或外部 HTTP。否则锁持有时间会受外部网络控制，而且数据库回滚也无法撤销已经发生的远端效果。

下面的 `worker.sql` 使用租约领取任务，事务立即提交，真实发送在事务外执行：

```sql
PREPARE claim_events(integer, interval) AS
WITH selected AS (
  SELECT event_id
  FROM outbox
  WHERE sent_at IS NULL AND dead_at IS NULL
    AND attempts < 8
    AND available_at <= now()
    AND (lease_until IS NULL OR lease_until < now())
  ORDER BY available_at, event_id
  FOR UPDATE SKIP LOCKED
  LIMIT $1
)
UPDATE outbox AS o
SET lease_until = now() + $2,
    attempts = o.attempts + 1
FROM selected
WHERE o.event_id = selected.event_id
RETURNING o.event_id, o.event_type, o.payload, o.attempts;

PREPARE acknowledge(uuid, integer) AS
UPDATE outbox
SET sent_at = clock_timestamp(), lease_until = NULL, last_error = NULL
WHERE event_id = $1 AND attempts = $2
  AND sent_at IS NULL AND dead_at IS NULL
  AND lease_until > clock_timestamp();

PREPARE reschedule(uuid, integer, interval, text) AS
UPDATE outbox
SET available_at = clock_timestamp() + $3,
    lease_until = NULL,
    last_error = left($4, 300),
    dead_at = CASE WHEN attempts >= 8 THEN clock_timestamp() END
WHERE event_id = $1 AND attempts = $2
  AND sent_at IS NULL AND dead_at IS NULL
  AND lease_until > clock_timestamp();

UPDATE outbox
SET dead_at = clock_timestamp(), lease_until = NULL
WHERE sent_at IS NULL AND dead_at IS NULL AND attempts >= 8
  AND (lease_until IS NULL OR lease_until < clock_timestamp());

BEGIN;
EXECUTE claim_events(10, interval '30 seconds');
COMMIT;
```

领取结果中的 `attempts` 是本轮栅栏值。确认与重排必须携带这个值，并检查租约仍有效，避免旧 Worker 在新 Worker 接管之后修改任务状态。失败信息必须先在应用层去敏，SQL 截断只能限制大小，不能删除敏感数据。

“30 秒”和“8 次”只是示例策略，不是测量所得的最佳配置。发送耗时、租约续期、退避上限和人工处理策略需要按实际外部系统设计。最后一次领取后崩溃的任务也必须进入可见的终止处理，否则 `attempts < 8` 会让它永久无人领取。

发送成功但确认前崩溃时，事件仍会重新投递。租约与栅栏保护的是数据库任务状态，无法阻止已经在外部系统发生的重复动作。`SKIP LOCKED` 也不保证同一订单的多个事件全局有序；需要顺序时，应引入聚合版本、分区与消费者顺序校验。

## exactly-once 的边界在消费者事务里

消费者可以通过持久化 Inbox 避免同一事件重复更新自己的数据库。示例 `consumer.sql`：

```sql
CREATE TABLE inbox (
  consumer text NOT NULL,
  event_id uuid NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);
CREATE TABLE order_projection (
  order_id uuid PRIMARY KEY,
  status text NOT NULL
);

PREPARE apply_created(uuid, uuid) AS
WITH accepted AS (
  INSERT INTO inbox (consumer, event_id)
  VALUES ('order-projection-v1', $1)
  ON CONFLICT DO NOTHING
  RETURNING event_id
)
INSERT INTO order_projection (order_id, status)
SELECT $2, 'created' FROM accepted
ON CONFLICT (order_id) DO UPDATE SET status = EXCLUDED.status;
```

消费者验证事件类型、来源与结构后，将事件 ID、订单 ID 参数化传入；执行提交成功后才能确认消费。Inbox 与业务投影在同一语句事务中提交，重复事件不会再次修改投影。实际消费者数据库可以与生产者不同，但消费者内部这两次写入必须属于同一事务。

如果业务效果是发送邮件、扣第三方余额或写另一个数据库，这个事务就无法覆盖效果。需要远端幂等键、另一层 Outbox 或补偿流程。所谓“端到端 exactly-once”若不说明事务范围、确认语义与外部能力，就容易把至少一次投递误写成绝不重复。

## 重试、保留窗口与故障验证

事务重试应识别可重试错误，例如序列化失败和死锁，并以同一个业务键从事务起点重试。键内容冲突、参数非法和权限不足不能无限重试。退避需要抖动与上限，客户端超时也不能直接推断失败。

如果数据库在 `COMMIT` 时连接中断，服务端可能不知道结果。重新连接后用同一个键查询或再调用，才能恢复已提交响应；随机换键重做是错误策略。幂等记录的保留期限至少覆盖约定重试窗口，删除后再次收到旧键会重新执行，这必须是公开的协议边界。

验证需要覆盖两个并发会话使用相同键、相同键不同内容、事务回滚、提交后响应丢失、领取后崩溃、发送后确认丢失、租约过期接管，以及消费者重复消费。每个场景都检查订单、请求记录、Outbox 与 Inbox 的数量和状态，不只检查 HTTP 返回成功。

本文的 Node 摘要与数据库核心可在隔离实例验证；真实消息代理、外部 HTTP、进程崩溃恢复和生产容量需要另行集成测试。请求幂等、Outbox 和 Inbox 的价值是把模糊失败转换成可以查询和重试的持久状态，而不是宣称分布式故障已经消失。

## 官方参考

- [PostgreSQL：事务隔离](https://www.postgresql.org/docs/current/transaction-iso.html)，核对 Read Committed、并发冲突与快照语义。
- [PostgreSQL 16：INSERT](https://www.postgresql.org/docs/16/sql-insert.html)，核对 `ON CONFLICT` 与 `RETURNING`。
- [PostgreSQL 16：约束](https://www.postgresql.org/docs/16/ddl-constraints.html)，理解唯一约束与复合主键。
- [PostgreSQL 16：SELECT](https://www.postgresql.org/docs/16/sql-select.html)，核对行锁与 `SKIP LOCKED` 的适用范围。
- [Node.js 22：Crypto](https://nodejs.org/docs/latest-v22.x/api/crypto.html)，核对摘要与输入编码。
- [AWS Prescriptive Guidance：Transactional Outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)，理解数据库提交与事件发布的双写问题。
