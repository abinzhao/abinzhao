---
title: "第 50 章：集成、合约与浏览器测试"
description: "用真实 PostgreSQL 验证事务和权限，以 OpenAPI 控制契约变化，并通过真实 HTTP 与浏览器覆盖代理、Cookie 和交互。"
date: '2026-10-23'
category: 工程质量
tags: [集成测试, OpenAPI, PostgreSQL, Playwright]
series:
  order: 51
---

# 第 50 章：集成、合约与浏览器测试

测试的价值不是让终端显示绿色，而是对特定风险建立可重复证据。密码函数测试不能证明 Cookie 会被浏览器发送；页面提交成功不能证明两次并发发布只产生一次效果；伪造数据库返回值不能证明 PostgreSQL 的唯一约束、事务回滚或锁行为。本章把这些证明拆开，避免一个“测试通过”承担所有结论。

## 50.1 按边界组织验证

纯逻辑测试验证输入校验、令牌比较、分页游标和重试计算，执行快但不知道外部系统如何工作。集成测试连接真实数据库，运行真实 HTTP handler，验证 SQL、状态变化和错误映射。合约测试验证输入输出是否满足公开 schema，以及升级是否破坏消费者。浏览器测试验证真实 DOM、Cookie、代理、焦点、网络错误和用户操作，成本更高，优先覆盖主路径。

