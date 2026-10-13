---
title: HTTP 与 REST：从报文到原生服务
description: 理解请求、响应、状态码、幂等和分页，运行一个无需框架的 Node HTTP API。
---

# HTTP 与 REST：从报文到原生服务

## 学习目标与准备

先完成 [Node 运行时](../node/runtime)。
本章用 Node 22.13+ 的 `node:http` 实现内存任务集合，不安装依赖。
目标是读懂协议边界，不是把原生服务包装成完整生产框架。

```sh
mkdir http-rest-lab
cd http-rest-lab
node --version
```

## 机制：请求和响应是两份报文

请求包含方法、目标路径、头部和可选 body；响应包含状态、头部和 body。
URL 查询参数适合筛选和分页；JSON body 适合结构化写入。
`Content-Type` 描述发送的内容，`Accept` 描述期待的响应类型。
HTTP 状态表达协议结果，JSON 的 error 字段提供可编程细节。
客户端 `fetch` 收到 404 或 500 不会自动抛错，必须检查 `response.ok`。

| 方法/状态 | 本章含义 | 边界 |
| --- | --- | --- |
| GET / 200 | 读取集合 | 安全方法不应改变业务资源 |
| POST / 201 | 创建资源 | 默认不幂等，返回 Location |
| DELETE / 204 | 删除成功，无响应体 | 重复删除可返回 404，最终状态仍一致 |
| 400 / 422 | JSON/参数格式错，字段语义错 | 本章约定，不是所有 API 的唯一选法 |
| 404 / 405 | 路径不存在，已知路径方法不支持 | 405 带 Allow |
| 413 / 415 | body 过大，媒体类型不支持 | 解析前先设限 |
| 500 | 未知服务端故障 | 不把堆栈返回给客户 |

幂等指重复调用的预期业务效果一致，不要求每次状态码和日志相同。
PUT 通常表示整体替换，PATCH 表示局部修改，但 PATCH 并非天然幂等。
网络超时不证明服务端没写入；不能自动重试没有去重协议的 POST。
HTTP/1.1 的 body 可能按块到达，不能把一次 `data` 事件当完整 JSON。

## 操作：建立可运行的 server.mjs

分页使用 `limit` 与 `offset`，固定按 id 升序；最大每页 20 条。
offset 简单但并发插删会导致重复或遗漏，稳定游标见全栈契约章。

```js [server.mjs]
import { createServer } from 'node:http';

const tasks = new Map();
let nextId = 1;
function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
function send(res, status, data, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(status === 204 ? undefined : JSON.stringify(data));
}
function integer(value, fallback, min, max) {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) fail(400, 'invalid pagination');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    fail(400, 'invalid pagination');
  }
  return number;
}
async function body(req) {
  const type = req.headers['content-type']?.split(';')[0].trim();
  if (type !== 'application/json') fail(415, 'JSON required');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) fail(413, 'body too large');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { fail(400, 'invalid JSON'); }
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/tasks') {
      if (req.method === 'GET') {
        const limit = integer(url.searchParams.get('limit'), 10, 1, 20);
        const offset = integer(url.searchParams.get('offset'), 0, 0, 100000);
        const all = Array.from(tasks.values());
        return send(res, 200, { data: all.slice(offset, offset + limit),
          page: { limit, offset, total: all.length } });
      }
      if (req.method === 'POST') {
        const input = await body(req);
        if (!input || Array.isArray(input) || typeof input.title !== 'string'
          || !input.title.trim() || input.title.trim().length > 100) {
          fail(422, 'title must contain 1-100 characters');
        }
        const task = { id: nextId++, title: input.title.trim() };
        tasks.set(task.id, task);
        return send(res, 201, { data: task }, {
          Location: `/api/tasks/${task.id}`,
        });
      }
      return send(res, 405, { error: 'method not allowed' }, { Allow: 'GET, POST' });
    }
    const match = /^\/api\/tasks\/([1-9]\d*)$/.exec(url.pathname);
    if (!match) fail(404, 'not found');
    const id = Number(match[1]);
    if (!Number.isSafeInteger(id)) fail(400, 'invalid id');
    if (!['GET', 'DELETE'].includes(req.method)) {
      return send(res, 405, { error: 'method not allowed' }, { Allow: 'GET, DELETE' });
    }
    const task = tasks.get(id);
    if (!task) fail(404, 'not found');
    if (req.method === 'GET') return send(res, 200, { data: task });
    tasks.delete(id);
    send(res, 204);
  } catch (error) {
    const status = error.status ?? 500;
    if (status === 500) console.error(error.message);
    if (!res.destroyed) send(res, status, {
      error: status === 500 ? 'internal error' : error.message,
    });
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(3000, '127.0.0.1', () => console.log('http://127.0.0.1:3000'));
server.on('error', error => { console.error(error.code); process.exitCode = 1; });
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
```

## 效果验证

第一个终端运行 `node server.mjs`，第二个终端执行：

```sh
curl -i -H 'Content-Type: application/json' -d '{"title":"learn HTTP"}' http://127.0.0.1:3000/api/tasks
curl -i 'http://127.0.0.1:3000/api/tasks?limit=1&offset=0'
curl -i -H 'Content-Type: application/json' -d '{' http://127.0.0.1:3000/api/tasks
curl -i -X DELETE http://127.0.0.1:3000/api/tasks/1
curl -i -X DELETE http://127.0.0.1:3000/api/tasks/1
curl -i -X PUT http://127.0.0.1:3000/api/tasks
```

全新进程下依次预期：201 且 Location 为 `/api/tasks/1`；
200 且 data 长度 1、page.total 为 1；400；204 空 body；404；405。
`curl -i` 同时显示状态与头，便于发现“JSON 写成功但状态错”的问题。
重启后集合为空：内存生命周期与进程相同，不是持久化数据库。
超限读取可能在流销毁后表现为连接关闭；生产入口还需代理限额与超时。

## 常见错误

| 现象 | 排查 |
| --- | --- |
| JSON 请求得到 415 | 加 Content-Type，不能只写 Accept |
| curl 中 `&` 被解释 | 查询 URL 用引号包住 |
| 返回两次响应 | 每个分支 return；end 后不能再写头 |
| 删除后解析 JSON 失败 | 204 无 body，客户端不要调用 json |
| offset 页内容变化 | 插删会移动位置，改用稳定排序的游标 |
| POST 超时后多一条记录 | 超时结果未知，不能盲目重复提交 |

## 标准练习

1. 添加 PUT 单条整体替换，仅允许 title。
   验收：连续两次同一 PUT 不增加资源数量，空 title 返回 422。
2. 创建三条任务后请求 `limit=2&offset=2`。
   验收：只得到第三条，total 为 3；`limit=0` 返回 400。
3. 对不存在路径用 POST，对集合用 PATCH。
   验收：前者 404，后者 405 且 Allow 为 `GET, POST`。
4. 整理接口表，把成功、无效 JSON、资源不存在分别写成断言。
   验收：不只检查 body，也检查 status、Location 和 204 空体。

## 官方来源与下一步

- [Node HTTP API](https://nodejs.org/download/release/v22.13.0/docs/api/http.html)
- [HTTP 语义 RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html)
- [Fetch 的响应处理](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)

下一章：[Express 5 中间件](../express/middleware)。
