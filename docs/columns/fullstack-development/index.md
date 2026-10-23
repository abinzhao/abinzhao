---
title: 全栈开发：从网页基础到可运维的全栈博客
description: 55 章贯穿 HTML、CSS、JavaScript、TypeScript、React、Node.js、Fastify、PostgreSQL、鉴权、异步任务、测试与运维，完成博客 v1、v2 和全栈 v3。
date: '2026-10-23'
status: 持续更新
featured: true
---

# 全栈开发：从网页基础到可运维的全栈博客

这套专题面向零基础读者，目标不是背诵 API，而是建立一条可以反复实践、逐步验证的完整开发路径：

1. 用 HTML5 写出语义正确、可访问的页面结构。
2. 用 CSS3 完成布局、响应式设计、视觉样式和动画。
3. 用 Chrome DevTools 定位样式、网络、脚本与性能问题。
4. 理解 JavaScript 运行模型、DOM、事件与常用浏览器 API。
5. 用严格 TypeScript 建立类型边界，验证外部数据。
6. 使用 React 19、路由、Zustand 和 Zod 重构博客。
7. 用 Node.js 与 Fastify 建立有输入校验和 OpenAPI 契约的 HTTP 服务。
8. 用 PostgreSQL 实现持久化、迁移、事务、索引和游标分页。
9. 实现 Session、OAuth/OIDC、资源授权和租户隔离。
10. 加入 Redis、Outbox、幂等任务、对象存储和实时通知。
11. 用集成测试、容器、CI/CD、可观测性与恢复演练完成博客 v3。

**对象与边界**：适合从网页基础开始学习、或已有前端经验但缺少后端实践的读者。v1 是静态内容站；v2 是 React 客户端应用；只有 v3 才包含可信后端、持久数据库和部署运维。浏览器里的 localStorage、模拟提交和静态 JSON 都不是后端。

**实践说明**：文中的命令、响应和故障实验是学习步骤与预期，不是已经运行通过的记录。应在独立学习项目中执行，不要把教程中的数据库迁移、测试清理或发布命令直接用于真实系统。外部账号、云存储和发布权限需要读者自行准备；凭据只通过环境变量或秘密管理系统注入。

## 阶段路线

### 阶段 1：网页基础与博客第一版

- **第 0–1 章**：网页运行原理、HTML 语义、表单与可访问性。
- **第 2–5 章**：CSS 层叠、布局、视觉样式和工程化。
- **第 6–10 章**：过渡、变换、关键帧、滚动动画与性能。
- **第 11–12 章**：Chrome DevTools 与浏览器渲染流程。
- **第 13–19 章**：原生 HTML、CSS、JavaScript 静态博客 v1。

### 阶段 2：JavaScript、TypeScript、React 与博客第二版

阶段 2 建议用 5 周完成，每周都要运行代码并保留验证结果：

| 周次 | 章节 | 学习与交付 |
|---|---|---|
| 第 1 周 | 第 20–22 章 | 变量、作用域、闭包、原型、类、ESM、错误处理、Promise 与事件循环 |
| 第 2 周 | 第 23–26 章 | DOM、事件、观察器、网络与存储、图形与文件、实时通信、兼容策略 |
| 第 3 周 | 第 27–29 章 | TypeScript 基础、类型组合、泛型、收窄、工具类型与严格模式 |
| 第 4 周 | 第 30–33 章 | React 19 组件与钩子、动作、路由、Zustand、Zod |
| 第 5 周 | 第 34–36 章 | React 与 TypeScript 博客第二版、状态与表单、性能监控、Biome 与部署 |

### 阶段 3：后端、数据与安全

建议按交付物推进，不以读完章节代替运行结果：

| 范围 | 内容 | 阶段交付 |
|---|---|---|
| 37–39 | Node.js、HTTP/OpenAPI、Fastify | 可关闭、有错误契约的 API |
| 40–42 | SQL、迁移、事务、索引、分页 | 可从空库重建的文章数据库 |
| 43–45 | 密码、Session、OAuth/OIDC、授权、多租户 | 两个用户、两个租户之间无法越权 |
| 46–49 | 缓存、限流、队列、Outbox、文件、实时通信 | 可重试且不重复产生业务效果的流程 |
| 50–53 | 集成测试、容器、发布恢复、遥测与隐私 | 有证据的质量门禁和恢复手册 |
| 54 | 全栈博客毕业项目 | 登录、编辑、发布、上传、通知、回归与恢复闭环 |

先使用一个 API 服务、一个 worker 和一个 PostgreSQL 数据库。不要为了“全栈”提前引入微服务、Kubernetes 或分布式事务；当需求明确超出当前边界，再比较迁移成本。

