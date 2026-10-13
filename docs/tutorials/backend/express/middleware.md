---
title: Express 5：中间件、校验与错误边界
description: 建立完整的 Express 5 应用，理解执行顺序、路由输入、body 限制和统一错误。
---

# Express 5：中间件、校验与错误边界

## 学习目标与准备

先完成 [HTTP 与 REST](../http/rest)。
本章用 Node 22.13+ 和 Express 5，依赖仅安装到独立练习目录。
`.mjs` 使用 ESM；Express 的最低版本要求是 Node 18，但教程统一用 22.13+。

```sh
mkdir express-lab
cd express-lab
npm init -y
npm install express@5
npm ls express
```

最后一条应显示 `express@5.x`，保留本实验的 lock 文件以复现实际版本。
不要在教程主站的 package.json 中添加 Express。

## 机制：中间件是一条有方向的链

每层接收 `req`、`res`、`next`：结束响应，或者调用 next 交给下一层。
普通 next 继续普通链；`next(error)` 跳到错误中间件。
错误中间件必须写四个形参，包括即便未使用的 next。
注册顺序就是执行顺序：记录请求、检查类型、解析 body、校验、业务、404、错误。
把 JSON 解析放在路由后面，会让 `req.body` 一直未定义。
客户端验证只为体验，服务端校验才是安全边界。

Express 5 能自动捕获 async 路由返回的 Promise 拒绝。
但定时器内部 throw、脱离等待的 Promise，不会神奇地进入这条链。
必须 await 异步操作，或显式在回调中调用 next(error)。
404 是所有路由都没匹配后的正常响应，不是 Express 自动抛出的异常。
不使用 Express 4 的裸 `*` 路径；5 的通配符需要名称。
这里用末尾无路径 app.use 处理 404，避免版本路径语法差异。

## 操作：完整应用

本例内存 CRUD 只保存 title，不把用户提交对象直接赋给资源。
请求来源分开读取：params 是路径，query 是查询，body 是正文。
`express.json` 的限额限制解析字节数，不能代替反向代理的连接限额。

```js [app.mjs]
import express from 'express';
import { randomUUID } from 'node:crypto';

const app = express();
const tasks = new Map();
let nextId = 1;
app.disable('x-powered-by');
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.set('X-Request-Id', req.requestId);
  res.set('Cache-Control', 'no-store');
  next();
});
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({ error: 'JSON required' });
  }
  next();
});
app.use(express.json({ limit: '8kb', strict: true, inflate: false }));
function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
function titleOf(input) {
  if (!input || Array.isArray(input) || typeof input !== 'object'
    || Object.keys(input).some(key => key !== 'title')
    || typeof input.title !== 'string'
    || !input.title.trim() || input.title.trim().length > 100) {
    fail(422, 'only title with 1-100 characters is accepted');
  }
  return input.title.trim();
}
const router = express.Router();
router.get('/', (req, res) => {
  res.json({ data: Array.from(tasks.values()) });
});
router.post('/', async (req, res) => {
  const title = titleOf(req.body);
  const task = { id: nextId++, title };
  tasks.set(task.id, task);
  res.location(`/api/tasks/${task.id}`).status(201).json({ data: task });
});
router.param('id', (req, res, next, value) => {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    return next(Object.assign(new Error('invalid id'), { status: 400 }));
  }
  req.task = tasks.get(Number(value));
  if (!req.task) return next(Object.assign(new Error('not found'), { status: 404 }));
  next();
});
router.get('/:id', (req, res) => res.json({ data: req.task }));
router.put('/:id', (req, res) => {
  req.task.title = titleOf(req.body);
  res.json({ data: req.task });
});
router.delete('/:id', (req, res) => {
  tasks.delete(req.task.id);
  res.status(204).end();
});
app.use('/api/tasks', router);
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/fail', async () => {
  await Promise.resolve();
  throw new Error('teaching failure');
});
app.use((req, res) => res.status(404).json({
  error: 'not found', requestId: req.requestId,
}));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number.isInteger(error.status)
    && error.status >= 400 && error.status <= 599 ? error.status : 500;
  console.error(JSON.stringify({ requestId: req.requestId, status }));
  const message = status === 500 ? 'internal error'
    : status === 400 ? 'invalid JSON or path' : error.message;
  res.status(status).json({ error: message, requestId: req.requestId });
});
const server = app.listen(3001, '127.0.0.1', error => {
  if (error) { console.error(error.code); process.exitCode = 1; return; }
  console.log('http://127.0.0.1:3001');
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
process.on('SIGINT', () => server.close());
process.on('SIGTERM', () => server.close());
```

## 效果验证

终端一执行 `node app.mjs`，终端二执行：

```sh
curl -i -H 'Content-Type: application/json' -d '{"title":"middleware"}' http://127.0.0.1:3001/api/tasks
curl -i -X PUT -H 'Content-Type: application/json' -d '{"title":"validated"}' http://127.0.0.1:3001/api/tasks/1
curl -i -H 'Content-Type: application/json' -d '{"title":"x","admin":true}' http://127.0.0.1:3001/api/tasks
curl -i -H 'Content-Type: application/json' -d '{' http://127.0.0.1:3001/api/tasks
curl -i http://127.0.0.1:3001/api/fail
curl -i http://127.0.0.1:3001/missing
node --input-type=module -e "const r=await fetch('http://127.0.0.1:3001/api/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'x'.repeat(9000)})});console.log(r.status)"
```

预期依次为 201、200（title 为 validated）、422、400、500、404、413。
500 的正文不能包含 `teaching failure` 或堆栈，requestId 可在终端匹配。
health 返回 200，不受上一次失败影响，说明错误未把整个进程结束。
请求 1 的 DELETE 应返回 204，后续 GET 应返回 404。
本例没有鉴权、持久化和完整 405 表，不能直接作为公网服务发布。

## 常见错误

| 现象 | 机制与处理 |
| --- | --- |
| 请求一直挂起 | 中间件既不 next 也不 end |
| `Cannot set headers` | 响应后又 next，或两分支重复发送 |
| 字段“消失” | 解析器未执行、类型不匹配；不要默认 body 总存在 |
| 大请求得到 413 | body 上限生效，不应改成无限大 |
| async 错误没被捕获 | 任务未返回或未 await；检查异步边界 |
| 错误 handler 没执行 | 四形参签名错误，或注册在路由之前 |

## 标准练习

1. 为 title 添加禁用控制字符规则。
   验收：有效中文不误拒，带换行或 NUL 的输入返回 422。
2. 为已知集合路径添加 405 和 Allow。
   验收：PATCH 集合为 405，未知路径仍为 404，不吞掉已有 GET。
3. 增加请求结束耗时日志，监听 finish 而不是在 next 后立即计时。
   验收：日志包括实际 status、requestId，不记录 body 和 Cookie。
4. 写三组回归请求：无 Content-Type、坏 JSON、合法 JSON 的错误字段。
   验收：分别为 415、400、422，不能全都返回 500。

## 官方来源与下一步

- [Express 5 迁移与 Promise](https://expressjs.com/en/guide/migrating-5.html)
- [中间件](https://expressjs.com/en/guide/using-middleware.html)
- [错误处理](https://expressjs.com/en/guide/error-handling.html)
- [Express 5 API](https://expressjs.com/en/5x/api.html)

下一章：[SQLite 数据与事务](../database/sqlite)。
