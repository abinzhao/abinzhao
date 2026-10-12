---
title: Node.js 全栈实战：带会话与 PostgreSQL 的任务应用
description: 将浏览器表单、HTTP API、会话授权和 PostgreSQL 持久化接到同一个可运行任务模型上。
type: tutorial
topic: node-fullstack
section: platform
order: 40
level: advanced
status: published
tags: [Node.js, PostgreSQL, 全栈, 鉴权]
prerequisites:
  - /tutorials/node-fullstack/http.html
  - /tutorials/node-fullstack/database.html
  - /tutorials/node-fullstack/production.html
comments: true
---

# Node.js 全栈实战：带会话与 PostgreSQL 的任务应用

前面三章分别练习协议、事务和会话。这一章把它们接成一个应用：浏览器登录后创建任务、查询自己的任务、切换完成状态；重启服务之后任务仍在数据库中。代码使用同一个任务结构和统一的错误契约，前端直接请求后端实际实现的接口。

## 范围与前置条件

使用 Node.js 22、PostgreSQL 17 和 `pg`。这是只监听本机的学习应用；两个演示用户使用同一个临时实验密码，目的在于验证会话和资源隔离。正式产品应有注册、逐用户密码哈希、会话共享存储、HTTPS、速率限制、备份与运维策略。不要用真实密码或真实业务数据库练习。

先理解 [HTTP 请求边界](./http.html)、[参数化 SQL 和事务](./database.html) 与 [会话和 CSRF](./production.html)。准备一个**新的**实验数据库 `tutorial_tasks`，安装与创建方式参见数据库章。应用连接角色必须能读写下面的表；不要连接已有生产环境。

项目目录如下，所有文件都由本章给出：

```text
task-lab/
  schema.sql
  server.mjs
  server.test.mjs
  public/
    index.html
    app.js
```

```bash
npm init -y
npm install pg
export PGHOST=127.0.0.1
export PGPORT=5432
export PGDATABASE=tutorial_tasks
export PGUSER=tutorial_app
```

本机数据库如要求认证，用环境提供实验身份密码，不写进源码。`pg` 的默认连接配置读取标准 PostgreSQL 环境变量。依赖锁文件应保留，另一台机器用 `npm ci` 复现。

## 统一数据与接口契约

任务公开结构为 `{ id, title, done }`，用户归属只由服务端会话确定。前端不传 `owner_id`。同一个资源查询同时包含任务编号和当前用户，查不到返回 404，避免泄露别人资源是否存在。

| 方法与路径 | 用途 | 条件 |
| --- | --- | --- |
| `GET /api/session` | 获得会话状态和 CSRF token | 匿名可用 |
| `POST /api/login` | 登录并轮换会话 | 原会话、来源和 CSRF 校验 |
| `POST /api/logout` | 退出 | 已登录与 CSRF 校验 |
| `GET /api/tasks` | 查询自己的任务 | 已登录 |
| `POST /api/tasks` | 创建任务 | 已登录、CSRF、合法标题 |
| `PATCH /api/tasks/:id` | 修改完成状态 | 同上，并验证归属 |

保存 `schema.sql`，仅在新的实验数据库执行一次：

```sql
CREATE TABLE app_users (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username text NOT NULL UNIQUE CHECK (length(username) BETWEEN 1 AND 40)
);
CREATE TABLE tasks (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id integer NOT NULL REFERENCES app_users(id),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  done boolean NOT NULL DEFAULT false
);
CREATE INDEX tasks_owner_id ON tasks(owner_id, id);
INSERT INTO app_users (username) VALUES ('learner'), ('editor');
```

```bash
psql -v ON_ERROR_STOP=1 -f schema.sql
```

这个脚本不删除旧数据，也不是自动迁移程序。再次运行表已存在的错误属于实验目录使用错误，换一个新数据库，不要随手删除未知的表。

## 后端：真实数据库与受控会话

保存 `server.mjs`。`createApp` 接受连接池、实验密码和允许来源，测试与启动入口共用同一实现。会话只保存在内存，重启后重新登录；任务存 PostgreSQL，重启不丢失。这两种状态的生命周期必须区分。

