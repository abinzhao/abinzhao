---
title: 契约与可靠请求：分页、取消、重试和幂等
description: 通过完整 client/server 示例划清响应校验、取消请求、有限重试与 POST 去重的边界。
---

# 契约与可靠请求：分页、取消、重试和幂等

## 学习目标与准备

先完成 [笔记项目](../projects/notes-app)，使用 Node 22.13+。
本章三个 `.mjs` 文件同目录，无依赖；客户端使用 Node 内置 fetch。
学习重点：网络错误不等于业务失败，超时不等于写入没有发生。

```sh
mkdir reliability-lab
cd reliability-lab
```

## 机制：schema 是双方共同执行的规则

契约不仅是 TypeScript 类型，还包括 URL、方法、状态、字段边界与错误格式。
网络数据运行时可能来自旧版本或错误代理，静态类型不能验证它。
本例 schema 用可执行断言表示：id 为正安全整数，title 为 1–80 字符。
列表固定按 id 升序，after 是最后一条已返回 id，limit 默认 2、最大 10。
新插入会出现在后续页；这是活动集合分页，不是某一时刻的完整快照。
分页需稳定唯一排序；游标按 title 而不带唯一 id 会遗漏相同标题。

GET 可有限重试网络故障和 503；400/422 等输入错误不能靠重试修复。
重试需次数上限、等待、抖动和总预算；Retry-After 可能是秒或 HTTP 日期。
示例只支持整数秒并上限一秒，生产必须定义超过预算时停止的行为。
AbortController 取消客户端等待，不承诺服务器事务回滚。
POST 去重键须绑定主体、操作、规范化 payload；同键不同内容返回 409。
持久化业务应把去重记录与写入放同一事务，缓存过期后不能保证不重复。
本例仅单进程内存、60 秒窗口，无登录；禁止宣传为“全局恰好一次”。

## 操作：共享契约与两端

::: code-group
```js [contract.mjs]
export function titleOf(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object'
    || Object.keys(value).some(key => key !== 'title')
    || typeof value.title !== 'string' || !value.title.trim()
    || value.title.trim().length > 80) throw new Error('invalid title');
  return value.title.trim();
}
export function rowOf(value) {
  if (!value || !Number.isSafeInteger(value.id) || value.id < 1
    || typeof value.title !== 'string' || value.title !== titleOf({ title: value.title })) {
    throw new Error('invalid row schema');
  }
  return value;
}
export function pageOf(value) {
  if (!value || !Array.isArray(value.data) || !value.page
    || !(value.page.nextCursor === null
      || (Number.isSafeInteger(value.page.nextCursor) && value.page.nextCursor > 0))) {
    throw new Error('invalid page schema');
  }
  value.data.forEach(rowOf);
  return value;
}
```

```js [server.mjs]
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { titleOf } from './contract.mjs';
const rows = [{ id: 1, title: 'one' }, { id: 2, title: 'two' }, { id: 3, title: 'three' }];
const keys = new Map();
let unavailable = true, nextId = 4;
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function send(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}
function number(value, fallback, min, max) {
  if (value === null) return fallback;
  const n = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < min || n > max) fail(400, 'invalid page');
  return n;
}
async function input(req) {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') fail(415, 'JSON required');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) fail(413, 'body too large');
    chunks.push(chunk);
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { fail(400, 'invalid JSON'); }
  try { return titleOf(value); } catch { fail(422, 'invalid title'); }
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/api/notes') fail(404, 'not found');
    if (req.method === 'GET') {
      if (unavailable) { unavailable = false; return send(res, 503, { error: 'try later' }, { 'Retry-After': '0' }); }
      const after = number(url.searchParams.get('after'), 0, 0, Number.MAX_SAFE_INTEGER);
      const limit = number(url.searchParams.get('limit'), 2, 1, 10);
      if (url.searchParams.get('slow') === '1') await sleep(300);
      if (res.destroyed) return;
      const found = rows.filter(row => row.id > after);
      const data = found.slice(0, limit);
      return send(res, 200, { data, page: { nextCursor: found.length > limit ? data.at(-1).id : null } });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' }, { Allow: 'GET, POST' });
    const key = req.headers['idempotency-key'];
    if (typeof key !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(key)) fail(400, 'key required');
    const title = await input(req);
    for (const [k, entry] of keys) if (entry.expires <= Date.now()) keys.delete(k);
    const saved = keys.get(key);
    if (saved) {
      if (saved.title !== title) fail(409, 'key reused with different input');
      return send(res, 201, { data: saved.row }, { 'Idempotency-Replayed': 'true' });
    }
    if (keys.size >= 100 || rows.length >= 1000) fail(503, 'capacity reached');
    const row = { id: nextId++, title };
    rows.push(row);
    keys.set(key, { title, row, expires: Date.now() + 60000 });
    send(res, 201, { data: row });
  } catch (error) {
    if (!res.destroyed) send(res, error.status ?? 500, { error: error.status ? error.message : 'internal error' });
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(3006, '127.0.0.1', () => console.log('http://127.0.0.1:3006'));
server.on('error', error => { console.error(error.code); process.exitCode = 1; });
process.on('SIGINT', () => server.close());
process.on('SIGTERM', () => server.close());
```

