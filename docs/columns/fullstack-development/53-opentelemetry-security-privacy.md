---
title: "第 53 章：OpenTelemetry、安全与隐私"
description: "用最小化的业务追踪和结构化日志定位故障，控制遥测基数、敏感字段、供应链与数据生命周期。"
date: '2026-10-23'
category: 可观测性与安全
tags: [OpenTelemetry, 日志, 隐私, 安全]
series:
  order: 54
---

# 第 53 章：OpenTelemetry、安全与隐私

发生保存失败时，需要知道请求经过哪里、数据库等待多久、属于权限拒绝还是内部异常。但这些问题不要求收集用户正文、密码、完整邮箱或 Session。可观测性首先是诊断设计，其次才是安装 SDK；没有字段边界的自动采集可能把一套正确保护的应用变成数据泄漏通道。

## 53.1 信号、问题与预算

日志记录离散事件与错误类别；指标观察请求量、错误率、延迟分布、连接池等待和队列积压；追踪串联一次操作跨组件的耗时。三者互补，不能把每条请求正文塞进日志来代替诊断，也不能用平均延迟掩盖 p99。

先定义用户可见的服务目标：保存请求的成功率与延迟、公开阅读的可用性、任务完成时间。身份错误、权限拒绝与服务内部 5xx 分开统计，避免大量预期 401 淹没真正故障。低流量博客的百分位和错误率样本不足时应显示样本数，不伪装成稳定统计结论。

