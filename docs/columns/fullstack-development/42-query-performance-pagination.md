---
title: "第 42 章：查询性能、索引与游标分页"
description: "从执行计划发现瓶颈，建立适配租户与发布时间的索引，实现保留微秒精度的稳定分页并验证重复、遗漏和边界。"
date: '2026-10-23'
category: 数据库
tags: [索引, EXPLAIN, 游标分页, 查询优化]
series:
  order: 43
---

# 第 42 章：查询性能、索引与游标分页

列表开始只有十篇文章，所有查询看起来都快；增长到十万篇后，深页 OFFSET、重复查作者、排序临时文件与连接池排队会一起出现。本章从查询意图与执行计划出发优化，不通过增加缓存隐藏慢 SQL，也不预先给每一列建立索引。

## 42.1 性能目标需要可比较证据

先记录请求量、文章规模、租户分布、过滤条件和分页位置，再比较响应延迟分布。数据库执行时间、连接池等待、网络传输和 JSON 序列化不是同一个指标。一次热缓存本机查询不能证明线上 SLA，也不能证明冷启动下的行为。

公开列表只读已发布摘要，按 `published_at DESC, id DESC` 排序。第二个键必须稳定且唯一：同一时刻可以发布多篇文章，单用时间排序会导致页边界不确定。文章编辑不改变发布时间；若业务允许调整排序键，就必须承认跨页读取时可能出现数据移动。

OFFSET 适合小规模后台随机跳页，但越往后越需要跳过更多行；新文章插入第一页也可能使后续偏移发生重复或遗漏。Keyset 分页使用上一页最后一条记录的排序键，不扫描所有前置页，但不天然支持“直接跳到第 500 页”，两者应按产品需求选择。

## 42.2 建立与查询匹配的索引

在下一份迁移中增加：

```sql
CREATE INDEX posts_public_page_idx
ON posts (tenant_id, published_at DESC, id DESC)
WHERE status = 'published';

CREATE INDEX memberships_user_idx ON memberships (user_id, tenant_id);
```

第一个部分索引只包含公开列表需要的行。查询必须明确包含 `status = 'published'`，规划器才能证明条件符合索引谓词。租户等值条件在前，排序键在后，对这一查询有明确依据；不是所有组合查询都必须照抄“最左前缀”口诀。

PostgreSQL 18 的 B-tree 还可能使用 skip scan，在某些分布下利用缺少首列条件的索引；这不意味着顺序不重要，更不意味着对任意租户分布都保证高效。具体是否使用由数据分布、统计信息和成本模型决定，仍需执行计划。

索引会增加写入、磁盘和维护成本。给摘要字段加 INCLUDE 可能支持 index-only scan，但可见性与更新频率仍会影响回表，不把所有正文塞进覆盖索引。新增索引与删除旧索引也需要迁移与回滚考虑，不能在线上随意试探。

## 42.3 阅读 EXPLAIN，而不是只看总毫秒

在学习库执行：

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, slug, title, summary, published_at
FROM posts
WHERE tenant_id = '00000000-0000-4000-8000-000000000010'
  AND status = 'published'
ORDER BY published_at DESC, id DESC
LIMIT 21;
```

`ANALYZE` 会真实执行查询。用于 UPDATE、DELETE 或带副作用函数时更需谨慎，不能把 EXPLAIN 当成只读按钮。这里仅针对学习数据的 SELECT；生产排查先核对权限、数据量和影响。

| 执行计划信号 | 需要思考的问题 |
|---|---|
| estimated rows 与 actual rows 差距大 | 统计是否陈旧、分布是否倾斜 |
| Rows Removed by Filter 很多 | 条件是否能进入索引 |
| Sort 溢出到磁盘 | 是否有合适排序索引、结果是否过大 |
| Nested Loop 内侧 loops 很多 | 是否重复读取、索引是否存在 |
| buffers 大但返回很少 | 是否扫描了无关数据 |
| Seq Scan | 小表可能合理，不能直接判为错误 |

cost 是规划器成本单位，不是毫秒；上层节点时间与子节点工作有包含关系，不能简单把每行数值相加。热缓存命中与真正磁盘读取也不同。用 JSON 格式保留计划方便比较，但不要将真实正文、邮箱和连接串混入公开报告。

批量导入学习数据后运行 ANALYZE 再比较，保持机器、过滤条件和并发相同。查询没有命中索引时先理解原因，不关闭 `enable_seqscan` 制造“索引优化成功”。

## 42.4 游标中的时间不能丢精度

PostgreSQL 时间戳可到微秒，JavaScript Date 主要保留毫秒。若数据库最后一条是 `.123456`，先转 Date 再 `toISOString()` 会变成 `.123`，下页比较可能跳过部分文章。游标值必须来自与排序字段一致的精确表示。

在 SQL 中输出 UTC 六位小数：

```sql
SELECT
  id, slug, title, summary,
  to_char(
    published_at AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  ) AS "publishedAt"
