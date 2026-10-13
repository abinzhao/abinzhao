---
title: 本地 Mock 流式输出：SSE 与 NDJSON
description: 用 Node 内置服务和浏览器流读取验证字节分片、协议分帧、取消与结束语义。
---

# 本地 Mock 流式输出：SSE 与 NDJSON

## 目标与部署边界
建立独立 `stream-lab`，用本地 Node 服务模拟逐段输出，不调用模型，不需要 API key。
教程主站仍是纯静态：下面的 `server.mjs` 不部署到主站，也不把模型密钥写进前端环境变量。
真实模型请求应经可信服务端鉴权、限额和密钥管理；前端构建中的 `VITE_*` 变量不是秘密。

网络 chunk 是字节片段，不是 token、JSON 对象或 SSE 事件。一个汉字的 UTF-8 字节可能跨 chunk，
一个 chunk 也可能包含多条事件；必须先连续解码，再按协议边界分帧，最后解析 JSON。
SSE 用空行分隔事件、`data:` 承载内容；NDJSON 每行一个 JSON，字符串内部换行要被 JSON 转义。

## 完整四文件项目
Node 22+；无需 npm 依赖。此 SSE 解析器支持 LF/CRLF、注释、多行 data，
不实现 `id`、`retry` 和自动重连；它是 fetch 流读取，不是完整 EventSource 替代品。
::: code-group
```js [server.mjs]
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/client.js', ['client.js', 'text/javascript; charset=utf-8']],
  ['/frames.mjs', ['frames.mjs', 'text/javascript; charset=utf-8']]
]);
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:8787');
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    const origin = req.headers.origin;
    if (origin && origin !== 'http://127.0.0.1:8787') { res.writeHead(403).end(); return; }
    if (url.pathname !== '/stream') {
      const file = files.get(url.pathname);
      if (!file) { res.writeHead(404).end(); return; }
      const bytes = await readFile(new URL(file[0], import.meta.url));
      res.writeHead(200, { 'Content-Type': file[1] }).end(bytes);
      return;
    }
    const mode = url.searchParams.get('mode');
    if (!['sse', 'ndjson'].includes(mode)) { res.writeHead(400).end(); return; }
    res.writeHead(200, { 'Content-Type': mode === 'sse' ? 'text/event-stream' : 'application/x-ndjson',
      'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.flushHeaders();
    let closed = false;
    res.on('close', () => { closed = true; });
    const records = ['你好', '，这是', '本地 mock', ' 流式输出。'].map(text => ({ type: 'delta', text }));
    records.push({ type: 'done' });
    for (const record of records) {
      const json = JSON.stringify(record);
      const bytes = Buffer.from(mode === 'sse' ? `data: ${json}\r\n\r\n` : `${json}\n`);
      const at = bytes.indexOf(Buffer.from('你'));
      const split = at >= 0 ? at + 1 : Math.floor(bytes.length / 2);
      for (const part of [bytes.subarray(0, split), bytes.subarray(split)]) {
        if (closed) return;
        if (!res.write(part)) await new Promise(resolve => {
          const finish = () => { res.off('drain', finish); res.off('close', finish); resolve(); };
          res.once('drain', finish); res.once('close', finish);
        });
        await delay(15);
      }
      await delay(180);
    }
    if (!closed) res.end();
  } catch {
    if (!res.headersSent) res.writeHead(500).end('Local server failed');
    else res.destroy();
  }
});
server.listen(8787, '127.0.0.1', () => console.log('Open http://127.0.0.1:8787'));
```
```js [frames.mjs] {17}
export async function* readFrames(reader, mode) {
  if (!['sse', 'ndjson'].includes(mode)) throw new Error('Unknown mode');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const separator = mode === 'sse' ? /\r?\n\r?\n/ : /\r?\n/;
  let buffer = '';
  let total = 0;
  function parse(frame) {
    if (mode === 'ndjson') return frame.trim() ? JSON.parse(frame) : null;
    const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).replace(/^ /, '')).join('\n');
    return data ? JSON.parse(data) : null;
  }
  while (true) {
    const { value, done } = await reader.read();
    total += value?.byteLength ?? 0;
    if (total > 1024 * 1024) throw new Error('Stream too large');
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
    let match;
    while ((match = separator.exec(buffer))) {
      const frame = buffer.slice(0, match.index);
      if (frame.length > 65536) throw new Error('Frame too large');
      buffer = buffer.slice(match.index + match[0].length);
      const object = parse(frame);
      if (object !== null) yield object;
    }
    if (buffer.length > 65536) throw new Error('Frame too large');
    if (done) break;
  }
  if (buffer.trim()) {
    if (mode === 'sse') throw new Error('Incomplete SSE event');
    yield JSON.parse(buffer);
  }
}
```
```html [index.html]
<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>流式实验</title></head>
<body><label>协议 <select id="mode"><option value="sse">SSE</option>
<option value="ndjson">NDJSON</option></select></label>
<button id="start">开始</button><button id="stop" disabled>取消</button>
<pre id="output" aria-live="polite"></pre><p id="status" role="status">等待开始</p>
<script type="module" src="/client.js"></script></body></html>
```
```js [client.js]
import { readFrames } from './frames.mjs';
const start = document.querySelector('#start');
const stop = document.querySelector('#stop');
const output = document.querySelector('#output');
const status = document.querySelector('#status');
let controller;
stop.addEventListener('click', () => controller?.abort());
start.addEventListener('click', async () => {
  controller = new AbortController();
  start.disabled = true; stop.disabled = false; output.textContent = ''; status.textContent = '读取中';
  const mode = document.querySelector('#mode').value;
  let reader;
  let completed = false;
  try {
    const response = await fetch(`/stream?mode=${mode}`, { signal: controller.signal });
    const expected = mode === 'sse' ? 'text/event-stream' : 'application/x-ndjson';
    if (!response.ok || !response.body || !response.headers.get('content-type')?.startsWith(expected)) {
      throw new Error('Invalid response');
    }
    reader = response.body.getReader();
    for await (const item of readFrames(reader, mode)) {
      if (item?.type === 'done') { completed = true; break; }
      if (item?.type !== 'delta' || typeof item.text !== 'string' || item.text.length > 4096) {
        throw new Error('Invalid record');
      }
      output.textContent += item.text;
    }
    if (!completed) throw new Error('Stream ended without done');
    status.textContent = '已完成';
  } catch (error) {
    status.textContent = error.name === 'AbortError' ? '已取消，保留部分内容' : '流失败，不能标为完成';
  } finally {
    if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    start.disabled = false; stop.disabled = true; controller = null;
  }
});
```
:::

