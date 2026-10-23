# 全栈博客 v3：可运行最小核心

这是全栈开发第 37–54 章配套的独立学习项目，不依赖站点根 package.json。
包含 React/Vite 前端、Fastify API、PostgreSQL 迁移与可重复执行的业务验证。
真实数据库是必要条件；没有把内存数组、localStorage 或静态 JSON 当成后端。

## 实现边界

已实现：

- 密码注册与登录，异步 scrypt、随机盐、限长与单进程认证限流。
- 注册事务创建用户、空间、owner 成员与 Session。
- 随机 Session Cookie、数据库摘要、7 天绝对期限、登录轮换、退出撤销。
- Origin 与 Session 绑定 CSRF，生产使用 Secure 和 `__Host-` Cookie。
- 成员即时授权，owner/editor 可写、reader 只读，跨租户资源返回 404。
- 草稿创建、文章编辑、revision 冲突、首次发布、重复发布冲突。
- 匿名公开文章与正文，草稿不公开，正文按纯文本显示。
- 校验和迁移、参数化 SQL、事务回滚、健康检查与停止资源释放。

未实现：OIDC、邮箱验证、找回密码、成员邀请 UI、图片上传、Redis、Outbox、
后台任务、SSE/WebSocket、OpenTelemetry、生产反向代理与备份系统。
这些属于后续章节的扩展任务，不应把本项目直接当成生产登录系统。
内存限流只适用于单实例学习；数据库/API 使用同一学习账号，也不是生产权限配置。
管理列表上限 100 篇、公开列表上限 50 篇；第 42 章的游标分页是扩展，不在此最小实现中。

## 文件组织

```text
api/
  app.ts             HTTP 校验、鉴权、授权和博客路由
  db.ts              连接池与同连接事务
  security.ts        密码与 Session/CSRF 原语
  migrate.ts         有版本与校验和的迁移入口
  server.ts          启动、配置、停止
migrations/
  001_initial.sql    用户、空间、成员、文章、Session
scripts/
  security-check.ts  不依赖数据库的真实密码验证
  api-check.ts       使用真实 PostgreSQL 的 HTTP/业务验证
web/
  api.ts             同源请求与错误边界
  main.tsx           注册、登录、管理与公开阅读
  style.css          简洁响应式布局
```

## 安装与数据库准备

课程版本核验日为 **2026-10-23**，推荐 Node **24.22.1**，
PostgreSQL **18.6**；各 npm 包精确版本在 package.json 和生成的 package-lock.json。
本项目验证使用的 Node 22.22.0 也满足当前工具兼容条件，不能把兼容下限当推荐版本。

在项目目录执行：

```bash
cd examples/fullstack-blog
npm ci --registry=https://registry.npmjs.org
npm run check
npm run verify:security
```

若只取得 package.json 而没有 lockfile，首次使用
`npm install --registry=https://registry.npmjs.org`，保存工具生成的锁文件后改用 `npm ci`。
不要在站点根目录安装这些依赖。

为课程新建独立 PostgreSQL 数据库和专用账号，例如 `blog_learning`。
账号需要学习库的建表与读写权限。设置连接字符串时替换下面的明显占位值，
不要提交真实凭据，不连接已有业务数据库。远程连接需要正确校验 TLS。

```bash
export DATABASE_URL='postgresql://blog_learning:CHANGE_ME@127.0.0.1:5432/blog_learning'
export APP_ORIGIN='http://127.0.0.1:5173'
psql "$DATABASE_URL" -c 'SELECT current_database(), current_user, version();'
npm run migrate
npm run migrate
npm run verify:api
```

第二次 migrate 应不重复应用。verify:api 创建随机学习账号与空间，
最后只清理本次创建的数据；它会修改目标数据库，因此只在独立学习库执行。
不要把真实 DATABASE_URL 出现在截图、日志或 shell 历史分享中。

## 本地启动

终端 A 保持 DATABASE_URL 与 APP_ORIGIN 环境变量：

```bash
npm run dev:api
```

终端 B 在同一个项目目录：

```bash
npm run dev:web
```

访问 **http://127.0.0.1:5173**，不要混用 localhost。
Vite 将 `/api` 与 `/health` 代理到 127.0.0.1:3000，保留浏览器 Origin。
这让浏览器请求同源，不需要宽泛 CORS，也不把数据库地址暴露给前端。
端口被占用时服务应停止，不自动切换后导致 Cookie 与 Origin 混乱。

注册时使用学习邮箱和至少 15 字符的学习密码，创建独一无二的空间 slug。
新建草稿、保存、发布，退出后在“匿名公开阅读”输入空间 slug。
输入未保存的正文不会被发布；发布操作使用服务器已保存的 revision。
409 冲突保留输入，请记录本地内容，重新选择当前文章并人工合并。

```bash
npm run build
npm run start:api
```

build 输出 `dist/` 静态前端和 `dist-api/` API。start:api 不自动托管前端。
生产需同域静态服务器与 `/api` 代理，设置 NODE_ENV=production、
HTTPS APP_ORIGIN、数据库证书与真实秘密管理。不能把 Vite 开发服务器当生产服务器。
API 默认只监听 127.0.0.1；容器内按需明确设置 HOST=0.0.0.0。
部署迁移时必须携带 migrations/，迁移不在 API 启动时隐式执行。

## 实际验证记录

2026-10-23 在本机独立安装上述固定依赖，根依赖与根锁文件未修改：

| 项目 | 实际结果与边界 |
|---|---|
| 安装 | 默认 npm 镜像 ETARGET；显式 npm 官方 registry 安装成功 |
| `npm run check` | API 与前端 TypeScript 检查通过 |
| `npm run build` | API 编译、Vite 8.3.5 生产构建通过 |
| `npm run verify:security` | 正确/错误密码、独立随机盐、损坏摘要、Session/CSRF 比较通过 |
| `npm run migrate` 两次 | 隔离临时 PostgreSQL 16.13 初始化成功，第二次不重复 |
| `npm run verify:api` | 真实数据库注册/密码登录、Origin/CSRF、带 query 的注销 CSRF/登录限流、租户/角色拒绝、草稿隐私、revision/重复发布冲突、退出通过 |
| 浏览器 | Chrome 中用原生 DOM 事件完成注册、保存、发布、刷新恢复、退出与匿名正文阅读；390px 无文档横向溢出 |

浏览器工具的鼠标 click 未触发表单 submit，改用浏览器原生 requestSubmit/click
执行上述流程；这不是“鼠标点击路径通过”的证据。API 检查使用 Fastify inject
运行真实路由和 PostgreSQL，不走 mock 数据；浏览器验证另走 Vite 代理和实际 HTTP。
未验证 PostgreSQL 18.6、Redis、外部身份提供方、对象存储、公网 TLS、
生产容器、负载性能、密码找回或完整无障碍键盘流程。
以上结果不证明未实现的扩展已完成，也不证明该学习系统满足生产合规要求。