OpenTelemetry 是厂商中立的采集与传输接口，不是默认承诺隐私安全的存储系统。课程 API 包为 1.10.0，sdk-node 与 OTLP HTTP exporter 为 0.300.0；不同包有不同稳定性层级。官方当前示例与旧文章的 SDK 路径也可能不同，具体 API 以安装包类型与官方说明为准，不把 npm latest 当成所有实验能力稳定的证明。[JavaScript 状态](https://opentelemetry.io/docs/languages/js/)

## 53.2 先做手动业务追踪

在独立学习后端安装已核验版本：

```bash
npm install --save-exact @opentelemetry/api@1.10.0 \
  @opentelemetry/sdk-node@0.300.0 \
  @opentelemetry/exporter-trace-otlp-http@0.300.0
```

先使用手动 span，默认不启用 HTTP、数据库与环境自动插桩，避免未审查的 URL、SQL、主机信息或请求属性进入遥测。遥测端点通过受控配置指定，学习时指向本机 Collector；不把浏览器用户数据自动发送到外部监控服务。

```ts
// src/instrumentation.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

export const telemetry = new NodeSDK({
  serviceName: 'blog-api',
  autoDetectResources: false,
  instrumentations: [],
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
      'http://127.0.0.1:4318/v1/traces',
    timeoutMillis: 3000,
  }),
});
telemetry.start();
```

```bash
export OTEL_TRACES_SAMPLER=parentbased_traceidratio
export OTEL_TRACES_SAMPLER_ARG=0.1
node --import ./dist/instrumentation.js ./dist/server.js
```

这里的 `dist/` 对应第 37 章练习工程；配套博客的编译目录是 `dist-api/`，接入后替换路径。SDK 必须在应用模块执行前初始化，不在首个请求中重复建立。Exporter 初始化成功不代表 Collector 已收到数据；端口、协议、TLS 与导出队列仍需要真实验证。

本章只手动插桩，不需要为此添加自动插桩 loader。如果启用自动插桩，课程可选包版本为 `@opentelemetry/auto-instrumentations-node@0.82.0`；ESM 依赖截获还需按官方 ESM 支持说明配置加载机制并测试，不能声称一个 `--import` 自动覆盖所有第三方库。避免同时使用两种自动注册方式造成重复 span。[Node 入门与 ESM 注意事项](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/)

## 53.3 业务 span 只记录可解释字段

给发布事务包一层手动追踪，保持返回值与异常传播不变：

```ts
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('blog-api', '1.0.0');
function failureCode(error: unknown) {
  if (typeof error !== 'object' || error === null) return 'INTERNAL_ERROR';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' &&
    ['REVISION_CONFLICT', 'FORBIDDEN', 'AUTH_REQUIRED'].includes(code)
    ? code : 'INTERNAL_ERROR';
}
export async function tracePublish<T>(work: () => Promise<T>): Promise<T> {
  return tracer.startActiveSpan('posts.publish', async span => {
    span.setAttribute('app.operation', 'posts.publish');
    span.setAttribute('http.route', '/api/tenants/:tenantId/posts/:id/publish');
    try {
      const result = await work();
      span.setAttribute('app.result', 'success');
      return result;
    } catch (error) {
      const code = failureCode(error);
      span.setAttribute('app.result', code);
      if (code === 'INTERNAL_ERROR') {
        span.setStatus({ code: SpanStatusCode.ERROR });
      }
      span.addEvent('operation.failed', { 'app.error.code': code });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

`work` 仍是现有事务函数，不能为了追踪拆掉授权锁或吞掉业务异常。冲突和拒绝属于预期业务结果，不必全部标成服务内部错误。错误分类使用白名单，不直接把任意 `error.message`、SQL 或 stack 写入 span；错误对象可能带用户输入与数据库参数。原始异常继续传播到应用既有错误边界。

span 名称是稳定操作名，路由是模板，不包含文章 ID、空间 slug 或查询参数。没有日志与追踪关联时可以增加服务自己生成的 requestId，但不把它作为指标标签。不要把用户提供的 `traceparent` 当作身份、权限或可信 requestId；外部追踪上下文需要长度与格式限制，采样和租户授权仍由服务器控制。

Root span 本章从业务操作开始，不声称已有完整 HTTP→SQL 分布式树。加入自动 HTTP、数据库插桩之前，先用带学习秘密和正文的请求检查原始导出内容，明确如何删除 URL query、Cookie、SQL 参数与异常详情。只在 Collector 后端脱敏不够，数据可能先进入出口日志或另一个 exporter。

## 53.4 结构化日志采用白名单

Fastify 默认请求日志可能包含原始 URL。需要隐私最小化时关闭自动请求日志，并在 `onResponse` 写允许字段；不要先记录整个 request，再寄希望于后续规则覆盖所有新增属性。

```ts
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';

const app = Fastify({
  genReqId: () => randomUUID(),
  disableRequestLogging: true,
  logger: {
    level: 'info',
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie',
        'res.headers["set-cookie"]', 'password', 'token', 'body'],
      censor: '[REDACTED]',
    },
  },
});
app.addHook('onResponse', async (request, reply) => {
  request.log.info({
    route: request.routeOptions.url ?? 'unmatched',
    method: request.method,
    statusCode: reply.statusCode,
  }, 'request_completed');
});
```

这段用于新练习服务，接入配套项目时修改现有 Fastify 配置，不另建第二个 app。redact 是误用时的补充防线，主要安全性来自不发送请求体、完整 URL 与身份字段。不要打印传入的 error 对象后又以“日志有 redaction”宣称安全，它可能在不同路径携带敏感信息。

requestId 用于排查某次错误，长度固定且由服务器生成；返回给前端可以让用户描述问题，而不需要提交正文。数据库池错误日志只记录错误类别和连接状态。身份登录事件、权限变化和敏感管理操作需要独立安全审计，但仍按目的限制内容、访问权限和保留周期。

## 53.5 指标基数与采样边界

指标标签允许 method、路由模板、状态类别与固定业务结果，不允许 userId、tenantId、邮箱、文章 slug、requestId。标签组合数量相乘，会带来存储、查询和内存成本；所谓“方便按用户看图”可能变成高基数故障与隐私问题。

请求延迟使用分布而非每请求一个标签；任务积压、最老未完成事件年龄、池等待与认证忙碌拒绝需要独立指标。认证限流造成的 429 与 scrypt 并行容量造成的 503 分开统计，避免把防护效果误判成业务崩溃。学习时先用低基数日志建立基线，再接入实际 MetricReader 和 exporter，不把只有 API 的 no-op counter 当已采集指标。

10% 头部采样是起步策略，不保证所有错误被保留。需要保留慢请求或错误的尾部采样时，Collector 要等待 trace 完成并承担有界内存和队列成本。导出失败不得阻塞登录和保存；也不无限缓冲等待监控恢复。遥测是辅助系统，仍需对队列、超时、丢弃量和出口流量设限。

退出时在停止活动请求之后调用 `telemetry.shutdown()`，给它独立的短截止时间，不让不可达 Collector 拖住无限停机。不能添加多个各自 `process.exit()` 的信号处理器互相竞争；把它接入第 37/51 章统一关闭流程。日志输出顺序也不等于事务提交顺序，记录成功必须放在提交成功之后。

## 53.6 数据生命周期与安全基线

列出存储中的用户数据：邮箱、密码摘要、Session 摘要、私有文章、文件、登录审计与遥测。每项写清用途、合法依据或产品授权、访问者、保留期限、删除触发与备份中的处理。密码摘要不是匿名数据，用户 ID 哈希也不自动匿名；低熵邮箱被普通 SHA-256 后仍可能枚举。

删除用户不能只删前端缓存，还需 Session 撤销、成员关系、文章归属、对象文件、异步任务、搜索索引与遥测标识的处理。备份常有延迟删除窗口，应在政策中明确并限制恢复后数据重新出现。最小博客未实现删除与合规管理，不能凭“数据在 PostgreSQL”声称满足隐私法规。

安全基线还包括 HTTPS、Cookie、CSRF、输入与输出边界、授权、参数化 SQL、上传隔离、网络出口、依赖更新和最小权限。CSP 先在报告模式检查实际脚本与资源，再逐步强制，不复制一个会阻断功能的策略后以浏览器没报错当安全验证。错误页、帮助链接和监控端点同样在范围内。

供应链更新要核对受维护版本、公告、锁文件与镜像摘要，不将旧依赖永久固定。浏览器 `VITE_*` 都是公开配置，后端秘密不进入静态产物。调试日志和截图同样可能泄漏数据，发布前搜索明显秘密与学习标记，同时检查实际构建内容而非仅看源码。

## 53.7 验证、排错与练习

在本机 Collector 读取真实导出，执行正常发布、冲突、权限拒绝与数据库失败；检查 span 结束、业务错误传播不变，且日志和 trace 不含学习密码、Cookie、邮箱、正文与完整 URL。关闭 Collector 后业务应仍按原错误契约运行，导出队列与内存有界；这项必须实测，安装成功不算通过。

没有 span 时查 SDK 是否提前加载、provider 是否注册、采样是否丢弃、Exporter 协议和 Collector 路由；span 重复查双重注册；标签激增查动态路径与任意错误文本。误采敏感字段时先停止相关出口、限制访问并按事件流程处理，不只是增加一个未来 redaction 规则。

练习定义公开阅读与发布各一个服务目标，设计对应低基数指标与告警；再为一条用户删除流程写数据清单、保留与备份处理。完成标准是故障可以凭 requestId 和稳定操作名定位、遥测失败不改变业务语义、敏感字段通过原始导出检查、采样与丢弃有记录、停机有界。最小配套项目尚未接入 OpenTelemetry、Collector 或生产安全审计，此章内容是明确扩展实践，不是已有通过项。

## 官方参考

- [OpenTelemetry：JS 手动插桩](https://opentelemetry.io/docs/languages/js/instrumentation/)。
- [OpenTelemetry：Exporter](https://opentelemetry.io/docs/languages/js/exporters/)与[采样](https://opentelemetry.io/docs/concepts/sampling/)。
- [OpenTelemetry：敏感数据处理](https://opentelemetry.io/docs/security/handling-sensitive-data/)。
- [Fastify：Logging](https://fastify.dev/docs/latest/Reference/Logging/)。
- [OWASP：Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)。
- [OWASP：ASVS](https://owasp.org/www-project-application-security-verification-standard/)。

下一章：[博客 v3 全栈毕业项目](./54-blog-v3-fullstack-capstone)。