```javascript
import http from "node:http";
import { readFile } from "node:fs/promises";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import pg from "pg";

const derive = promisify(scrypt);
class Fault extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function createApp(db, password, origin = "http://127.0.0.1:3002") {
  if (typeof password !== "string" || password.length < 15 || password.length > 128) {
    throw new Error("Use a local demo password of 15..128 characters");
  }
  const salt = randomBytes(16);
  const options = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
  const hash = await derive(password, salt, 64, options);
  const sessions = new Map();
  const ttl = 30 * 60 * 1000;
  let hashing = false;
  let attempts = 0;
  let windowStart = Date.now();
  const makeToken = () => randomBytes(32).toString("hex");
  const same = (a, b) => {
    if (typeof a !== "string" || typeof b !== "string") return false;
    const x = Buffer.from(a), y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  };
  function makeSession(user = null) {
    for (const [id, item] of sessions) {
      if (item.expires <= Date.now()) sessions.delete(id);
    }
    if (sessions.size >= 1000) throw new Fault(503, "Session capacity reached");
    const item = { id: makeToken(), csrf: makeToken(), user, expires: Date.now() + ttl };
    sessions.set(item.id, item);
    return item;
  }
  function getSession(req) {
    const values = (req.headers.cookie ?? "").split(";")
      .map((x) => x.trim()).filter((x) => x.startsWith("lab_session="));
    if (values.length !== 1) return null;
    const id = values[0].slice("lab_session=".length);
    const item = sessions.get(id);
    if (!item || item.expires <= Date.now()) { sessions.delete(id); return null; }
    return item;
  }
  const cookie = (id, age = ttl / 1000) =>
    `lab_session=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}`;
  function reply(res, status, value, extra = {}) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra,
    });
    res.end(JSON.stringify(value));
  }
  async function json(req) {
    if (req.headers["content-type"]?.split(";")[0].trim() !== "application/json" ||
        req.headers["content-encoding"]) throw new Fault(415, "Expected uncompressed JSON");
    const bytes = await new Promise((resolve, reject) => {
      const chunks = []; let size = 0; let failed = false;
      const fail = (error) => { if (!failed) { failed = true; reject(error); } };
      req.on("data", (chunk) => {
        if (failed) return;
        size += chunk.length;
        if (size > 16 * 1024) { req.pause(); fail(new Fault(413, "Body too large")); }
        else chunks.push(chunk);
      });
      req.on("error", () => fail(new Fault(400, "Read failed")));
      req.on("aborted", () => fail(new Fault(400, "Request aborted")));
      req.on("end", () => { if (!failed) resolve(Buffer.concat(chunks)); });
    });
    try {
      const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
      return value;
    } catch { throw new Fault(400, "Expected JSON object"); }
  }
  function only(value, keys) {
    if (Object.keys(value).some((key) => !keys.includes(key))) {
      throw new Fault(422, "Unexpected field");
    }
  }
  const server = http.createServer({ maxHeaderSize: 8192 }, async (req, res) => {
    try {
      const path = new URL(req.url, origin).pathname;
      if (req.method === "GET" && (path === "/" || path === "/app.js")) {
        const filename = path === "/" ? "index.html" : "app.js";
        const body = await readFile(new URL(`./public/${filename}`, import.meta.url));
        res.writeHead(200, {
          "Content-Type": path === "/" ? "text/html; charset=utf-8" : "text/javascript; charset=utf-8",
          "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
        });
        return res.end(body);
      }
      let current = getSession(req);
      if (path === "/api/session" && req.method === "GET") {
        current ??= makeSession();
        return reply(res, 200, { csrf: current.csrf, user: current.user },
          { "Set-Cookie": cookie(current.id) });
      }
      const known = ["/api/login", "/api/logout", "/api/tasks"].includes(path) ||
        /^\/api\/tasks\/[1-9]\d*$/.test(path);
      if (!known) throw new Fault(404, "Route not found");
      const expected = path === "/api/tasks" ? ["GET", "POST"] :
        path.startsWith("/api/tasks/") ? ["PATCH"] : ["POST"];
      if (!expected.includes(req.method)) {
        return reply(res, 405, { error: "Method not allowed" }, { Allow: expected.join(", ") });
      }
      if (req.method !== "GET" &&
          (!current || req.headers.origin !== origin ||
           !same(req.headers["x-csrf-token"], current.csrf))) {
        throw new Fault(403, "CSRF check failed");
      }
      if (path === "/api/login") {
        if (Date.now() - windowStart > 60000) { windowStart = Date.now(); attempts = 0; }
        if (++attempts > 20) throw new Fault(429, "Try later");
        const body = await json(req); only(body, ["username", "password"]);
        if (typeof body.username !== "string" || !/^[a-z]{1,40}$/.test(body.username) ||
            typeof body.password !== "string" || body.password.length < 15 ||
            body.password.length > 128) throw new Fault(422, "Invalid credentials format");
        if (hashing) throw new Fault(503, "Login busy");
        hashing = true;
        let valid;
        try { valid = timingSafeEqual(await derive(body.password, salt, 64, options), hash); }
        finally { hashing = false; }
        const result = await db.query("SELECT id, username FROM app_users WHERE username=$1", [body.username]);
        if (!valid || !result.rows[0]) throw new Fault(401, "Invalid credentials");
        sessions.delete(current.id);
        current = makeSession(result.rows[0]);
        return reply(res, 200, { csrf: current.csrf, user: current.user },
          { "Set-Cookie": cookie(current.id) });
      }
      if (!current?.user) throw new Fault(401, "Login required");
      if (path === "/api/logout") {
        sessions.delete(current.id);
        return reply(res, 200, { loggedOut: true }, { "Set-Cookie": cookie("", 0) });
      }
      if (path === "/api/tasks" && req.method === "GET") {
        const result = await db.query(
          "SELECT id,title,done FROM tasks WHERE owner_id=$1 ORDER BY id DESC LIMIT 100",
          [current.user.id],
        );
        return reply(res, 200, { items: result.rows });
      }
      const body = await json(req);
      if (path === "/api/tasks") {
        only(body, ["title"]);
        if (typeof body.title !== "string" || !body.title.trim() ||
            body.title.trim().length > 120 || body.title.includes("\u0000")) {
          throw new Fault(422, "Title must contain 1..120 characters");
        }
        const result = await db.query(
          "INSERT INTO tasks(owner_id,title) VALUES($1,$2) RETURNING id,title,done",
          [current.user.id, body.title.trim()],
        );
        return reply(res, 201, result.rows[0]);
      }
      only(body, ["done"]);
      if (typeof body.done !== "boolean") throw new Fault(422, "done must be boolean");
      const id = Number(path.split("/").at(-1));
      if (!Number.isSafeInteger(id) || id > 2147483647) throw new Fault(400, "Invalid task id");
      const result = await db.query(
        "UPDATE tasks SET done=$1 WHERE id=$2 AND owner_id=$3 RETURNING id,title,done",
        [body.done, id, current.user.id],
      );
      if (!result.rows[0]) throw new Fault(404, "Task not found");
      reply(res, 200, result.rows[0]);
    } catch (error) {
      if (res.headersSent || res.destroyed) return;
      const known = error instanceof Fault;
      if (!known) console.error("request failed", { kind: error.name });
      res.once("finish", () => req.destroy());
      reply(res, known ? error.status : 500,
        { error: known ? error.message : "Internal server error" }, { Connection: "close" });
    }
  });
  server.headersTimeout = 5000;
  server.requestTimeout = 10000;
  server.keepAliveTimeout = 5000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const password = process.env.DEMO_PASSWORD;
  delete process.env.DEMO_PASSWORD;
  const db = new pg.Pool({ max: 4, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
  db.on("error", () => console.error("idle database connection failed"));
  await db.query("SELECT 1");
  const server = await createApp(db, password);
  server.listen(3002, "127.0.0.1", () => console.log("Open http://127.0.0.1:3002"));
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 10000);
    server.close(async () => {
      try { await db.end(); process.exitCode = 0; }
      catch { process.exitCode = 1; }
      finally { clearTimeout(deadline); }
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
```