## 运行与效果验证
```bash [终端：stream-lab]
node server.mjs
curl -N "http://127.0.0.1:8787/stream?mode=sse"
curl -N "http://127.0.0.1:8787/stream?mode=ndjson"
```
浏览器打开 `http://127.0.0.1:8787`，两种协议都应逐步显示“你好，这是本地 mock 流式输出。”并标记完成。
在过程中取消，应保留已显示文本、状态为已取消，服务端停止发送；再次开始应从空输出开始。
拆字节发送是测试输入，网络仍可能合并分片；确定性分片测试应直接给 parser 喂一字节数组。

## 故障、练习与官方资料
乱码检查 decoder 是否跨 chunk 保留状态；JSON 失败检查是否按网络 chunk 直接 parse；
一次性显示全部检查代理缓冲、服务端 flush 与客户端是否使用 `response.text()`。
断流不代表成功，只有明确 done 才完成；此例不做重连，重试可能重复输出，真实产品需序号与去重。
`reader.cancel` 失败仅在清理时忽略，不隐藏读取/解析失败；AbortController 不保证远端模型立刻停止计费。
练习：测试每个字节边界、合并事件、CRLF、无 done、非法 JSON 与取消；验收输出不重复，无半个汉字，
错误不标完成。真实服务还需超时、认证、速率限制、背压与输出渲染节流。

- [MDN SSE 格式](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- [TextDecoder.decode 与 stream](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/decode)
- [AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
- [NDJSON 规范](https://github.com/ndjson/ndjson-spec)
