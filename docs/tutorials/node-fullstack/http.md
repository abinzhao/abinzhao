---
title: Node.js 22 原生 HTTP：构建有边界的 JSON API
description: 用原生 HTTP 理解路由、流式请求体、输入校验、错误响应与接口测试。
type: tutorial
topic: node-fullstack
section: platform
order: 10
level: beginner
status: published
tags: [Node.js, HTTP, API, 输入校验]
prerequisites: []
comments: true
---

# Node.js 22 原生 HTTP：构建有边界的 JSON API

一个能返回 JSON 的服务器，还不等于一个可以交付的 API。真实请求可能没有合法路径，可能使用错误方法，也可能持续发送请求体直到耗尽内存。本篇使用 Node.js 22 的原生 `node:http`，构建只在本机运行的任务接口，把协议处理与业务处理的边界放到明面上。目标不是手写一个框架，而是理解框架通常替我们承担什么工作。

## 前置条件与完成目标

准备 Node.js 22 或兼容的后续版本，以及能运行 `curl` 的终端。先执行 `node --version`，确认不是旧版运行时。在独立实验目录创建下面两份文件，无须安装第三方依赖；使用 `.mjs` 扩展名让 Node 按 ES module 解释代码。

完成实验后，你应能够创建任务、按编号查询任务，并验证非法 JSON、超限请求、错误方法和不存在的资源。数据只保存在内存中，进程停止就会丢失；接口没有登录和租户隔离，因此只监听 `127.0.0.1`，不能直接开放到互联网。这个限制是实验的一部分，不是后续上线时可以忽略的提醒。

## 核心原理：请求是流，路由是协议契约

HTTP 请求包含方法、目标、头部和可能存在的主体。Node 会解析协议头，却不会自动把主体解析成 JavaScript 对象。`IncomingMessage` 是可读流，一次 `data` 事件不保证包含完整 JSON，中文字符也可能横跨多个网络块，所以必须先按字节累计，再进行完整解码和解析。

请求体上限应根据实际收到的字节判断，不能只信任 `Content-Length`。客户端可以使用分块传输，也可能伪造长度。上限解决的是内存预算，接收超时解决的是慢速发送，两者不是同一种保护。本例使用 16 KiB 上限，属于任务标题接口的教学选择，不是所有服务通用的推荐值。

路径与查询参数也需要分离。用固定基地址构造 `URL`，再匹配 `pathname`，不会把 `?limit=3` 误认成路径。重复查询参数需要明确处理，否则代理、客户端和服务端可能选取不同值。方法不匹配返回 405 并带 `Allow`，资源不存在返回 404；不要把这两种情况统统包装成成功响应。

设计接口时，还要明确读取是否改变状态。列表查询应是只读操作，创建任务才产生新的编号；不要通过 GET 请求触发删除或转账，因为浏览器预取、缓存和爬虫都可能读取链接。请求方法不是权限证明，但它表达了客户端和中间设施对操作语义的共同理解。

响应状态与响应体也应一致。创建成功使用 201，并通过 Location 指向新资源；校验失败不是一个空任务列表，而是明确错误。客户端应先判断状态，再按约定解析响应，不能把任何 JSON 都当作业务成功。错误格式保持稳定有助于前端展示，但内部堆栈和数据库诊断不能成为公共契约。

连接可以承载多个请求，未消费的请求体可能影响后续连接使用。本例在错误路径关闭连接，简化未读主体的处理；正式服务也可以有界地排空主体，但必须保证不会无限接收。对于本来不接受主体的路由，应明确拒绝或限制其行为，不能认为 GET 请求天然不可能携带主体。

## 从代码读懂一条请求

先以创建任务为例，从网络入口沿调用链走一遍：服务器收到请求，构造 URL，识别任务集合和 POST 方法，验证媒体类型，累计主体字节，解码 UTF-8，再解析 JSON。对象形状和标题范围校验通过后，才分配编号和修改内存状态，最后构造响应。前半段失败时，后半段的状态变化不能发生。

这一顺序解释了为什么先插入数据再验证标题不合理。如果解析失败后任务编号已经消耗，接口可能出现不必要的状态变化；对简单内存编号影响较小，但接入库存扣减或外部发送就可能造成严重问题。业务副作用应放在格式、权限和业务规则确认之后，数据库内部的多步更新再用事务保护。

然后检查列表请求：查询参数被解析成文本，重复参数和范围先被检查，再转成数字，最后截取结果。数字转换本身并不构成校验，空字符串、指数形式和特殊数值可能拥有意外转换结果。用明确文本格式加数值范围能够让接口接受什么变得可检查。

最后检查错误路径：已知错误保留公开状态和消息，未知异常使用固定响应；响应已经发出时不再写第二次头部。重复发送通常产生额外错误，并且掩盖首次失败，因此异常边界还要判断连接是否可用。请求被客户端中断时，不能为了保持“成功率”强行记录为完成。

