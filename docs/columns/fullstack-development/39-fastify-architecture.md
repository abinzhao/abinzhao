---
title: "第 39 章：Fastify 服务架构与生命周期"
description: "使用 Fastify 5 的插件封装、完整 schema、请求生命周期、错误边界与连接池关闭，建立可测试的 API 工厂。"
date: '2026-10-23'
category: 后端开发
tags: [Fastify, 插件, 生命周期, 后端架构]
series:
  order: 40
---

# 第 39 章：Fastify 服务架构与生命周期

一个路由文件可以同时校验输入、查数据库、写日志和返回 JSON，但规模增大后，身份、连接池与错误策略会散落在每个处理器。本章建立一个小而清晰的服务组织方式：应用工厂不监听端口，启动文件管理进程资源，业务路由拥有自己的封装范围。

## 39.1 版本与目录

课程选用官方稳定 Fastify **5.12.7**。registry 中的 6.0.0-alpha.5 是预览，不是本章基线。v5 与 v4 的重要区别之一是 body、params、querystring 需要完整 JSON Schema，不沿用只有字段的简写。各插件必须检查其 Fastify 主版本兼容矩阵，不能把“插件安装成功”当成运行兼容。

在独立的 `blog-api` 中安装：

```bash
npm install --save-exact fastify@5.12.7 pg@8.23.1
npm install -D --save-exact @types/pg@8.23.1
```

延续第 37 章的 ESM 与 NodeNext 配置：

```text
src/
├── app.ts
├── server.ts
├── config.ts
├── errors.ts
├── db.ts
└── routes/
    └── health.ts
```

现在不引入依赖注入框架、装饰器或十层仓库接口。连接池通过函数参数传递，已有类型足以表达依赖。毕业项目会增加 `auth.ts`、`posts.ts` 和共享 schema，但仍保持一个 API 服务，不提前拆微服务。

## 39.2 应用工厂与错误契约

错误类只保存可公开的稳定字段：

```ts
// src/errors.ts
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
```

数据库连接池不应每个请求创建一份：

```ts
// src/db.ts
import { Pool } from 'pg';

export function createPool(connectionString: string) {
  return new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30000,
    statement_timeout: 5000,
  });
}
```

这些数量和超时是学习初始值，不是通用性能建议。十个实例各十条连接就是一百条，再加迁移、worker、运维工具后要与数据库上限共同计算。连接池还有空闲客户端错误事件，需要记录最小错误码与故障状态，不能因为是后台事件就无人处理。

```ts
// src/app.ts
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { AppError } from './errors.js';
import { healthRoutes } from './routes/health.js';

export function buildApp(pool: Pool, logger = true) {
  const app = Fastify({
    logger: logger ? {
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    } : false,
    bodyLimit: 1024 * 1024,
    requestTimeout: 15000,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });

  app.setErrorHandler((error, request, reply) => {
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = '服务暂时不可用';

    if (error instanceof AppError) {
      status = error.statusCode;
      code = error.code;
      message = error.message;
    } else if (
      error instanceof Error && 'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400 && error.statusCode < 500
    ) {
      status = error.statusCode;
      code = 'INVALID_REQUEST';
      message = '请求格式或参数不符合契约';
    } else {
      request.log.error({ code, requestId: request.id }, 'unexpected request failure');
    }
    return reply.code(status).send({ code, message, requestId: request.id });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      code: 'NOT_FOUND', message: '接口不存在', requestId: request.id,
    }),
  );
  app.register(healthRoutes, { pool });
  app.addHook('onClose', async () => { await pool.end(); });
  return app;
}
```

请求标识由服务端生成，不直接相信客户端发来的 `X-Request-Id`。否则超长字符串、重复值或敏感数据可能进入日志。日志默认不主动记录 body，也不序列化数据库 URL；第 53 章会建立更完整的遥测脱敏策略。

`removeAdditional: false` 配合 `additionalProperties: false` 才是明确拒绝额外字段。这里关闭隐式类型转换，查询字符串 limit 后续先验证十进制文本再转为 number。若选择默认 coercion，则必须对空字符串、数组参数、布尔值和联合 schema 做独立测试。

## 39.3 插件封装是一棵作用域树

```ts
// src/routes/health.ts
import type { FastifyPluginAsync } from 'fastify';
import type { Pool } from 'pg';

export const healthRoutes: FastifyPluginAsync<{ pool: Pool }> =
  async (app, { pool }) => {
    app.get('/health/live', async () => ({ status: 'ok' }));
    app.get('/health/ready', async (_request, reply) => {
      try {
        await pool.query('SELECT 1');
        return { status: 'ready' };
      } catch {
        return reply.code(503).send({ status: 'unavailable' });
      }
    });
  };
```

`register()` 默认创建子上下文。子上下文能看到父级装饰器和 hooks，但父级与兄弟级看不到子级定义。适合把公开路由与管理路由分开：管理范围注册会话检查，公开范围不继承它。不要为了“全局好调用”把所有业务 hooks 都打破封装，否则公开读接口可能意外要求登录。

官方 `fastify-plugin` 可以显式共享基础设施，但不是每个插件必须套一层。普通函数参数已经能传递 pool，就不需要为这一处增加新的框架依赖。异步插件返回 Promise；回调插件调用 `done()`，同一个插件不要同时使用两种完成方式。

Liveness 回答“进程是否活着”，Readiness 回答“是否具备接流条件”。数据库失联时 ready 503、live 200 可以是合理状态。若每次短暂数据库波动都让 live 失败，容器可能不断重启，反而放大故障。`SELECT 1` 只证明连通，不证明迁移版本、写权限或所有业务操作正常，不能夸大健康探针结论。

## 39.4 请求生命周期与职责