来源固定为本机地址，所以这里不需要 CORS。Cookie 使用 `HttpOnly`，脚本通过 `/api/session` 读取 CSRF token。写请求同时检查来源、CSRF 和登录状态。正式服务还需要 `Secure` cookie 与 HTTPS，不能直接把这份本地监听程序改成公网开放。

标题和完成状态都有应用校验，数据库还有独立约束。每次请求使用参数化 SQL；单条创建或更新已经是原子操作，涉及多表操作时再按事务章使用同一连接的事务。查询最多返回最近 100 条，这个教学上限不是完整分页功能。

## 前端：使用真实接口的状态与表单

保存 `public/index.html`，不需要构建工具即可由同一服务提供：

```html
<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>全栈任务实验</title>
<style>
  body { font: 16px system-ui; max-width: 680px; margin: 48px auto; padding: 0 20px; }
  input, button { font: inherit; min-height: 44px; padding: 6px 12px; }
  label { display: grid; gap: 6px; margin-bottom: 12px; }
  form { margin: 24px 0; }
  li { display: flex; align-items: center; gap: 16px; margin: 12px 0; }
  li span { flex: 1; overflow-wrap: anywhere; }
  #status { min-height: 24px; }
</style>
<main>
  <h1>全栈任务实验</h1>
  <p id="status" role="status" aria-live="polite"></p>
  <form id="login">
    <label>演示用户 <select name="username"><option>learner</option><option>editor</option></select></label>
    <label>本地实验密码 <input name="password" type="password" required minlength="15" maxlength="128"></label>
    <button>登录</button>
  </form>
  <section id="workspace" hidden>
    <p id="identity"></p>
    <button id="logout" type="button">退出</button>
    <form id="create">
      <label>任务标题 <input name="title" required maxlength="120"></label>
      <button>创建任务</button>
    </form>
    <ul id="tasks"></ul>
  </section>
</main>
<script type="module" src="/app.js"></script>
</html>
```

