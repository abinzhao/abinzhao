---
title: 浏览器 HTTP、缓存、Cookie 与 CORS
description: 用双端口本地服务器观察请求、协商缓存和跨源凭据，区分网络失败与浏览器读取限制。
type: tutorial
topic: browser
section: platform
order: 20
level: intermediate
status: published
tags:
  - HTTP
  - 缓存
  - CORS
  - Cookie
prerequisites:
  - /tutorials/browser/architecture.html
comments: true
---

# 浏览器 HTTP、缓存、Cookie 与 CORS

请求“失败”有很多含义：连接没有建立、服务器返回错误状态、响应无法解析，或者响应已经到达但浏览器不允许脚本读取。缓存又可能让请求根本不抵达服务器。先区分这些层次，再修改服务端或前端配置，才能避免把安全机制当成网络故障。

## 前置条件与实验环境

先理解[浏览器导航与事件循环](/tutorials/browser/architecture.html)。本章使用现代浏览器的 Fetch API，以及 Node.js 22 或以上运行本地服务器；不依赖 npm 包，不访问外部接口。没有 Node 时仍可阅读模型，但下面的服务实验应标为未运行，不能用第三方网站响应代替。

创建独立实验目录，在其中建立 `index.html` 和 `server.mjs`。服务器仅监听 `127.0.0.1` 的 8080 与 8081，两端口必须空闲。不要监听全部网卡，也不要把演示 Cookie 当登录方案。结束实验在服务器终端按 Ctrl+C，不需要清理真实浏览器账号或修改全局安全设置。

同源由协议、主机和端口共同决定，因此这两个端口是不同 origin。它们仍属于相同主机和相同 scheme 的同站场景；“跨源”与“跨站”不能混用。Cookie 的站点规则和 CORS 的 origin 规则处理的是不同问题。

## 先建立 HTTP 请求与响应模型

HTTP 请求包含方法、目标、头字段及可能的请求体，响应包含状态、头字段和可能的响应体。GET 用于获取，POST 常用于提交，但真正的安全性与幂等语义应由服务契约保证，不能只凭方法名称猜。HTTPS 在传输层保护数据，不代表服务端数据一定可信，也不能替代授权校验。

2xx 通常表示成功，3xx 表示重定向或缓存协商等情况，4xx 表示请求侧问题，5xx 表示服务侧问题。`fetch` 收到 404 或 500 仍通常兑现为 Response，只有网络错误、部分安全阻断或中止等才拒绝 Promise。业务代码要检查 `response.ok`，再按类型读取内容。

HTTP/2 与 HTTP/3 的传输和多路复用机制不同于 HTTP/1.1，但方法、状态和缓存语义仍然成立。DevTools 展示的请求不是原始 TCP 报文，Timing 也受连接复用影响。不能把“一条 HTTP 请求”直接等同于“一次全新的连接”。

## 搭建可观察的双端口服务器

先创建页面：

```html
<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>网络实验</title>
<h1>网络、缓存与跨源实验</h1>
<p>打开 DevTools Console 与 Network，按教程运行请求。</p>
</html>
```

再创建 `server.mjs`。它对跨源授权采用明确允许的演示 origin，而不是反射任何请求来源：

```js
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("./index.html", import.meta.url));
const allowedOrigin = "http://127.0.0.1:8080";
const etag = '"demo-v1"';

function handler(req, res) {
  const url = new URL(req.url, "http://127.0.0.1");
  const authorized = url.searchParams.get("cors") === "allow"
    && req.headers.origin === allowedOrigin;

  res.setHeader("Vary", "Origin");
  if (authorized) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  if (req.method === "OPTIONS") {
    if (!authorized) {
      res.writeHead(403).end();
      return;
    }
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Access-Control-Allow-Headers", "X-Demo");
    res.writeHead(204).end();
    return;
  }

  if (url.pathname === "/") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(page);
    return;
  }

  if (url.pathname === "/cache") {
    res.setHeader("Cache-Control", "private, max-age=10");
    res.setHeader("ETag", etag);
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304).end();
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ version: 1 }));
    return;
  }

  if (url.pathname === "/cookie") {
    res.setHeader("Set-Cookie",
      "demo_browser_cookie=1; HttpOnly; SameSite=Lax; Path=/");
  }
  if (url.pathname === "/data" || url.pathname === "/cookie") {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    const hasDemoCookie = (req.headers.cookie || "")
      .split(";").some((item) => item.trim() === "demo_browser_cookie=1");
    res.end(JSON.stringify({ ok: true, hasDemoCookie }));
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
}

for (const port of [8080, 8081]) {
  const server = createServer(handler);
  server.on("error", (error) => console.error(error.message));
  server.listen(port, "127.0.0.1", () => {
    console.log(`Listening on http://127.0.0.1:${port}`);
  });
}
```

```bash
node --version
node server.mjs
```

预期出现两个监听地址。浏览器访问 `http://127.0.0.1:8080/` 后应看到实验标题。若出现 `EADDRINUSE`，说明端口被占用，先停止本实验或统一调整代码与页面 origin；不要随意杀死不认识的进程。

