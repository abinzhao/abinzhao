---
title: PostgreSQL Keyset 分页：复合排序、游标验证与并发边界
description: 从稳定排序推导 Keyset 查询，实现保留微秒精度的签名游标，并验证索引、NULL、过滤条件和并发变动下的分页语义。
date: "2026-10-17"
category: 后端工程
tags: [PostgreSQL, Keyset, 分页, 索引, API设计]
featured: true
---

# PostgreSQL Keyset 分页：复合排序、游标验证与并发边界

分页不是单纯把结果切成若干块，而是在多次独立请求之间定义“下一块从哪里开始”。`OFFSET` 表达的是跳过当前结果集中的若干行；Keyset 表达的是从某个排序位置继续。两者的产品语义、索引需求和并发行为并不相同。

当列表按时间倒序、用户主要连续向后浏览时，Keyset 往往更合适。但它不自动提供固定快照，也不支持任意跳到第几页，更不能只凭一条复合比较就解决 NULL、排序变更和游标篡改。本文使用 PostgreSQL 16 兼容 SQL 与 Node 22 标准库实现，范围是单租户订单列表，不提供生产性能数字或虚构的执行计划。

## 先把排序变成全序

只写 `ORDER BY created_at DESC` 不够，因为多条记录可以拥有相同时间。数据库不承诺这些记录之间的固定顺序；第一页与第二页可能对相同时间的记录采用不同排列。

需要一个唯一的最终排序键：

```sql
ORDER BY created_at DESC, id DESC
```

这里假定 `created_at` 非空、创建后不修改，`id` 是非空且唯一的正 bigint。对于第一页最后一条返回记录 `(T, I)`，下一页条件是：

```sql
WHERE (created_at, id) < (T, I)
```

复合比较按字典序进行：时间更早，或者时间相同而 ID 更小。它与两个独立条件 `created_at < T AND id < I` 不等价；后者会错误丢弃时间更早但 ID 更大的合法记录。使用 `<=` 也会把上一页最后一条再次返回。

若排序为时间倒序、ID 正序，则不能继续使用上述整行小于比较，应写成“时间更早，或时间相同且 ID 更大”。Keyset 条件必须从排序规则推导，而不是从其他文章复制一个 `<`。

## 一份完整且可检查的 SQL 输入

以下 `pagination.sql` 仅用于一次性测试数据库。显式 ID 与时间用于构造确定的排序边界，不代表真实订单或性能样本。实际业务的 ID 应由服务端可靠生成。

```sql
CREATE TABLE orders (
  id bigint PRIMARY KEY CHECK (id > 0),
  tenant_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL,
  title text NOT NULL
);

CREATE INDEX orders_tenant_status_created_id
  ON orders (tenant_id, status, created_at DESC, id DESC);

INSERT INTO orders (id, tenant_id, status, created_at, title)
VALUES
  (1, '11111111-1111-4111-8111-111111111111', 'open',
   '2026-10-17T12:00:00.000001Z', '第一项'),
  (2, '11111111-1111-4111-8111-111111111111', 'open',
   '2026-10-17T12:01:00.000001Z', '第二项'),
  (3, '11111111-1111-4111-8111-111111111111', 'open',
   '2026-10-17T12:01:00.000001Z', '第三项'),
  (4, '11111111-1111-4111-8111-111111111111', 'open',
   '2026-10-17T12:02:00.000001Z', '第四项'),
  (5, '11111111-1111-4111-8111-111111111111', 'open',
   '2026-10-17T12:02:00.000001Z', '第五项'),
  (6, '11111111-1111-4111-8111-111111111111', 'open',
   '2026-10-17T12:03:00.000001Z', '第六项'),
  (7, '22222222-2222-4222-8222-222222222222', 'open',
   '2026-10-17T12:04:00.000001Z', '另一租户');

PREPARE first_page(uuid, text, integer) AS
SELECT id::text AS id, title,
  to_char(created_at AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time
FROM orders
WHERE tenant_id = $1 AND status = $2
ORDER BY orders.created_at DESC, orders.id DESC
LIMIT $3;

PREPARE next_page(uuid, text, timestamptz, bigint, integer) AS
SELECT id::text AS id, title,
  to_char(created_at AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time
FROM orders
WHERE tenant_id = $1 AND status = $2
  AND (created_at, id) < ($3, $4)
ORDER BY orders.created_at DESC, orders.id DESC
LIMIT $5;

EXECUTE first_page(
  '11111111-1111-4111-8111-111111111111', 'open', 3
);
EXECUTE next_page(
  '11111111-1111-4111-8111-111111111111', 'open',
  '2026-10-17T12:02:00.000001Z', 5, 3
);
EXECUTE next_page(
  '11111111-1111-4111-8111-111111111111', 'open',
  '2026-10-17T12:01:00.000001Z', 3, 3
);
```

