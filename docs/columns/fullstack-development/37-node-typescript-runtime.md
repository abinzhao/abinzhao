---
title: "第 37 章：Node.js LTS 与 TypeScript 服务运行时"
description: "选择受维护的 Node.js，建立严格 ESM 服务，理解事件循环、资源边界、配置校验与优雅关闭。"
date: '2026-10-23'
category: 后端开发
tags: [Node.js, TypeScript, ESM, 事件循环]
series:
  order: 38
---

# 第 37 章：Node.js LTS 与 TypeScript 服务运行时

浏览器负责不可信的用户交互，服务端负责可信规则、共享数据和持久化。把 `localStorage` 换成一个 HTTP 地址，并没有自动解决权限、并发或故障恢复。本阶段从一个进程开始，让每个后续能力都能解释自己的输入、输出、资源和失败边界。

## 37.1 学习目标与课程版本

完成本章应能解释 Node 的 I/O 并发模型，独立启动一个严格 TypeScript 服务，证明错误配置会在监听端口前失败，并在停止进程时释放资源。练习使用本地数据和学习凭据，不连接真实业务系统。

核验日为 **2026-10-23**。官方发行数据中 Node Current 是 26.12.1，但 26 的 LTS 计划日期是 2026-10-28，因此本章不把它称为 LTS。课程选用受维护的 Node **24.22.1**，TypeScript 稳定版 **7.0.2**，不是 7.1 beta 或每日构建。版本快照、支持状态与 registry 来源集中在[专题首页](./index)。

`engines` 中写着 `>=18` 只表示包的兼容下限，不意味着 Node 18 仍受安全维护。选择生产运行时要同时看官方支持周期、依赖兼容矩阵和部署镜像，而不是只看本机能不能启动。LTS 也不等于永久安全：仍需要定期安装受维护分支的补丁，并保留回归记录。

## 37.2 Node 能做什么，不能做什么

Node 在操作系统上运行 JavaScript，提供文件、网络、进程和加密 API。一个主线程执行 JS；网络 I/O、操作系统通知以及部分线程池任务完成后，再把回调排回事件循环。多个 HTTP 请求可以同时等待数据库，但同一主线程上的长循环仍会阻塞其他请求。

| 工作 | 适合的位置 | 原因 |
|---|---|---|
| 输入校验、授权、SQL 调用 | API 进程 | 工作短，依赖可信上下文 |
| 图片解码、压缩、批量导出 | worker 或独立任务进程 | CPU、内存与超时需要隔离 |
| 大文件上传 | 有界流或对象存储直传 | 不把全部内容读进 API 内存 |
| 浏览器动画与 DOM | 前端 | Node 没有页面 DOM |

`async` 不会把计算自动移到另一条线程。对字符串做十秒同步处理，即使函数声明为 `async`，也会让 API 十秒无法正常响应。`Promise.all()` 也不是线程池或并发限流器；如果同时创建十万次请求，可能先耗尽连接和内存。

进程内 Map 只适合短期、可丢弃状态。进程重启、多实例部署或滚动发布时，每份 Map 都不同。文章、会话和可靠任务最终进入数据库；缓存的价值是加速读取，不是充当事实真相源。

## 37.3 建立独立练习目录

本章的 `blog-api` 是读者自己的练习目录，不是教程站点根目录。毕业项目的统一源码组织见[第 54 章](./54-blog-v3-fullstack-capstone)，本章先用最少文件理解运行时。

```bash
mkdir blog-api
cd blog-api
npm init -y
npm install -D --save-exact typescript@7.0.2 tsx@4.23.15 @types/node@24.19.2
```

将下面字段合并到安装工具生成的 `package.json`，保留工具写入的依赖：

```json
{
  "type": "module",
  "private": true,
  "engines": { "node": "24.x" },
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "check": "tsc --noEmit",
    "build": "tsc",
    "start": "node dist/server.js"
  }
}
```

`engines` 通常不会主动切换本机 Node，仍需检查 `node --version`。开发时 `tsx` 处理 TS，但不替代类型检查；生产用已构建 JS，减少运行时转译差异。保存安装工具生成的 lockfile，后续 CI 用 `npm ci`，不要手改锁文件。

创建 `tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "types": ["node"],
    "sourceMap": true
  },
  "include": ["src/**/*.ts"]
}
```

前端的 `Bundler` 模块解析交给打包器，Node 服务则需要理解实际 ESM 路径。源文件中写 `./config.js`，TypeScript 会解析对应的 `config.ts`，生成后路径仍能被 Node 识别。类型导入用 `import type`；不要让仅用于编译的类型变成运行时依赖。

Node 支持一定范围的原生 TS 类型擦除，但这不代表会执行 `tsc` 检查、转换全部 TS 语法或读取所有 tsconfig 设置。本课程保留独立检查和构建流程，避免把运行时支持与工程质量门禁混为一谈。

## 37.4 配置在启动时校验

配置是外部输入。`Number(process.env.PORT)` 可能得到 `NaN`，空字符串也可能被转成零。不要等请求到来才发现数据库地址缺失，也不要打印包含密码的完整环境变量。