一个简化请求路径：

```text
onRequest → preParsing → body 解析 → preValidation
→ schema 校验 → preHandler → handler
→ preSerialization → onSend → onResponse
```

`onRequest` 时 body 尚未解析，不能在那里读取用户名完成登录。Session Cookie 可较早读取；租户参数和业务输入经过校验后，再在 `preHandler` 或业务服务中完成数据库权限检查。校验器只检查结构，不在 schema 里查询数据库，避免复杂异步校验形成拒绝服务入口。

| 阶段 | 适合的工作 | 不适合的工作 |
|---|---|---|
| schema | 参数形状、长度、允许字段 | 查成员关系、发送邮件 |
| preHandler | 会话、资源权限、必要业务前置条件 | 无界外部请求 |
| handler | 事务、状态转换、返回领域结果 | 拼接 SQL、复制全局安全逻辑 |
| onResponse | 有界指标和完成日志 | 再修改已经发送的响应 |
| onClose | 释放连接池、订阅、worker | 新发业务任务 |

请求级身份是每次请求独立创建的值，不要给 `decorateRequest` 放可变共享对象，再让不同用户修改同一个对象。异步 hooks 已返回结果时不要再调用回调。发送响应后继续执行写操作也不是可靠后台任务：客户端已经得到成功，但进程可能立即重启；可靠异步交付在第 47 章使用 Outbox。

## 39.5 启动与关闭进程

替换第 37 章的原生 HTTP 启动文件：

```ts
// src/server.ts
import { buildApp } from './app.js';
import { createPool } from './db.js';
import { config } from './config.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const pool = createPool(databaseUrl);
const app = buildApp(pool);
pool.on('error', () => app.log.error({ code: 'DB_POOL_ERROR' }, 'database pool failure'));

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 10000);
  try {
    await app.close();
  } finally {
    clearTimeout(deadline);
  }
}
process.once('SIGINT', () => { void stop().catch(() => { process.exitCode = 1; }); });
process.once('SIGTERM', () => { void stop().catch(() => { process.exitCode = 1; }); });

try {
  await app.listen({ port: config.port, host: config.host });
} catch {
  await app.close();
  process.exitCode = 1;
}
```

关闭超时才强制结束，正常路径等待 `app.close()` 与 pool 释放。长连接 SSE/WebSocket 还需要主动终止，否则它们可能永不结束；第 49 章单独处理。启动失败必须非零退出，不能捕获后打印“服务已启动”。

## 39.6 注入测试与真实网络

应用工厂可以在不占端口时验证路由：

```ts
const app = buildApp(pool, false);
try {
  const response = await app.inject({
    method: 'GET', url: '/health/live',
  });
  if (response.statusCode !== 200 || response.json().status !== 'ok') {
    throw new Error('liveness contract failed');
  }
} finally {
  await app.close();
}
```

`pool` 必须来自当前学习数据库配置；这里的 live 不执行 SQL，所以成功只证明路由与响应，不证明数据库。`inject()` 不覆盖真实 TCP、TLS、反向代理、Cookie 浏览器策略和 WebSocket 握手。第 50 章会区分协议测试、真实数据库集成与浏览器验收，不用其中一层冒充全部。

## 39.7 资源预算与故障传播

每次请求都应有有限预算：连接取得不能无限等待，SQL 不能无限运行，外部请求必须超时，请求体和响应集合必须有上限。Fastify 的请求超时不会自动停止 PostgreSQL 中已经执行的查询；客户端关闭连接也不代表事务撤销，因此业务结果仍需查询或幂等恢复。

Readiness 失败时记录依赖状态，停止接收新流量；已开始的请求按自己的截止时间完成或失败。数据库暂时不可用不应该触发一次无界重连风暴，也不能为“页面还能显示”悄悄改成进程内存储。恢复后的持久化与权限语义必须保持不变。

路由响应 schema 还承担输出白名单：即使内部函数返回密码哈希，也不能把它列入公开响应。输出序列化不是输入验证的替代品，业务函数仍应只返回必要字段。修改一份共享 schema 会影响所有引用它的路由，需要同时检查文档、实际输出和客户端收窄逻辑。

## 39.8 验证、排错与完成标准

运行类型检查和构建后启动服务，检查 live、ready、未知路径。临时停止学习数据库，ready 应为 503，而错误中没有连接串。向有 schema 的接口发送额外字段、错误类型和超大 body，分别确认拒绝，不把“路由不存在”的 404 算作校验通过。

插件里“看不到 pool”优先检查封装范围和注册顺序；同一个请求响应两次检查 async 与 done 混用、send 后继续返回；Ctrl+C 卡住检查长连接、计时器和连接池。数据库错误被包装成 400 则说明把依赖故障误当用户输入错误，需要恢复正确错误分类。

练习增加一个独立管理插件，暂时明确拒绝未实现的认证，不放一个永远返回 true 的假权限函数。为管理输入补完整 schema 和 response schema，再在第 43 章接会话。完成标准是应用工厂可注入、请求错误稳定、依赖失联不泄密、插件作用域清楚、进程能关闭与重启。

## 官方参考

- [Fastify v5 迁移](https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/)与[LTS 政策](https://fastify.dev/docs/latest/Reference/LTS/)。
- [Fastify 封装](https://fastify.dev/docs/latest/Reference/Encapsulation/)与[Hooks](https://fastify.dev/docs/latest/Reference/Hooks/)。
- [Fastify 校验和序列化](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)。
- [Fastify 测试指南](https://fastify.dev/docs/latest/Guides/Testing/)。
- [node-postgres 连接池](https://node-postgres.com/features/pooling)。

下一章：[PostgreSQL、SQL 与数据建模](./40-postgresql-sql-modeling)。