用 `psql -X -v ON_ERROR_STOP=1 -f pagination.sql` 对独立实例执行，第一组预期返回 `6、5、4`，第二组 `4、3、2`，第三组 `2、1`。租户二的记录不会进入结果。

这里业务页大小为 `2`，数据库查询 `3` 条，即 `limit + 1`。第三条只用于判断是否还有下一页，不应返回给客户端。第一页实际返回 `6、5`，游标从 `5` 生成；第二页实际返回 `4、3`，游标从 `3` 生成。如果把多取的第三条作为游标，就会跳过本来还没返回的记录。

分页响应可采用 `items`、`nextCursor` 和 `hasMore`。最后一页没有多余记录时，`nextCursor` 为 `null`。不必为了显示下一页状态额外执行总数查询；总数在并发更新下也可能与当前页不属于同一个快照。

## 时间戳与 bigint 不要经过有损转换

PostgreSQL 时间戳支持微秒，而 JavaScript `Date` 表达毫秒。若数据库返回 `12:02:00.000001`，服务端转换为 `Date` 再序列化，就可能变成 `12:02:00.000`。拿这个被截断的位置查询下一页，会破坏相同时间附近的边界。

上面的 SQL 使用 `to_char` 输出 UTC 六位小数字符串，游标保留该字符串，并在参数化查询中转回 `timestamptz`。日期解析只用于验证日历合法性，不用于重新生成数据库排序值。

bigint 同理：超过 JavaScript 安全整数范围的 ID 不能经过 `Number`。SQL 将 ID 输出为十进制字符串，Node 使用 `BigInt` 校验范围，然后仍以字符串绑定查询参数。选择 UUID 作最终键也可以，但比较顺序应与数据库类型一致，不应在客户端随意替换成另一套排序。

投影别名还有一个隐蔽影响：`SELECT id::text AS id` 之后，未限定的 `ORDER BY id` 可以指向输出别名，从而按文本而非 bigint 排序。示例明确写 `orders.id` 保持数值排序。只有单个位数的输入不容易发现这个问题，应再插入同一时间的 ID `10`，验证它排在 `5` 之前，并检查 EXPLAIN 的排序键没有变成文本转换表达式。

## opaque cursor 是接口契约，不是安全魔法

不透明游标意味着客户端将其视为不可解释的令牌，而不是依赖内部时间、ID 和字段结构。它方便服务端以后升级格式，但 Base64 编码本身不提供完整性或保密性。

下面的 `cursor.mjs` 使用 HMAC-SHA256 防止篡改，绑定租户、状态与排序版本，严格检查编码、类型、时间和 ID 范围，并设置十五分钟有效期。示例不依赖数据库驱动；最终查询必须继续使用上述参数化语句。

