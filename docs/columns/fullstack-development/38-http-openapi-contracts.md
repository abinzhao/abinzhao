---
title: "第 38 章：HTTP 语义与 OpenAPI 契约"
description: "设计博客资源、状态码、输入输出 schema、条件请求与错误契约，生成能用于前后端协作的 OpenAPI。"
date: '2026-10-23'
category: 后端开发
tags: [HTTP, OpenAPI, JSON Schema, API 设计]
series:
  order: 39
---

# 第 38 章：HTTP 语义与 OpenAPI 契约

接口不只是一个 URL。它是客户端与服务端之间可验证的约定，包含身份、资源、输入、响应、错误和重试行为。前端能通过 TypeScript 编译，并不表示请求会被服务器接受；服务器返回 200，也不表示响应字段符合 UI 预期。

## 38.1 把业务操作映射为资源

课程博客有公开阅读和管理编辑两种边界。公开列表永远不包含草稿；管理列表必须验证会话与租户成员关系。用户不能通过 body 里的 `authorId` 或 `tenantId` 自己宣告身份。

| 方法与路径 | 语义 | 正常结果 |
|---|---|---|
| `GET /api/public/:tenantSlug/posts` | 读取已发布摘要 | 200，分页对象 |
| `GET /api/public/:tenantSlug/posts/:slug` | 读取公开正文 | 200 或 404 |
| `POST /api/tenants/:tenantId/posts` | 创建当前租户草稿 | 201，Location 与文章 |
| `PATCH /api/tenants/:tenantId/posts/:id` | 修改允许字段 | 200，新的 revision |
| `POST /api/tenants/:tenantId/posts/:id/publish` | 明确的发布状态转换 | 200，发布结果 |
| `DELETE /api/tenants/:tenantId/posts/:id` | 删除符合权限的文章 | 204，无响应体 |
| `GET /api/session` | 查询当前会话 | 200 或 401 |

不要用 `GET /delete-post?id=...` 修改数据。GET 的安全语义让预取器、爬虫和缓存可以读取它；在 GET 中删除文章会把正常读取变成危险操作。幂等指重复执行产生相同业务效果，不意味着响应必须完全相同：重复 DELETE 可以先 204、后 404。

POST 默认不具备幂等保证。浏览器因为网络中断重试创建时，可能已经在数据库插入成功；第 47 章将通过幂等键解决“调用方不知道结果”的窗口。单纯禁用按钮无法覆盖刷新、代理重试或多个标签页。

## 38.2 区分路径、查询、Header 与 Body

路径标识资源，查询表达筛选和分页，Header 表达协商、身份或条件，body 传递结构化输入。不要把密码、令牌和会话写进查询字符串；它们容易进入浏览器历史、代理日志和 Referer。

创建草稿的输入约定：

```json
{
  "slug": "http-contracts",
  "title": "理解 HTTP 契约",
  "summary": "为公开阅读与编辑建立明确的边界。",
  "body": "## 资源\n\n接口围绕资源和状态转换设计。"
}
```

服务器生成 `id`、`authorId`、`tenantId`、`status`、时间戳和 revision。输入与输出不是同一模型，不能直接把数据库行全部返回，更不能 `INSERT` 客户端提供的任意对象。前端 v2 的 `content` 在持久模型里统一叫 `body`，接入时显式映射，不默默改变含义。

Fastify 5 的 JSON Schema 需要完整对象：

```ts
export const createPostBody = {
  type: 'object',
  additionalProperties: false,
  required: ['slug', 'title', 'summary', 'body'],
  properties: {
    slug: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 80 },
    title: { type: 'string', minLength: 1, maxLength: 120 },
    summary: { type: 'string', maxLength: 240 },
    body: { type: 'string', minLength: 1, maxLength: 100000 },
  },
} as const;
```

长度约束是课程的产品决策，不是 HTTP 标准。schema 保证结构，业务层还要拒绝全空白标题和正文。服务器请求体上限是总字节限制，字段 `maxLength` 是字符限制，两者不能互相替代。Markdown 存文本；展示时仍按第 34 章的渲染链净化，数据入库不等于 HTML 安全。

`additionalProperties: false` 的实际行为还取决于校验器设置。Fastify 默认可能移除额外字段；本课程在第 39 章配置 `removeAdditional: false`，使客户端非法提交 `authorId` 时明确返回 400，而不是让它以为字段生效。

## 38.3 错误也是契约

约定统一错误对象：

```json
{
  "code": "REVISION_CONFLICT",
  "message": "文章已被其他编辑更新，请重新加载。",
  "requestId": "服务端生成的请求标识"
}
```

这是课程自定义 JSON 契约，不冒充 RFC 9457 的 `application/problem+json`。采用 Problem Details 时应实际实现 `type/title/status/detail/instance` 的标准语义，不能只改 Content-Type。

| 状态 | 应用边界 | 客户端行为 |
|---|---|---|
| 400 | JSON、参数或 schema 不合法 | 修正输入，不自动原样重试 |
| 401 | 缺少或失效的身份 | 引导重新登录 |
| 403 | 有身份但无权限 | 不展示成网络故障 |
| 404 | 资源不存在或按策略隐藏 | 显示不存在状态 |
| 409 | slug 重复、revision 冲突 | 刷新或解决冲突 |
| 413 / 415 | 内容过大 / 类型不支持 | 调整上传内容 |
| 429 | 达到速率上限 | 尊重 Retry-After |
| 500 / 503 | 未预期错误 / 依赖不可用 | 有限退避，不泄漏内部细节 |

