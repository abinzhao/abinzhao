---
title: "第 54 章：博客 v3 全栈毕业项目"
description: "运行 React、Fastify 与真实 PostgreSQL 的最小博客，验证注册、草稿、并发版本、发布与公开阅读，再按证据完成生产扩展。"
date: '2026-10-23'
category: 全栈实战
tags: [React, Fastify, PostgreSQL, 毕业项目]
series:
  order: 55
---

# 第 54 章：博客 v3 全栈毕业项目

前两版博客分别验证网页基础与客户端工程，第三版要把可信写入、持久数据库、身份和资源权限连接起来。浏览器刷新后文章还在、匿名读者不能看到草稿、两个窗口不会互相覆盖，这些是可以观察的结果，不是“全栈”标签自动带来的能力。本章先运行真实最小核心，再用前面章节的安全和运维标准扩展，严格区分已有代码与待完成的毕业要求。

## 54.1 交付边界与统一源码

配套源码位于本教程仓库的 `examples/fullstack-blog/`。它有独立 package.json 与包管理器生成的 package-lock.json，不依赖教程站点的运行时，也不应在站点根目录安装后端依赖。已有代码包括 React/Vite 页面、Fastify API、PostgreSQL 迁移、密码原语检查与真实数据库业务验证。

```text
examples/fullstack-blog/
  api/
    app.ts                  路由、schema、认证与资源授权
    security.ts             异步 scrypt、Session 摘要与 CSRF
    db.ts                   池、同连接事务与损坏连接释放
    migrate.ts              迁移锁、版本、校验和与事务
    server.ts               配置、监听与有截止时间的停机
  migrations/
    001_initial.sql         用户、空间、成员、文章、Session
  web/
    api.ts                  同源请求、JSON 与错误包装
    main.tsx                注册、登录、编辑、发布和匿名阅读
    style.css               响应式页面
  scripts/
    security-check.ts       无数据库的真实密码检查
    api-check.ts            使用真实数据库的应用检查
  vite.config.ts
  tsconfig.api.json
  tsconfig.web.json
  package.json
  package-lock.json
  README.md
```

第 37–53 章为讲解机制而使用 `src/` 练习目录，毕业项目后端统一为 `api/`，前端为 `web/`。不要把两个目录的入口、编译输出和迁移表盲目合并。课程 Session 示例保存独立 csrf_token，配套核心从 Session 令牌派生 CSRF，因此初始迁移没有该列；只选择一套方案并保持一致。

最小核心没有引入 Router、Zustand、Redis、worker、对象存储、OIDC、SSE 或 OpenTelemetry。这是为了先验证最短可信链路，不意味着前面章节的扩展已经落地。v2 路由课程已经采用 React Router 8.5.0，v3 当前用单页分区，不能把 Router 的独立类型检查算作这个最小项目已有路由功能。

## 54.2 安装、数据库与版本事实

课程核验日为 2026-10-23，推荐 Node 24.22.1 与 PostgreSQL 18.6，npm 包按索引版本表与项目锁文件固定。TypeScript 7.0.2 是稳定基线，不使用 beta、next 或 React canary。Node 支持状态与工具 engines 要分别判断；兼容某个版本不代表应该用于新生产部署。

```bash
cd examples/fullstack-blog
node --version
npm ci --registry=https://registry.npmjs.org
npm run check
npm run verify:security
```

默认镜像曾出现 ETARGET，显式官方 registry 安装成功；这不是修改根 registry 配置或升级全部依赖的理由。若只取得 package.json 没有锁文件，首次由 `npm install` 生成并保存锁文件，之后使用 `npm ci`，不要手工补出一份锁文件。

新建独立学习账号与数据库，确保没有连接已有业务库。下面凭据为明显占位值，真实值不提交、不分享日志：

```bash
export DATABASE_URL='postgresql://blog_learning:CHANGE_ME@127.0.0.1:5432/blog_learning'
export APP_ORIGIN='http://127.0.0.1:5173'
psql "$DATABASE_URL" -c 'SELECT current_database(), current_user, version();'
npm run migrate
npm run migrate
npm run verify:api
```

第二次迁移应跳过已应用文件；修改已应用 SQL 会触发校验和失败，新增迁移才是合法演进。迁移使用锁与事务，但不是所有 DDL 都能按此方式运行，非事务索引操作见第 41 章。业务验证会创建学习账号并清理本次记录，属于数据库写操作，必须只在专用学习库执行。

远程 PostgreSQL 必须配置可信 TLS，不能通过关闭证书验证修复连接。最小项目使用一个学习账号同时做迁移和读写，生产需要拆分权限；这项没有因为本地 SQL 运行通过而自动完成。