## 完整目录

### 网页基础与静态博客

| 章 | 内容 |
|---|---|
| 00 | [网页运行原理与开发起步](./00-web-foundations) |
| 01 | [HTML 语义、表单与可访问性](./01-semantic-html) |
| 02 | [CSS 选择器、层叠与优先级](./02-css-cascade-specificity) |
| 03 | [盒模型与布局](./03-box-model-layout) |
| 04 | [视觉样式](./04-visual-styling) |
| 05 | [CSS 变量与工程化](./05-css-variables-tooling) |
| 06 | [CSS 过渡](./06-css-transitions) |
| 07 | [CSS 变换](./07-css-transforms) |
| 08 | [关键帧动画](./08-keyframe-animation) |
| 09 | [滚动动画与视图过渡](./09-scroll-view-transitions) |
| 10 | [动画性能](./10-animation-performance) |
| 11 | [Chrome DevTools](./11-chrome-devtools) |
| 12 | [浏览器渲染](./12-browser-rendering) |
| 13 | [静态博客项目规划](./13-project-planning) |
| 14 | [CSS 架构](./14-css-architecture) |
| 15 | [HTML 页面](./15-html-pages) |
| 16 | [JavaScript 交互](./16-javascript-behavior) |
| 17 | [Markdown 内容管理](./17-markdown-content) |
| 18 | [静态部署](./18-static-deployment) |
| 19 | [上线验收](./19-quality-checklist) |

### JavaScript、TypeScript 与 React

| 章 | 内容 |
|---|---|
| 20 | [作用域与闭包](./20-javascript-scope-closures) |
| 21 | [原型、类、模块与错误](./21-prototypes-classes-modules-errors) |
| 22 | [异步与事件循环](./22-async-event-loop) |
| 23 | [DOM、事件与观察器](./23-dom-events-observers) |
| 24 | [网络与浏览器数据 API](./24-browser-data-apis) |
| 25 | [图形、文件与实时 API](./25-media-files-realtime-apis) |
| 26 | [浏览器兼容策略](./26-browser-compatibility) |
| 27 | [TypeScript 基础](./27-typescript-foundations) |
| 28 | [类型组合与泛型](./28-typescript-composition-generics) |
| 29 | [严格模式与类型守卫](./29-typescript-strict-tooling) |
| 30 | [React 组件基础](./30-react-foundations) |
| 31 | [React Hooks](./31-react-hooks) |
| 32 | [React Actions 与乐观更新](./32-react-19-actions) |
| 33 | [路由、Zustand 与 Zod](./33-react-router-zustand-zod) |
| 34 | [博客 v2 重构](./34-blog-v2-react-refactor) |
| 35 | [博客 v2 状态与表单](./35-blog-v2-state-forms) |
| 36 | [博客 v2 性能与 Biome](./36-blog-v2-performance-biome) |

### 后端与全栈毕业项目

| 章 | 内容 |
|---|---|
| 37 | [Node.js LTS 与 TypeScript 服务运行时](./37-node-typescript-runtime) |
| 38 | [HTTP 与 OpenAPI 契约](./38-http-openapi-contracts) |
| 39 | [Fastify 服务架构与生命周期](./39-fastify-architecture) |
| 40 | [PostgreSQL、SQL 与数据建模](./40-postgresql-sql-modeling) |
| 41 | [迁移、事务与并发一致性](./41-migrations-transactions) |
| 42 | [查询性能、索引与游标分页](./42-query-performance-pagination) |
| 43 | [密码与 Session 鉴权](./43-password-session-auth) |
| 44 | [OAuth、OIDC 与登录安全](./44-oauth-oidc-security) |
| 45 | [访问控制与多租户隔离](./45-authorization-multitenancy) |
| 46 | [Redis 缓存与限流](./46-redis-cache-rate-limits) |
| 47 | [队列、Outbox 与幂等](./47-queues-outbox-idempotency) |
| 48 | [文件与对象存储](./48-files-object-storage) |
| 49 | [SSE、WebSocket 与实时状态](./49-sse-websocket-realtime) |
| 50 | [集成与合约测试](./50-integration-contract-testing) |
| 51 | [Docker 与 Linux 运维](./51-docker-linux-operations) |
| 52 | [CI/CD、发布与故障恢复](./52-ci-cd-release-recovery) |
| 53 | [OpenTelemetry、安全与隐私](./53-opentelemetry-security-privacy) |
| 54 | [博客 v3 全栈毕业项目](./54-blog-v3-fullstack-capstone) |

