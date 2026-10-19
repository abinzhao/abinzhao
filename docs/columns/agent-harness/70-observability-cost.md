---
title: 第七十章：OpenTelemetry、诊断与成本
description: 区分追踪、指标、日志与会话内容，控制敏感信息和高基数，并用可核对的测量解释运行成本。
date: '2026-10-17'
category: 智能体工程
tags: [OpenTelemetry, 成本]
series:
  order: 70
---

# 第七十章：OpenTelemetry、诊断与成本

智能体慢了，需要知道是排队、模型生成、工具执行还是审批等待。任务失败了，需要知道是输入、权限、网络还是产物不合格。遥测的作用是定位这些问题，不是把全部对话复制到另一个数据库。本章围绕信号、字段、队列与成本来源设计诊断流程，尤其防止凭据泄露和高基数指标。

## 三类信号与不同问题

Trace 表示请求经过组件的路径，适合关联一次运行的模型、工具和提交阶段；Metric 聚合运行时测量，适合看错误率、队列深度和耗时分布；Log 保留离散事件，适合解释具体失败。Baggage 是跨边界传播的上下文，不能当作安全授权载体，更不应携带用户正文或 Token。信号可以相互关联，但不应重复存储全部敏感内容。

指标标签需低基数。tool_name、status、受控 provider 类别可用于聚合；sessionId、文件路径、完整 URL、错误全文和用户输入会产生大量独特序列，还可能泄露信息。run ID 可以进入有访问控制的追踪关联字段，但不能因为“需要定位”就成为每个 metric 的维度。指标缺少详细正文是有意设计，细节应通过授权日志查询。

## 固定实现的真实遥测边界

DeepSeek Harness 固定提交 `1517a4dbca0a2789ff1d41ba439600f8547d23fa` 的 otel 文档说明，共享服务提供独立普通事件与 Session log 通道，通道的传输、资源和 scope 由业务消费者显式选择。仅挂载服务不分配 provider 或网络连接；每个通道拥有独立队列和请求，消费者负责 shutdown，关闭后不得复用。

Session 反馈会先经过授权、规范前缀捕获与脱敏，再进入报告通道。共享服务本身不自动决定身份和采集政策。这意味着“接入 OTel”不能作为全量记录聊天的授权，也不能让业务把红线治理推给 exporter。字段选择应在数据离开业务边界之前完成，而不是发送后再希望后端删除。

```text
运行事件
  -> 采集授权
  -> 字段白名单 + 脱敏
  -> Trace/Metric/Log 分类
  -> 有界队列与批处理
  -> 受控导出
  -> 有期限的 shutdown
```

Trace span 应围绕真实阶段开始和结束。动作意图生成、实际工具开始与耐久记录提交不是同一时间；一个 turn 结束也不表示后台 job 已释放。记录 duration 时应注明范围，并将用户审批等待与执行耗时分开，否则团队会把正常人工等待误判成模型性能退化。

## 自包含安全字段实验

下面是事件投影器，不是 OpenTelemetry SDK。它仅输出白名单元信息，使用受控枚举降低基数，并拒绝非法耗时。夹具中的 secret 字符串是明显假值；代码不读取凭据、不发送遥测，也不安装任何依赖。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
function project(event) {
  if (!Number.isFinite(event.durationMs) || event.durationMs < 0) {
    throw new Error('invalid-duration');
  }
  const tool = new Set(['read', 'search']).has(event.tool) ? event.tool : 'other';
  const status = new Set(['completed', 'failed', 'cancelled']).has(event.status)
    ? event.status : 'unknown';
  return { tool, status, durationMs: event.durationMs };
}
const raw = {
  tool: 'read', status: 'completed', durationMs: 12,
  prompt: 'do not export this fixture',
  authorization: 'FAKE_SECRET_DO_NOT_USE',
  path: '/private/fixture.txt', sessionId: 'fixture-session-1',
};
const safe = project(raw);
assert.deepEqual(Object.keys(safe), ['tool', 'status', 'durationMs']);
assert.equal(JSON.stringify(safe).includes('FAKE_SECRET'), false);
const labels = new Set(Array.from({ length: 100 }, (_, i) =>
  project({ tool: `arbitrary-${i}`, status: 'failed', durationMs: i }).tool));
assert.deepEqual([...labels], ['other']);
assert.throws(() => project({ durationMs: Infinity }), /duration/);
console.log(JSON.stringify({ safe, distinctToolLabels: labels.size }));
NODE
```

投影器仍不构成完整隐私方案。允许的工具名也可能由动态插件生成，应以注册目录映射到受控分类；错误堆栈和资源属性同样要审查。采用白名单通常比对未知字段逐个打码可靠，但保留字段也需授权。对外传播的 trace headers 应验证格式和长度，不能任意转发来源请求的 baggage。

## 成本与 Token 的口径

上下文压力、模型 usage 与计费金额是三件事。基础项目按 JSON 字节估算输入，不是精确 Token；实验每块成本一也只是选择夹具。DeepSeek token-meter 文档区分 usage 锚点、estimated 基线、表面 Token 与请求响应总压力，并携带日志修订。因此估算应附来源、模型路由与修订，不能把估算值当作平台账单。

成本核算需要固定 provider、model、价格版本、计费单位和真实 usage，并区分输入、缓存、输出及重试。价格未知或 usage 缺失时保持 null，不能用零填充。工具服务、容器和对象存储成本也可能存在；只算模型 Token 会漏掉任务总成本。跨供应商比较必须统一币种与计费口径，不能拿目录价与实际账单混比。

用户取消不保证免费。请求已进入服务后，可能产生部分用量；工具超时后重试也可能已发生费用。记录应同时追踪请求尝试和最终任务，把失败尝试归到所属任务，避免只给成功调用记账。测量缺失的运行应单独列出，不能以估算补齐后宣称真实成本全量覆盖。

## 故障与可观察验收

导出端不可用时，队列应有明确上限与丢弃或背压策略，不能无限占内存。一般诊断通道失败不应阻塞核心任务；安全审计若是执行前提，则要采用明确 fail-closed 策略。两种政策必须提前决定，不能在 exporter 失败时临时吞错。关闭时限制 flush 等待，并报告剩余或丢弃事件，不能声称全部送达。

运行实验应确认 prompt、路径、session ID 和假凭据都不出现在输出，一百个任意工具名被归为一个标签，非法耗时被拒绝。真实 OTel 验收还需拦截实际网络载荷，检查 headers、resource 属性、事件正文与失败诊断日志，测试 exporter 超时和 shutdown。仅扫描应用输出不足以证明没有泄露。

基础示例未接入 OTel exporter，`labs/` 的统计也不是计费采集。这里没有模型费用、真实吞吐或云端遥测效果数据。上线前应独立审查采集权限、保留周期、删除流程和访问控制，带上成本缺失率及队列丢弃指标，才能把诊断作为可信运维证据。

## 官方来源

- [DeepSeek otel](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/otel.md)：通道所有权、采集与关闭契约。
- [DeepSeek token-meter](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/token-meter.md)：估算与 usage 锚点。
- [OpenTelemetry signals](https://opentelemetry.io/docs/concepts/signals/)：官方信号定义，核验于 `2026-10-17`。
- [OpenTelemetry sensitive data](https://opentelemetry.io/docs/security/handling-sensitive-data/)：生产脱敏与采集治理阅读入口。

上一章：[第六十九章：Skill、插件评测与消融对比](./69-skill-plugin-evals.md)

下一章：[第七十一章：性能、限流、资源泄漏与运维](./71-performance-operations.md)