Fastify inject 不启动 TCP 监听，但会走路由、hooks、schema 和序列化，因此适合应用层集成测试；它不经过 Vite 代理、TLS、负载均衡和浏览器 Cookie 策略。用真实 PostgreSQL 配合 inject 是真实数据库验证，不是完整公网链路验证。[Fastify 测试指南](https://fastify.dev/docs/latest/Guides/Testing/)

先列不变量，再选工具：未发布正文不能公开；用户 B 不能读写 A 的空间；旧 revision 不能覆盖新内容；发布重试不能生成第二次业务效果；退出后旧 Cookie 无效。每个不变量同时检查响应和数据库最终状态，否则接口返回 409 但已经修改数据的错误可能漏掉。若选择 Vitest，核验日稳定版为 `vitest@5.0.5`，要求 Node `^22.12.0 || ^24.0.0 || >=26.0.0`；在独立项目固定安装。下面使用已有 tsx 与 Node 内置 runner，无须额外安装 Vitest，也不把未采用的工具写成已运行。

## 50.2 建立不会误伤数据的测试数据库

使用独立数据库 `blog_learning_test`，应用运行时账号与测试迁移账号的权限应分开。测试命令必须明确允许写入，并查询当前库名，不依赖“连接地址看起来像本地”判断安全。下面的门禁只用于自己建立的学习库，不要为了通过测试重命名真实数据库。

```bash
export DATABASE_URL='postgresql://blog_test:CHANGE_ME@127.0.0.1:5432/blog_learning_test'
export ALLOW_LEARNING_DB_TESTS=1
npm run migrate
node --import tsx --test learning-tests/posts.test.ts
```

命令中的凭据是占位值，真实值通过秘密管理或私有环境注入，不提交到代码。测试开始前应核对 PostgreSQL 主版本、扩展、迁移版本和应用配置；本机低版本通过不自动证明目标生产主版本通过。CI 服务库每个任务独立，不能共享一个库后靠随机测试顺序碰运气。

不要把所有测试包在一个事务里再统一 rollback，而生产代码使用另外的池连接：外层事务不能控制其他连接，未提交 fixture 也可能不可见。可以为任务创建独立数据库，或者记录本次创建的 ID 并按外键依赖清理。本章使用后者；清理失败需要暴露，不允许吞掉异常制造成功。

## 50.3 一条真实并发与权限测试

下面测试针对第 54 章配套项目的 `api/app.ts`，放在读者独立项目的 `learning-tests/`。它使用已有 `tsx` 与 Node 内置测试模块，不要求改动教程站点的测试体系。先运行该测试确认实现前的失败，再加入或修复对应事务与权限代码。

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { buildApp } from '../api/app.js';

test('private drafts and concurrent publication', async () => {
  assert.equal(process.env.ALLOW_LEARNING_DB_TESTS, '1');
  assert.ok(process.env.DATABASE_URL);
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 3000,
    statement_timeout: 5000,
  });
  const origin = 'http://127.0.0.1:5173';
  const users: string[] = [];
  const tenants: string[] = [];
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  try {
    const database = await pool.query('SELECT current_database() AS name');
    assert.equal(database.rows[0].name, 'blog_learning_test');
    app = await buildApp(pool, { origin, secureCookie: false });
    await app.ready();
    async function signup() {
      const slug = `test-${randomUUID()}`;
      const response = await app!.inject({
        method: 'POST', url: '/api/register', headers: { origin },
        payload: {
          email: `${slug}@example.org`, password: 'Learning-test-password-42!',
          tenantSlug: slug, tenantName: 'Integration test',
        },
      });
      assert.equal(response.statusCode, 201, response.body);
      const data = response.json();
      users.push(data.user.id);
      tenants.push(data.tenants[0].id);
      return {
        slug, tenant: data.tenants[0].id,
        headers: {
          origin,
          cookie: String(response.headers['set-cookie']).split(';')[0]!,
          'x-csrf-token': data.csrfToken,
        },
      };
    }
    const a = await signup();
    const b = await signup();
    const list = `/api/tenants/${a.tenant}/posts`;
    const draft = await app.inject({
      method: 'POST', url: list, headers: a.headers,
      payload: { slug: 'first', title: 'First', summary: '', body: 'Private body' },
    });
    assert.equal(draft.statusCode, 201, draft.body);
    const post = draft.json();
    assert.equal((await app.inject(`/api/public/${a.slug}/posts/first`)).statusCode, 404);
    assert.equal((await app.inject({ url: list, headers: b.headers })).statusCode, 404);
    const forbidden = await app.inject({
      method: 'POST', url: `${list}/${post.id}/publish`,
      headers: { origin, cookie: a.headers.cookie },
      payload: { revision: post.revision },
    });
    assert.equal(forbidden.statusCode, 403);
    const publish = () => app!.inject({
      method: 'POST', url: `${list}/${post.id}/publish`,
      headers: a.headers, payload: { revision: post.revision },
    });
    const results = await Promise.all([publish(), publish()]);
    assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 409]);
    const stored = await pool.query(
      'SELECT status,revision,published_at FROM posts WHERE id=$1 AND tenant_id=$2',
      [post.id, a.tenant],
    );
    assert.equal(stored.rows[0].status, 'published');
    assert.equal(stored.rows[0].revision, post.revision + 1);
    assert.ok(stored.rows[0].published_at);
    const publicPost = await app.inject(`/api/public/${a.slug}/posts/first`);
    assert.equal(publicPost.statusCode, 200);
    assert.equal(publicPost.json().body, 'Private body');
    assert.equal('author_id' in publicPost.json(), false);
  } finally {
    await app?.close();
    try {
      for (const id of tenants) {
        await pool.query('DELETE FROM posts WHERE tenant_id=$1', [id]);
        await pool.query('DELETE FROM memberships WHERE tenant_id=$1', [id]);
        await pool.query('DELETE FROM tenants WHERE id=$1', [id]);
      }
      for (const id of users) {
        await pool.query('DELETE FROM sessions WHERE user_id=$1', [id]);
        await pool.query('DELETE FROM users WHERE id=$1', [id]);
      }
    } finally {
      await pool.end();
    }
  }
});
```

这里的随机邮箱和空间是测试 fixture，不是虚构业务数据，更不是线上验证结果。测试清理只处理本次记录，不 truncate 共享表。并发测试每次可能由不同请求获胜，断言状态集合和最终 revision，不固定“第一个一定成功”。时间断言关注期限范围，不比较两个数据库时间戳必须完全相等。

配套项目已有 `scripts/api-check.ts`，还覆盖带 query 的注销 CSRF 与登录限流；本章额外的并发测试是学习任务，不在已有实际通过记录中。新增断言前先确认产品契约：最小项目重复发布返回 409，Outbox 扩展的幂等接口可以返回之前结果，不能把两种契约混着断言。

## 50.4 合约测试不仅是快照

第 38–39 章由完整 JSON Schema 注册路由并生成 OpenAPI。提交受审查的契约文件，CI 从应用重新生成再比较，防止代码已经改变而文档仍旧。配套最小项目尚未集成 swagger 和完整响应 schema，不能把其中的类型检查称为 OpenAPI 合约测试通过。

兼容检查要区分消费者视角：请求新增必填字段、响应删除字段、状态码改变、枚举缩小、日期格式改变都可能破坏使用者。响应新增字段通常兼容，但严格拒绝未知字段的消费者可能例外。JSON 文件完全相同只是机械稳定，不说明语义正确；快照变化也不总是破坏，需要按具体规则审查。

为公开文章定义最小输出字段，schema 的 `additionalProperties: false` 与 Fastify 序列化可以减少意外泄漏，但仍需断言正文接口没有密码摘要、邮箱、内部权限或私有存储 key。错误对象应稳定包含业务 code 与 requestId，而不是把 PostgreSQL 错误、SQL 或 stack 原样发给浏览器。

第三方 OAuth、对象存储等通过各自官方测试环境或可验证的协议 fixture 测试边界。Mock 可以模拟超时与重复消息，不能证明真实身份提供方签名验证、S3 条件请求或 Redis 脚本执行。报告必须分别标明协议模拟与真实服务运行。

## 50.5 真正经过网络与浏览器

使用独立服务启动进程，等待 `/health/ready` 后发真实 HTTP 请求，测试启动配置、端口绑定、代理头和停机流程。读取服务输出用于诊断，不把固定 sleep 当 readiness。健康接口可用之后再启动 Playwright；服务启动失败应立即结束测试，而不是产生几十个无法连接的后续错误。

浏览器测试采用当前稳定 `@playwright/test@1.64.1`，在读者项目安装固定版本与匹配浏览器。定位优先使用可访问名称和 label，不以 DOM 层级或 CSS 随意变化的类作为主契约：

```ts
import { test, expect } from '@playwright/test';

