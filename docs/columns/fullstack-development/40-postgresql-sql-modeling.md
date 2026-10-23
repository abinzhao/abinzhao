---
title: "第 40 章：PostgreSQL、SQL 与博客数据建模"
description: "建立用户、租户、成员与文章关系，使用约束和参数化 SQL 管理真实持久数据，理解类型、连接池与查询边界。"
date: '2026-10-23'
category: 数据库
tags: [PostgreSQL, SQL, 数据建模, 参数化查询]
series:
  order: 41
---

# 第 40 章：PostgreSQL、SQL 与博客数据建模

共享数据库解决的不只是“刷新后内容还在”。它要让不同请求遵守同一组约束：作者确实存在，slug 在租户中唯一，发布文章具备发布时间，更新版本不会回到零。本章先用关系模型表达这些事实，再让 API 通过参数化 SQL 使用它。

## 40.1 版本、范围与准备

核验日为 2026-10-23，官方支持页和发布归档本次列出的课程数据库为 **PostgreSQL 18.6**，不是根据年度节奏猜测主版本。Node 驱动 `pg` 与类型 `@types/pg` 均固定 **8.23.1**。数据库服务端、驱动和类型包各自发布，不能因为数字不同就判定不兼容。

准备一个独立学习数据库 `blog_learning` 和专用学习账号。可以使用本机 PostgreSQL 或第 51 章的容器方式。数据库初始化、迁移和清理只操作学习库，绝不照抄到已有业务库。检查：

```bash
psql --version
psql "$DATABASE_URL" -c "SELECT version(), current_database(), current_user;"
```

`DATABASE_URL` 由读者在终端注入，不在文章中填写真实密码。命令历史、截图和日志也可能泄漏凭据，尽量使用本地权限受控的配置或连接服务名。若实际服务版本不同，记录差异再验证 SQL，不把客户端版本当成服务端版本。

## 40.2 从领域关系出发

一个用户可以加入多个博客空间，一个空间有多个成员，每篇文章属于一个空间并由一个用户创作。因此用户与租户是多对多关系，成员关系有自己的 role，不应把单一 `tenantId` 写进用户表。

```text
users ← memberships → tenants
  ↑                       ↑
author_id              tenant_id
  └──────── posts ────────┘
```

租户是数据隔离边界，不只是 UI 分类。公开页面使用可读的租户 slug，管理 API 使用租户 UUID，再查当前用户的成员关系。文章 UUID 便于稳定引用，slug 便于公开地址；改标题不自动改地址，避免破坏已经传播的链接。

没有在用户表存“超级管理员=true”来绕过全部租户规则。授权在第 45 章明确表达：owner/editor 可以做哪些操作，reader 可以读取什么，撤销成员关系后哪些历史数据仍保留。数据库约束负责结构一致，不能替代权限决策。

## 40.3 建立第一份 schema

将以下内容保存为独立学习项目的 `migrations/001_initial.sql`。第 41 章负责有版本、事务和校验和的执行器，不在每次 API 启动时随意 `CREATE TABLE IF NOT EXISTS`。

```sql
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_norm text NOT NULL UNIQUE,
  password_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email_norm = lower(email_norm)),
  CHECK (char_length(email_norm) BETWEEN 3 AND 254)
);

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CHECK (char_length(slug) BETWEEN 1 AND 80),
  CHECK (char_length(btrim(name)) BETWEEN 1 AND 120)
);

CREATE TABLE memberships (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('owner', 'editor', 'reader')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  author_id uuid NOT NULL REFERENCES users(id),
  slug text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  body text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT posts_tenant_slug_key UNIQUE (tenant_id, slug),
  UNIQUE (tenant_id, id),
  CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CHECK (char_length(slug) BETWEEN 1 AND 80),
  CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  CHECK (char_length(summary) <= 240),
  CHECK (char_length(btrim(body)) BETWEEN 1 AND 100000),
  CHECK (
    (status = 'draft' AND published_at IS NULL)
    OR (status = 'published' AND published_at IS NOT NULL)
  )
);
```

`password_hash` 可空，为后续只有 OIDC 身份的用户保留合法状态；空值用户不能通过密码登录。邮箱统一小写是课程的产品选择，不是声称所有邮件服务的本地部分天然不区分大小写。注册、登录和唯一约束必须使用同一规范化规则。

`timestamptz` 保存时间瞬间，不保存用户的原始时区名称。展示时用用户时区格式化；不能用 `timestamp without time zone` 随意承载全球时间。文本正文先用 text，标签如果加入可搜索领域则建独立关联表；不要因为 PostgreSQL 有 JSONB 就把所有实体装进一个没有约束的 JSON 字段。

`CHECK` 遇到 NULL 可能得到未知并被接受，所以需要 `NOT NULL` 与检查一起使用。主键、唯一键会建立相关索引；外键的引用列不一定自动建立适合查询的索引。文章作者引用用户而不是成员关系，允许成员离开后保留创作历史，权限仍由实时成员关系判断。

## 40.4 插入、读取、更新与删除

先用完全隔离的练习数据建立用户与空间：

```sql
INSERT INTO users (id, email_norm) VALUES
  ('00000000-0000-4000-8000-000000000001', 'learner@example.org');
INSERT INTO tenants (id, slug, name) VALUES
  ('00000000-0000-4000-8000-000000000010', 'learning', '学习博客');
INSERT INTO memberships (tenant_id, user_id, role) VALUES
  ('00000000-0000-4000-8000-000000000010',
   '00000000-0000-4000-8000-000000000001', 'owner');
```

这些是课程练习记录，不是生产用户，也不是已经插入本机的验证结果。示例用户没有密码，正式闭环由第 43、54 章的注册流程创建。

Node 中创建文章：