## 54.3 连接前端、API 与 Cookie

终端 A 保持数据库与 Origin 配置，终端 B 在同一独立项目启动前端：

```bash
npm run dev:api
```

```bash
npm run dev:web
```

访问 `http://127.0.0.1:5173`，不要与 localhost 混用。Vite 将 `/api` 与 `/health` 代理到 `127.0.0.1:3000`，浏览器看到同源请求；数据库连接字符串仅存在 API 进程。固定端口被占用应失败，不悄悄切到另一个 Origin 后造成 Cookie 混乱。

注册时提交邮箱、至少 15 字符的学习密码、独一无二的空间地址和空间名称。API 在事务中创建用户、空间、owner 成员和 Session，提交后设置 HttpOnly Cookie。登录轮换会话，页面通过 `/api/session` 获得必要用户信息、空间与 CSRF；浏览器 JavaScript 不读取 Session Cookie。

| 操作 | 实际接口 | 关键边界 |
|---|---|---|
| 注册 / 登录 | `POST /api/register`、`POST /api/login` | Origin、输入长度、限流与真实密码 |
| 会话 / 退出 | `GET /api/session`、`POST /api/logout` | 过期查询、退出 CSRF、令牌撤销 |
| 管理列表 / 新建 | `/api/tenants/:tenantId/posts` | Session、成员身份与写权限 |
| 保存 | `PATCH /api/tenants/:tenantId/posts/:id` | 资源归属、revision 与事务 |
| 发布 | `POST /api/tenants/:tenantId/posts/:id/publish` | 保存版本、草稿状态与一次转换 |
| 公开列表 / 正文 | `/api/public/:tenantSlug/posts` 及 `/:slug` | 只读 published，最小公开字段 |

空间 id 和文章 id 是数据库 UUID，不是可以直接替换成任意昵称的参数。公开空间 slug 与内部 tenantId 也不同；前端不能用“当前选中的空间”代替服务端资源授权。

## 54.4 草稿、版本与发布的真实机制

新建草稿后选择文章，修改正文并保存，再点击“发布已保存的草稿”。发布使用数据库已保存内容，不把编辑器中的未保存文本隐式提交。保存成功后服务器返回新 revision，前端下次写入必须使用这个版本；遇到 409 保留本地输入，重新取得服务器版本后人工合并。

核心发布 SQL 位于 `api/app.ts` 的事务中：

```sql
UPDATE posts
SET status='published',
    published_at=COALESCE(published_at,now()),
    revision=revision+1,
    updated_at=now()
WHERE tenant_id=$1
  AND id=$2
  AND revision=$3
  AND status='draft'
RETURNING id,slug,title,summary,body,status,revision,published_at;
```

事务内先锁定检查成员写权限，再确认文章属于该空间；零行更新映射为 409，而不是偷偷覆盖或返回成功。两个相同版本并发发布最多一个改变状态，另一个因状态或版本不再匹配被拒绝。第 47 章 Outbox 扩展的可重放响应需要额外幂等记录，本核心没有该能力，不能把重复发布 409 说成可靠任务投递。

公开查询同时要求空间匹配与 `status='published'`，只返回需要的字段；不通过“前端隐藏草稿按钮”保护内容。正文按纯文本呈现，输入 `<script>` 不会被执行。以后加入 Markdown 时沿用 v2 的安全渲染边界，不能因为作者已登录就开启不受限原始 HTML。

前端 `web/api.ts` 的泛型 DTO 是编译期类型，不是运行时验证；当前项目不能声称已通过 Zod/OpenAPI 完整合约测试。毕业扩展应从 `unknown` 校验返回值，加入响应 schema 和兼容门禁，而不是给 `as T` 起一个“安全解析”名字。

## 54.5 按风险执行验收

先运行已有独立门禁，再验证浏览器与网络：

```bash
npm run check
npm run verify:security
npm run migrate
npm run verify:api
npm run build
```

`verify:security` 真正计算 scrypt，检查正确与错误密码、随机盐、损坏摘要、Session/CSRF 比较。`verify:api` 使用真实 PostgreSQL 与 Fastify inject，检查错误 Origin、缺 CSRF、带 query 的注销防绕过与登录限流、跨租户访问、reader 写拒绝、草稿隐私、旧版本冲突、重复发布与退出。它不启动网络监听，代理和浏览器策略需要另外验证。

浏览器主路径为注册、新建、保存、发布、刷新、退出、匿名阅读。异常路径为错误密码、未保存输入、旧版本保存、断网、过期会话和另一个用户猜测资源。390px 下检查文档无横向溢出；键盘检查 label、Tab 顺序、焦点与可见错误。不能把 API 错误码断言当成键盘可访问性通过。