## 测试覆盖与客户端责任

测试中的随机端口避免与正在运行的服务竞争，独立服务器状态避免测试顺序影响结果。清理钩子确保测试结束后关闭监听；如果测试挂住，先查未关闭连接和未消费响应，而不是直接延长超时。确定性测试关注状态、响应形状和拒绝行为，不断言真实网络延迟。

客户端重试也需要谨慎。读取请求通常可以重试，创建请求在响应丢失时可能已经执行，再发一次会创建第二条记录。本篇没有实现幂等键，所以不能把 POST 超时后的自动重试当成可靠行为。后续接入数据库时，应明确请求标识、重复请求内容比较和结果查询，而不依赖客户端猜测。

## 实操：完整的原生 HTTP 服务

将以下代码放入 `server.mjs`。`createApp` 每次生成独立状态，测试不会共享任务编号。主程序负责监听，导出的工厂负责创建服务器，这样后续可以在随机端口进行真实 HTTP 测试。

```javascript
import http from "node:http";
import { pathToFileURL } from "node:url";

class HttpError extends Error {
  constructor(status, message, headers = {}) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

function send(res, status, data, headers = {}, close = false, req) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
    ...(close ? { Connection: "close" } : {}),
  });
  res.end(JSON.stringify(data), () => {
    if (close) req?.destroy();
  });
}

async function readJson(req, limit = 16 * 1024) {
  const media = req.headers["content-type"]?.split(";")[0].trim();
  if (media !== "application/json") {
    throw new HttpError(415, "Expected application/json");
  }
  if (req.headers["content-encoding"]) {
    throw new HttpError(415, "Compressed bodies are not supported");
  }
  const bytes = await new Promise((resolve, reject) => {
    let size = 0;
    let done = false;
    const chunks = [];
    function fail(error) {
      if (done) return;
      done = true;
      reject(error);
    }
    req.on("data", (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        req.pause();
        fail(new HttpError(413, "Body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks));
    });
    req.on("aborted", () => fail(new HttpError(400, "Request aborted")));
    req.on("error", () => fail(new HttpError(400, "Request failed")));
  });
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON or UTF-8");
  }
}

export function createApp() {
  const tasks = new Map();
  let nextId = 1;
  const server = http.createServer(
    { maxHeaderSize: 8192 },
    async (req, res) => {
      try {
        let url;
        try {
          url = new URL(req.url, "http://127.0.0.1");
        } catch {
          throw new HttpError(400, "Invalid URL");
        }
        if (url.pathname === "/health" && req.method === "GET") {
          return send(res, 200, { status: "ok" });
        }
        if (url.pathname === "/tasks") {
          if (req.method === "GET") {
            const limits = url.searchParams.getAll("limit");
            const raw = limits[0] ?? "20";
            if (limits.length > 1 || !/^[1-9]\d?$/.test(raw)) {
              throw new HttpError(400, "limit must be 1..99");
            }
            return send(res, 200, {
              items: [...tasks.values()].slice(0, Number(raw)),
            });
          }
          if (req.method === "POST") {
            const body = await readJson(req);
            if (
              !body || typeof body !== "object" || Array.isArray(body) ||
              Object.keys(body).some((key) => key !== "title") ||
              typeof body.title !== "string" ||
              body.title.trim().length < 1 || body.title.trim().length > 120
            ) {
              throw new HttpError(422, "Expected a title of 1..120 characters");
            }
            const task = { id: nextId++, title: body.title.trim() };
            tasks.set(task.id, task);
            return send(res, 201, task, { Location: `/tasks/${task.id}` });
          }
          throw new HttpError(405, "Method not allowed", { Allow: "GET, POST" });
        }
        const match = /^\/tasks\/([1-9]\d*)$/.exec(url.pathname);
        if (match) {
          if (req.method !== "GET") {
            throw new HttpError(405, "Method not allowed", { Allow: "GET" });
          }
          const id = Number(match[1]);
          if (!Number.isSafeInteger(id)) throw new HttpError(400, "Invalid id");
          const task = tasks.get(id);
          if (!task) throw new HttpError(404, "Task not found");
          return send(res, 200, task);
        }
        throw new HttpError(404, "Route not found");
      } catch (error) {
        if (res.destroyed || res.headersSent) return;
        const known = error instanceof HttpError;
        if (!known) console.error("request failed", { kind: error.name });
        send(res, known ? error.status : 500,
          { error: known ? error.message : "Internal server error" },
          known ? error.headers : {}, true, req);
      }
    },
  );
  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 5_000;
  return server;
}

if (process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href) {
  createApp().listen(3000, "127.0.0.1", () => {
    console.log("Listening on http://127.0.0.1:3000");
  });
}
```

这里没有把客户端输入原样写到日志，也不向客户端返回堆栈。公开错误说明发生了什么，内部错误只返回固定信息。生产日志应再加入关联编号和分级策略，但不能顺手记录整份请求体。超限后暂停流、发送关闭连接的响应，并在响应发送结束后销毁请求，避免继续接收无界内容。