已登录但不是某租户成员时，可以返回统一 404 隐藏存在性；策略必须对读取、修改、批量操作一致，不能在错误文案里泄漏租户名称。日志保留请求标识和稳定错误码，不返回 SQL、数据库 URL、堆栈或 OAuth 原始响应。

## 38.4 明确分页与日期表示

列表不要裸返回无限数组，使用固定对象：

```json
{
  "items": [
    {
      "id": "00000000-0000-4000-8000-000000000001",
      "slug": "http-contracts",
      "title": "理解 HTTP 契约",
      "summary": "为阅读与编辑建立边界。",
      "publishedAt": "2026-10-23T08:00:00.000000Z"
    }
  ],
  "nextCursor": null
}
```

这是响应形状示例，不是已运行的数据。`nextCursor: null` 明确表示没有下一页；空列表仍返回 200 与 `items: []`，不把“没有文章”变成服务器错误。公开摘要不返回正文、内部审核字段或作者邮箱。

日期在 API 中使用带时区的字符串，不能传本地格式的“2026/10/23 上午”。PostgreSQL 时间戳精度高于 JavaScript Date，第 42 章会在 SQL 输出中保留微秒，使分页边界不丢失精度。分页顺序、默认 limit、最大 limit 和过滤条件属于契约，不是客户端自行猜测的细节。

## 38.5 从路由生成 OpenAPI

在第 37 章的独立练习目录安装：

```bash
npm install --save-exact fastify@5.12.7 @fastify/swagger@9.9.2 @fastify/swagger-ui@6.1.2
```

Swagger 是具体工具，OpenAPI 是规范。这里选用插件支持的 OpenAPI **3.0.3**，不是声称它是规范最新版。Fastify 校验采用 JSON Schema Draft 7 子集；OpenAPI 3.0 Schema Object 不等于任意 JSON Schema，涉及 nullable、联合和引用时要检查生成结果。

```ts
import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

const app = Fastify();
await app.register(swagger, {
  openapi: {
    openapi: '3.0.3',
    info: { title: 'Blog API', version: '1.0.0' },
    components: {
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey', in: 'cookie', name: 'blog_session',
        },
      },
    },
  },
});
await app.register(swaggerUi, { routePrefix: '/docs' });

app.get('/health/live', {
  schema: {
    operationId: 'getLiveness',
    response: {
      200: {
        type: 'object',
        additionalProperties: false,
        required: ['status'],
        properties: { status: { type: 'string', enum: ['ok'] } },
      },
    },
  },
}, async () => ({ status: 'ok' }));

await app.ready();
console.log(JSON.stringify(app.swagger(), null, 2));
await app.close();
```

保存为 `src/export-openapi.ts` 后执行 `npx tsx src/export-openapi.ts`。动态生成插件要在路由注册之前安装，否则可能漏掉路由。`security` 是文档描述，不会自动校验 Cookie；真正的会话与权限检查在第 43–45 章实现。

文档 UI 只用于学习或受保护管理入口。生产中不要默认公开内部路由、管理说明和 Try It Out 权限。自动生成类型可以减少字段复制，但生成类型同样不验证网络数据；客户端仍需 schema 或合约测试。

## 38.6 条件请求、缓存与版本演进

公开读取可以根据表示版本返回 ETag，客户端发送 `If-None-Match` 后可能得到 304；304 没有正文，前端必须使用已缓存表示。登录和管理接口通常返回 `Cache-Control: no-store`，不能让共享 CDN 缓存不同用户的草稿。

编辑并发可选强 ETag + `If-Match`，前置条件失败返回 412；课程最小实现使用 body 中的 `revision`，冲突返回 409。两种方式都需要数据库的原子条件更新，不能先查版本再无条件覆盖。

增加可选字段通常比修改已有字段含义风险小，但严格客户端也可能拒绝未知字段，不能简单声称“增加字段一定兼容”。删除字段、改变类型、枚举新增、错误码变化都需要协作评估。OpenAPI `info.version` 是契约版本，不是数据库迁移版本或应用提交哈希。

## 38.7 验证、排错与练习

正常验证应核对方法、状态、Content-Type、Location、分页字段及文档中的 operationId。异常验证包含错误 JSON、额外 `authorId`、过长标题、未知文章、无 Cookie、无权限和 revision 冲突，不能只点通 Swagger 的成功按钮。

在本机学习服务执行：

```bash
curl -i http://127.0.0.1:3000/health/live
curl -i -H 'Content-Type: text/plain' --data 'invalid' \
  http://127.0.0.1:3000/api/tenants/invalid/posts
```

第二条只有在后续路由实现后才具备验证意义。不要在路由不存在时，把得到的 404 当成内容类型校验通过。出现文档为空先查插件注册顺序；返回多余字段先查 response schema；浏览器失败但 curl 成功则核对 Origin、Cookie 和 CORS，而不是直接关闭安全检查。

练习为创建、修改和公开列表补齐 operationId、输入 schema、响应 schema 与错误矩阵。让前端同学仅根据契约实现加载、空结果、401 和 409 四种状态，再对照真实 API。完成标准是每个状态都有可重复请求和预期行为，且服务不会接受由客户端指定的作者身份。

## 官方参考

- [RFC 9110：HTTP 语义](https://www.rfc-editor.org/rfc/rfc9110.html)。
- [RFC 9457：Problem Details](https://www.rfc-editor.org/rfc/rfc9457.html)。
- [OpenAPI 3.0.3](https://spec.openapis.org/oas/v3.0.3.html)。
- [Fastify：校验与序列化](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)。
- [官方 Swagger 插件](https://github.com/fastify/fastify-swagger)：版本兼容、动态模式与注册顺序。

下一章：[Fastify 架构与生命周期](./39-fastify-architecture)。
