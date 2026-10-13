---
title: 认证、服务器会话、归属授权与 CSRF
description: 用 scrypt、随机盐、HttpOnly Cookie 和服务器 session 构建可运行的教学认证服务。
---

# 认证、服务器会话、归属授权与 CSRF

## 学习目标与准备

认证回答“你是谁”，授权回答“这条记录是否属于你”；登录不是管理员权限。
本例 Node 22.13+、无依赖，注册创建私有笔记，支持登录、读取、删除、退出；数据全在内存，重启清空。

```sh
mkdir sessions-lab
cd sessions-lab
node --version
```

## 机制：密码不是可解密保存的秘密

scrypt 是带成本参数的密码派生算法，随机盐让相同密码产生不同结果；盐不需保密，应和算法版本、参数、hash 一起保存。
本例每个用户用 16 字节随机盐、N=32768、r=8、p=1，输出 64 字节。
这组参数只用于实验；生产按安全指南、硬件、并发预算评估并支持升级。
使用异步 scrypt 避免直接阻塞 JavaScript，但线程池与内存仍会耗尽，必须限流。
`timingSafeEqual` 比较等长 Buffer；长度不等会抛错，先验证存储格式。
不存在的用户也计算 dummy hash，减少明显的账号枚举时间差，不保证全链路恒时。

Cookie 只是携带随机 session id；服务器保存用户、过期时间和 CSRF token。
HttpOnly 禁止脚本读 Cookie，不能阻止 XSS 以用户身份发请求。
SameSite=Lax 限制部分跨站携带行为，不等于同源限制，也不保证挡住同站攻击。
Secure 限制 HTTPS 传输；开发 HTTP 不设置，生产必须 HTTPS 且设置 Secure。
不设置 Domain 是 host-only；Path=/ 不是资源授权，Cookie 也不是密码保险箱。
浏览器自动携带 Cookie 会产生 CSRF：恶意页面诱使受害者发写请求。
本例写请求同时核对固定 Origin 和 session CSRF token，登录也核对 Origin。
不信任 Host 来生成可信 origin；curl 能伪造 Origin，因此它不是身份凭证。

## 操作：完整 server.mjs

::: code-group
```js [server.mjs]
import { createServer } from 'node:http';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const secure = process.env.NODE_ENV === 'production';
const origin = process.env.APP_ORIGIN ?? 'http://127.0.0.1:3004';
if (secure && new URL(origin).protocol !== 'https:') throw new Error('HTTPS origin required');
const users = new Map(), sessions = new Map(), notes = new Map();
let nextId = 1;
const dummy = { salt: randomBytes(16) };
dummy.hash = await derive('not-a-real-password', dummy.salt, 64, options);
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function equal(a, b) { return a.length === b.length && timingSafeEqual(a, b); }
function sidOf(req) {
  return /(?:^|;\s*)sid=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
}
function cookie(res, sid, age) {
  res.setHeader('Set-Cookie', `sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`);
}
function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(status === 204 ? undefined : JSON.stringify(data));
}
async function body(req) {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') fail(415, 'JSON required');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) fail(413, 'body too large');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { fail(400, 'invalid JSON'); }
}
function account(input) {
  if (!input || typeof input.name !== 'string' || !/^[a-z0-9]{3,20}$/.test(input.name)
    || typeof input.password !== 'string' || input.password.length < 12
    || input.password.length > 128 || Object.keys(input).some(k => !['name', 'password'].includes(k))) {
    fail(422, 'name: 3-20 lowercase letters/digits; password: 12-128 characters');
  }
  return input;
}
function session(req) {
  const sid = sidOf(req), value = sessions.get(sid);
  if (!value || value.expires <= Date.now()) {
    sessions.delete(sid);
    fail(401, 'login required');
  }
  return value;
}
function csrf(req, value) {
  const token = Buffer.from(req.headers['x-csrf-token'] ?? '');
  if (!equal(token, Buffer.from(value.csrf))) fail(403, 'invalid CSRF token');
}
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, origin).pathname;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== origin) {
      fail(403, 'invalid origin');
    }
    if (req.method === 'POST' && path === '/api/register') {
      const input = account(await body(req));
      if (users.has(input.name)) fail(409, 'name unavailable');
      const salt = randomBytes(16);
      const hash = await derive(input.password, salt, 64, options);
      if (users.has(input.name)) fail(409, 'name unavailable');
      users.set(input.name, { salt, hash });
      const note = { id: nextId++, owner: input.name, text: 'private note' };
      notes.set(note.id, note);
      return send(res, 201, { noteId: note.id });
    }
    if (req.method === 'POST' && path === '/api/login') {
      const input = account(await body(req));
      const user = users.get(input.name);
      const saved = user ?? dummy;
      const hash = await derive(input.password, saved.salt, 64, options);
      if (!equal(hash, saved.hash) || !user) fail(401, 'invalid credentials');
      sessions.delete(sidOf(req));
      const sid = randomBytes(32).toString('hex');
      const token = randomBytes(32).toString('hex');
      sessions.set(sid, { user: input.name, csrf: token, expires: Date.now() + 600000 });
      cookie(res, sid, 600);
      return send(res, 200, { csrf: token });
    }
    if (req.method === 'GET' && path === '/api/session') {
      const value = session(req);
      return send(res, 200, { user: value.user, csrf: value.csrf });
    }
    if (req.method === 'POST' && path === '/api/logout') {
      const value = session(req);
      csrf(req, value);
      sessions.delete(sidOf(req));
      cookie(res, '', 0);
      return send(res, 204);
    }
    const match = /^\/api\/notes\/([1-9]\d*)$/.exec(path);
    if (match && ['GET', 'DELETE'].includes(req.method)) {
      const value = session(req);
      const id = Number(match[1]);
      if (!Number.isSafeInteger(id)) fail(400, 'invalid id');
      const note = notes.get(id);
      if (!note || note.owner !== value.user) fail(404, 'not found');
      if (req.method === 'GET') return send(res, 200, { data: note });
      csrf(req, value);
      notes.delete(id);
      return send(res, 204);
    }
    fail(404, 'not found');
  } catch (error) {
    if (!res.destroyed) send(res, error.status ?? 500, {
      error: error.status ? error.message : 'internal error',
    });
  }
});
const cleanup = setInterval(() => {
  for (const [sid, value] of sessions) if (value.expires <= Date.now()) sessions.delete(sid);
}, 60000);
cleanup.unref();
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(3004, '127.0.0.1', () => console.log(origin));
server.on('error', error => { console.error(error.code); process.exitCode = 1; });
function stop() { clearInterval(cleanup); server.close(); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
```
:::

