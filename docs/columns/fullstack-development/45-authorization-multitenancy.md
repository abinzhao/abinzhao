---
title: "第 45 章：访问控制与多租户隔离"
description: "用动作矩阵、实时成员检查、带租户 SQL、事务锁和可选 RLS 防止越权，并建立跨用户跨空间回归用例。"
date: '2026-10-23'
category: 后端安全
tags: [授权, 多租户, RBAC, RLS]
series:
  order: 46
---

# 第 45 章：访问控制与多租户隔离

知道请求来自 Alice，不意味着她可以修改任意文章。UUID 不可预测、前端按钮隐藏、路由包含 tenantId 都不是授权。本章建立“身份、动作、资源、租户”的完整判断，把授权放进真实查询与事务，而不是只在进入页面时检查一次。

## 45.1 先写动作矩阵

课程采用共享数据库、共享表、每行带 tenant_id。空间是权限边界，角色属于 memberships，不属于用户全局身份。一个人在空间 A 是 owner，在空间 B 可以是 reader，切换空间时必须重查，不能复用一个 Session 内缓存的最高角色。

| 动作 | 匿名 | reader | editor | owner |
|---|---|---|---|---|
| 阅读已发布内容 | 允许 | 允许 | 允许 | 允许 |
| 阅读当前空间草稿 | 拒绝 | 允许 | 允许 | 允许 |
| 创建、编辑、发布文章 | 拒绝 | 拒绝 | 允许 | 允许 |
| 管理成员与空间设置 | 拒绝 | 拒绝 | 拒绝 | 允许 |
| 修改其他空间文章 | 拒绝 | 拒绝 | 拒绝 | 拒绝 |

这里 editor 可以编辑本空间所有文章，是明确产品选择；若要“只能编辑自己”，增加 `author_id=userId` 条件与动作区分，不能让前后端各自猜测。公开页面只读取 published，登录也不会自动扩大公开接口的数据范围。没有给 owner 全局跨租户权限。

默认拒绝比默认允许更容易审阅。新增动作先加入矩阵、API 与测试，再显示 UI；不能因为函数名叫 `adminRoute` 就认为天然安全。对象级越权既可能通过 URL id，也可能通过 body 中的 authorId、批量数组、嵌套附件 ID 与导出任务发生。[OWASP 授权指南](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)

## 45.2 可信上下文不来自请求体

userId 来自第 43 章 Session，tenantId 来自验证后的路由，再检查成员关系。写入输入只包含允许的字段，不能 `INSERT ... request.body` 或将 body 展开到更新对象；传来的 role、status、authorId、tenantId 需要明确拒绝。

```ts
import type { PoolClient } from 'pg';
import { AppError } from './errors.js';

type Role = 'owner' | 'editor' | 'reader';
type Action = 'read-drafts' | 'write-posts' | 'manage-members';
const allowed: Record<Action, readonly Role[]> = {
  'read-drafts': ['owner', 'editor', 'reader'],
  'write-posts': ['owner', 'editor'],
  'manage-members': ['owner'],
};

export async function authorize(
  db: PoolClient, userId: string, tenantId: string, action: Action,
) {
  const membership = await db.query<{ role: Role }>(
    `SELECT role FROM memberships
     WHERE user_id=$1 AND tenant_id=$2 FOR SHARE`,
    [userId, tenantId],
  );
  const row = membership.rows[0];
  if (!row) throw new AppError(404, 'NOT_FOUND', '资源不存在');
  if (!allowed[action].includes(row.role)) {
    throw new AppError(403, 'FORBIDDEN', '没有执行此操作的权限');
  }
  return row.role;
}
```

不存在成员关系返回 404，减少泄漏空间或资源存在性；已知空间的只读成员执行写操作返回 403。这个策略不是通用规定，关键是所有相关入口一致且不会通过错误正文泄漏标题、作者或邮箱。

`FOR SHARE` 在事务中锁定成员行，角色修改或成员删除会等待当前写事务结束。只检查后立即释放连接，再在另一个事务更新文章，仍可能出现权限撤销后继续写入的窗口。事务中的锁表达的是“操作开始时仍有权限且撤销与操作有明确顺序”，不是保证所有并发撤销瞬间停止已执行的代码。

## 45.3 授权与更新放在同一事务

```ts
type EditInput = { title: string; body: string; revision: number };

async function editPost(
  userId: string, tenantId: string, postId: string, input: EditInput,
) {
  return transaction(pool, async db => {
    await authorize(db, userId, tenantId, 'write-posts');
    const result = await db.query<{ id: string; revision: number }>(
      `UPDATE posts SET title=$4,body=$5,revision=revision+1,updated_at=now()
       WHERE tenant_id=$1 AND id=$2 AND revision=$3
       RETURNING id,revision`,
      [tenantId, postId, input.revision, input.title.trim(), input.body],
    );
    if (result.rows[0]) return result.rows[0];
    const exists = await db.query(
      'SELECT 1 FROM posts WHERE tenant_id=$1 AND id=$2',
      [tenantId, postId],
    );
    if (!exists.rowCount) throw new AppError(404, 'NOT_FOUND', '文章不存在');
    throw new AppError(409, 'REVISION_CONFLICT', '文章已被其他操作修改');
  });
}
```

transaction 沿用第 41 章同连接实现。授权不替代 tenant 条件，两者同时存在：成员检查回答能否操作这个空间，UPDATE 确保目标资源确实属于它。把其他空间文章 ID 与合法 tenantId 拼起来，应返回 404 而不是更新其他空间。