## 新鲜缓存、重新验证与不存储

HTTP 缓存可以在浏览器私有缓存或共享代理/CDN 中存在。`max-age` 定义响应在一定年龄范围内可以直接复用，过期不代表立即删除，而是通常需要重新验证。ETag 是服务端提供的版本标识，客户端可用 `If-None-Match` 询问版本是否仍相同。

`304 Not Modified` 不携带新的完整响应体，客户端复用已有内容并更新缓存元数据。它不是“服务器没有返回任何可用数据”。`no-cache` 允许存储但复用前要重新验证，`no-store` 指示不要存储；`private` 允许私有缓存使用，但不让共享缓存存储。Cookie 存在不会自动把响应变成 private。

在页面 Console 中运行：

```js
async function readCache() {
  const response = await fetch("/cache");
  console.log(response.status, await response.json());
}
await readCache();
await readCache();
```

在 Network 中取消勾选 Disable cache，观察两次请求。第二次可能命中新鲜缓存；等待超过十秒后再请求，通常能看到条件请求与 304 协商。Fetch 向代码暴露的最终状态通常是复用后的 200，不应要求 Console 必须打印 304。真正的协商证据要看 Network 请求头与响应。

```js
const refreshed = await fetch("/cache", { cache: "no-cache" });
console.log(await refreshed.json());
```

这会要求按 Fetch 的缓存模式进行重新验证，不能等同于删除所有缓存。刷新、强制刷新、DevTools 禁用缓存和 Service Worker 的 Cache API 又是不同路径；如果响应来源标明 Service Worker，先检查该层逻辑，不能只改 HTTP 头。

本实验服务端内容固定，所以 ETag 固定合理。真实服务若内容改变却不更新 ETag，客户端可能继续复用旧版本。内容协商依赖请求头时要正确设置 `Vary`，例如按 Origin 动态返回 CORS 头时应避免共享缓存把一个来源的授权结果复用于另一个来源。

## CORS 是读取授权，不是身份授权

在 Console 执行允许与不允许的两组请求：

```js
try {
  await fetch("http://127.0.0.1:8081/data");
} catch (error) {
  console.log("expected CORS rejection:", error.name);
}
const allowed = await fetch("http://127.0.0.1:8081/data?cors=allow");
console.log(await allowed.json());
const preflighted = await fetch("http://127.0.0.1:8081/data?cors=allow", {
  headers: { "X-Demo": "tutorial" }
});
console.log(await preflighted.json());
```

预期第一组脚本无法读取，第二组可读取 JSON，第三组首次通常出现 OPTIONS 预检，因为自定义头不属于简单请求允许的头集合。预检结果也可能被浏览器缓存，重复请求不一定再次显示 OPTIONS。Network 可能仍能看到第一组的服务响应，这说明请求到达不等于脚本获得读取权限。

简单请求可能直接发送而不预检，所以 CORS 不能代替 CSRF 防护，更不能代替服务端认证。服务器应独立检查用户身份和业务授权。不能把允许任意 origin 作为解决所有报错的方式，带凭据请求也不能使用 `Access-Control-Allow-Origin: *` 作为授权。

`mode: "no-cors"` 不是关闭安全检查。它会限制请求能力，并返回不可读取的 opaque 响应，状态、头和响应体不能用于正常 API 处理。浏览器扩展、命令行 curl 和普通网页的权限环境不同，用 curl 成功并不能证明网页跨源读取成功。

## Cookie、凭据与实际观察

Cookie 是浏览器按作用域和策略附带的状态，不按端口隔离。`Domain`、`Path`、`Secure`、`HttpOnly`、`SameSite` 分别影响可发送范围、传输条件、脚本读取与跨站发送。`HttpOnly` 限制页面脚本读取，不阻止浏览器自动发送；Path 不是可靠的安全隔离边界。

```js
const cookieResponse = await fetch("http://127.0.0.1:8081/cookie?cors=allow", {
  credentials: "include"
});
console.log(await cookieResponse.json());
const withCookie = await fetch("http://127.0.0.1:8081/data?cors=allow", {
  credentials: "include"
});
console.log(await withCookie.json());
console.log(document.cookie);
```