## 阅读方式

首次学习建议按章节顺序阅读，并把完整代码放进本地项目运行。每章至少完成“代码运行、异常路径、效果验证”三项，不要只阅读代码。

已经具备基础时，可以按主题选择：

- **页面与样式基础**：第 0–10 章。
- **调试与浏览器原理**：第 11–12、22–26 章。
- **JavaScript 核心**：第 20–23 章。
- **TypeScript**：第 27–29 章。
- **React 19**：第 30–33 章。
- **后端与数据库**：第 37–42 章。
- **安全与分布式边界**：第 43–49 章。
- **测试、运维与隐私**：第 50–53 章。
- **项目实战**：第 13–19 章完成 v1，第 34–36 章完成 v2，第 54 章交付 v3。

## 开始前准备

阶段 1 只需要现代浏览器、代码编辑器和静态文件服务器。阶段 2–3 使用下面的课程版本；后端还需要 PostgreSQL、Redis 和可选的对象存储。安装命令都在独立学习目录执行，不修改本教程站点的依赖。

## 版本核验

**核验日期：2026-10-23。** 下表来自官方发布数据、支持政策、文档和 npm 官方 registry 的 `dist-tags`、发布时间及 `engines`。这是时间快照，不表示阅读时仍然最新。官方文档中的 `latest` 链接会变化，安装则固定到具体版本。