列表、详情、删除、发布、附件与后台任务都要沿用同一边界。批量操作先定义整体失败还是部分成功；整体事务中，任一跨租户 ID 都应回滚全部，不能先修改已授权项再发现后面的非法项。任务 payload 中带 userId 也不等于仍有权限，消费时按任务语义选择重新授权或使用明确的系统能力。

## 45.4 关系约束也需要租户一致

第 40 章 posts 已有 `UNIQUE(tenant_id,id)`，后续附件关系用组合外键：

```sql
CREATE TABLE post_assets (
  tenant_id uuid NOT NULL,
  post_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, post_id, asset_id),
  FOREIGN KEY (tenant_id, post_id) REFERENCES posts(tenant_id, id),
  FOREIGN KEY (tenant_id, asset_id) REFERENCES assets(tenant_id, id)
);
```

assets 在第 48 章建立相同组合唯一键。只有 assetId 外键虽然保证文件存在，却不能阻止 A 空间文章绑定 B 空间文件。缓存 key、对象存储路径、实时订阅频道与幂等键也要带租户边界，不把隔离理解成仅数据库查询中的一个 WHERE。

“最后一个 owner 不能退出”属于跨行不变量。简单先 COUNT 再 DELETE 会被两个并发请求击穿。所有成员管理事务先锁当前 tenants 行 `FOR UPDATE`，再重查执行者角色、owner 数量与目标成员，最后更新；这样同一空间的成员管理串行化。每条成员变更路径必须采用同一锁顺序，邀请接受、转移所有权和管理员接口不能遗漏。

## 45.5 RLS 是第二道防线

Row-Level Security 可以让数据库自动附加行可见条件，但不能代替应用鉴权。课程先完成显式查询隔离，生产风险提高后再评估 RLS；开启后必须用实际应用账号验证，不用超级用户测试得出结论。

```sql
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts FORCE ROW LEVEL SECURITY;
CREATE POLICY posts_tenant_policy ON posts
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
```

在已验证成员身份的事务中设置：

```ts
await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
```

第三个参数 true 限制到当前事务，连接归还池后不会串到下一请求。不要使用持久连接级 SET 后忘记清除；并发测试必须让两租户共享连接池反复读写，确认没有串租户。缺上下文时默认看不到行，非法 UUID 应失败，不回退全量。

这个策略只检查当前 app tenant，不直接证明用户是成员；应用有权设置上下文，因此 SQL 注入或错误授权仍危险。表 owner 通常可绕过普通 RLS，FORCE 可约束 owner，但超级用户与 BYPASSRLS 仍绕过。迁移账号、应用账号和备份账号应分离。公开读需单独设计最小权限角色与策略，不能为让首页显示就增加 `USING(true)` 破坏管理数据边界。[PostgreSQL RLS](https://www.postgresql.org/docs/18/ddl-rowsecurity.html)

## 45.6 两用户两租户测试矩阵

创建 A、B 两个空间，Alice 在 A 是 owner、在 B 无成员；Bob 在 A 是 reader、在 B 是 owner。保留每个空间一篇草稿和一篇已发布文章，不能只用一位管理员验证。

正常路径是 Alice 管理 A、Bob 阅读 A 草稿、匿名阅读发布内容。拒绝路径包括 Bob 编辑 A，Alice 以 B 的 tenantId 创建文章，Alice 以 A tenantId 更新 B 的 postId，body 偷带 role=owner，批量数组混入 B 资源。匿名不能读任何草稿，返回体不能含其他空间数据。

再启动并发事务：编辑已取得成员锁时撤销成员应等待；撤销提交后新编辑应失败。两位 owner 同时离开只能有一位成功，另一位必须保留；事务异常后连接重新借出不能继承旧租户上下文。RLS 用不带超级权限的应用连接实测，mock SQL 字符串只能证明拼装，不证明数据库策略实际生效。

排错优先看身份来源、路由参数、成员行、查询 tenant 条件、事务连接与账号权限。偶发跨空间结果通常要检查缓存 key 和池级上下文，不仅看 SQL。403 时不要把 reader 升级为 owner 来“修复功能”，先查动作矩阵与测试账号。

练习增加仅作者可删除的动作、成员邀请和 owner 转移；记录每个入口的拒绝情况与资源存在性策略。完成标准是横向越权、角色提升、跨租户关联与并发撤销都被验证，而不是“页面没有显示编辑按钮”。

## 45.7 数据导出与系统身份

导出是常被遗漏的读取入口。创建任务时验证成员，下载结果时再次验证；结果对象存储 key 带租户与随机任务标识，并使用短期下载能力。撤销成员后，旧下载地址是否继续有效需要明确期限，不能假设删除前端按钮就能收回已发出的签名链接。导出字段显式白名单，避免新增邮箱、密码摘要或内部审计字段后自动被包含。

后台任务使用系统身份时不应伪装成某个全局 owner。明确它只具备“处理已记录发布事件”或“扫描指定资产”的能力，从数据库核对事件与资源关系；任务输入中的 tenantId 不构成可信授权。记录发起人、动作和资源标识有助于追溯，但审计正文不保存私有文章内容或完整凭据。

测试还应覆盖角色降级、成员删除、资源删除与任务完成之间的竞争。允许已提交事实继续产生通知，与允许被撤销的用户继续导出私有草稿，是两种不同政策；先写清业务语义，再决定消费时是否重新授权，不能为方便把全部任务统一设为“系统绕过权限”。

## 官方参考

- [OWASP 授权指南](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)。
- [OWASP API Security：对象级授权](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/)。
- [PostgreSQL：行级安全](https://www.postgresql.org/docs/18/ddl-rowsecurity.html)、[显式锁](https://www.postgresql.org/docs/18/explicit-locking.html)。

下一章：[Redis 缓存与限流](./46-redis-cache-rate-limits)。
