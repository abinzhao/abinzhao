---
title: OpenTelemetry JS 的隐私边界：最小化 Trace 数据与有期限的导出收尾
description: 基于核验后的 OpenTelemetry JS SDK 构建真实跨 HTTP Trace，控制上下文传播和敏感字段，并让导出超时不阻塞服务退出。
date: "2026-10-17"
category: 可观测性
tags: [OpenTelemetry, Trace, 隐私工程, Node.js]
featured: false
---

# OpenTelemetry JS 的隐私边界：最小化 Trace 数据与有期限的导出收尾

可观测性数据很容易绕过业务系统原本的安全边界。请求正文没有进入业务日志，却被异常事件带进 Trace；URL 查询参数没有保存到数据库，却被自动插桩导出；业务服务已经准备关闭，遥测出口却因网络不响应而拖住进程。收集更多数据不一定提高排障能力，也可能扩大数据暴露和停机风险。

本文解决的实质问题是：如何在保留跨 HTTP 调用关联的同时，只导出必要信息，并给遥测收尾设置真正有效的期限。示例使用实际 OpenTelemetry JS 发布包、真实 HTTP 服务和真实 OTLP/HTTP JSON 接收端，不把内存中的 span 列表当成已经发送到 Collector 的证据，也不编造吞吐数据。

## 版本首先是实现的一部分

OpenTelemetry JS 的 API、稳定 SDK 和实验包不共享同一个版本号。本文核验的发布组合是 API `1.9.1`、稳定 tracing SDK 与 resources/core `2.12.0`、`sdk-node` 和 OTLP HTTP exporter `0.223.0`。这是文章的可复现组合，不是建议把所有项目依赖无条件升级成最新版本。

