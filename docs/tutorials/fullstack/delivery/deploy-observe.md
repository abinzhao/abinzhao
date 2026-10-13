---
title: 部署与可观察性：代理、健康检查与优雅关闭
description: 区分静态产物和 API 进程，配置本地反向代理，验证 requestId 日志、关闭期限和回滚策略。
---

# 部署与可观察性：代理、健康检查与优雅关闭

## 学习目标与准备

先读 [契约与可靠请求](../contracts/reliability)。
本章只进行本地 Node 22.13+ 实验；Nginx 配置是独立练习，不要求发布外部系统。
目标：一次请求能关联日志，退出时停止接新请求、等待在途请求并设置硬期限。

```sh
mkdir delivery-lab
cd delivery-lab
node --version
```

## 机制：静态网站不是 API 进程

| 对象 | 运行方式 | 必须管理的状态 |
| --- | --- | --- |
| HTML/CSS/JS | CDN 或静态服务器按文件响应 | 缓存、版本、路由、资源完整性 |
| Node API | 常驻进程处理请求 | 健康、日志、连接、内存、退出与重启 |
| SQLite | API 访问持久磁盘 | 备份、锁、迁移、文件权限、磁盘余量 |

把 server.mjs 上传到静态空间不会启动 Node；把数据库放进静态目录会泄漏数据。
数据库不能跟随容器临时文件系统消失，卷路径与代码发布目录应分离。
前端“环境变量”经构建替换后是公开 JS；名称带 SECRET 也不会使它保密。
API 密钥、密码只留服务器或密钥管理器；公开 API 基址不是 secret。
`.env` 只是本地文件，不是加密存储；不要提交真实凭据或把它复制进静态产物。
本例只包含非敏感运行配置，不演示任何真实密钥。

## 操作：配置、进程与本地反向代理

::: code-group
```text [.env]
PORT=3007
HOST=127.0.0.1
RELEASE_ID=local-v1
```

```js [server.mjs]
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
const port = Number(process.env.PORT ?? 3007);
const host = process.env.HOST ?? '127.0.0.1';
const release = process.env.RELEASE_ID ?? 'local';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid PORT');
if (!['127.0.0.1', '0.0.0.0'].includes(host)) throw new Error('invalid HOST');
if (!/^[a-zA-Z0-9._-]{1,64}$/.test(release)) throw new Error('invalid RELEASE_ID');
let draining = false;
function log(value) { console.log(JSON.stringify({ time: new Date().toISOString(), release, ...value })); }
function send(res, status, data, head = false) {
  if (draining) res.shouldKeepAlive = false;
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(head ? undefined : JSON.stringify(data));
}
const server = createServer(async (req, res) => {
  const requestId = randomUUID(), started = performance.now();
  res.setHeader('X-Request-Id', requestId);
  let recorded = false, route = 'unknown';
  function record(event) {
    if (recorded) return;
    recorded = true;
    log({ event, requestId, method: req.method, route,
      status: res.writableFinished ? res.statusCode : 499,
      durationMs: Math.round(performance.now() - started) });
  }
  res.on('finish', () => record('request_finished'));
  res.on('close', () => record('request_closed'));
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    route = ['/health/live', '/health/ready', '/api/slow', '/api/info'].includes(path) ? path : 'unknown';
    if (['GET', 'HEAD'].includes(req.method) && path === '/health/live') {
      return send(res, 200, { status: 'alive' }, req.method === 'HEAD');
    }
    if (['GET', 'HEAD'].includes(req.method) && path === '/health/ready') {
      return send(res, draining ? 503 : 200, { ready: !draining }, req.method === 'HEAD');
    }
    if (draining) return send(res, 503, { error: 'draining', requestId });
    if (req.method === 'GET' && path === '/api/info') return send(res, 200, { release });
    if (req.method === 'GET' && path === '/api/slow') {
      await sleep(500);
      if (!res.destroyed) send(res, 200, { done: true });
      return;
    }
    send(res, 404, { error: 'not found', requestId });
  } catch {
    if (!res.destroyed) send(res, 500, { error: 'internal error', requestId });
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;
server.listen(port, host, () => log({ event: 'started', host, port }));
server.on('error', error => { log({ event: 'listen_failed', code: error.code }); process.exitCode = 1; });
function shutdown(signal) {
  if (draining) return;
  draining = true;
  log({ event: 'shutdown_started', signal });
  const deadline = setTimeout(() => {
    log({ event: 'shutdown_timeout' });
    server.closeAllConnections();
    process.exit(1);
  }, 2000);
  server.close(error => {
    clearTimeout(deadline);
    log({ event: 'shutdown_finished', failed: Boolean(error) });
    process.exitCode = error ? 1 : 0;
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

```nginx [nginx.conf]
events {}
http {
  server {
    listen 127.0.0.1:8080;
    server_name localhost;
    root /srv/notes-static;
    client_max_body_size 16k;
    location / {
      try_files $uri $uri/ =404;
    }
    location /api/ {
      proxy_pass http://127.0.0.1:3007;
      proxy_http_version 1.1;
      proxy_set_header Connection "";
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_set_header X-Forwarded-For $remote_addr;
      proxy_connect_timeout 2s;
      proxy_read_timeout 15s;
    }
    location /health/ {
      proxy_pass http://127.0.0.1:3007;
    }
  }
}
```
:::

`proxy_pass` 不带尾部 `/`，保留 `/api/info`；加尾部斜杠会替换匹配前缀。
这是完整本地 HTTP 配置，`/srv/notes-static` 换成你的静态产物绝对路径。
若已安装 Nginx，可用 `nginx -t -c "$PWD/nginx.conf"` 检查；不要覆盖系统配置。
它未配置 TLS；公网必须另外配置证书、HTTPS 重定向和 HSTS。
同源代理可减少 CORS 配置，但认证仍须核对实际外部 origin 与 Secure Cookie。
只有受信代理链才可信任转发头，不能让客户端伪造 IP 绕过限流。

## 效果验证

把 `.env` 放在同目录，执行 `node --env-file=.env server.mjs`。
另一终端 `curl -i http://127.0.0.1:3007/api/info`：200 且 release 为 local-v1。
响应 X-Request-Id 对应一条 request_finished 日志，status=200、durationMs 为非负数。
health/live 和 health/ready 都应 200；未知路径 404，日志 route=unknown。
不打印 Cookie、Authorization、body 和原始查询串，避免日志泄露或注入。