第一次响应中的布尔值可能仍为 false，因为它报告的是设置 Cookie 前的请求；后续通常为 true。`document.cookie` 不应显示这个 HttpOnly Cookie。到 Application 的 Cookies 面板核对名称、HttpOnly 和 SameSite，不输出真实网站 Cookie，也不要导出含凭据的 HAR。

Fetch 默认 `credentials: "same-origin"`，跨端口请求要显式 include 才参与跨源凭据。本例两端口同站，所以 Lax Cookie 仍可在满足条件时发送；换成真正跨站场景还受 SameSite 和第三方 Cookie 策略影响。CORS 允许不代表凭据一定存在。

为了本地 HTTP 演示，这个 Cookie 没有 Secure，也不提供真实认证。线上登录 Cookie 应结合 HTTPS、Secure、HttpOnly、适当 SameSite 与服务端会话管理；`SameSite=None` 通常要求 Secure。实验不是安全上线配置，浏览器隐私策略也可能使具体存储行为不同。

## 响应体、中止与超时边界

响应头到达后，Fetch 的 Promise 可以先兑现，响应体还在后续读取。`json()`、`text()` 等读取通常消耗响应体，不能无条件重复读；需要两份时可提前 clone，但大响应会带来缓存与内存成本。内容类型也应核对，服务器把错误页当 HTML 返回时，JSON 解析报错不能简单归结为接口没连接上。

```js
async function readDemo() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch("/data", { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const type = response.headers.get("content-type") || "";
    if (!type.includes("application/json")) throw new Error("Unexpected type");
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
console.log(await readDemo());
```

在本地页运行，预期得到 `{ ok: true, hasDemoCookie: ... }`。定时器定义客户端允许等待的范围，不保证精确三秒执行；浏览器任务繁忙时中止也可能延后。Abort 可以停止客户端等待与相关网络处理，不保证服务端回滚已接收的业务操作，因此对写入请求仍需要服务端幂等和确认机制。

开发代理可以把页面看到的请求变成同源，服务端再转发到另一地址，但这是服务端代理架构，不是 CORS 被浏览器禁用了。代理也必须限制目标与身份，不能开放成任意网址转发器。线上协议、Cookie 域与缓存层变化后，要重新检查实际条件，不能把本地代理成功直接当上线成功。

请求重定向还可能改变 origin、凭据范围与最终类型。Network 应查看完整链路及最终 URL，不只看最初一行。登录超时返回登录 HTML、CDN 返回旧数据、接口返回业务错误 JSON，都需要按对应层处理。把这些结果全部 catch 后显示同一句“网络异常”，会让用户和维护者失去有用信息。

为了确认客户端与缓存的分工，可以在浏览器之外对实验端点进行一次只读条件请求。这里使用 curl，不发送 Cookie 或授权头：

```bash
curl -i http://127.0.0.1:8080/cache
curl -i -H 'If-None-Match: "demo-v1"' http://127.0.0.1:8080/cache
```

预期第一条返回 JSON 与 ETag，第二条返回 304 且没有完整正文。curl 不自动具有浏览器 HTTP 缓存，也不执行网页的同源读取限制，因此这个实验只验证服务端条件响应，不能替代浏览器缓存和 CORS 验收。

## 常见错误、练习与完成标准

看到 404 时先检查路径与 Response 状态，不要只 catch Promise。看到 CORS 错误时核对当前页面 origin、预检和实际响应，不要只看服务器业务日志。返回 HTML 却调用 `response.json()` 会产生解析错误，它不同于连接失败。Cookie 不发送时分别核对 credentials、作用域、SameSite 和浏览器策略。

练习先关闭 Disable cache，记录两次缓存请求来源；再开启它重做，解释为什么结果不同。调用 `/missing` 并输出 `ok` 与 `status`，证明 HTTP 错误仍能形成 Response。去掉自定义请求头观察预检变化，去掉 include 观察跨源凭据变化。仅在实验 Cookie 条目上手工删除，确认下一次布尔值变回 false。

完成标准是能分开连接、HTTP 状态、CORS 读取和 JSON 解析四种失败，能区分 no-cache 与 no-store，能解释同源与同站不同。进一步阅读[浏览器调试、性能与安全](/tutorials/browser/debugging.html)，把这些观察组织成可复现的诊断证据。

## 官方参考

- [MDN：HTTP 概览](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview)：协议语义与状态。
- [MDN：HTTP 缓存](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching)：新鲜度、验证与 Vary。
- [MDN：CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)：简单请求、预检与凭据。
- [MDN：Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies)：作用域和安全属性。
- [MDN：Fetch 使用指南](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)：状态检查与请求选项。
