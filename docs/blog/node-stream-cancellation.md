---
title: Node.js SSE 代理的取消传播：从 UTF-8 分块到背压与资源清理
description: 用 Node 22 原生 fetch、AbortSignal 和 Web Streams 构建可取消的 SSE 代理，处理跨块解码、慢消费者、超时及连接收尾。
date: "2026-10-17"
category: 后端工程
tags: [Node.js, SSE, Web Streams, AbortSignal]
featured: true
---

# Node.js SSE 代理的取消传播：从 UTF-8 分块到背压与资源清理

一个流式接口经常同时拥有三个生命周期：浏览器等待结果，代理读取上游，上游持续产生事件。用户点击停止，只终止页面上的渲染，并不意味着后两者停止。反过来，代理设置了请求超时，也不代表已经进入读取阶段的响应体、等待排空的写队列和定时器都得到了清理。

本文解决的实质问题是：怎样让一次 SSE 订阅的读取、写入、超时和用户取消共享明确的结束条件。实现以 Node `22.22.0` 为运行基线，不安装 `node-fetch`，不把网络读取替换成假响应。示例是本机真实 HTTP 源、代理和客户端，不涉及外部业务服务；它能验证协议和生命周期，但不能证明某个生产网关一定及时转发断连。

## 先确定谁拥有结束订阅的权力

代理并不是透明的字节管道。它需要检查状态码、解析事件并重新编码，还可能接入审计和权限。因此，不能把所有错误压成“流断了”。至少要区分正常 EOF、调用方取消、总时限到达、协议违规和传输失败。它们分别决定客户端是否重试、服务是否告警、上游是否应继续工作。