在一个新的终端、没有同端口进程时执行完整关闭实验：

```sh
node --env-file=.env server.mjs > run.log 2>&1 &
PID=$!
sleep 1
curl -s http://127.0.0.1:3007/api/slow > slow.json &
CLIENT=$!
sleep 0.1
kill -TERM "$PID"
wait "$CLIENT"
wait "$PID"
cat slow.json
cat run.log
```

预期 slow.json 是 `{"done":true}`；日志有 started、shutdown_started、200 请求、shutdown_finished。
wait 进程状态为 0；再次请求连接失败。启动等待一秒是本地实验简化，不是生产就绪门禁。
将 slow 等待改为 3000ms：应在约两秒硬退出，shutdown_timeout 且退出码 1。
close 关闭当时空闲的连接；排空期间响应设置 shouldKeepAlive=false，防止刚完成的连接继续驻留；WebSocket 需另行管理。
数据库应在在途请求结束后 close，不能收到 SIGTERM 时立即关闭仍被请求使用的连接。

## 健康检查与回滚

live 检查进程活着，ready 检查能否接业务；真实 ready 还需依赖可用与迁移完成。
关闭时先撤掉流量并等传播，再触发退出；本例调用 close 后新连接可能直接拒绝，而不是返回 503。
编排器终止宽限必须长于应用两秒期限；不要把健康检查当作全业务验收。
发布保留不可变版本与上一版本，先验证 ready 和核心 CRUD，再切换流量。
回滚要同时确认静态页面、API 契约和数据库兼容，回退代码不会回退已写入的数据。
破坏性迁移不可盲目逆转；先备份并演练恢复，采用扩展后收缩的兼容升级。
观察错误率、p95 延迟、事件循环延迟、磁盘与数据库锁；requestId 用于定位，不是业务权限。

## 常见错误与标准练习

静态站刷新 404 需确认路由策略，本例非 SPA，不应一律改成 index.html。
代理 502 多为 API 未启动/端口错误；504 查超时，别只无限提高代理超时。
1. 用 RELEASE_ID=local-v2 启动。验收：响应与所有日志版本一致。
2. 请求携带伪造 X-Request-Id。验收：响应 id 由服务器生成，不采纳未可信输入。
3. 验证慢请求关闭。验收：500ms 请求完成；3000ms 请求触发硬期限且非零退出。
4. 写回滚清单。验收：包括版本、数据兼容、健康、CRUD 和备份恢复，不只写重启。

## 官方来源

- [Node HTTP close](https://nodejs.org/download/release/v22.13.0/docs/api/http.html)
- [Node 环境文件](https://nodejs.org/download/release/v22.13.0/docs/api/cli.html#--env-fileconfig)
- [Nginx proxy_pass](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)
- [OWASP 日志指南](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
