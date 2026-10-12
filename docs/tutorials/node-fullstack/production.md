---
title: Node.js 服务交付：密码、Cookie 会话与优雅停机
description: 用 scrypt 和服务端会话理解鉴权、CSRF、CORS、错误隔离及部署边界。
type: tutorial
topic: node-fullstack
section: platform
order: 30
level: advanced
status: published
tags: [Node.js, 会话安全, CSRF, 部署]
prerequisites: [/tutorials/node-fullstack/database.html]
comments: true
---

# Node.js 服务交付：密码、Cookie 会话与优雅停机

服务交付包含两个不同问题：请求是否有权执行，以及进程能否在异常和升级时保持可控。前者需要密码处理、会话与权限，后者需要超时、错误隔离和停机流程。本篇用 Node.js 22 编写一个本机登录实验，再解释正式部署必须补齐的设施。示例不会因为加了密码就变成可直接上线的账户系统。

## 前置条件与安全目标

先阅读[数据库教程](/tutorials/node-fullstack/database.html)。准备 Node.js 22 和独立实验目录。本篇服务是独立的，不需要拼接前篇代码。实验只有 `learner` 一个账号，密码从进程环境注入，所有会话和笔记都在内存中；它仅演示原理，不提供注册、找回密码、多实例会话或完整审计。

本地 HTTP 使用不带 Secure 的实验 Cookie，因为回环 HTTP 无法模拟完整 HTTPS 部署。正式配置必须使用 HTTPS 外部来源、Secure Cookie 和可信反向代理，不能把这个本地例外复制到公网。接口不开放 CORS，浏览器页面应同源访问；终端请求仍能调用服务，CORS 从来不是认证系统。

## 核心原理：密码、会话和权限不是同一件事

密码不应明文入库，也不应只做一次快速 SHA 哈希。`scrypt` 通过时间和内存成本增加离线猜测代价，每个密码使用独立随机盐。验证时使用相同参数重新派生密钥，再用恒定时间比较。参数、盐和哈希可以一起存储，原密码不能存储；生产还应记录参数版本并支持登录时升级。

本例采用 `N=131072`、`r=8`、`p=1`，并显式设置内存上限。这是教学采用的 OWASP scrypt 参数组合，部署前仍要在目标资源额度下测量。异步接口避免阻塞 JavaScript 主线程，但仍占用线程池和大量内存，所以登录必须限速、限制同时派生数量，不能因为用了 `await` 就认为资源无限。

会话 Cookie 只保存随机标识，身份和过期时间由服务端掌握。登录成功后更换会话编号，防止会话固定；退出时删除服务端记录，过期后不再接受。`HttpOnly` 降低脚本读取 Cookie 的风险，`Secure` 约束传输，`SameSite` 限制部分跨站携带场景，但这些都不能取代业务授权，也不能消除 XSS 的全部影响。

CSRF 利用的是浏览器自动携带 Cookie 的行为。写操作除了验证会话，还验证来源和随机 CSRF token。Token 通过同源响应获得，由客户端在请求头中提交；不能只检查请求是否为 JSON 就宣称解决全部 CSRF。CORS 若以后开放，应使用固定可信来源、明确预检头部并设置 `Vary: Origin`，携带凭据时不得使用通配来源。

## 实操：完整的本机会话服务

保存为 `auth.mjs`。输入密码只在启动时派生一次用于实验验证，随后移除环境变量。生产应在受控账户创建流程中存储哈希，而不是依靠环境变量保存真实用户密码。下面的全局速率限制适合单账号本地实验，不是多用户生产限流方案。

