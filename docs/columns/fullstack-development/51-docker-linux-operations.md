---
title: "第 51 章：Docker 与 Linux 服务运维"
description: "构建不可变镜像，分离数据库和静态前端，配置健康检查、最小权限、资源预算、优雅停机与可恢复数据。"
date: '2026-10-23'
category: 部署运维
tags: [Docker, Linux, PostgreSQL, 健康检查]
series:
  order: 52
---

# 第 51 章：Docker 与 Linux 服务运维

开发服务器启动快，是因为它假设可信开发者、可写工作区和手工重启。生产服务面对进程崩溃、磁盘满、秘密轮换、慢查询与主机重启，必须明确谁启动服务、谁持久保存数据、谁终止请求、谁执行恢复。本章从单机部署开始，不为学习博客提前引入 Kubernetes。

## 51.1 部署对象与信任边界

前端 `dist/` 是可缓存的公开静态资源，API `dist-api/` 是可信服务，PostgreSQL 数据目录是不能丢失的状态。Redis 缓存即使可重建，队列状态却可能承载尚未完成的任务，不能一概认为 Redis 数据可以随时删除。对象存储与数据库记录需要一起规划备份、保留和删除。

浏览器只访问 HTTPS 站点与同域 `/api`，不能直接访问数据库或 Redis。API 对数据库使用专用受限账号，迁移任务使用有 DDL 权限的独立账号；管理员账号只用于初始化与维护。主机端口只暴露反向代理，服务间通信在私有网络；“运行在容器里”并不等于没有网络风险。