## 预期检查：正常路径与拒绝路径一起测

启动服务后，在另一个终端执行以下命令。第一条应返回 201，响应包含 `id` 和清理两端空白后的 `title`；随后查询应返回同一任务。第三条应返回 400，而不是进程崩溃。

```bash
node server.mjs
```

```bash
curl -i http://127.0.0.1:3000/tasks \
  -H 'Content-Type: application/json' \
  --data '{"title":"学习请求边界"}'
curl -i 'http://127.0.0.1:3000/tasks?limit=1'
curl -i http://127.0.0.1:3000/tasks \
  -H 'Content-Type: application/json' --data '{'
```

再把下面内容放入 `server.test.mjs`，运行 `node --test server.test.mjs`。测试真实地走过网络解析和响应读取，不是直接调用某个业务函数，因此能发现方法、头部和状态码契约上的错误。

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "./server.mjs";

test("task API accepts valid input and rejects unsafe boundaries", async (t) => {
  const server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body, headers = { "Content-Type": "application/json" }) =>
    fetch(`${base}/tasks`, { method: "POST", headers, body });
  const created = await post(JSON.stringify({ title: "read" }));
  assert.equal(created.status, 201);
  assert.deepEqual(await created.json(), { id: 1, title: "read" });
  assert.equal((await post("{")).status, 400);
  assert.equal((await post(JSON.stringify({ title: "" }))).status, 422);
  assert.equal((await post("x".repeat(17 * 1024))).status, 413);
  assert.equal((await post("{}", { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await fetch(`${base}/tasks?limit=1&limit=2`)).status, 400);
  assert.equal((await fetch(`${base}/tasks/999`)).status, 404);
  const wrong = await fetch(`${base}/tasks/1`, { method: "DELETE" });
  assert.equal(wrong.status, 405);
  assert.equal(wrong.headers.get("allow"), "GET");
});
```

这些断言是读者执行时的预期，不表示你的机器上已经通过。测试覆盖了确定性边界，但没有覆盖慢速连接、代理行为和内存压力。对接数据库后，还需要测试连接失败是否被转换成不泄露内部信息的错误。

## 排错：从协议层向业务层缩小范围

如果请求一直等待，先看服务是否监听成功，再用 `/health` 排除业务问题。端口占用会产生 `EADDRINUSE`，应找到占用进程或修改实验端口，不要随意终止其他服务。返回 415 时检查 `Content-Type`，`curl --data` 默认并不声明 JSON，文件内容是 JSON 也不能改变头部语义。

若中文标题显示异常，检查终端和源文件编码，服务按 UTF-8 解码且拒绝损坏字节。标题长度目前按 JavaScript UTF-16 代码单元计算，因此某些表情占两单位；如果产品要求按用户感知字符计数，应明确改为分段规则并增加对应测试，不能在前后端使用两种“字符”定义。

看到 413 不要先调大阈值。确认请求是不是误带了图片、整份文档或重复字段，再决定是否需要独立上传接口。看到 500 要查看服务端错误类型，不能通过把所有异常改成 200 来掩盖问题。服务端成功读取 JSON 只代表格式正确，业务合法性仍由下一层校验决定。

## 练习与后续边界

练习一：加入只接受 `true` 或 `false` 的完成状态字段，并写一个字符串 `"false"` 被拒绝的测试。不要通过布尔转换处理输入，否则非空字符串也会变成真。练习二：为列表增加分页游标，明确游标失效、重复参数和空结果的响应；先写预期，再实现查询。

练习三：增加一次异常注入，让接口返回 500，检查任务列表是否仍可访问，且响应不包含文件路径或堆栈。这个练习建立的是错误隔离能力，不是任意异常后继续运行的承诺。进程级不可恢复错误应交给监管进程重启。

本篇省略鉴权、持久化和优雅停机，不能把回环监听改成公网监听就宣称上线。继续阅读[数据库与事务](/tutorials/node-fullstack/database.html)，再学习[会话安全与部署](/tutorials/node-fullstack/production.html)。回到[教程入口](/tutorials/)时，应能解释每条接口的输入预算和拒绝行为，而不只是记住创建服务器的语法。

## 官方来源

- [Node.js 22 HTTP 文档](https://nodejs.org/docs/latest-v22.x/api/http.html)：请求流、服务器超时和连接关闭语义。
- [Node.js 22 URL 文档](https://nodejs.org/docs/latest-v22.x/api/url.html)：WHATWG URL 与查询参数处理。
- [Node.js 22 测试运行器](https://nodejs.org/docs/latest-v22.x/api/test.html)：测试生命周期和清理。
- [OWASP 输入校验指南](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)：格式校验与业务校验的区别。

本文以 Node.js 22 为教学基线，不宣称覆盖其他版本的全部差异。升级运行时后，应重新运行接口测试并核对对应版本文档。
