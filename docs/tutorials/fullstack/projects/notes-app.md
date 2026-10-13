---
title: 全栈项目：持久化笔记应用
description: 用 Node 22.13+、内置 SQLite 与原生浏览器 JavaScript 完成增删改查、异常反馈与重启验收。
---

# 全栈项目：持久化笔记应用

## 目标与运行边界

完成“表单 → API 校验 → SQLite → 刷新列表”闭环，无依赖；先读 [SQLite](../../backend/database/sqlite)与 [HTTP](../../backend/http/rest)。
**本项目不含登录、会话或用户隔离**；认证实现见 [认证章](../../backend/auth/sessions)。
只绑定本机，不能原样暴露公网；Node 22.13+ SQLite 无需开关，仍有实验 API 警告。

```sh
mkdir notes-lab
cd notes-lab
node --version
```

## 契约与安全机制

资源为 `{id,title,text}`；title 去空白后 1–80 字符，text 0–2000 字符；GET 返回 data，POST 返回 201 与 Location，PUT 整体替换。
DELETE 返回 204，无 JSON；异常统一 `{error:string}`，坏 JSON 为 400，字段错为 422。
数据库与网页放同目录，但服务仅允许 `/` 和 `/index.html`，不会暴露 `.db`。
相对 fetch 同源访问无需 CORS；即使无 Cookie 身份，写入也只接受固定 Origin。
服务端校验保护数据、SQL 绑定防注入、textContent 防储存型 XSS；长度按 JS UTF-16 单元计。

## 操作：两个完整文件

::: code-group
```js [server.mjs]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
const origin = 'http://127.0.0.1:3005';
const html = await readFile(new URL('./index.html', import.meta.url));
const db = new DatabaseSync(fileURLToPath(new URL('./notes.db', import.meta.url)));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
  CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY, title TEXT NOT NULL, text TEXT NOT NULL) STRICT;`);
const list = db.prepare('SELECT * FROM notes ORDER BY id DESC');
const get = db.prepare('SELECT * FROM notes WHERE id=?');
const add = db.prepare('INSERT INTO notes(title,text) VALUES(?,?)');
const put = db.prepare('UPDATE notes SET title=?,text=? WHERE id=?');
const del = db.prepare('DELETE FROM notes WHERE id=?');
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function send(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(status === 204 ? undefined : JSON.stringify(data));
}
async function input(req) {
  if (req.headers.origin !== origin) fail(403, 'invalid origin');
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') fail(415, 'JSON required');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) fail(413, 'body too large');
    chunks.push(chunk);
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { fail(400, 'invalid JSON'); }
  if (!value || Array.isArray(value) || typeof value !== 'object'
    || Object.keys(value).some(k => !['title', 'text'].includes(k))
    || typeof value.title !== 'string' || !value.title.trim() || value.title.trim().length > 80
    || typeof value.text !== 'string' || value.text.length > 2000) fail(422, 'invalid title or text');
  return { title: value.title.trim(), text: value.text };
}
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, origin).pathname;
    if (req.method === 'GET' && ['/', '/index.html'].includes(path)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(html);
    }
    if (path === '/api/notes' && req.method === 'GET') return send(res, 200, { data: list.all() });
    if (path === '/api/notes' && req.method === 'POST') {
      const value = await input(req);
      const id = Number(add.run(value.title, value.text).lastInsertRowid);
      return send(res, 201, { data: get.get(id) }, { Location: `/api/notes/${id}` });
    }
    const match = /^\/api\/notes\/([1-9]\d*)$/.exec(path);
    if (!match) fail(404, 'not found');
    const id = Number(match[1]);
    if (!Number.isSafeInteger(id)) fail(400, 'invalid id');
    if (!['GET', 'PUT', 'DELETE'].includes(req.method)) {
      return send(res, 405, { error: 'method not allowed' }, { Allow: 'GET, PUT, DELETE' });
    }
    if (!get.get(id)) fail(404, 'not found');
    if (req.method === 'GET') return send(res, 200, { data: get.get(id) });
    if (req.method === 'PUT') {
      const value = await input(req);
      if (!put.run(value.title, value.text, id).changes) fail(404, 'not found');
      return send(res, 200, { data: get.get(id) });
    }
    if (req.headers.origin !== origin) fail(403, 'invalid origin');
    del.run(id);
    send(res, 204);
  } catch (error) {
    if (!error.status) console.error('request failed:', error.code ?? error.message);
    if (!res.destroyed) send(res, error.status ?? 500, { error: error.status ? error.message : 'internal error' });
  }
});
server.listen(3005, '127.0.0.1', () => console.log(origin));
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.on('error', error => { console.error(error.code); db.close(); process.exitCode = 1; });
function stop() { server.close(() => db.close()); }
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
```

```html [index.html]
<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>本地笔记</title></head><body><h1>本地笔记</h1>
<form id="editor">
  <label>标题 <input id="title" required maxlength="80"></label>
  <label>正文 <textarea id="text" maxlength="2000"></textarea></label>
  <button id="save">保存新笔记</button>
  <button id="cancel" type="button">取消编辑</button>