test('home page is visible and contained', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173');
  await expect(page.getByRole('heading', { name: '全栈博客学习项目' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '匿名公开阅读' })).toBeVisible();
  const width = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(width.document).toBeLessThanOrEqual(width.viewport);
});
```

这条仅验证页面可见和文档宽度，是页面与布局烟雾测试，不证明注册、保存、退出或草稿隐私。草稿隐私由前述真实数据库 API 测试覆盖；完整浏览器业务流程另需实际操作与断言。标题已按配套源码核对，其他控件也应使用真实 label，不能虚构不存在的“保存成功”提示。

至少在 390px 与桌面视口验证鼠标、键盘、刷新恢复、错误密码、CSRF 拒绝、保存冲突和断网时保留输入。若工具只能通过 `requestSubmit()` 触发提交，记录的是原生 DOM 与网络路径，不能称鼠标点击或无障碍键盘路径已验。

## 50.6 排错、证据与完成标准

SQL 测试间歇失败时先查共享库、异步未等待、连接未释放与固定时间假设；不要增加大量 sleep 或重复重跑直到变绿。Cookie 在 inject 通过而浏览器失败，先查域名、Secure、SameSite、Path、Origin 和代理。并发断言失败时读取最终记录、事务日志与错误 code，不先把期望改成“任意状态都可以”。

保存运行命令、提交或源码版本、Node/数据库版本、迁移校验和、失败输出和测试报告。截图是特定时刻视觉证据，不是所有交互的证明。合约 fixture 中的身份与邮箱必须是明显学习值，日志和截图不能带真实 Cookie 或数据库凭据。

练习补齐旧 revision 更新、会话过期、并发重复邮箱、数据库断连回滚和两租户资源猜测；给每一项标明响应、数据库不变量和清理策略。完成标准是测试在空库可重复运行、错误路径能稳定失败、失败不会污染下一次运行，且报告明确区分静态检查、真实数据库、真实 HTTP、浏览器与尚未验证的外部系统。

## 官方参考

- [Node.js：Test runner](https://nodejs.org/api/test.html)。
- [Fastify：Testing](https://fastify.dev/docs/latest/Guides/Testing/)。
- [node-postgres：事务](https://node-postgres.com/features/transactions)。
- [OpenAPI：规范](https://spec.openapis.org/oas/latest.html)。
- [Playwright：最佳实践](https://playwright.dev/docs/best-practices)与[隔离](https://playwright.dev/docs/browser-contexts)。
- [Vitest：官方入门](https://vitest.dev/guide/)与[版本元数据](https://registry.npmjs.org/vitest)。

下一章：[Docker 与 Linux 运维](./51-docker-linux-operations)。