```javascript
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const SORT = 'created_desc_id_desc';
const TTL = 15 * 60;
const invalid = () => { throw new Error('invalid cursor'); };
const record = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, expected) =>
  record(value) && Object.keys(value).sort().join(',') === expected;

function scopeHash(context) {
  if (!record(context) || typeof context.tenant !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        .test(context.tenant) ||
      !['open', 'closed'].includes(context.status)) invalid();
  return createHash('sha256').update(JSON.stringify({
    resource: 'orders:v1', tenant: context.tenant,
    status: context.status, sort: SORT
  })).digest('hex');
}

function validatePoint(point) {
  if (!keys(point, 'id,t') || typeof point.id !== 'string' ||
      !/^[1-9]\d{0,18}$/.test(point.id) ||
      BigInt(point.id) > 9223372036854775807n ||
      typeof point.t !== 'string' ||
      !/^[1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(point.t)) {
    invalid();
  }
  const milliseconds = point.t.slice(0, 23) + 'Z';
  const date = new Date(milliseconds);
  if (!Number.isFinite(date.getTime()) ||
      date.toISOString() !== milliseconds) invalid();
}

function decodeCanonical(value) {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) invalid();
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.toString('base64url') !== value) invalid();
  return bytes;
}

export function pageSize(value = '20') {
  if (typeof value !== 'string' || !/^[1-9]\d{0,2}$/.test(value)) invalid();
  const size = Number(value);
  if (size > 100) invalid();
  return size;
}

export function createCursorCodec(key) {
  if (!Buffer.isBuffer(key) || key.length < 32) {
    throw new Error('cursor key must contain at least 32 random bytes');
  }
  const secret = Buffer.from(key);
  const mac = (encoded) =>
    createHmac('sha256', secret).update(encoded, 'ascii').digest();
  const checkNow = (now) => {
    if (!Number.isSafeInteger(now) || now < 0 ||
        now > Number.MAX_SAFE_INTEGER - TTL) invalid();
  };
  return {
    issue(context, after, now = Math.floor(Date.now() / 1000)) {
      checkNow(now);
      validatePoint(after);
      const payload = {
        v: 1, sort: SORT, scope: scopeHash(context),
        after: { t: after.t, id: after.id }, exp: now + TTL
      };
      const encoded = Buffer.from(JSON.stringify(payload), 'utf8')
        .toString('base64url');
      return `${encoded}.${mac(encoded).toString('base64url')}`;
    },
    parse(token, context, now = Math.floor(Date.now() / 1000)) {
      checkNow(now);
      if (typeof token !== 'string' || token.length > 2048) invalid();
      const parts = token.split('.');
      if (parts.length !== 2) invalid();
      const [encoded, signature] = parts;
      const bytes = decodeCanonical(encoded);
      const received = decodeCanonical(signature);
      const expected = mac(encoded);
      if (received.length !== expected.length ||
          !timingSafeEqual(received, expected)) invalid();
      let payload;
      try {
        const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        payload = JSON.parse(json);
      } catch {
        invalid();
      }
      if (!keys(payload, 'after,exp,scope,sort,v') ||
          payload.v !== 1 || payload.sort !== SORT ||
          payload.scope !== scopeHash(context) ||
          !Number.isSafeInteger(payload.exp) || payload.exp <= now ||
          payload.exp > now + TTL) invalid();
      validatePoint(payload.after);
      return { createdAt: payload.after.t, id: payload.after.id };
    }
  };
}
```

这个令牌经过签名但没有加密，任何持有者仍可解码其中的时间和 ID。若这些数据需要保密，应采用经过审查的认证加密方案或服务端随机游标映射，而不是自行增加一层“编码”。

租户与过滤条件来自服务端本次认证和规范化结果，不能从解码游标中反向设定查询租户。签名游标也不代替每次请求的权限检查。若权限会变化，还应绑定权限版本或每次重新应用可见性条件。

生产部署必须持久保存签名密钥，不能像独立测试一样每次启动随机生成。多实例需要一致密钥，轮换时可增加明确的 key ID 和短期兼容窗口；密钥泄漏后的旧游标则需要失效策略。代码中的格式版本不是完整的密钥轮换系统。

## 验证游标的输入输出

下面的 `cursor-check.mjs` 生成临时测试密钥，不打印密钥或令牌：

```javascript
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createCursorCodec, pageSize } from './cursor.mjs';

const codec = createCursorCodec(randomBytes(32));
const context = {
  tenant: '11111111-1111-4111-8111-111111111111', status: 'open'
};
const after = { t: '2026-10-17T12:02:00.000001Z', id: '5' };
const now = 1_800_000_000;
const token = codec.issue(context, after, now);
assert.deepEqual(codec.parse(token, context, now), {
  createdAt: after.t, id: '5'
});
assert.throws(() => codec.parse(token, { ...context, status: 'closed' }, now));
assert.throws(() => codec.parse(token, {
  ...context, tenant: '22222222-2222-4222-8222-222222222222'
}, now));
assert.throws(() => codec.parse(token, context, now + 901));
const [encoded, signature] = token.split('.');
const changed = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);
assert.throws(() => codec.parse(`${encoded}.${changed}`, context, now));
assert.throws(() => codec.issue(context, {
  t: '2026-02-30T12:02:00.000001Z', id: '5'
}, now));
assert.throws(() => codec.issue(context, {
  ...after, id: '9223372036854775808'
}, now));
assert.equal(pageSize('2'), 2);
assert.throws(() => pageSize('101'));
console.log('cursor: ok');
```