FROM posts;
```

JSON 表示保持字符串，不经过 Date 截断再写回游标。UI 需要本地展示时可以用 Date，但下一页 cursor 使用原始字符串。另一种方案是直接用稳定序号排序；那会改变产品语义，应先明确是“发布时间顺序”还是“插入顺序”。

## 42.5 编码、校验与查询实现

创建 `src/pagination.ts`，沿用第 39 章 `AppError` 与数据库 pool：

```ts
import type { Pool } from 'pg';
import { AppError } from './errors.js';

type Cursor = {
  v: 1; tenantId: string; sort: 'published-desc'; at: string; id: string;
};
type Summary = {
  id: string; slug: string; title: string; summary: string; publishedAt: string;
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(raw: string, tenantId: string): Cursor {
  try {
    if (raw.length > 512 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error();
    const value: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (
      typeof value !== 'object' || value === null ||
      !('v' in value) || value.v !== 1 ||
      !('tenantId' in value) || value.tenantId !== tenantId ||
      !('sort' in value) || value.sort !== 'published-desc' ||
      !('at' in value) || typeof value.at !== 'string' ||
      !timestampPattern.test(value.at) || !Number.isFinite(Date.parse(value.at)) ||
      new Date(value.at).toISOString().slice(0, 19) !== value.at.slice(0, 19) ||
      !('id' in value) || typeof value.id !== 'string' || !uuidPattern.test(value.id)
    ) throw new Error();
    return {
      v: 1, tenantId, sort: 'published-desc', at: value.at, id: value.id,
    };
  } catch {
    throw new AppError(400, 'INVALID_CURSOR', '分页游标不合法或不属于当前空间');
  }
}

export async function listPublished(
  pool: Pool, tenantId: string, limit: number, rawCursor?: string,
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new AppError(400, 'INVALID_LIMIT', '每页数量必须是 1 到 100');
  }
  const cursor = rawCursor ? decodeCursor(rawCursor, tenantId) : null;
  const boundary = cursor
    ? 'AND (published_at, id) < ($2::timestamptz, $3::uuid)' : '';
  const limitParameter = cursor ? '$4' : '$2';
  const values = cursor
    ? [tenantId, cursor.at, cursor.id, limit + 1] : [tenantId, limit + 1];
  const result = await pool.query<Summary>(
    `SELECT id, slug, title, summary,
       to_char(published_at AT TIME ZONE 'UTC',
         'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "publishedAt"
     FROM posts
     WHERE tenant_id = $1 AND status = 'published' ${boundary}
     ORDER BY published_at DESC, id DESC LIMIT ${limitParameter}`,
    values,
  );
  const items = result.rows.slice(0, limit);
  const last = items.at(-1);
  const nextCursor = result.rows.length > limit && last
    ? encodeCursor({
        v: 1, tenantId, sort: 'published-desc', at: last.publishedAt, id: last.id,
      }) : null;
  return { items, nextCursor };
}
```

SQL 中插入的 boundary 和占位符来自服务器固定分支，不来自用户字符串；所有值仍通过参数绑定。第一页与后续页用不同条件，避免一个泛用 `OR cursor IS NULL` 查询遮蔽索引意图。多读一行判断是否有下一页，再用实际返回页的最后一条建立 cursor，不能用额外的哨兵行，否则会漏掉那条记录。

Base64 是编码，不是加密或签名。游标不承担身份授权：管理列表仍需验证当前租户权限。这里绑定租户与排序版本，阻止误用另一列表的 cursor；如加入标签或搜索条件，需要绑定相同过滤上下文。需要防篡改可做服务端签名，但不能因此允许游标跳过权限检查。

## 42.6 分页一致性的真实边界

游标分页不代表跨多次 HTTP 请求的数据库快照。翻页期间新文章发布在前面，旧 cursor 继续读后面通常不会重复新文章；但旧文章被取消发布、删除或调整发布时间后，用户看到的集合会变化。

多数博客列表接受“每页读取当时已发布内容”的语义。需要审计导出时，应建立明确快照或后台导出任务，而不是在浏览器维持十分钟数据库事务。客户端合并多页可按稳定 id 去重，但去重只是 UI 防护，不修复后端漏行。

全文搜索也不是 `ILIKE '%词%'` 加一个普通 B-tree 就会快。PostgreSQL 提供全文检索与 GIN，中文分词策略需结合实际内容验证；不要把英文词典示例宣称为完整中文搜索方案。先做有界的简单搜索，测量后再增加检索能力。

## 42.7 避免 N+1 与连接排队

先取二十篇文章，再为每篇各查一次作者，会变成二十一次数据库往返。能够表达为 JOIN 或有界批量查询时优先合并，但需要验证关联是否造成一篇文章多行，不能 JOIN 标签后把重复文章当作分页项。

连接池 max 增大也不是自动提升吞吐。数据库已经 CPU 饱和时，更多并发会增加排队和内存。记录 pool 总数、空闲数、等待数，区分“数据库语句慢”与“借不到连接”。慢请求的端到端预算还包含授权查询和序列化，不只是一条 SELECT。

不要在公开接口返回精确总数作为默认需求。`COUNT(*)` 可能比取得一页更贵，动态数据下总数与列表也可能不是同一快照。产品确需总数时，明确刷新频率、准确性与成本。

## 42.8 正常、异常与性能验证

准备包含相同发布时间、相差一微秒、多个租户和草稿的学习记录。每页只取两条，持续翻到 `nextCursor: null`，收集所有 id：在静态数据集下应无重复、无遗漏，且草稿和其他租户不可见。不要只用时间全不同的三条数据验证分页。

异常输入包括乱码 cursor、超长 cursor、另一租户 cursor、非法日期、非法 UUID、limit 0、101、小数和数组查询参数。应得到明确 400，而不是让数据库类型转换异常变成 500。空字符串 cursor 是否等同第一页须在 HTTP schema 中明确，本实现把未提供视作第一页。

比较 OFFSET 深页与 cursor 后续页的执行计划和缓冲读取，不编造“性能提升十倍”的固定结果。发生重复时核对 ORDER BY 与边界比较方向；发生漏行时核对 cursor 是否取了哨兵行、是否丢微秒；索引未使用时核对谓词、统计与表规模。

练习把筛选条件绑定到 cursor，给前端增加“加载更多”与重试状态，并在取消发布时解释列表变化。完成标准是固定数据集完整遍历、边界输入拒绝、公开范围不越界、性能结论有同条件计划与命令记录。

## 官方参考

- [PostgreSQL：EXPLAIN](https://www.postgresql.org/docs/18/using-explain.html)。
- [PostgreSQL：多列索引与 skip scan](https://www.postgresql.org/docs/18/indexes-multicolumn.html)。
- [PostgreSQL：部分索引](https://www.postgresql.org/docs/18/indexes-partial.html)。
- [PostgreSQL：行比较](https://www.postgresql.org/docs/18/functions-comparisons.html#ROW-WISE-COMPARISON)。
- [PostgreSQL：日期格式化](https://www.postgresql.org/docs/18/functions-formatting.html)。

下一章：[密码与 Session 鉴权](./43-password-session-auth)。