Node 官方文档说明，`AbortSignal.any()` 在任一输入信号取消时取消组合信号，原因来自触发取消的那个输入；`AbortSignal.timeout()` 产生会在指定时间后取消的信号。组合信号表达的是“任何结束条件都足够”，不是投票机制。一个已经取消的信号不可重置，也不应跨订阅复用。[Node Globals](https://nodejs.org/docs/latest-v22.x/api/globals.html#static-method-abortsignalanysignals) 是这里的 API 依据。

下游断开和总时限组成代理的信号，传给 `fetch`，也传给等待 `drain` 的函数。只传给 `fetch` 不够：当下游不再读取时，代理可能正停在写入等待中，根本没有继续调用上游读取的机会。另一方面，`abort()` 是合作式取消，不会回滚上游已经提交的操作，也不是杀死任意同步计算的抢占机制。

HTTP 请求对象的 `close` 不适合直接表示订阅者离开。请求消息读取完成也可能触发它，而 GET 的请求体早已结束，响应仍要持续很久。本例观察响应对象的 `close`，并在正常响应完成前终止上游。`finally` 中移除监听器，避免把正常 `end()` 后的收尾误记为业务取消。

## 字节、文本、行和事件是四个不同边界

网络中的一个块不是一个 Unicode 字符，更不是一个 SSE 事件。中文的 UTF-8 编码可能跨三个字节，`\r\n` 可能跨两个块，多个事件也可能合并在一次读取中。每块分别调用 `Buffer.toString()` 会把不完整字节序列变成替换字符，再拼接也无法恢复原文。

正确顺序是有状态解码、识别行结束符、累计字段、遇到空行派发事件。SSE 允许 LF、CRLF 和单独 CR；多条 `data:` 行用换行连接；注释行不派发事件；`id` 会影响后续事件。字段值冒号后最多去掉一个空格，而不是随意 `trim()`。这些规则来自 [WHATWG SSE 解析算法](https://html.spec.whatwg.org/multipage/server-sent-events.html#parsing-an-event-stream)。

本例实现事件解析，不实现 `EventSource` 的自动重连、`retry` 调度及 `Last-Event-ID` 请求。最后一个没有空行终止的事件在 EOF 时被丢弃，不能凭空补出一次提交。解码器采用 `fatal: true`，遇到非法 UTF-8 直接失败；规范浏览器解析器通常允许替换字符，这里选择更严格的后端输入政策，应在接口契约中声明。

限制单个事件累计的字符数量，是为了阻止无限长字段耗尽内存，不是精确的堆内存预算。代理还应限制并发连接和总体时间；否则一万个合法的小事件流照样能压垮进程。下述限制包含事件内注释及字段字符，但不限制整个订阅的累计输出。

## 一个完整的原生解析器

在独立目录创建以下文件。三个程序只依赖 Node 内置模块，终端先执行 `node --version` 确认是 `v22.22.0`。文件名为 `sse.mjs`：

```js
export async function* parseSSE(body, signal, maxChars = 65536) {
  if (!body) throw new Error('Missing response body');
  signal?.throwIfAborted();
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let line = '';
  let skipLF = false;
  let data = [];
  let type = '';
  let lastId = '';
  let chars = 0;

  function consumeLine(value) {
    if (value === '') {
      const event = data.length
        ? { event: type || 'message', id: lastId, data: data.join('\n') }
        : null;
      data = [];
      type = '';
      chars = 0;
      return event;
    }
    if (value.startsWith(':')) return null;
    const colon = value.indexOf(':');
    const key = colon < 0 ? value : value.slice(0, colon);
    let content = colon < 0 ? '' : value.slice(colon + 1);
    if (content.startsWith(' ')) content = content.slice(1);
    if (key === 'data') data.push(content);
    if (key === 'event') type = content;
    if (key === 'id' && !content.includes('\0')) lastId = content;
    return null;
  }

  function* consumeText(text) {
    for (const ch of text) {
      if (skipLF) {
        skipLF = false;
        if (ch === '\n') continue;
      }
      if (ch === '\r' || ch === '\n') {
        const event = consumeLine(line);
        line = '';
        skipLF = ch === '\r';
        if (event) yield event;
      } else {
        chars += ch.length;
        if (chars > maxChars) throw new Error('SSE event too large');
        line += ch;
      }
    }
  }

  const abort = () => {
    void reader.cancel(signal.reason).catch(() => {});
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    signal?.throwIfAborted();
    for (;;) {
      const { value, done } = await reader.read();
      signal?.throwIfAborted();
      if (done) {
        yield* consumeText(decoder.decode());
        break;
      }
      yield* consumeText(decoder.decode(value, { stream: true }));
    }
  } finally {
    signal?.removeEventListener('abort', abort);
    try {
      await reader.cancel();
    } finally {
      reader.releaseLock();
    }
  }
}
```

`cancel()` 和 `releaseLock()` 含义不同。前者通知流不再需要数据，后者释放读取器所有权；只释放锁不保证底层传输终止。这里在生成器正常结束、异常以及消费者提前 `break` 的路径上统一清理。取消监听器里捕获取消失败，是因为主读取路径仍会检查信号并报告结束原因，不是把解析错误吞掉。

这个实现允许单个已经读入的网络块在内存中停留，消费者每取得一个事件才继续解析。它没有在后台把所有事件收集进数组。若一个事件之后要写数据库，必须等待数据库操作后再继续消费，或者建立有界队列；随手启动未等待的异步任务，会在应用层重新破坏背压。

## 真实源和代理：把背压纳入取消协议

文件 `server.mjs` 同时提供 `/source` 和 `/proxy`。使用本机源是为了能控制产生频率和字节切分，不是假造一次已完成的网络结果。每个订阅最多产生一百个事件，总时限为十秒：

```js
import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseSSE } from './sse.mjs';

function write(res, chunk, signal) {
  signal.throwIfAborted();
  if (res.destroyed) throw new Error('Downstream closed');
  if (res.write(chunk)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      res.off('drain', drained);
      res.off('close', closed);
      res.off('error', failed);
      signal.removeEventListener('abort', aborted);
    };
    const finish = (error) => {
      cleanup();
      error ? reject(error) : resolve();
    };
    const drained = () => finish();
    const closed = () => finish(new Error('Downstream closed'));
    const failed = (error) => finish(error);
    const aborted = () => finish(signal.reason);
    res.once('drain', drained);
    res.once('close', closed);
    res.once('error', failed);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
    else if (res.destroyed) closed();
  });
}

async function handle(req, res) {
  const controller = new AbortController();
  const disconnected = () => {
    controller.abort(new DOMException('Subscriber left', 'AbortError'));
  };
  res.once('close', disconnected);
  const signal = AbortSignal.any([
    controller.signal,
    AbortSignal.timeout(10000),
  ]);
  try {
    if (req.url === '/source') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      for (let i = 1; i <= 100; i++) {
        const bytes = Buffer.from(
          `id: ${i}\r\ndata: ${JSON.stringify({ i, text: '中文事件' })}\r\n\r\n`,
        );
        for (let p = 0; p < bytes.length; p += 7) {
          await write(res, bytes.subarray(p, p + 7), signal);
        }
        await sleep(100, undefined, { signal });
      }
    } else if (req.url === '/proxy') {
      const upstream = await fetch('http://127.0.0.1:3001/source', { signal });
      if (!upstream.ok ||
          upstream.headers.get('content-type')?.split(';')[0] !==
            'text/event-stream') {
        await upstream.body?.cancel();
        throw new Error('Invalid upstream response');
      }
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
      });
      for await (const event of parseSSE(upstream.body, signal)) {
        await write(res, `data: ${JSON.stringify(event)}\n\n`, signal);
      }
    } else {
      res.writeHead(404);
    }
    res.end();
  } catch (error) {
    const reason = signal.aborted ? signal.reason?.name : 'StreamError';
    console.error('subscription-ended', reason);
    if (!res.headersSent && !res.destroyed) {
      res.writeHead(signal.aborted ? 504 : 502);
      res.end('Subscription failed');
    } else if (!res.destroyed) {
      res.destroy(error instanceof Error ? error : undefined);
    }
  } finally {
    res.off('close', disconnected);
    controller.abort();
  }
}

const server = http.createServer((req, res) => {
  void handle(req, res).catch(() => res.destroy());
});
server.listen(3001, '127.0.0.1', () => console.log('listening:3001'));
process.once('SIGTERM', () => {
  server.close();
  server.closeAllConnections();
});
```

`res.write()` 返回 `false` 并不表示写入失败，而是提示生产者等待可写队列排空。等待期间，上游读取自然暂停。这个反馈最终还受 HTTP 客户端缓冲、TCP 窗口以及反向代理缓冲影响，不能解释为“内存里永远只有一个事件”。本例避免应用自行建立无限队列，并处理 `drain` 永远不来的断连路径。

返回头已经发出后，代理不能再把状态码改成 502。因此，此处中断传输，让客户端知道流没有正常结束。实际产品也可以定义专门的终止事件，但必须区分正常完成和错误事件，不能先发送成功结束标识再关闭连接。对于必须完成的任务，订阅连接不应该承担任务持久化所有权，应该使用任务 ID 和独立的查询协议。

## 客户端主动停止，而不只是停止显示

文件 `client.mjs`：

```js
import { parseSSE } from './sse.mjs';

const controller = new AbortController();
const signal = AbortSignal.any([
  controller.signal,
  AbortSignal.timeout(5000),
]);
let count = 0;
try {
  const response = await fetch('http://127.0.0.1:3001/proxy', { signal });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`HTTP ${response.status}`);
  }
  for await (const event of parseSSE(response.body, signal)) {
    console.log(JSON.parse(event.data));
    if (++count === 3) {
      controller.abort(new DOMException('User stopped', 'AbortError'));
      break;
    }
  }
} catch (error) {
  if (!controller.signal.aborted) throw error;
} finally {
  controller.abort();
}
```

两个终端分别执行：

```sh
node server.mjs
node client.mjs
```

客户端应读取三个事件后停止。本机源和代理分别记录自己的订阅结束，这不是两次用户操作。浏览器端同样可以用 `fetch` 和读取器，把按钮事件绑定到该次订阅的控制器；内置 `EventSource` 则调用 `close()`，但它的认证头、自定义 POST 和取消原因表达能力不同，不能无条件替换这套接口。

还要避免旧请求清理新请求的竞态：组件保存当前控制器时，旧请求 `finally` 只有确认控制器仍是自己的，才能清空引用。否则快速连续点击开始、停止，旧订阅结束后可能把新订阅的取消入口擦掉。取消对象应当跟逻辑订阅一一对应，而不是跟页面永久绑定。

## 怎样建立失败证据

只测试源端输出七字节块，不能证明客户端实际也接收七字节块，TCP 可以合并数据。解析器需要确定性分块测试。下面文件 `parser-check.mjs` 使用真实的原生 `ReadableStream`，不替代前面的 HTTP 验证：

```js
import assert from 'node:assert/strict';
import { parseSSE } from './sse.mjs';

const bytes = new TextEncoder().encode(
  ': heartbeat\r\nid: 7\r\ndata: 中文\r\ndata: 第二行\r\n\r\ndata: lost',
);
const body = new ReadableStream({
  start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  },
});
const events = [];
for await (const event of parseSSE(body)) events.push(event);
assert.deepEqual(events, [
  { event: 'message', id: '7', data: '中文\n第二行' },
]);
assert.equal(body.locked, false);
console.log('parser assertions passed');
```

执行 `node parser-check.mjs` 检查逐字节 UTF-8、跨块 CRLF、多行数据、注释和未完成尾事件。另做非法 UTF-8、单独 CR、连续空行以及超过字符上限的用例，断言失败类型而不只看控制台。总时限测试应保持连接持续产生数据：否则测试到的可能只是空闲超时，而非总时限。

背压测试需要慢读真实 socket，并让源产生足够数据触发写队列阈值。观察 `writableLength`、活跃订阅数、等待排空次数及上游断连时间，不应凭一次小响应就声称背压已经测过。真实部署还应分别经过 CDN、压缩中间件和网关，确认是否缓冲 SSE，验证移动网络断连检测的延迟。

## 取消协议的工程边界

这份实现主动拒绝无限事件，限制订阅时间，且没有自动重试。自动重试必须同时考虑授权过期、事件 ID 的持久性、重放窗口以及重复事件的处理；仅保存最后一个字符串 ID 并不能提供恰好一次消费。源端若没有可恢复事件日志，客户端重连只能获取新流，不能保证补齐断线期间的数据。

日志只记录受控原因，不记录事件正文、请求凭证或完整 URL。对外错误响应保持有限信息，对内指标区分用户取消与故障。正常用户点击停止不应该计入上游错误率，但“取消后源仍持续工作”应成为单独的资源泄漏信号。

最重要的不变量不是“所有异常都被捕获”，而是任何结束路径都能回答三个问题：谁不再需要数据，等待中的操作如何醒来，谁负责释放自己持有的资源。UTF-8 解码、SSE 空行、写队列和控制器分别落实自己的边界，才有机会形成一个可解释的流式系统。

## 时限、重试和连接池需要分别设计

总时限和空闲时限不是同一回事。十秒总时限从订阅开始计算，即使上游一直发心跳也会结束；空闲时限则在收到有效活动后重新计时。若产品允许长时间订阅，应该定义什么算活动：收到任意字节、完整行还是完整业务事件。只按字节续命可能让攻击者每隔几秒发一个字符，永久占用连接而不产生可用结果。

本例采用总时限，是为了让资源占用具有上界。实际应用若需要空闲时限，可以用额外控制器及可清理定时器组合信号，但不能在每次数据到来时不断新增未移除的监听器。成功、取消和解析失败都要撤销定时器，防止旧订阅的定时任务后来影响新订阅。

上游状态码错误也需要处理响应体。HTTP 失败的响应可能包含大正文，直接抛错而不消费或取消会让连接资源的释放依赖底层实现及垃圾回收。本例不读取错误正文，只取消响应体并记录受控失败分类；若排障确需错误摘要，应限制字节数，过滤敏感字段，不将全部正文直接拼进异常消息。

连接池重用和业务订阅结束也不能混为一谈。取消响应体后，底层客户端可以选择关闭连接或以安全方式复用连接，应用不该把“还存在 TCP 连接”直接判定成订阅泄漏。更可靠的观测对象是活跃业务订阅、尚未结束的读取器和仍在执行的源任务，并结合连接状态分析，而不是只统计端口上的 socket 数量。

自动重试还会形成新的负载反馈。上游一旦变慢，客户端同时超时并立即重连，可能把短暂拥塞放大成持续过载。指数退避、随机抖动和并发上限分别限制重试频率与峰值，但业务上必须先判断这个订阅是否允许重试。认证拒绝和协议错误不应被当成临时传输错误反复请求。

## 监测指标要围绕生命周期

可以在开始时增加活跃订阅计数，在唯一的收尾位置减少，并按正常完成、用户离开、总时限和协议失败分类。这个计数不能在多个 catch 和 close 回调里各减一次，否则取消竞态会把仪表盘变成负数。开始次数、结束次数与当前活跃数之间的关系，本身就是发现漏清理的检查条件。

慢读观察需要记录等待排空的次数与持续时间，但不要把一个偶发的 `false` 当成性能事故。网络窗口、响应大小和消费者速度都会影响结果。持续排空等待伴随活跃订阅增长，才值得进一步查客户端、网关与上游的瓶颈；没有具体测量，不应该宣称某种分块大小天然更快。

对于断连后的源任务，代理只能证明自己的取消信号已经发出。要证明外部上游也停止，需要上游提供结束事件、任务状态或受控指标。若上游忽略连接关闭而继续计算，代理的正确清理并不能节省它的算力。双方协议必须明确取消是停止生成、停止订阅，还是仅停止发送结果。

应用关闭同样应有两阶段策略：先不接受新订阅，再给已存在的订阅一段排空时间，最后主动取消仍未完成者。本例的 SIGTERM 处理选择立即关闭全部 HTTP 连接，便于本机结束；生产若要优雅发布，应给每个活跃订阅保存自己的控制器，并定义宽限期及恢复方法，不能以无限等待作为“优雅”的代价。

## 示例验证范围

在 Node `22.22.0` 中运行完整 HTTP 源、代理和客户端，客户端收到三条中文事件后取消，代理与源均进入取消收尾。另用总时限信号中断已经收到事件的响应体读取，并验证逐字节 UTF-8、跨块 CRLF、单独 CR/LF、过长事件、非法 UTF-8 及读取锁释放。这些是本机功能验证，不是外部服务和生产负载证据。

没有实施大响应慢 socket 负载测试，也没有经过 CDN、压缩代理和移动网络。因此，代码包含背压等待与断连唤醒机制，但真实链路的缓冲量、排空延迟和取消到达时间仍需部署环境实测，不能从三条小事件推导容量结论。

## 官方参考

- [Node 22 Globals：fetch、AbortController、AbortSignal](https://nodejs.org/docs/latest-v22.x/api/globals.html)
- [Node HTTP：ServerResponse 和服务器连接关闭](https://nodejs.org/docs/latest-v22.x/api/http.html)
- [Node Web Streams：读取器、取消与锁](https://nodejs.org/docs/latest-v22.x/api/webstreams.html)
- [WHATWG：Server-Sent Events 的逐行解析与事件派发](https://html.spec.whatwg.org/multipage/server-sent-events.html)

示例覆盖本机协议和取消路径，不包含生产负载数据，也不以本机测试推导网关性能。发布前应在实际链路重复断连、慢读和时限测试，并单独核验认证及重放策略。