保存 `public/app.js`。所有文本通过 `textContent` 设置，不把标题拼成 HTML；非法 JSON、HTTP 错误和网络失败都进入可见提示。操作期间统一禁用按钮，避免本例出现重复提交；更复杂应用需要分别建模各操作状态。

```javascript
const $ = (selector) => document.querySelector(selector);
let session;
async function api(path, body, method = "POST") {
  const response = await fetch(path, body === undefined ? {} : {
    method, headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrf },
    body: JSON.stringify(body),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? `HTTP ${response.status}`);
  return value;
}
async function load() {
  const value = await api("/api/tasks");
  $("#tasks").replaceChildren();
  for (const task of value.items) {
    const item = document.createElement("li");
    const text = document.createElement("span");
    text.textContent = task.title;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = task.done ? "标为未完成" : "完成";
    button.setAttribute("aria-pressed", String(task.done));
    button.onclick = () => run(async () => {
      await api(`/api/tasks/${task.id}`, { done: !task.done }, "PATCH");
      await load();
    });
    item.append(text, button);
    $("#tasks").append(item);
  }
  if (!value.items.length) $("#status").textContent = "还没有任务，可以创建第一条。";
}
async function refresh() {
  session = await api("/api/session");
  $("#login").hidden = Boolean(session.user);
  $("#workspace").hidden = !session.user;
  if (session.user) {
    $("#identity").textContent = `当前用户：${session.user.username}`;
    await load();
  }
}
async function run(action) {
  const buttons = [...document.querySelectorAll("button")];
  buttons.forEach((button) => button.disabled = true);
  $("#status").textContent = "正在处理……";
  try { await action(); if ($("#status").textContent === "正在处理……") $("#status").textContent = "操作完成。"; }
  catch (error) { $("#status").textContent = error instanceof Error ? error.message : "请求失败"; }
  finally {
    document.querySelectorAll("button").forEach((button) => button.disabled = false);
  }
}
$("#login").onsubmit = (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const body = { username: data.get("username"), password: data.get("password") };
  event.currentTarget.reset();
  run(async () => { session = await api("/api/login", body); await refresh(); });
};
$("#create").onsubmit = (event) => {
  event.preventDefault();
  const title = new FormData(event.currentTarget).get("title");
  run(async () => { await api("/api/tasks", { title }); $("#create").reset(); await load(); });
};
$("#logout").onclick = () => run(async () => { await api("/api/logout", {}); await refresh(); });
run(refresh);
```

浏览器同源请求默认携带同源 cookie。Cookie、CSRF 和用户状态不是一个东西：有匿名 cookie 仍未登录；登录会轮换 cookie 与 token；退出之后先建立新匿名状态，再允许重新登录。刷新页面时从接口恢复身份，不能只靠内存布尔值假装仍然登录。

## 启动与浏览器验收

在 Bash 中输入只用于实验的密码。`node` 前台运行时，最后的 `unset` 要等进程停止才执行；在其他终端测试。不要把真实密码放进命令历史。

```bash
read -rs DEMO_PASSWORD
export DEMO_PASSWORD
node server.mjs
unset DEMO_PASSWORD
```

打开 `http://127.0.0.1:3002`，按以下顺序验收：

1. 用 `learner` 登录，创建“学习全栈”，应出现真实任务。
2. 点击“完成”，刷新页面，状态应仍是完成。
3. 退出后用 `editor` 登录，列表应为空，不能看到 learner 的任务。
4. 重新用 learner 登录，任务应还在。
5. 停止并重启 Node，重新登录，任务仍可查询；会话重新登录是预期。
6. 停止数据库后请求应显示错误，恢复数据库后重试应恢复。

输入空标题、只含空白的标题或直接调用 API 传入 `owner_id` 应被拒绝。前端原生校验提高体验，直接 API 测试才能证明服务端没有只依赖浏览器校验。

## 真实数据库的集成测试