```ts
import type { Pool } from 'pg';

type CreatePostInput = {
  slug: string; title: string; summary: string; body: string;
};
type CreatedPost = { id: string; revision: number };

export async function createDraft(
  pool: Pool, tenantId: string, userId: string, input: CreatePostInput,
): Promise<CreatedPost> {
  const result = await pool.query<CreatedPost>(
    `INSERT INTO posts (tenant_id, author_id, slug, title, summary, body)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, revision`,
    [tenantId, userId, input.slug, input.title.trim(), input.summary, input.body],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Insert returned no row');
  return row;
}
```

`tenantId` 与 `userId` 来自已验证的路由和身份上下文，不由输入对象决定。调用前还需要成员与角色检查。`Pool.query<T>` 的泛型只是编译期声明，不会自动验证真实数据库列；迁移、显式 SELECT 列、结果映射和集成测试共同维护这条契约。

公开读取必须在 SQL 层限制已发布数据：

```sql
SELECT p.id, p.slug, p.title, p.summary, p.body, p.published_at
FROM posts AS p
JOIN tenants AS t ON t.id = p.tenant_id
WHERE t.slug = $1 AND p.slug = $2 AND p.status = 'published';
```

不能先查全部文章，再在前端过滤草稿。避免 `SELECT *`：它容易让新增的内部列直接泄漏到 API，还让类型与查询意图难以审阅。更新同样限制租户和资源 ID，并使用下一章的 revision 条件；删除策略要明确硬删除还是回收站，不能无需求加入“软删除一切”再遗漏过滤。

## 40.5 参数化 SQL 与动态标识符

参数化查询把值交给驱动，不把输入当作 SQL 源码：

```ts
const result = await pool.query(
  `SELECT id, title FROM posts
   WHERE tenant_id = $1 AND title ILIKE $2
   ORDER BY created_at DESC, id DESC LIMIT $3`,
  [tenantId, `%${keyword}%`, 20],
);
```

它防 SQL 注入，但 `%` 与 `_` 仍是 LIKE 的通配符。如果需求是字面量搜索，需要转义并指定 ESCAPE；如果允许模糊匹配则明确告知。参数化也不会限制查询成本，超长搜索、无索引匹配和无界分页仍可耗尽资源。

列名、表名、排序方向不能用 `$1` 作为标识符替换。对排序只使用服务器枚举白名单，绝不 `ORDER BY ${request.query.sort}`。多租户也不通过用户输入拼 schema 名；第 45 章先采用共享表与强制租户条件。

驱动默认把部分数据库类型映射为字符串，例如需要保留精度的 numeric 或 bigint。不要无条件 `Number()`：超出安全整数范围会损失信息。API 可以使用字符串表示大整数，货币优先以最小单位的有界整数或准确十进制模型处理，不能用浮点数随意结算。

## 40.6 约束错误与连接边界

重复 slug 的 SQLSTATE `23505` 是可预期冲突，但只映射已知约束名：

```ts
try {
  return await createDraft(pool, tenantId, userId, input);
} catch (error) {
  if (
    typeof error === 'object' && error !== null &&
    'code' in error && error.code === '23505' &&
    'constraint' in error && error.constraint === 'posts_tenant_slug_key'
  ) {
    throw new AppError(409, 'SLUG_CONFLICT', '当前空间已使用该文章地址');
  }
  throw error;
}
```

这里的 `AppError` 从第 39 章 `errors.ts` 导入。不能把任何数据库错误都返回“文章不存在”，更不能把死锁、连接超时和语法错误都吞成空列表。`23503` 外键失败、`23514` CHECK 失败分别说明关系或数据约束不满足；它们可能是输入错误，也可能是实现缺陷，需按具体边界分析。

生产数据库连接需要正确验证 TLS 证书。遇到证书错误不要设 `rejectUnauthorized: false` 制造“连通”；核对 CA、主机名与平台连接说明。连接池复用连接，不等于可跨请求共享事务；事务必须使用同一客户端，下一章解释。

## 40.7 正常、异常与持久化验证

从空学习库执行迁移后，插入用户、空间和草稿，查询应存在；重启 API 后记录仍存在，这是持久化验证。公开查询在草稿状态应为空，发布后才可读。只检查 API 的内存数组不能证明数据库持久化。

异常实验分别插入重复租户 slug、同租户重复文章 slug、不存在的作者、空白标题、发布但没有发布时间的文章。数据库应拒绝；不同租户可以使用相同文章 slug。使用单引号、SQL 片段和 LIKE 通配符搜索，确认参数化不会变成执行命令，同时记录通配符的合法含义。

排错先查 `current_database()` 和 `current_user`，避免连到错误库；查 `search_path`，避免表在另一个 schema；查约束名，而不是模糊匹配错误消息。显示日期偏移时核对连接 TimeZone 和浏览器格式化，不直接修改数据库时间值“补八小时”。

练习增加文章标签关系，定义重复标签、删除标签与按标签查询的行为；为公开摘要写显式列清单；写出两个租户同 slug 的查询。完成标准是 schema 能从空库重建、错误关系被约束拒绝、SQL 不拼用户输入、重启不丢数据且公开接口不泄漏草稿。

## 官方参考

- [PostgreSQL 支持政策](https://www.postgresql.org/support/versioning/)与[18.6 发布说明](https://www.postgresql.org/docs/release/18.6/)。
- [PostgreSQL 18：约束](https://www.postgresql.org/docs/18/ddl-constraints.html)。
- [PostgreSQL：日期时间类型](https://www.postgresql.org/docs/18/datatype-datetime.html)。
- [node-postgres：参数化查询](https://node-postgres.com/features/queries)与[数据类型](https://node-postgres.com/features/types)。

下一章：[迁移、事务与并发一致性](./41-migrations-transactions)。