</form>
<button id="refresh" type="button">刷新列表</button>
<p id="status" role="status" aria-live="polite"></p>
<ul id="notes"></ul>
<script type="module">
const editor = document.querySelector('#editor');
const title = document.querySelector('#title'), text = document.querySelector('#text');
const status = document.querySelector('#status'), notes = document.querySelector('#notes');
const save = document.querySelector('#save');
let editingId = null, busy = false;
async function api(path = '', method = 'GET', value) {
  const response = await fetch(`/api/notes${path}`, {
    method, headers: value ? { 'Content-Type': 'application/json' } : {},
    body: value ? JSON.stringify(value) : undefined,
  });
  if (response.status === 204) return null;
  const result = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${result.error}`);
  return result.data;
}
function reset() { editingId = null; editor.reset(); save.textContent = '保存新笔记'; }
async function load() {
  const data = await api();
  notes.replaceChildren();
  for (const note of data) {
    const li = document.createElement('li'), content = document.createElement('p');
    content.textContent = `${note.title}: ${note.text}`;
    const edit = document.createElement('button'), remove = document.createElement('button');
    edit.textContent = '编辑'; remove.textContent = '删除';
    edit.onclick = () => {
      if (busy) return;
      editingId = note.id; title.value = note.title; text.value = note.text;
      save.textContent = '保存修改'; title.focus();
    };
    remove.onclick = () => perform(async () => {
      await api(`/${note.id}`, 'DELETE');
      if (editingId === note.id) reset();
      await load();
    });
    li.append(content, edit, remove); notes.append(li);
  }
}
async function perform(action) {
  if (busy) return;
  busy = true; status.textContent = '处理中';
  document.querySelectorAll('button,input,textarea').forEach(el => el.disabled = true);
  try { await action(); status.textContent = '操作完成'; }
  catch (error) { status.textContent = `失败：${error.message}；写入结果未知时先刷新确认，勿直接重交。`; }
  finally {
    busy = false;
    document.querySelectorAll('button,input,textarea').forEach(el => el.disabled = false);
  }
}
editor.onsubmit = event => {
  event.preventDefault();
  perform(async () => {
    await api(editingId === null ? '' : `/${editingId}`, editingId === null ? 'POST' : 'PUT', { title: title.value, text: text.value });
    reset(); await load();
  });
};
document.querySelector('#cancel').onclick = reset;
document.querySelector('#refresh').onclick = () => perform(load);
perform(load);
</script></body></html>
```
:::

## 效果验证与重启验收

执行 `node server.mjs`，浏览器打开 `http://127.0.0.1:3005`，不能双击 HTML。
新建“第一条/持久化测试”，编辑正文为“已修改”：同一 id 更新，数量不增加。
Ctrl+C 后重启刷新仍显示“已修改”；删除后再重启仍为空。
输入 `<img src=x onerror=alert(1)>` 显示原文；停服务提交显示失败并保留表单，恢复后先刷新确认。

```sh
curl -i -H 'Origin: http://127.0.0.1:3005' -H 'Content-Type: application/json' -d '{"title":"","text":"x"}' http://127.0.0.1:3005/api/notes
curl -i -H 'Origin: http://127.0.0.1:3005' -H 'Content-Type: application/json' -d '{' http://127.0.0.1:3005/api/notes
curl -i http://127.0.0.1:3005/notes.db
```

预期分别 422、400、404；没有一条新增记录。单条不存在时 GET/PUT/DELETE 为 404。

## 常见错误与边界
`file://` 无同源 API；错误端口会断连；Origin 用 localhost 为 403；超大 body 可能断连，生产需代理限额。
同步 SQL、全量列表、无版本锁有性能与覆盖风险；没有认证、限流、CSP、硬关闭期限，不代表公网安全。

## 标准练习
1. 覆盖新增/修改/删除/重启。验收：记录 id、status 与重启前后结果。
2. 增加空列表文案。验收：只有 data 为空时显示，不把网络失败当空集合。
3. 接入认证章并改表存 owner。验收：服务器从 session 取 owner，两账号不能互改。
4. 为编辑增加版本号。验收：旧版本 PUT 返回 409，不静默覆盖另一个窗口的修改。

## 官方来源与下一步
- [Node SQLite](https://nodejs.org/download/release/v22.13.0/docs/api/sqlite.html)
- [Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)
- [textContent](https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent)
下一章：[契约与可靠请求](../contracts/reliability)。