保存 `server.test.mjs`。只在专用实验数据库运行：测试创建带随机名称的用户与任务，并在结束时仅清理本次创建的记录。不使用已有用户的数据，也不执行清空表。

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { createApp } from "./server.mjs";

test("browser contract persists tasks and isolates two users", async (t) => {
  const db = new pg.Pool({ max: 2, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
  const names = [0, 1].map(() => "test" + [...randomBytes(12)].map((x) => String.fromCharCode(97 + x % 26)).join(""));
  const users = await db.query(
    "INSERT INTO app_users(username) VALUES($1),($2) RETURNING id,username", names,
  );
  const password = "local-fixture-password-only";
  let server;
  t.after(async () => {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    await db.query("DELETE FROM tasks WHERE owner_id=ANY($1::int[])", [users.rows.map((x) => x.id)]);
    await db.query("DELETE FROM app_users WHERE id=ANY($1::int[])", [users.rows.map((x) => x.id)]);
    await db.end();
  });
  server = await createApp(db, password);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  let base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, auth, body, method = "POST") {
    const headers = { Cookie: auth?.cookie ?? "" };
    if (body !== undefined) Object.assign(headers, {
      Origin: "http://127.0.0.1:3002", "Content-Type": "application/json",
      "X-CSRF-Token": auth?.csrf ?? "",
    });
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : method,
      headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, value: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0] };
  }
  async function login(username) {
    const anonymous = await request("/api/session");
    const result = await request("/api/login",
      { cookie: anonymous.cookie, csrf: anonymous.value.csrf }, { username, password });
    assert.equal(result.status, 200);
    assert.notEqual(result.cookie, anonymous.cookie);
    return { cookie: result.cookie, csrf: result.value.csrf };
  }
  const alice = await login(names[0]);
  const bob = await login(names[1]);
  const created = await request("/api/tasks", alice, { title: "persistent task" });
  assert.equal(created.status, 201);
  const id = created.value.id;
  assert.equal((await request(`/api/tasks/${id}`, bob, { done: true }, "PATCH")).status, 404);
  assert.equal((await request("/api/tasks", alice, { title: " " })).status, 422);
  assert.equal((await request("/api/tasks", alice, { title: "\u0000" })).status, 422);
  assert.equal((await request("/api/tasks", { ...alice, csrf: "" }, { title: "x" })).status, 403);
  assert.equal((await request(`/api/tasks/${id}`, alice, { done: true }, "PATCH")).value.done, true);
  assert.equal((await request("/api/tasks", bob)).value.items.length, 0);
  await new Promise((resolve) => server.close(resolve));
  server = await createApp(db, password);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
  const again = await login(names[0]);
  const list = await request("/api/tasks", again);
  assert.equal(list.value.items[0].id, id);
  assert.equal(list.value.items[0].done, true);
  await request("/api/logout", again, {});
  assert.equal((await request("/api/tasks", again)).status, 401);
});
```

```bash
node --test server.test.mjs
```

它走真实 HTTP 和真实 SQL，能检查前后端共用的契约、越权拒绝、非法输入、CSRF、退出及重启持久性。浏览器 UI 仍要另外执行前一节的路径，集成测试通过不能证明表单、焦点和触控行为。

## 排错、练习与生产边界

`relation does not exist` 先检查数据库名称与 schema 是否执行；`password authentication failed` 检查实际连接身份；连接拒绝核对进程与端口。不要为了快速通过认证而对所有来源开放数据库。

HTTP 403 先检查当前 session、CSRF token 和实际 Origin。换会话后旧 token 必须失效；请求成功但列表为空时检查登录用户，而不是删掉 `owner_id` 条件。另一用户查不到资源是正确授权行为。

练习增加删除任务：先定义 `DELETE /api/tasks/:id` 契约，再复用方法、来源、CSRF、身份和归属检查。增加测试验证别人不能删除，删除后刷新仍不存在。添加多表审计时，用同一数据库连接包裹事务，再验证审计失败时任务更新回滚。

生产运行必须将每个用户的密码独立派生保存，会话存储要符合多进程与退出需求。TLS、限流、健康检查、日志、迁移与恢复方案需要部署环境配合。这里的完整闭环是本地任务应用；安全和运维实验帮助理解边界，不代表已经完成公网生产验收。

- [Node.js HTTP](https://nodejs.org/docs/latest-v22.x/api/http.html)
- [node-postgres 查询](https://node-postgres.com/features/queries)
- [PostgreSQL 约束](https://www.postgresql.org/docs/17/ddl-constraints.html)
- [MDN Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)
- [OWASP 会话管理](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