课程 Node 选择 24.22.1，数据库选择 PostgreSQL 18.6，但主机架构、镜像标签是否存在和最终 digest 都必须现场核验。Redis 8 系列的精确补丁与摘要尚未在课程快照确认，不能编造一个生产镜像 ID。[Docker 官方镜像](https://docs.docker.com/docker-hub/image-library/trusted-content/)

## 51.2 固定镜像来源与构建输入

先查询官方标签与平台，然后拉取并记录实际摘要。以下是读者的核验步骤，不是本章已经运行成功的证据：

```bash
docker buildx imagetools inspect node:24.22.1-bookworm-slim
docker buildx imagetools inspect postgres:18.6-bookworm
docker pull node:24.22.1-bookworm-slim
docker image inspect node:24.22.1-bookworm-slim --format '{{json .RepoDigests}}'
```

如果标签不存在就停止，回到官方镜像发布数据选择可用的受维护补丁，不偷偷使用 latest。部署变量 `NODE_IMAGE`、`POSTGRES_IMAGE` 应保存核验得到的 `name@sha256:...`，同时记录平台；多架构索引摘要与单平台 manifest 摘要不是同一个对象。固定摘要仍需定期升级安全补丁，而不是永远锁死。

构建上下文必须排除秘密、缓存和无关内容。在自己的学习项目建立 `.dockerignore`：

```text
node_modules
dist
dist-api
.git
.env
.env.*
runtime.env
*.key
*.pem
backups
learning-tests
```

排除规则是第二道防线，不应该把秘密文件先放入可分享目录再依赖忽略规则。build args、Dockerfile ENV、镜像层和 CI 输出都不是秘密保险箱。依赖若需要私有 registry 凭据，应使用构建工具的 secret mount，不把 token 放入参数或复制到镜像。[Docker 构建秘密](https://docs.docker.com/build/building/secrets/)

## 51.3 多阶段 API 镜像

下面 Dockerfile 对应第 54 章项目。builder 安装开发依赖完成编译；runtime 只安装生产依赖，包含编译后的 API 和迁移 SQL，不运行 Vite 开发服务器。基础镜像由外部提供已核验摘要，不写一个未核实的默认值。

```dockerfile
ARG NODE_IMAGE
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --registry=https://registry.npmjs.org
COPY tsconfig.api.json tsconfig.web.json vite.config.ts index.html ./
COPY api ./api
COPY web ./web
COPY migrations ./migrations
RUN npm run check && npm run build

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --registry=https://registry.npmjs.org && npm cache clean --force
COPY --from=build --chown=node:node /app/dist-api ./dist-api
COPY --from=build --chown=node:node /app/migrations ./migrations
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node --input-type=module -e "const r=await fetch('http://127.0.0.1:3000/health/ready',{signal:AbortSignal.timeout(3000)});if(!r.ok)process.exit(1)"
CMD ["node", "dist-api/server.js"]
```

```bash
docker build --build-arg NODE_IMAGE="$NODE_IMAGE" -t blog-api:learning .
```

镜像默认执行 Node，SIGTERM 直接到应用，而不是被 shell 启动器吞掉。`USER node` 降低权限，不能替代主机隔离、seccomp、只读文件系统和漏洞修复。API 的生产 `APP_ORIGIN` 必须是精确 HTTPS Origin；在容器内明确监听 `0.0.0.0`，而主机开发仍只监听 `127.0.0.1`。

本项目迁移源入口用 tsx，但 runtime 不含该开发依赖，所以生产执行 `node dist-api/migrate.js`，不能照抄 `npm run migrate`。编译后入口通过相对模块 URL 寻找 `/app/migrations/`，镜像必须携带 SQL。前端产物在 builder 的 `/app/dist`，应作为独立构建产物交给静态服务器；API 镜像并不自动托管它。

## 51.4 Compose、数据卷与初始化顺序

下面是单机学习配置，真实秘密文件由读者在受限路径准备，不提交到仓库。`runtime.env` 保存 API 连接字符串与 HTTPS APP_ORIGIN，连接主机名应为 `db`，不是容器内部的 localhost。数据库先启动并初始化专用账号，再执行迁移，最后启动 API。

```yaml
services:
  db:
    image: ${POSTGRES_IMAGE:?Set a verified official image digest}
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/pg_admin_password
      POSTGRES_DB: blog_learning
    secrets:
      - pg_admin_password
    volumes:
      - pg_data:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d blog_learning"]
      interval: 10s
      timeout: 5s
      retries: 10
    restart: unless-stopped
    stop_grace_period: 60s
  api:
    image: blog-api:learning
    env_file: runtime.env
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "127.0.0.1:3000:3000"
    read_only: true
    tmpfs:
      - /tmp:size=16m
    cap_drop: ["ALL"]
    security_opt: ["no-new-privileges:true"]
    init: true
    mem_limit: 768m
    cpus: 1.0
    restart: unless-stopped
    stop_grace_period: 20s
secrets:
  pg_admin_password:
    file: ${PG_ADMIN_PASSWORD_FILE:?Set a private password file path}
volumes:
  pg_data:
```

PostgreSQL 18 官方镜像改变了版本化数据目录，卷示例挂在 `/var/lib/postgresql`；旧版常用的 `/var/lib/postgresql/data` 不能不经核对就套到 18。必须依据实际镜像的 PGDATA 与官方说明检查，不能仅看卷存在就说数据持久化成功。[官方 PostgreSQL 镜像说明](https://github.com/docker-library/docs/blob/master/postgres/README.md)

`POSTGRES_PASSWORD_FILE` 是数据库镜像支持的入口，不表示应用自动支持 `DATABASE_URL_FILE`。配套 API 只读取 `DATABASE_URL`，若要文件秘密读取需显式实现、测试并设置权限。不要在讲解中引入代码根本不识别的变量。

```bash
docker compose up -d db
docker compose run --rm api node dist-api/migrate.js
docker compose up -d api
curl --fail https://blog.example.org/health/ready
```

执行迁移前，应暂时为一次性任务注入迁移账号；API 常驻进程只使用读写账号。`depends_on` 只处理初次启动条件，不保证数据库后来永远可用。`pg_isready` 表示服务器接收连接，不证明业务账号、迁移与业务查询正常；API readiness 还需使用业务连接执行轻量查询。

## 51.5 Linux 资源与优雅停机

资源预算从最昂贵路径开始。scrypt 单任务占百兆级内存，两个并发加上 Node、连接池和运行时开销可能接近容器额度；768m 是学习起点，不是经过负载验证的承诺。CPU 被限流时哈希与请求延迟会增加，盲目扩大工作线程可能加剧内存耗尽。监控 RSS、事件循环、活动请求、池等待和 OOM 退出。

连接预算是实例数乘池 max，再加迁移、备份与管理连接；四个 API 实例每个十连接已经占四十，不要只看单实例参数。给查询、连接获取和 HTTP 请求设置不同超时，避免请求已放弃而数据库还运行几分钟。文件描述符限制同样影响实时连接、数据库连接和日志句柄。

停止顺序是撤出 readiness、停止接收新请求、等待或取消活动工作、关闭 SSE/WebSocket、结束池连接、刷新必要遥测，最后退出。容器停止宽限期必须大于应用内部截止时间；到期强制结束要记录，不无限等。应用 shutdown 被调用多次应幂等，迁移失败则非零退出。

不要通过持续 restart 掩盖配置错误。先查看进程退出码、健康状态、数据库日志与主机磁盘；日志只保留结构化错误类别和 requestId，不输出 runtime.env 或完整连接字符串。Linux 上以专用服务账号管理部署目录，限制写权限与秘密文件读取权限，日志配置轮换，不让无限日志占满数据盘。

## 51.6 持久化、备份与恢复验证

卷不是备份：误删、坏迁移和主机故障会原样影响卷。学习库可使用 `pg_dump` 自定义格式，将结果保存在另一故障域、加密并记录校验和；生产根据 RPO/RTO 选择基础备份与 WAL 归档。不要直接复制运行中的数据库文件目录当可靠备份。

```bash
pg_dump --format=custom --file=blog-learning.dump "$BACKUP_DATABASE_URL"
pg_restore --list blog-learning.dump
pg_restore --exit-on-error --dbname="$RESTORE_DATABASE_URL" blog-learning.dump
```

恢复目标必须是空的隔离库，先核对库名和账号；恢复后运行迁移版本检查、用户与文章数量核对、登录读取与权限测试。`pg_restore --list` 只证明归档目录可读取，不证明恢复完成；备份文件生成也不证明可恢复。对象存储的版本和文章引用需要另外核对。

## 51.7 排错、练习与完成标准

容器健康但浏览器 502 时查代理 upstream、容器网络与 HOST；迁移找不到 SQL 时查镜像复制路径而不是修改数据库；重启后数据丢失时查真实 PGDATA 与卷挂载；只读文件系统失败时明确需要写哪里的临时文件，不直接赋予整个容器可写权限。数据库证书失败不应通过关闭 TLS 校验兜底。

练习在隔离环境执行 API SIGTERM、数据库断连、只读目录、超出连接数与磁盘告警演练，并记录可观察结果。完成标准是镜像可从锁文件重建、运行时不含开发服务器、秘密不在镜像、数据重启后存在、停机有截止时间、恢复到新库通过业务验证。Docker、代理 TLS、目标 PostgreSQL 18.6 与负载参数未经实际运行时，必须在交付记录中明确未验证。

## 官方参考

- [Docker：多阶段构建](https://docs.docker.com/build/building/multi-stage/)。
- [Docker Compose：启动顺序](https://docs.docker.com/compose/how-tos/startup-order/)。
- [PostgreSQL：备份与恢复](https://www.postgresql.org/docs/current/backup.html)。
- [PostgreSQL：pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html)。
- [Fastify：生命周期与关闭](https://fastify.dev/docs/latest/Reference/Server/)。

下一章：[CI/CD、发布与故障恢复](./52-ci-cd-release-recovery)。