| 项目 | 核验结果与课程选择 | 官方来源 |
|---|---|---|
| Node.js | Current 为 **26.12.1**；26 的 LTS 计划日为 **2026-10-28**，本日不能称为 LTS。课程用 **24.22.1**，24 与 22 均处 Maintenance LTS；22 最新补丁为 22.23.4；20 已 EOL | [发行 JSON](https://nodejs.org/dist/index.json)、[发布日程](https://github.com/nodejs/Release/blob/main/schedule.json)、[支持说明](https://nodejs.org/en/about/previous-releases) |
| npm / Node 类型 | Node 24.22.1 发行数据附带 npm **11.19.1**；`@types/node` 用 **24.19.2**，不跟随默认 26 系列 | [Node 发行数据](https://nodejs.org/dist/index.json)、[类型 registry](https://registry.npmjs.org/@types/node) |
| TypeScript | 稳定 **7.0.2**；`beta` 为 **7.1.0-beta**，`next` 为 **7.1.0-dev.20261022.1**，都不是稳定基线 | [下载说明](https://www.typescriptlang.org/download/)、[registry](https://registry.npmjs.org/typescript) |
| React / React DOM | 同时固定 **19.3.1**；不使用 canary 或 experimental | [React 版本](https://react.dev/versions)、[registry](https://registry.npmjs.org/react) |
| Vite / create-vite | **8.3.5 / 9.3.1**；React 插件 **6.1.2**；Node 要求 `^20.19.0 || >=22.12.0` 只是兼容下限，不是受维护版本推荐 | [入门](https://vite.dev/guide/)、[Vite registry](https://registry.npmjs.org/vite)、[脚手架 registry](https://registry.npmjs.org/create-vite) |
| Router / Zustand / Zod | **8.5.0 / 5.0.16 / 4.6.7**；Router 用 `react-router`，v8 移除 `react-router-dom`，要求 Node ≥22.22、React/React DOM ≥19.2.7 | [Router registry](https://registry.npmjs.org/react-router)、[v8 迁移](https://reactrouter.com/8.5.0/upgrading/v7)、[Zustand registry](https://registry.npmjs.org/zustand)、[Zod registry](https://registry.npmjs.org/zod) |
| Markdown | `react-markdown` **10.1.0**、`rehype-sanitize` **6.0.0** | [渲染器](https://github.com/remarkjs/react-markdown)、[净化器](https://github.com/rehypejs/rehype-sanitize) |
| Web Vitals / Biome | **6.2.3 / 2.6.2** | [Web Vitals registry](https://registry.npmjs.org/web-vitals)、[Biome registry](https://registry.npmjs.org/@biomejs/biome) |
| Fastify | 稳定 **5.12.7**；`next` 的 6.0.0-alpha.5 不是本课程版本；v5 要求完整 JSON Schema，不能照抄 v4 简写 | [v5 迁移](https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/)、[支持政策](https://fastify.dev/docs/latest/Reference/LTS/)、[registry](https://registry.npmjs.org/fastify) |
| Fastify 插件 | cookie **11.1.3**、cors **11.3.1**、swagger **9.9.2**、swagger-ui **6.1.2**、websocket **11.3.4** | [官方插件组织](https://github.com/fastify)、[npm registry](https://registry.npmjs.org/) |
| PostgreSQL / pg | 官方支持页与发布归档本次列出 **18.6**，课程采用此版本；驱动与类型为 **8.23.1**。不根据“每年发主版本”推测不存在于核验数据中的版本 | [支持政策](https://www.postgresql.org/support/versioning/)、[18.6 发布说明](https://www.postgresql.org/docs/release/18.6/)、[pg registry](https://registry.npmjs.org/pg) |
| Redis / BullMQ | Node 客户端 `redis` **6.3.0**，队列库 **6.4.0**。Redis 服务端与客户端不是同一版本号；服务端采用官方 Redis 8 系列，安装前从发布页选择精确补丁并记录镜像摘要 | [Redis 升级说明](https://redis.io/docs/latest/operate/oss_and_stack/install/upgrade/)、[客户端 registry](https://registry.npmjs.org/redis)、[BullMQ registry](https://registry.npmjs.org/bullmq) |
| S3 SDK | client-s3 与 s3-request-presigner 同用 **3.1156.0** | [官方 SDK](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/welcome.html)、[registry](https://registry.npmjs.org/@aws-sdk/client-s3) |
| OpenTelemetry JS | API **1.10.0**、sdk-node 与 OTLP HTTP exporter **0.300.0**、自动插桩 **0.82.0**；包处于不同稳定性层级，不因 registry 的 latest 就宣称所有 API 稳定 | [JS 文档](https://opentelemetry.io/docs/languages/js/)、[SDK registry](https://registry.npmjs.org/@opentelemetry/sdk-node) |

Redis 服务端精确补丁与容器摘要未在本次核验中确认，不能把 `redis:8` 这种浮动标签当成可复现生产安装。第 51 章说明如何核验镜像并固化部署清单。

### 固定安装与复查

前端起步：

```bash
npm create vite@9.3.1 blog-v2 -- --template react-ts
cd blog-v2
npm install --save-exact react@19.3.1 react-dom@19.3.1
npm install --save-exact react-router@8.5.0 zustand@5.0.16 zod@4.6.7
npm install --save-exact react-markdown@10.1.0 rehype-sanitize@6.0.0 web-vitals@6.2.3
npm install -D --save-exact typescript@7.0.2 vite@8.3.5 @vitejs/plugin-react@6.1.2
npm install -D --save-exact @types/react@19.3.0 @types/react-dom@19.3.0 @biomejs/biome@2.6.2
```

后端起步：

```bash
mkdir blog-api
cd blog-api
npm init -y
npm install --save-exact fastify@5.12.7 pg@8.23.1
npm install -D --save-exact typescript@7.0.2 tsx@4.23.15 @types/node@24.19.2 @types/pg@8.23.1
```

其余依赖在对应章节按固定版本加入。`--save-exact` 固定直接依赖，仍需保存安装工具生成的 lockfile，CI 使用 `npm ci` 固定传递依赖；不要手工编辑锁文件。更新安全补丁时建立单独升级记录并回归，而不是永久冻结存在漏洞的版本。

复查来源：

```bash
node --version
npm --version
npm view typescript dist-tags --json
npm view fastify@5.12.7 version engines --json
npm view vite@8.3.5 engines --json
npm view react-router@8.5.0 version engines peerDependencies --json
npm ls --depth=0
```

核验时同时看发布时间是否早于核验日、预览标签、Node 支持状态、插件兼容矩阵和主版本迁移说明。registry 元数据证明“发布过”，不证明教程组合已经运行通过。

Router 核验必须区分包名与发布通道：本日 `react-router` 的 `latest` 是 8.5.0，发布时间为 2026-10-19，`version-7` 才是 7.18.4；`react-router-dom` 的旧版本不能代表 Router 当前稳定版本。第 33–36 章采用 v8 Data 模式，普通 API 从 `react-router` 导入，浏览器 `RouterProvider` 从 `react-router/dom` 导入。已有 v7 工程按官方迁移说明渐进验证，不安装不存在的 `react-router-dom@8`，也不为纯 SPA 添加 Framework 专用构建配置。

## 毕业标准

完成三个阶段后，应能从空数据库启动服务，登录并编辑文章，发布后让匿名读者读取，上传文件经历验证，刷新不丢数据，重复请求不重复发布，跨用户和跨租户访问被拒绝。还应保存失败路径的测试报告、数据库恢复记录和发布回滚说明。

“API 返回 200”不等于系统可靠：错误契约、授权、数据一致性、凭据保护、停止服务时的资源释放，以及故障后的可恢复性，都属于全栈开发的一部分。