```javascript
import http from "node:http";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
const production = process.env.NODE_ENV === "production";
const origin = process.env.APP_ORIGIN ?? "http://127.0.0.1:3001";
const parsedOrigin = new URL(origin);
if (parsedOrigin.origin !== origin ||
    (production && parsedOrigin.protocol !== "https:") ||
    (!production && origin !== "http://127.0.0.1:3001")) {
  throw new Error("Invalid APP_ORIGIN");
}
const password = process.env.DEMO_PASSWORD;
delete process.env.DEMO_PASSWORD;
if (!password || password.length < 15 || password.length > 128) {
  throw new Error("Provide a local demo password of 15..128 characters");
}
const options = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const salt = randomBytes(16);
const stored = await derive(password, salt, 64, options);
const sessions = new Map();
const ttl = 15 * 60 * 1000;
const cookieName = production ? "__Host-session" : "local_session";
let draining = false;
let hashing = false;
let windowStart = Date.now();
let attempts = 0;
let note = "";

class Fault extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function token() { return randomBytes(32).toString("hex"); }
function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function cookie(id, age = ttl / 1000) {
  return `${cookieName}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}` +
    (production ? "; Secure" : "");
}
function session(req) {
  const values = (req.headers.cookie ?? "").split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${cookieName}=`));
  if (values.length !== 1) return undefined;
  const id = values[0].slice(cookieName.length + 1);
  const record = sessions.get(id);
  if (!record || record.expires <= Date.now()) {
    sessions.delete(id);
    return undefined;
  }
  return { id, ...record };
}
function createSession(user = null) {
  for (const [id, item] of sessions) {
    if (item.expires <= Date.now()) sessions.delete(id);
  }
  if (sessions.size >= 1000) throw new Fault(503, "Session capacity reached");
  const record = { user, csrf: token(), expires: Date.now() + ttl };
  const id = token();
  sessions.set(id, record);
  return { id, ...record };
}
function reply(res, status, data, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  if (req.headers["content-type"]?.split(";")[0].trim() !== "application/json" ||
      req.headers["content-encoding"]) {
    throw new Fault(415, "Expected uncompressed JSON");
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let failed = false;
    const fail = (error) => { failed = true; reject(error); };
    req.on("data", (chunk) => {
      if (failed) return;
      size += chunk.length;
      if (size > 4096) {
        req.pause();
        fail(new Fault(413, "Body too large"));
      } else chunks.push(chunk);
    });
    req.on("error", () => fail(new Fault(400, "Body error")));
    req.on("aborted", () => fail(new Fault(400, "Body aborted")));
    req.on("end", () => {
      if (failed) return;
      try {
        const body = JSON.parse(new TextDecoder("utf-8", { fatal: true })
          .decode(Buffer.concat(chunks)));
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          throw new Error("object required");
        }
        resolve(body);
      } catch { fail(new Fault(400, "Invalid JSON object")); }
    });
  });
}

const server = http.createServer({ maxHeaderSize: 8192 }, async (req, res) => {
  try {
    if (draining) throw new Fault(503, "Service draining");
    const url = new URL(req.url, origin);
    if (req.method === "GET" && url.pathname === "/health") {
      return reply(res, 200, { status: "ok" });
    }
    if (req.method === "GET" && url.pathname === "/session") {
      const current = session(req) ?? createSession();
      return reply(res, 200,
        { csrf: current.csrf, authenticated: current.user !== null },
        { "Set-Cookie": cookie(current.id) });
    }
    if (!["/login", "/note", "/logout"].includes(url.pathname)) {
      throw new Fault(404, "Route not found");
    }
    if (req.method !== "POST") {
      return reply(res, 405, { error: "Method not allowed" }, { Allow: "POST" });
    }
    const current = session(req);
    if (!current || req.headers.origin !== origin ||
        !same(req.headers["x-csrf-token"], current.csrf)) {
      throw new Fault(403, "CSRF check failed");
    }
    if (url.pathname === "/login") {
      if (Date.now() - windowStart > 60_000) {
        windowStart = Date.now(); attempts = 0;
      }
      if (++attempts > 10) throw new Fault(429, "Try later");
      const body = await readBody(req);
      if (Object.keys(body).some((key) => !["user", "password"].includes(key)) ||
          typeof body.user !== "string" || typeof body.password !== "string" ||
          body.user.length > 64 || body.password.length < 15 ||
          body.password.length > 128) {
        throw new Fault(422, "Invalid credentials format");
      }
      if (hashing) throw new Fault(503, "Login busy");
      hashing = true;
      let valid;
      try {
        const candidate = await derive(body.password, salt, 64, options);
        valid = timingSafeEqual(candidate, stored) && body.user === "learner";
      } finally { hashing = false; }
      if (!valid) throw new Fault(401, "Invalid credentials");
      sessions.delete(current.id);
      const next = createSession("learner");
      return reply(res, 200, { csrf: next.csrf, authenticated: true },
        { "Set-Cookie": cookie(next.id) });
    }
    if (current.user !== "learner") throw new Fault(401, "Login required");
    if (url.pathname === "/logout") {
      sessions.delete(current.id);
      return reply(res, 200, { loggedOut: true }, { "Set-Cookie": cookie("", 0) });
    }
    const body = await readBody(req);
    if (Object.keys(body).some((key) => key !== "text") ||
        typeof body.text !== "string" || body.text.length > 200) {
      throw new Fault(422, "Expected text up to 200 characters");
    }
    note = body.text;
    reply(res, 200, { saved: true, length: note.length });
  } catch (error) {
    if (res.destroyed || res.headersSent) return;
    if (!(error instanceof Fault)) console.error("request failed", error.name);
    reply(res, error instanceof Fault ? error.status : 500,
      { error: error instanceof Fault ? error.message : "Internal error" },
      { Connection: "close" });
    res.on("finish", () => req.destroy());
  }
});
server.headersTimeout = 5000;
server.requestTimeout = 10_000;
server.keepAliveTimeout = 5000;
server.listen(3001, "127.0.0.1", () => console.log("Local auth server ready"));