```js [client.mjs]
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { pageOf, rowOf } from './contract.mjs';
const base = 'http://127.0.0.1:3006/api/notes';
async function getPage(query, signal) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try {
      response = await fetch(`${base}${query}`, {
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(1000)]) : AbortSignal.timeout(1000),
      });
    } catch (error) {
      if (signal?.aborted || attempt === 2) throw error;
      await sleep(100 * 2 ** attempt + Math.random() * 50, undefined, { signal });
      continue;
    }
    if (response.status === 503 && attempt < 2) {
      const raw = response.headers.get('retry-after') ?? '';
      const delay = /^\d+$/.test(raw) ? Math.min(Number(raw) * 1000, 1000) : 100 * 2 ** attempt;
      await response.arrayBuffer();
      await sleep(delay, undefined, { signal });
      continue;
    }
    if (!response.ok) throw new Error(`GET failed: ${response.status}`);
    return pageOf(await response.json());
  }
}
let cursor = 0;
do {
  const page = await getPage(`?after=${cursor}&limit=2`);
  console.log('page ids:', page.data.map(row => row.id));
  cursor = page.page.nextCursor;
} while (cursor !== null);
const controller = new AbortController();
setTimeout(() => controller.abort(), 30);
try { await getPage('?slow=1', controller.signal); }
catch (error) { console.log('cancelled:', error.name); }
const key = randomUUID();
async function post(title) {
  const response = await fetch(base, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ title }) });
  const result = await response.json();
  if (response.ok) rowOf(result.data);
  console.log('POST:', response.status, result.data?.id ?? result.error);
}
await post('same request');
await post('same request');
await post('different request');
```
:::

## 效果验证

终端一 `node server.mjs`，终端二 `node client.mjs`；每轮验收重启服务器。
预期列表页 id 为 `[1,2]`、`[3]`，首次 503 在重试后恢复。
取消打印 `AbortError`；POST 依次输出 `201 4`、`201 4`、`409 key reused with different input`。
相同键只创建一条；换键会创建新记录，重启/60 秒后旧键不再保证去重。
`curl -i 'http://127.0.0.1:3006/api/notes?limit=0'` 应为 400，不自动纠正输入。

## 常见错误与标准练习

把所有异常统一重试会重试 schema 错误；把 abort 当回滚会误报写入失败。
不要并发改同一个分页 cursor；不要在每次重试生成新去重键。
1. 将超时调到 100ms，去掉手动 abort 再访问 slow。验收：最多三次请求，最终 TimeoutError。
2. 篡改响应 id 为字符串。验收：客户端 schema 拒绝，不再盲目渲染。
3. 同键并发提交两次。验收：单进程相同 id；记录多实例内存缓存不共享的风险。
4. 用 SQLite 实现持久化去重表。验收：重启后同键同主体同操作仍返回原结果。

## 官方来源与下一步

- [HTTP 幂等与 Retry-After](https://www.rfc-editor.org/rfc/rfc9110.html)
- [Node AbortSignal](https://nodejs.org/download/release/v22.13.0/docs/api/globals.html)
- [JSON Schema](https://json-schema.org/understanding-json-schema)

下一章：[部署与可观察性](../delivery/deploy-observe)。