### 已有实际验证记录

| 验证 | 2026-10-23 实际结果 | 不证明的范围 |
|---|---|---|
| 类型 / 构建 | 独立 `check` 与 `build` 通过 | 不证明生产部署 |
| 密码原语 | `verify:security` 通过 | 不证明邮箱验证、恢复或 MFA |
| 迁移 | 隔离 PostgreSQL **16.13** 连续两次通过 | 未运行目标 PostgreSQL 18.6 |
| 数据库业务 | `verify:api` 上述真实路由与 SQL 通过 | 不证明代理、TLS、外部服务 |
| 浏览器 | Chrome 原生 DOM 事件完成主路径，390px 无横向溢出 | 鼠标 click 工具未触发 submit，完整鼠标/键盘路径未验 |

本地实际 Node 为 22.22.0，与推荐 Node 24.22.1 不同；它满足已有工具兼容条件，但不能写成推荐运行时已测试。浏览器使用 `requestSubmit()` 和原生 click 补充工具触发限制，是实际 DOM、HTTP 与数据库路径，不是完整鼠标操作证据。记录基于配套 README 和源码，不把教学预期响应伪装为实测。

## 54.6 构建与生产差距

```bash
npm run build
npm run start:api
```

构建生成 `dist/` 与 `dist-api/`。`start:api` 只启动 API，不托管静态前端；生产需同域静态服务器、HTTPS 和 `/api` 代理，配置 `NODE_ENV=production` 与 HTTPS `APP_ORIGIN`。生产 Cookie 使用 Secure 与 `__Host-`，不能把 Vite 开发服务暴露公网来替代部署。

API 默认监听 loopback，容器内显式 `HOST=0.0.0.0`；迁移 SQL 要与编译入口一起携带。关闭流程停止 Fastify 后释放数据库池，超时非零结束。Docker、TLS 代理、备份、负载、秘密轮换均尚未实测，按第 51–53 章完成后才能提升部署结论。

最小项目还有限制：认证限流是单进程内存实现；管理列表最多 100 篇，公开列表最多 50 篇；没有游标分页、成员邀请界面、邮箱验证、找回密码或账号停用。公开文章后续编辑直接改变正文，不存在审核、版本历史或撤回工作流。这些限制要向使用者说明，不凭页面按钮推断产品能力。

## 54.7 完整毕业扩展

先保持核心门禁通过，再按依赖关系推进，不一次安装所有中间件：

| 章节 | 扩展交付 | 必须新增的失败证据 |
|---|---|---|
| 38–42 | 响应 schema、OpenAPI、受限账号、游标分页 | 非法响应、跨空间游标、迁移升级与并发 |
| 43–45 | 恢复、停用、OIDC 与身份绑定 | 旧会话撤销、state/nonce、邮箱不可自动接管 |
| 46–47 | 共享限流、缓存、Outbox 与 worker | 缓存旧版本、重复投递、租约过期与重放 |
| 48–49 | 私有文件验证、实时通知 | 版本替换、超限文件、断连与权限撤销 |
| 50 | 合约、并发、真实 HTTP 与浏览器测试 | 两用户两租户、代理、键盘与冲突保留 |
| 51–53 | 固定镜像、发布恢复、可观测性与隐私 | 停机、备份恢复、遥测不可用与敏感字段 |

OIDC、Redis、Outbox、上传、实时和 OpenTelemetry 都是明确的扩展任务，不在最小项目实现与通过记录里。单人学习可以先完成核心，再选一个可靠性扩展；若目标是公开生产服务，账号生命周期、安全、备份和运维不能因预算低而省略。

练习交付包含源码版本、命令结果、架构与数据表、错误契约、权限矩阵、迁移历史、恢复记录和未验证清单。最小核心完成标准是从空学习库启动、真实密码登录、草稿保密、保存冲突不覆盖、公开阅读持久化、跨租户拒绝与退出撤销；完整毕业标准另需扩展表全部具有代码和验证证据。这样才能把“读完 55 章”变成能够解释和维护的系统。

## 官方参考

- [React：表单](https://react.dev/reference/react-dom/components/form)。
- [Vite：后端集成](https://vite.dev/guide/backend-integration.html)。
- [Fastify：测试](https://fastify.dev/docs/latest/Guides/Testing/)。
- [PostgreSQL：并发控制](https://www.postgresql.org/docs/current/mvcc.html)。
- [OWASP：Session 管理](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)。

返回：[完整全栈路线与版本核验](./index)。