function shutdown() {
  if (draining) return;
  draining = true;
  const deadline = setTimeout(() => {
    server.closeAllConnections();
    process.exit(1);
  }, 10_000);
  server.close(() => {
    clearTimeout(deadline);
    sessions.clear();
    process.exitCode = 0;
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
```

## 预期检查：不要只检查登录成功

在 Bash 终端交互输入实验密码，启动服务后清除父终端变量。`read -s` 不回显输入；使用独立虚构密码，不使用真实账户密码。环境变量并不是秘密保险箱，同权限进程和运维工具可能看到它，正式系统应采用平台的秘密注入机制并避免输出环境。

```bash
read -rs DEMO_PASSWORD
export DEMO_PASSWORD
node auth.mjs
unset DEMO_PASSWORD
```

在同源页面的浏览器控制台执行以下代码，密码来自临时输入而非源码。先访问本机服务的 `/health` 页面再打开控制台；响应是 JSON 不影响同源调用。不要在不可信网站控制台粘贴包含凭据的代码。

```javascript
const first = await fetch("/session").then((r) => r.json());
const login = await fetch("/login", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-CSRF-Token": first.csrf },
  body: JSON.stringify({ user: "learner", password: prompt("Local demo password") }),
}).then((r) => r.json());
const saved = await fetch("/note", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-CSRF-Token": login.csrf },
  body: JSON.stringify({ text: "本机实验" }),
});
console.log(saved.status, await saved.json());
```

预期登录更换 Cookie，笔记保存返回 200。删掉 CSRF 头应返回 403；登录前写笔记应返回 401；复用登录前的 token 应失败；退出后原 Cookie 不再有效。测试登录成功后还要检查响应里的 token，不要只靠状态码判断身份已经建立。

## 将安全检查组织成回归

先把匿名、已登录、已退出和已过期作为不同状态，而不是只测一个成功账号。匿名状态获取 CSRF token 并不意味着已登录；登录后必须轮换会话和 token；退出后旧会话要失效；过期后需要重新建立状态。每次测试都应从明确初态开始，避免依赖上一条测试残留的 Cookie。

还应验证错误凭据返回相同的公开错误，不区分用户名存在与否。统一错误只能降低枚举信息，不代表完全阻止时序推测和暴力猜测；本例对所有合规输入派生一次密钥，并使用简单全局限速。正式系统需要分布式预算、按账号与来源限制，并考虑攻击者恶意触发锁定造成拒绝服务的风险。

授权检查应围绕资源拥有者，而不是只判断会话是否存在。一个用户登录后，不能通过修改笔记编号访问另一个用户的资源。查询语句应包含当前主体约束，拒绝路径也要有测试。隐藏前端按钮只是交互设计，服务端仍需独立授权，管理员操作更应有明确权限和审计。

Cookie 属性也需要在响应头层面验证。正式模式应出现 Secure、HttpOnly、Path 和预期 SameSite；使用 `__Host-` 前缀时不得设置 Domain。检查浏览器存储和实际请求，不要仅观察代码字符串。代理若错误缓存会话响应，可能将一个用户的状态交给另一个用户，因此响应禁止缓存，代理规则也要一致。

## CORS、CSRF 与页面内容的配合

当前服务不发送跨域允许头，陌生网站的浏览器脚本不能读取响应，但这不阻止终端程序或攻击者直接发请求。若前端部署到不同来源，必须明确开放哪个协议、域名和端口，预检允许哪些方法和请求头，是否允许凭据，并确保来源白名单不是任意反射。

CSRF token 用来约束携带 Cookie 的写操作，CORS 控制浏览器脚本读取跨域响应，二者职责不同。来源校验还能辅助拒绝跨站请求，但不应通过允许任意空来源来处理所有客户端。非浏览器客户端可使用单独认证契约，不要为了兼容它们降低浏览器会话的要求。

XSS 则可能在同源页面执行脚本，读取响应中的 CSRF token 并发起操作，因此会话和 CSRF 不能替代页面内容安全。渲染用户文本应使用转义或安全文本接口，不将笔记直接拼进 HTML。内容安全策略可以降低部分攻击面，但要与实际资源加载一致，并通过浏览器检查验证，不是复制一条头部就保证全部安全。

## 可观察性与事故恢复

生产事件应能关联到请求和部署版本，同时避免保存秘密。为登录失败、授权拒绝、资源饱和和停机超时建立不同事件类别，有助于判断是用户输错、攻击还是容量问题。日志权限、保存期限和外部日志平台的数据边界都需要明确，不能只在接口响应中隐藏秘密却在日志里全部输出。

停机失败时最终期限让进程退出非零，监管系统应识别异常结束并保留诊断。发布时先确认新实例可以接收业务，再逐步排空旧实例；回滚代码不保证数据库结构自动回滚。应提前演练会话存储故障、数据库不可用和代理超时，让响应与恢复步骤可预测，而不是事故发生后临时降低安全设置。

## 停机、排错与部署边界

优雅停机先停止接收新连接，再允许正在处理的请求结束，最后关闭数据库池和其他资源。真实服务应在 `server.close` 完成后等待 `pool.end()`，并保留最终期限；不要在收到信号时立即退出而中断提交。平台的终止宽限期必须长于应用排空预算，健康检查也应在排空时移除实例。

Cookie 不回传时检查来源是否使用 `localhost`，本例只接受 `127.0.0.1`；端口也是来源的一部分。正式模式看不到 Cookie 时先检查 HTTPS 和代理转发，不能临时取消 Secure。登录很慢时测量 scrypt 成本、线程池等待和并发数，不要把参数降低到失去离线攻击成本。

上线还缺少持久会话、用户数据库、按主体和来源限制的限流、多因素认证策略、权限矩阵、XSS 防护、审计、备份恢复与负载验证。TLS 由可信代理终止时，应用端口必须受网络限制，不能相信任意客户端发送的转发头。代理和应用的请求体上限、超时及头部解析策略要协调，避免请求走私和预算错配。

部署前在相同 Node 版本运行功能测试、类型检查和依赖审查，构建不可变产物，以非特权身份运行。日志记录状态、延迟、请求编号，不记录密码、Cookie 或 CSRF token。告警应围绕错误率和资源压力，不能仅以进程存活为健康依据。数据库迁移需要独立授权，发布失败时要知道代码与数据分别怎样恢复。

## 练习与官方来源

练习一：把笔记改为按用户拥有，先写“其他用户编号不能修改”的授权测试，再实现数据库查询条件。练习二：把会话搬到共享存储，验证重启、多实例、退出与过期；不能用延长过期时间掩盖存储失败。练习三：在正在处理请求时发送 SIGTERM，检查完成请求和超时连接分别如何结束，记录真实结果而非预设吞吐数字。

- [Node.js 22 crypto](https://nodejs.org/docs/latest-v22.x/api/crypto.html)：scrypt、随机数和恒定时间比较。
- [Node.js 22 HTTP](https://nodejs.org/docs/latest-v22.x/api/http.html)：连接关闭与服务器超时。
- [OWASP 密码存储](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)：密码派生成本与盐。
- [OWASP 会话管理](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)：会话轮换和 Cookie 属性。
- [OWASP CSRF 防护](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)：token 与来源校验。