## 效果验证

终端一运行 `node server.mjs`；全新进程中，终端二执行：
以下密码是明显的教学样例，不是真实凭据；不要将真实密码放入命令历史。

```sh
curl -i -H 'Origin: http://127.0.0.1:3004' -H 'Content-Type: application/json' -d '{"name":"alice","password":"example-only-123"}' http://127.0.0.1:3004/api/register
curl -s -c alice.cookies -H 'Origin: http://127.0.0.1:3004' -H 'Content-Type: application/json' -d '{"name":"alice","password":"example-only-123"}' http://127.0.0.1:3004/api/login > login.json
TOKEN=$(node --input-type=module -e "import {readFileSync} from 'node:fs'; console.log(JSON.parse(readFileSync('login.json','utf8')).csrf)")
curl -i -b alice.cookies http://127.0.0.1:3004/api/notes/1
curl -i -X DELETE -b alice.cookies -H 'Origin: http://127.0.0.1:3004' http://127.0.0.1:3004/api/notes/1
curl -i -X DELETE -b alice.cookies -H 'Origin: http://127.0.0.1:3004' -H "X-CSRF-Token: $TOKEN" http://127.0.0.1:3004/api/notes/1
curl -i -X POST -b alice.cookies -H 'Origin: http://127.0.0.1:3004' -H "X-CSRF-Token: $TOKEN" http://127.0.0.1:3004/api/logout
curl -i -b alice.cookies http://127.0.0.1:3004/api/session
```

预期注册 201、读取 200、缺 token 删除 403、有 token 删除 204、退出 204、旧会话 401。
同源 fetch 自动带 Cookie；token 从 `/api/session` 取出放请求头。本服务没有网页，浏览器实验需另接同源界面。
注册 bob 用独立 cookie jar 登录，访问 alice 未删除的笔记为 404；换恶意 Origin，即使 Cookie/token 正确也为 403。
404 隐藏“他人的记录是否存在”，不是漏做授权；不要先返回笔记再前端判断 owner。

## 常见错误与生产限制

| 现象 | 原因/边界 |
| --- | --- |
| 一直 403 | 127.0.0.1 与 localhost 的 origin 不同，必须精确匹配 |
| JS 读不到 sid | HttpOnly 正在生效，不应改成可读 |
| 重启后 401 | 内存 session 丢失，生产需要共享持久化存储与过期清理 |
| Secure 在 HTTP 失效 | 本地不设置；公网 HTTPS 终止于可信代理时仍需 Secure |
| scrypt 很慢 | 它故意昂贵；要限流、并发上限和滥用防护，不降低成本掩盖负载 |

生产需 HTTPS/HSTS、密码泄漏检测与找回、持久化账号、限流、多实例撤销，以及防 XSS、登录枚举和请求洪泛。
记录算法版本与成本参数并支持重新派生；本例注册泄露用户名存在性，数据量无上限，未实现 MFA、审计和风控。

## 标准练习

1. 同密码注册 alice/bob。验收：盐/hash 不同，bob 不能读取 alice 的笔记。
2. 把过期时间改为两秒。验收：即使 Cookie 还在，服务器仍在过期后返回 401。
3. 携带旧 Cookie 连续登录两次。验收：id 轮换，旧 Cookie 失效，退出后新 Cookie 也失效。
4. 删除前省略 token 或换 Origin。验收：均 403，笔记仍能由所有者读取。

## 官方来源与下一步

- [Node crypto/scrypt/timingSafeEqual](https://nodejs.org/download/release/v22.13.0/docs/api/crypto.html)
- [Cookie 属性](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie)
- [OWASP 密码保存](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

下一步：[全栈笔记项目](../../fullstack/projects/notes-app)，该项目本身不含登录。