执行 `node cursor-check.mjs`，预期输出 `cursor: ok`。这个检查验证令牌边界，SQL 输入检查验证排序边界；两者必须结合。合法游标不代表数据库中那条记录仍存在，也不要求先查找锚点记录：Keyset 使用的是排序值，锚点删除后仍能继续查询。

## 索引与过滤条件一起设计

示例索引首先放租户和状态，再放时间与 ID，是因为查询先对租户、状态做等值过滤，然后沿时间与 ID 继续扫描。B-tree 可以支持排序，但是否选择索引、扫描多少记录，还取决于过滤选择性、数据分布和计划。

如果接口新增“所有状态”，原索引中的状态不再是单个等值条件，不能直接假定它仍能高效输出全局时间顺序。可能需要另一条 `(tenant_id, created_at DESC, id DESC)` 索引，也可能拆成独立端点；应先检查实际查询和成本，再决定。

部分索引适合固定的业务过滤，例如只索引未删除记录。查询必须能证明满足部分索引条件。`INCLUDE` 可以减少某些回表需求，但增加索引体积与写入成本；即使覆盖了返回列，也不保证每次都是 Index Only Scan，因为可见性检查仍受数据库状态影响。

不要用“Keyset 一定是常数时间”概括所有情况。若额外过滤大量不满足条件的记录、排序涉及表达式、关联查询需要重新排序，仍可能扫描较多数据。PostgreSQL 文档中的优化也随版本变化，例如当前版本对多列索引的优化说明不能无条件套用到旧版本。

## 关联查询先确定分页实体

一个订单有多条明细时，直接连接订单与明细再执行 `LIMIT`，分页单位就会从订单变成连接后的行。同一个订单可能占据多条位置，客户端去重之后看起来页大小不足，游标也可能无法表达已经返回哪些明细。

如果列表的单位是订单，应先在订单层完成排序、过滤和 Keyset 限制，再读取这些订单的关联数据。用于判断订单是否满足条件的明细，可以通过 `EXISTS` 表达，避免为了过滤而把一个订单扩展成多行。随后聚合或批量读取展示信息，但要保留第一阶段的排序。

这里仍有一致性选择。两条独立 SQL 在 Read Committed 下可能看到不同版本；若要求当前页面的主记录与明细来自同一快照，可以使用单条查询组织，或在短事务中明确隔离等级。不能为了减少一次查询，就牺牲分页单位与可观察语义。

动态排序也属于输入边界。列名和排序方向不能靠参数占位符直接绑定，应该把公开排序标识映射到服务端固定 SQL 模板。用户传入的 `sort` 不应原样拼接进 `ORDER BY`；改排序后必须重新开始分页，因为原游标对应的是另一套全序。

全文检索或相关度排序尤其需要额外分析。相关度可能随索引、语料和权重更新而变化，未必适合长期稳定的 Keyset 游标。可以绑定检索版本、限定有效期，或者物化一次搜索结果；不能把时间列表的稳定性结论直接迁移到相关度列表。

## NULL 排序需要显式分支

示例把时间设为 `NOT NULL`，是为了简化且固定语义。若业务按可空优先级排序：

```sql
ORDER BY priority DESC NULLS LAST, id DESC
```

当游标优先级非空时，后续条件应包含：

```sql
priority < $1
OR (priority = $1 AND id < $2)
OR priority IS NULL
```

当游标优先级为空时，后续条件则是：

```sql
priority IS NULL AND id < $1
```

所有分支还必须保留租户与其他过滤条件，非空分支外层要加括号，避免 `AND`、`OR` 优先级造成越界。行比较遇到决定性 NULL 时可能返回未知值，不能把 `(priority, id) < (...)` 当成完整实现。

也不能随手用 `COALESCE(priority, -1)`，除非域规则证明 `-1` 永远不可能是合法优先级，并且索引与排序都使用完全相同的表达式。显式空值分支通常更容易说明和验证，游标也需要携带是否为空的状态。

## 并发插入、删除和更新到底影响什么

在 Read Committed 下，每次分页请求通常得到新的快照。第一页之后有更新更晚的记录插入到列表顶部，下一页不会把它补回来，因为它位于游标之前；用户刷新第一页才能看到。这符合连续向后浏览的语义，不是固定全量导出。

删除已看过的记录不会像 OFFSET 那样让后续位置整体左移，从而直接跳过下一条。但修改排序字段可以让记录跨越游标：已经看过的记录移动到更早位置，可能再次出现；尚未看过的记录移动到更晚位置，可能被跳过。