```ts
// src/config.ts
export function readPort(value: string | undefined): number {
  const raw = value ?? '3000';
  if (!/^[1-9]\d{0,4}$/.test(raw)) {
    throw new Error('PORT must be an integer from 1 to 65535');
  }
  const port = Number(raw);
  if (port > 65535) {
    throw new Error('PORT is out of range');
  }
  return port;
}

export const config = Object.freeze({
  port: readPort(process.env.PORT),
  host: process.env.HOST ?? '127.0.0.1',
});
```

开发默认监听 loopback，避免意外暴露到局域网。容器内需要 `0.0.0.0` 时由部署配置明确设置。`.env` 只是本地便利格式，不是秘密管理系统；生产凭据应由部署平台注入，不进 Git、不进前端 `VITE_*`、不进错误响应。

数据库 URL、允许 Origin、会话 Cookie 名称和超时同样要校验。未知环境名称应拒绝，而不是落入“开发默认值”关闭安全策略。配置只读取一次后传入服务工厂，测试才能替换它，而无需反复修改全局环境。

## 37.5 第一个有关闭边界的 HTTP 服务

创建 `src/server.ts`：

```ts
import { createServer } from 'node:http';
import { config } from './config.js';

const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health/live') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ code: 'NOT_FOUND' }));
});

server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.listen(config.port, config.host, () => {
  console.info(`Listening on ${config.host}:${config.port}`);
});
server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  const deadline = setTimeout(() => {
    server.closeAllConnections();
    process.exitCode = 1;
  }, 10_000);
  server.close(() => {
    clearTimeout(deadline);
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
```

这里没有处理 JSON body、路由参数和身份认证，第 39 章交给 Fastify。`requestTimeout` 也不是“处理器执行不得超过十五秒”的万能计时器；数据库查询、外部 HTTP 和长任务仍需自己的截止时间。关闭时先停止接收新请求，再等待在途请求，最后释放连接池。直接 `process.exit(0)` 会中断正在写入的响应和日志，不是优雅关闭。

不要把 `uncaughtException` 捕获后继续提供服务当成恢复策略。发生不可预期错误时，记录最小诊断信息、停止接流并让监督进程重启；业务可恢复失败在明确边界处理。

## 37.6 正常与异常验证

以下是需要读者执行的步骤与预期，不是本章已经实测的记录：

```bash
npm run check
npm run build
npm start
```

另一个终端请求：

```bash
curl -i http://127.0.0.1:3000/health/live
curl -i http://127.0.0.1:3000/missing
```

第一条应为 200 JSON，第二条为 404。停止服务后执行 `PORT=abc npm start`，应在监听前拒绝配置；用占用相同端口的另一个学习服务触发 `EADDRINUSE`，确认进程退出码非零。按 Ctrl+C 后端口应释放，再启动不应报占用。

进一步添加一个同步忙循环路由，只在本机实验。忙循环期间同时请求健康接口，观察延迟；再将工作迁移到任务进程比较。不要用一次延迟数值总结吞吐能力，记录数据量、机器、在途请求数和重复次数。

记录运行时版本时分别保存 Node、包管理器与编译器输出，不能从 package.json 的 engines 推断实际进程版本。进程管理器和交互终端可能使用不同 PATH；出现“本地通过、服务启动失败”时，核对服务实际执行文件与工作目录，不先修改业务代码或打印全部环境变量。

## 37.7 排错、练习与完成标准

| 现象 | 优先检查 |
|---|---|
| ESM 找不到模块 | `type: module`、NodeNext、导入 `.js` 后缀、dist 文件 |
| 开发能跑，构建失败 | `tsx` 不检查类型；检查严格配置和类型包主版本 |
| Ctrl+C 后迟迟不退出 | 未关闭的连接、计时器、数据库池或订阅 |
| 只有一个接口慢，全站却卡住 | 同步 CPU 工作、无界日志或 JSON 编解码 |

练习为端口解析添加零、负数、65536、空字符串与默认值验证；给服务增加一个只返回版本标识、不返回秘密的 `/health/version`；写下停止顺序以及每个资源的责任人。完成标准不是“看到 Listening”，而是类型检查、健康与 404、错误配置、端口冲突和关闭重启五条路径均有自己的命令记录。

## 官方参考

- [Node 官方发行数据](https://nodejs.org/dist/index.json)与[发布日程](https://github.com/nodejs/Release/blob/main/schedule.json)：Current 与 LTS 依据。
- [Node：TypeScript](https://nodejs.org/api/typescript.html)：原生类型擦除的范围。
- [Node：HTTP](https://nodejs.org/api/http.html)：超时与连接关闭语义。
- [Node：事件循环](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick)：服务 I/O 模型。
- [TypeScript：NodeNext](https://www.typescriptlang.org/docs/handbook/modules/reference.html#node16-nodenext)：模块与解析边界。

下一章：[HTTP 与 OpenAPI 契约](./38-http-openapi-contracts)。
