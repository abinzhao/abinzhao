---
title: 03 后端与数据库
description: 使用 Node.js、HTTP API 和 SQLite 建立可靠的数据服务。
---

# 03 后端与数据库

<p class="content-lead">
后端负责接收请求、执行规则、访问数据并返回明确结果。这个阶段从一个小型 REST API 开始，逐步加入验证、错误处理、身份与权限。
</p>

## 学习内容

这一阶段不要求同时学习多个框架，先理解运行时、协议、数据与身份的边界。
五章各自是独立实验，按下表顺序执行，不要把同名 server.mjs 混在同一目录。

| 顺序 | 章节入口 | 产出 | 通过标准 |
| --- | --- | --- | --- |
| 1 | [Node 运行时与文件流](./node/runtime) | ESM 多文件复制程序 | 13 字节复制成功，ENOENT/EEXIST 可解释 |
| 2 | [HTTP 与 REST](./http/rest) | 原生 Node 任务 API | 201/204/400/404/405 与分页准确 |
| 3 | [Express 5 中间件](./express/middleware) | 完整内存 CRUD 服务 | 校验、body 限额、404、异步错误生效 |
| 4 | [SQLite 与事务](./database/sqlite) | 持久化任务命令行 | 重启保留数据，非法外键整体回滚 |
| 5 | [会话、授权与 CSRF](./auth/sessions) | 教学账号与私有资源 API | 他人不可读写，旧会话/缺 token 被拒绝 |

## 前置知识

能够编写函数、对象和数组，知道 Promise、await 与 try/catch 的基本用途。
不熟悉浏览器表单时，先回 [前端基础](../frontend-basics/)。
不熟悉终端与包管理时，先回 [前端工程化](../frontend-engineering/)。
能够从错误信息找到文件与行号，比背诵框架 API 更重要。
课程不是“复制完代码就学会”，每章都要求观察正常和失败路径。

## 版本与目录准备

统一 Node **22.13+**；推荐受支持版本的最新安全补丁，而非长期固定旧补丁。
SQLite 直接使用内置 `node:sqlite`，不安装 sqlite3 或 better-sqlite3。
该 API 在基线版本仍属实验性质；同步数据库调用会占用事件循环。
只有 Express 章需 `npm install express@5`，依赖留在该章实验目录。
`.mjs` 明确使用 ESM，避免上级 package.json 影响 `.js` 的解析方式。

```sh
node --version
mkdir backend-labs
cd backend-labs
```

在 backend-labs 内按章节命令创建子目录；文档中的文件名就是需要创建的实际文件。
用下面的完整程序检查最低版本，保存为 `check-node.mjs`：

```js [check-node.mjs]
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error('Node 22.13+ required');
  process.exitCode = 1;
} else {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  try {
    const result = db.prepare('SELECT 1 AS ready').get();
    console.log({ node: process.versions.node, sqliteReady: result.ready === 1 });
  } finally {
    db.close();
  }
}
```

执行 `node check-node.mjs`，预期 sqliteReady 为 true，可能另有 ExperimentalWarning。
这证明模块可用，不证明应用能承受生产并发，也不是数据库备份测试。

## 推荐学习路径

**初学者**：按 1→2→3→4→5；先跑成功请求，再主动破坏输入观察错误。
**有前端经验**：重点完成 2、4、5，但不能跳过流、事件循环和异步错误边界。
**准备做项目**：完成 4 后可做全栈笔记，再回到 5 接入真正的归属授权。
不要把内存任务 API 的数据丢失误认为 SQLite 故障，它们是不同实验。
不要把认证章内存会话重启失效误认为 Cookie 无效，这是服务端状态丢失。

## 一条请求的责任链

浏览器输入 → HTTP 请求 → 媒体类型与体积检查 → 业务字段校验。
受保护请求还需会话认证与资源归属检查，然后才允许数据库读写。
数据库负责类型、外键和事务一致性；响应负责明确状态与错误结构。
客户端收到 JSON 不等于成功，要同时检查 HTTP 状态。
前端隐藏按钮不是权限控制，URL 难猜也不是授权。
SQL 参数绑定解决注入，不解决“读取别人的 id”。
随机 session id 解决凭据猜测，不解决 XSS、CSRF 或会话撤销。

## 阶段验收

| 类别 | 要执行的验证 | 预期 |
| --- | --- | --- |
| 运行时 | 正常复制与不存在源文件 | 正确字节数、明确 ENOENT |
| 协议 | 新建、读取、删除、重复删除 | 201、200、204、404 |
| 校验 | 空字段、坏 JSON、超大 body | 422、400、413 或说明原生流断连边界 |
| 数据 | 更新后重启再读 | 内容保持，不生成新任务 |
| 事务 | 先合法插入再非法外键 | 两条均不留下，前后数量一致 |
| 注入 | title 中带 SQL 引号 | 当文本保存，表仍存在 |
| 身份 | 未登录与错误密码 | 401，不返回密码/hash |
| 授权 | bob 访问 alice 的私有记录 | 404，不暴露记录内容 |
| CSRF | 正确 Cookie 但缺 token/错 Origin | 403，资源未删除 |

验收应记录命令、实际状态和预期差异，不只截图“页面能打开”。
命令使用教学数据；数据库、cookie jar 和登录响应留在本地，不提交真实凭据。
优雅关闭、requestId 和回滚门禁见 [部署观察章](../fullstack/delivery/deploy-observe)。

## 常见错误

端口占用时先关闭自己的实验进程，不随意结束未知服务。
用 localhost 打开要求 127.0.0.1 的认证实验，会因 Origin 不同被拒绝。
`node --check` 只检查语法，curl 测 HTTP，重启测持久化，三者不能互相代替。
复制示例时保留所有 import 与文件扩展名，不把几个实验的全局变量拼在一起。
实验数据库不要放进主站静态目录，静态站也不会执行后端 `.mjs`。

## 标准练习

1. 为五章各建实验目录，记录实际 Node/Express 版本。
   验收：五章分别能启动，停止后没有遗留占用端口。
2. 建立“输入 → status → 是否写入”的验收表。
   验收：坏 JSON、空字段、越权和成功写入至少各一行。
3. 组合 Express 与 SQLite，但不直接复制客户端 owner_id。
   验收：重启持久化，所有单条操作均带服务端会话归属条件。
4. 列出教学实现到生产之间的缺口。
   验收：包括 HTTPS、限流、迁移、备份、共享会话和错误观察，而非只写“部署”。

## 官方来源

- [Node 22.13 文档](https://nodejs.org/download/release/v22.13.0/docs/api/)
- [Express 5](https://expressjs.com/en/5x/api.html)
- [SQLite 官方文档](https://www.sqlite.org/docs.html)
- [OWASP Cheat Sheets](https://cheatsheetseries.owasp.org/)

下一步：[进入全栈产品](../fullstack/)