过滤条件变化也有类似影响。订单从 `closed` 改为 `open`，可能在翻页过程中加入结果；权限撤销则可能让记录消失。绑定过滤摘要防止客户端主动换条件继续使用旧游标，却不能冻结数据库中的字段值。

列表顶部的时间水位能限制某些新记录，但不是数据库快照：回填旧时间的插入仍可进入，更新与删除也未被冻结。需要一致导出时，可在受控任务中使用 Repeatable Read、物化结果或专门的导出任务。不要把数据库事务长期悬挂在用户翻页期间，这会增加连接与 MVCC 清理压力。

向前翻页也要重新推导：从当前页第一条记录向更大排序值查询，使用相反的排序取最近记录，再在响应中反转为约定顺序。没有必要把这种逻辑伪装成可以任意跳页；产品若强依赖页码跳转，OFFSET 或结果快照可能更适合。

并发验证可以从确定输入出发：读取第一页后，插入一条时间更晚的记录，下一页仍应从原游标向后；删除游标记录后，下一页仍应按排序值继续；修改尚未返回记录的排序时间，再观察它跨过游标后的变化。前两个场景验证续读位置，第三个场景验证已声明的非快照边界，而不是要求实现满足它从未承诺的快照行为。

客户端也应避免把连续读取等同于永久完整列表。`hasMore` 只表达当前查询时是否多取到一条记录，下一次请求前仍可能发生删除。下一页为空是可恢复的正常状态，不应无限重复请求同一个游标，也不能把旧游标回退后再次追加数据而制造重复。

## 用 EXPLAIN 检查真正的工作量

在同一个建立过 prepared statement 的测试会话中执行：

```sql
ANALYZE orders;
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
EXECUTE next_page(
  '11111111-1111-4111-8111-111111111111', 'open',
  '2026-10-17T12:02:00.000001Z', 5, 3
);
```

`EXPLAIN ANALYZE` 会真实执行语句；这里是只读 SELECT，但不能将这个命令直接泛化到写语句。`ANALYZE orders` 会更新统计信息，所以整套示例应在隔离数据库运行。

检查计划中等值条件与游标范围是否进入 Index Cond，是否出现额外 Sort，Rows Removed by Filter 是否很大，实际输出与扫描行数是否相差显著，以及缓冲区读取情况。只有几条教学记录时，顺序扫描可能是合理计划，不能为了让截图出现索引而关闭 `enable_seqscan`。

比较 OFFSET 与 Keyset 时，应使用相同过滤、返回列、页大小和近似数据位置，并区分冷缓存与热缓存。重复运行一次更快，不足以证明某种分页策略的普遍倍数优势。参数化查询的通用计划与自定义计划也可能不同，第一页和后续页分开查询有助于减少可空游标 OR 条件带来的规划歧义。

本文提供的是计划分析方法，没有编造耗时或缓冲区数字。真正的完成标准是：静态输入连续返回每条记录一次，非法游标被拒绝，微秒与 bigint 未丢失精度，租户与过滤始终受约束，并发语义被明确记录，实际执行计划与查询目标一致。

## 官方参考

- [PostgreSQL：多列索引](https://www.postgresql.org/docs/current/indexes-multicolumn.html)，理解前导列约束与版本相关优化。
- [PostgreSQL 16：行与数组比较](https://www.postgresql.org/docs/16/functions-comparisons.html)，核对复合比较与 NULL 语义。
- [PostgreSQL 16：索引与排序](https://www.postgresql.org/docs/16/indexes-ordering.html)，核对 B-tree 与排序方向。
- [PostgreSQL 16：LIMIT 与 OFFSET](https://www.postgresql.org/docs/16/queries-limit.html)，理解跳过记录与确定排序。
- [PostgreSQL：事务隔离](https://www.postgresql.org/docs/current/transaction-iso.html)，核对跨请求快照与并发可见性。
- [PostgreSQL 16：EXPLAIN](https://www.postgresql.org/docs/16/using-explain.html)，理解实际执行与计划成本的区别。
- [Google AIP-158：分页](https://google.aip.dev/158)，参考不透明分页令牌的接口契约。
- [Node.js 22：Crypto](https://nodejs.org/docs/latest-v22.x/api/crypto.html)，核对 HMAC 与固定时间比较。