[JavaScript instrumentation 官方说明](https://opentelemetry.io/docs/languages/js/instrumentation/) 当前示例使用 `resourceFromAttributes` 与 `sdk-trace`。安装包的类型声明也确认 `NodeSDK.start()` 返回 `void`、`shutdown()` 返回 Promise，批量处理器使用包含 `exporter` 的配置对象。不能把旧文章里的 `new Resource()`、运行后动态追加 processor 等写法直接拼到新 SDK 上。

SDK 初始化要早于需要插桩的模块导入。本例使用 `--require` 预加载 CommonJS 文件，并且完全采用手动插桩，不注册 HTTP 自动 instrumentation。ESM 自动插桩还可能涉及 loader 和 import hook 的版本条件，不能认为把初始化函数放在入口最后一行就会追溯捕获之前导入的库。

包锁文件、Node 版本和实际 exporter 配置共同决定运行结果。排查“没有数据”时，先确认到底装了哪份 SDK、全局 provider 是否注册、span 是否结束、采样是否保留以及协议是否匹配，再猜网络问题。OTLP HTTP 的 traces 路径通常是 `/v1/traces`，不是任意一个 HTTP 地址都能接收相同载荷。

## 从数据最小化开始，而不是从补丁式脱敏开始

最容易审查的策略是白名单。span 名称使用固定操作名，路由使用模板，属性只允许请求方法、受控操作分类和静态路由。不要默认采集 Cookie、Authorization、完整 URL、请求正文、邮件、手机号和异常原始信息，然后指望最后一个 exporter 把所有风险字段找出来。

哈希不自动让个人数据匿名。有限空间的手机号和邮箱可被枚举，不加盐的稳定哈希还会形成跨系统关联标识。即便去掉姓名，Trace ID、时间、设备标识、租户和罕见操作的组合仍可能识别个人。隐私要求需要同时约束采集目的、保留期、查询权限和传播范围。

错误也有载荷。`recordException(error)` 可以记录消息和堆栈，而驱动错误常包含 SQL、URL 或业务值。本例只设置受控的错误状态码，不导出异常对象、不把 `error.message` 当作 span 描述。需要更多错误细节时，可设计有限的错误分类，并在独立受控日志系统里保存经过审查的诊断信息。

这会损失一部分即时排障便利，却让跨团队共享 Trace 更容易治理。调试临时增加字段，应有明确授权、时限和清理策略，不应把“先收集以后可能有用”当成默认原则。Collector 侧的脱敏可以构成第二道防线，但敏感数据一旦离开应用，已经穿过了网络、队列和可能的其他 exporter。

## Trace Context 不是身份，也不是安全通行证

W3C Trace Context 用 `traceparent` 表达 trace、父 span 和标志，用 `tracestate` 传递供应商状态；Baggage 是另一套可以跨调用传播的键值信息。它们服务于关联观测，不证明请求来自哪个用户，也不能用于权限判断。

本例只接受格式受限的版本零 `traceparent`，不接收外部 `tracestate` 和 baggage。然后从 `ROOT_CONTEXT` 提取父上下文，避免错误沿用别的请求的活跃上下文。只配置 `W3CTraceContextPropagator`，也防止隐私信息通过默认 baggage 策略不经意传播。

外部调用者可以伪造 Trace ID 和 sampled 标志。可信内部服务可以采用 ParentBased 采样维持链路决策；公共入口则应设计独立采样与信任政策，避免客户端要求全量采样造成遥测成本攻击。本例采样比例为一，仅为了验证所有本机请求都可见，不是生产流量的建议设置。

关联 ID 本身仍需要访问控制。只要外部和内部共用一个 Trace ID，拥有任一侧信息的人就可能进行时间关联。不同信任域是否继续同一个 trace、是否建立新 trace 后使用受控 link，需要产品和安全规则决定，不是 propagator 自动替组织做出的选择。

## 安装经过核验的依赖

使用 Node `22.22.0`，在独立目录安装：

```sh
mkdir otel-privacy-example
cd otel-privacy-example
npm init -y
npm install --save-exact @opentelemetry/api@1.9.1 \
  @opentelemetry/sdk-node@0.223.0 @opentelemetry/sdk-trace@2.12.0 \
  @opentelemetry/resources@2.12.0 @opentelemetry/core@2.12.0 \
  @opentelemetry/exporter-trace-otlp-http@0.223.0
npm ls @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/sdk-trace
```

文件 `telemetry.cjs`：

```js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { BatchSpanProcessor, TraceIdRatioBasedSampler } =
  require('@opentelemetry/sdk-trace');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { W3CTraceContextPropagator, ExportResultCode } = require('@opentelemetry/core');
const { OTLPTraceExporter } =
  require('@opentelemetry/exporter-trace-otlp-http');

const transport = new OTLPTraceExporter({
  url: 'http://127.0.0.1:4318/v1/traces',
  timeoutMillis: 1000,
});
let exportFailed = false;
const pending = new Set();
const exporter = {
  export(spans, callback) {
    let finish;
    const done = new Promise((resolve) => { finish = resolve; });
    pending.add(done);
    let settled = false;
    const complete = (result) => {
      if (settled) return;
      settled = true;
      if (result.code !== ExportResultCode.SUCCESS) {
        exportFailed = true;
        console.error('trace_export_failed');
      }
      pending.delete(done);
      finish();
      callback(result);
    };
    try {
      transport.export(spans, complete);
    } catch (error) {
      // 同步回调自己的异常不能被误判成 transport 拒绝而吞掉。
      if (settled) throw error;
      complete({ code: ExportResultCode.FAILED });
    }
  },
  async shutdown() {
    // 包括定时批次已交给 exporter、已不在 processor 队列内的请求。
    await Promise.all([...pending]);
    await transport.shutdown();
  },
};
const processor = new BatchSpanProcessor({
  exporter,
  maxQueueSize: 128,
  maxExportBatchSize: 32,
  scheduledDelayMillis: 500,
  exportTimeoutMillis: 1500,
});
const sdk = new NodeSDK({
  autoDetectResources: false,
  resource: resourceFromAttributes({
    'service.name': 'privacy-example',
    'service.version': '1.0.0',
  }),
  textMapPropagator: new W3CTraceContextPropagator(),
  sampler: new TraceIdRatioBasedSampler(1),
  spanProcessors: [processor],
});
sdk.start();
module.exports = { sdk, processor, hasExportFailure: () => exportFailed };
```

关闭自动 resource 检测避免采集主机名和进程信息。SDK 仍可能附带标准 SDK resource 属性，它们和应用设置的 service 属性都应在接收端纳入审查。不能只审查 `span.attributes`，忽略 resource、event、link 和状态描述；这些字段同样会出现在导出载荷里。

有界队列意味着过载时可能丢弃遥测。这里接受这一取舍，因为 Trace 不是业务账本。必须可靠保存的交易和审计不应依赖一个会采样、会丢弃的批量 span 队列。增大队列会占用更多内存，也增加服务退出时需要排空的工作量，不是没有成本的优化。

## 真实跨 HTTP 调用及受控错误

文件 `app.cjs` 包含入口和工作端点，二者通过本机 HTTP 真实通信：

```js
const http = require('node:http');
const { context, propagation, trace, ROOT_CONTEXT,
  SpanKind, SpanStatusCode } = require('@opentelemetry/api');
const { sdk, processor, hasExportFailure } = require('./telemetry.cjs');
const tracer = trace.getTracer('privacy-example', '1.0.0');

function parentFrom(req) {
  const value = req.headers.traceparent;
  const carrier = {};
  if (typeof value === 'string' &&
      /^00-[a-f0-9]{32}-[a-f0-9]{16}-[a-f0-9]{2}$/.test(value)) {
    carrier.traceparent = value;
  }
  return propagation.extract(ROOT_CONTEXT, carrier);
}

async function handle(req, res) {
  const route = new URL(req.url, 'http://127.0.0.1').pathname;
  if (req.method !== 'GET' || !['/compute', '/worker'].includes(route)) {
    res.writeHead(404).end();
    return;
  }
  return tracer.startActiveSpan(route === '/compute' ? 'compute' : 'worker', {
    kind: SpanKind.SERVER,
    attributes: {
      'app.operation': route === '/compute' ? 'compute' : 'worker',
      'http.request.method': 'GET',
      'http.route': route,
    },
  }, parentFrom(req), async (span) => {
    try {
      if (route === '/compute') {
        await tracer.startActiveSpan('worker.call', {
          kind: SpanKind.CLIENT,
          attributes: { 'app.operation': 'worker' },
        }, async (child) => {
          try {
            const headers = {};
            propagation.inject(context.active(), headers);
            const response = await fetch('http://127.0.0.1:3004/worker', {
              headers,
              signal: AbortSignal.timeout(1500),
            });
            if (!response.ok) {
              await response.body?.cancel();
              throw new Error('Worker rejected');
            }
            await response.arrayBuffer();
          } catch (error) {
            child.setStatus({ code: SpanStatusCode.ERROR });
            throw error;
          } finally {
            child.end();
          }
        });
      } else {
        span.addEvent('worker.completed');
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      span.setStatus({ code: SpanStatusCode.ERROR });
      if (!res.destroyed) res.writeHead(502).end('Operation failed');
    } finally {
      span.end();
    }
  });
}

const server = http.createServer((req, res) => {
  void handle(req, res).catch(() => res.destroy());
});
server.listen(3004, '127.0.0.1', () => console.log('listening:3004'));

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  const hardDeadline = setTimeout(() => {
    console.error('shutdown_deadline');
    process.exit(1);
  }, 4000);
  let failed = false;
  const drainDeadline = setTimeout(() => server.closeAllConnections(), 1000);
  try {
    await new Promise((resolve) => server.close(resolve));
  } finally {
    clearTimeout(drainDeadline);
  }
  try {
    await processor.forceFlush();
  } catch {
    failed = true;
    console.error('trace_flush_failed');
  }
  try {
    await sdk.shutdown();
  } catch {
    failed = true;
    console.error('trace_shutdown_failed');
  }
  clearTimeout(hardDeadline);
  process.exit(failed || hasExportFailure() ? 1 : 0);
}
process.on('SIGTERM', () => { void stop(); });
process.on('SIGINT', () => { void stop(); });
```

`startActiveSpan` 为回调建立活动上下文，但不会替异步业务自动结束 span，所以每层都有自己的 `finally`。下游调用注入的是客户端 span 的上下文，工作端点从 HTTP 头重新提取父关系。即便两个服务运行在同一进程里，关联也必须经过协议，而不是直接拿全局变量当父 span。

完整 URL 只用于路径解析，没有成为属性。发送 `?token=DO_NOT_EXPORT` 不应该在 Trace 中出现这个查询值。同样，异常正文、登录 Cookie 和 baggage 不在白名单内。本例只读受控路由，没有业务身份和个人记录；实际接入应用时必须重新审查自动 instrumentation 和语义约定新增的属性。

## 一个真实的有限 OTLP 接收器

下面 `sink.cjs` 接收 SDK 实际发送的 OTLP/HTTP JSON，并写入本地文件。它不是完整 OpenTelemetry Collector，不支持 gzip、其他信号、鉴权、多租户和路由；也没有模拟 exporter 的返回值。用途是观察真实网络序列化结果，检查隐私边界：

```js
const http = require('node:http');
const { appendFileSync } = require('node:fs');
const allowedAttributes = new Set([
  'app.operation', 'http.request.method', 'http.route',
]);
const allowedResources = new Set([
  'service.name', 'service.version', 'telemetry.sdk.name',
  'telemetry.sdk.language', 'telemetry.sdk.version',
]);
const allowedNames = new Set(['compute', 'worker', 'worker.call']);

function validate(payload) {
  if (!Array.isArray(payload.resourceSpans)) throw new Error('Invalid payload');
  let count = 0;
  for (const resource of payload.resourceSpans) {
    for (const attribute of resource.resource?.attributes ?? []) {
      if (!allowedResources.has(attribute.key)) throw new Error('Resource rejected');
    }
    for (const scope of resource.scopeSpans ?? []) {
      for (const span of scope.spans ?? []) {
        if (!allowedNames.has(span.name)) throw new Error('Span rejected');
        for (const attribute of span.attributes ?? []) {
          if (!allowedAttributes.has(attribute.key)) throw new Error('Attribute rejected');
        }
        if (span.status?.message) throw new Error('Status text rejected');
        if (span.links?.length) throw new Error('Links rejected');
        for (const event of span.events ?? []) {
          if (event.name !== 'worker.completed' || event.attributes?.length) {
            throw new Error('Event rejected');
          }
        }
        count++;
      }
    }
  }
  return count;
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/v1/traces' ||
      !req.headers['content-type']?.startsWith('application/json') ||
      req.headers['content-encoding']) {
    res.writeHead(415).end();
    return;
  }
  if (process.env.STALL === '1') {
    req.resume();
    return;
  }
  try {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) throw new Error('Payload too large');
      chunks.push(chunk);
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const count = validate(payload);
    appendFileSync('received-otlp.jsonl', JSON.stringify(payload) + '\n');
    res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    console.log('accepted-spans', count);
  } catch {
    res.writeHead(400).end();
  }
});
server.listen(4318, '127.0.0.1', () => console.log('listening:4318'));
process.once('SIGTERM', () => {
  server.close();
  server.closeAllConnections();
});
```

白名单接收检查是验证防线，不是通用脱敏器：它只能拒绝不认识的字段，无法证明允许字段的任意值都不敏感。因此应用仍使用固定名称和值。真实 Collector 应有独立访问控制、TLS 和保留策略，不能把这个本机文件接收器暴露到公共网络。

三个终端分别运行接收端、应用和请求：

```sh
node sink.cjs
```

```sh
node --require ./telemetry.cjs app.cjs
```

```sh
curl --fail 'http://127.0.0.1:3004/compute?token=DO_NOT_EXPORT'
```

等待一个导出周期后检查 `received-otlp.jsonl`。应存在 compute 服务端 span、worker.call 客户端 span 和 worker 服务端 span，三者 traceId 相同，父子关系正确；查询值不应出现在文件中。随机生成的 ID 每次不同，不能拿文章中编造的一组 ID 当成实际运行日志。

## 卡住导出时，Promise 超时还不等于资源取消

`Promise.race([shutdown(), timeout])` 只能决定调用者何时不再等待，不能取消原始导出，也不能关闭它持有的 socket。如果超时定时器又被 `unref()`，进程退出行为还依赖其他活跃句柄，不能当成硬期限。把错误捕获后完全不报告，也会把遥测丢失伪装成成功退出。

本例同时设置 exporter 请求超时、processor 批次超时、业务连接排空期限和进程级硬期限。先停止接收新业务，再让活跃请求结束或被关闭，最后 flush 并 shutdown。flush 失败仍会尝试关闭 SDK；四秒硬期限保留引用，确实可以终止一直不返回的收尾。定时批次开始时，span 已从 processor 队列取走，随后 `forceFlush()` 不一定等待这批请求；因此 wrapper 在真实 exporter 回调中记录失败，并在关闭时等待所有已提交批次。即使 flush 和 shutdown 本身成功，之前的导出失败也会产生受控日志和非零退出码。

最后的 `process.exit()` 是应用进程拥有者的明确政策，不适合放进可复用库。它可能丢弃未完成遥测，甚至未完成业务，因此必须在业务停止接受请求且已有恢复机制的前提下使用。Trace 丢弃可以接受，不代表业务交易也可以接受；编排平台的终止宽限期还应大于应用自身的收尾预算。

停止普通接收器后，使用 `STALL=1 node sink.cjs` 重新启动，再运行应用、请求一次并向应用发送 SIGTERM。分别验证请求后立即关闭，以及等待 500ms 定时批次已开始之后关闭的时序。此模式建立真实 TCP 连接、读取请求体，但故意不返回 HTTP 响应。两种时序都应在期限内非零退出，并记录 `trace_export_failed` 或收尾失败类别，不输出原始异常或 span 载荷。这是故障注入条件，不是模拟成功的遥测链路。

退出测试要记录信号发出时刻、退出时刻、退出码和有限错误分类。只看 `shutdown()` 被调用一次不能证明任务完成，只看进程退出也不能证明最后一批 span 已被接收。成功链路用接收文件验证，失败链路用超时和退出证据验证，二者不能互相代替。

## 部署前还需要验证什么

最小化策略要检查整份实际 OTLP 载荷，包括 resource、scope、span、event、link、status，以及 exporter 的目标地址和认证头。对自动插桩新增字段建立契约检查，比人工看一次控制台更能发现升级后的变化。采样比例小也不是隐私豁免，未被采样的数据是否曾进入本地事件或日志仍要确认。

Collector 脱敏、重试和队列都可能增加数据驻留时间。删除业务记录之后，关联 Trace 在独立后端是否仍可查询，需要保留与删除政策协调。不同 exporter 同时导出时，不能只检查一个出口；应用进程的 crash dump 和诊断日志也属于范围。

本机例子没有验证正式 Collector 的重试语义、TLS、鉴权、生产资源探测或大流量队列丢弃。没有这些实测，就不应声称系统已经达到某个吞吐或零数据丢失目标。功能验证只是证明这套受控配置能产生符合预期的网络载荷和结束行为。

## 将隐私政策变成可检查的契约

属性白名单最好附带值的约束。路由必须是有限模板，操作名必须来自枚举，错误分类必须来自受控表。若允许任意 `app.operation` 字符串，即使属性名看起来无害，调用方仍可能把正文或邮箱放进去。本例的应用代码限定值，接收器验证字段；更完整的测试应同时验证允许值与最大长度。

高基数与隐私风险往往一起出现。把订单号、用户标识和动态 URL 放进属性，不仅扩大关联能力，也会使查询、聚合和存储成本难以预测。诊断需求可以通过有限的操作类型、状态和错误分类满足一部分，确需逐笔关联时应使用经过授权的短期标识，并说明何时删除映射。

上下文传播需要目标白名单。一个服务把活动上下文注入任何用户指定 URL，就可能向第三方暴露内部关联信息，若同时传播 baggage 风险更大。本文目标地址固定，不存在用户控制的转发；实际 HTTP 客户端必须区分内部可信服务、第三方 API 和公共下载，分别决定是否注入 traceparent。

遥测认证凭证是另一条边界。exporter 的目标、认证头和代理配置可以来自部署环境，但不应成为 span 属性或诊断输出。配置错误时只报告受控类别，不回显带凭证的 URL。还需要对遥测后端做最小权限访问控制，避免一个应用的写入凭证拥有读取全部团队数据的能力。

## 采样与收尾不是数据完整性承诺

头部采样在操作开始时决定是否记录，可能错过之后才出现的异常；尾部采样需要在 Collector 缓冲一定范围的数据，增加内存、延迟和驻留时间。选择哪种方式需要结合排障目标和隐私约束，不应仅比较“哪种收得更多”。只保留错误 Trace 也可能暴露更详细的业务失败信息。

服务终止时，业务 span 应先结束再执行 flush。若 span 仍活跃，flush 只会处理已经结束并进入队列的记录，不能证明当前所有请求都被导出。本文先等待服务器关闭，超出期限关闭连接，再排空队列，仍允许极端终止路径丢失记录；对这些路径必须记录收尾分类而不是承诺零丢失。

部署平台的强制终止会打断应用代码，因此进程内硬期限应小于平台宽限期，并给网络出口和代理留出余量。容器收到信号、服务停止接流量、客户端重试和 Collector 接收能力之间也有时序关系。本机四秒只是示例政策，没有经过生产链路测量，不能直接转成组织的停机标准。

最后，可观测性故障不应反向阻塞核心业务。导出失败可以计数并告警，但把每个请求都同步等待遥测服务器，会把遥测后端变成业务可用性的前置条件。批量异步出口、有界队列和受控关闭将风险限制在观测路径，同时接受诊断数据可能不完整；审计账本应继续使用可靠的独立持久化机制。

## 示例验证范围

使用本文固定版本运行 SDK、业务服务和 OTLP HTTP 接收端，检查实际收到的 JSON：三个 span 共享请求指定的 Trace ID，compute、worker.call 与 worker 的父子关系正确；测试查询值、外部 tracestate 和 baggage 没有进入导出文件，接收端字段白名单检查通过。

真实无响应接收端模式下，应用报告 flush 失败并以非零状态退出，没有因 HTTP 出口沉默无限等待。该本机验证没有覆盖正式 Collector、TLS、遥测鉴权、自动插桩或大流量队列，退出用时也不构成生产停机性能承诺。

## 官方参考

- [OpenTelemetry JavaScript instrumentation](https://opentelemetry.io/docs/languages/js/instrumentation/)
- [OpenTelemetry JS Node SDK 官方源码与使用说明](https://github.com/open-telemetry/opentelemetry-js/tree/main/experimental/packages/opentelemetry-sdk-node)
- [sdk-node 0.223.0 发布包](https://www.npmjs.com/package/@opentelemetry/sdk-node/v/0.223.0)
- [sdk-trace 2.12.0 发布包](https://www.npmjs.com/package/@opentelemetry/sdk-trace/v/2.12.0)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- [OpenTelemetry：处理敏感数据](https://opentelemetry.io/docs/security/handling-sensitive-data/)
- [OTLP 协议与 HTTP JSON 编码](https://opentelemetry.io/docs/specs/otlp/)

可观测性的可靠性不只由“收到了多少 span”衡量，也由没有收集什么、上下文跨过哪些信任域、导出失败如何被看见以及服务怎样退出决定。先设计这些边界，再增加插桩，才能让诊断能力和隐私要求同时成立。
