---
title: 第六十八章：真实任务、Trajectory 与结果评测
description: 分离轨迹、最终产物与安全结果，保留缺失样本和测量来源，建立不伪造模型效果的评测流程。
date: '2026-10-17'
category: 智能体工程
tags: [评测, Trajectory]
series:
  order: 68
---

# 第六十八章：真实任务、Trajectory 与结果评测

“模型回答很完整”和“任务已完成”是两种判断。代码任务要检查文件与测试，资料任务要检查来源与引用，安全任务要确认没有越权动作。本章建立三层证据：运行轨迹解释发生了什么，最终产物判定目标是否实现，安全记录判定是否违反边界。任何一层都不能只从最终聊天文本反推。

## 任务定义先于分数

真实任务集应来自已授权、可重复执行的需求，包含输入快照、允许动作、完成标准和独立验收器。任务 ID 用于配对，不替代任务定义；内容变了就必须更新修订。代码评测应固定起始提交、测试命令和工作目录，资料评测应固定可用来源和核验时间，不能让某个候选拥有更多资料却宣称只是模型更好。

训练或调优用任务与最终验收任务要分开。反复看失败例并修改提示词会把验收集变成开发集，最终效果容易高估。人工评审需要清晰 rubric，争议结果保留待确认；模型评审可辅助发现问题，但不能独占安全裁决或把自己的偏好当成正确性标准。客观产物检查应尽量先于语言评分。

## Trajectory 与最终产物

Trajectory 是带身份、顺序和时间的运行记录，通常包括请求、工具意图、权限决策、工具结果及终态。工具正文可能敏感，记录前应授权与脱敏；只有元信息时要明确无法回放内容。DeepSeek 固定提交的 session 与 session-projection 文档区分日志事实和模型表面，这提醒评测者保存实际发给模型的上下文修订，而不是只保存原始事件列表。

```text
任务定义 + 输入快照 + 配置指纹
  -> 实际运行
  -> trajectory 与副作用证据
  -> 最终产物独立验收
  -> 安全判定
  -> 缺失标记与测量汇总
```

轨迹不一定越短越好。少一次工具调用可能减少成本，也可能意味着缺少验证。评价应问每个关键动作是否有证据、工具结果是否真正支持结论、失败后有没有重复危险操作。最终产物通过而轨迹越权，不能归为安全成功；轨迹看起来合理而文件错误，也不能算任务完成。

## 指标的分母与缺失

至少分别报告任务成功、缺失结果、安全失败和安全未知。成功率若按全部分配任务计算，缺失不会凭空消失；若另报可判定样本成功率，必须注明分母。安全失败率应明确是 unsafe 占全部暴露任务，还是占已审查任务，两者不能混用。没有审查的样本不是 safe，拒绝执行也不自动等于业务成功。

耗时和成本同样要保留测量来源。工具运行时间、排队时间和用户审批等待应分别记录。费用未知用 null，不能用零占位；缓存和重试也应纳入实际计费口径。分位数必须报告有效样本数，小样本 p95 不能解释为稳定生产尾延迟，更不能从人工夹具推导模型性能。

## 已实现统计器的实验

以下导入的是实际 `labs/eval.mjs`。记录明确标为人工统计夹具，没有调用模型。这里设置的成功、安全和耗时只用于检验缺失与分母逻辑，不是任何产品的效果数据。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { summarizeRuns } from './labs/eval.mjs';
const fixtures = [
  { taskId: 'fixture-a', passed: true, safe: true, durationMs: 100, cost: 0 },
  { taskId: 'fixture-b', passed: false, safe: false, durationMs: 200, cost: 0 },
  { taskId: 'fixture-c', passed: null, safe: null, durationMs: null, cost: null },
];
const report = summarizeRuns(fixtures);
assert.equal(report.total, 3);
assert.equal(report.successRate, 1 / 3);
assert.equal(report.missing, 1);
assert.equal(report.unsafe, 1);
assert.equal(report.safetyMissing, 1);
const safety = {
  unsafeOverAssigned: report.unsafe / report.total,
  reviewed: report.total - report.safetyMissing,
  unknown: report.safetyMissing,
};
assert.equal(safety.reviewed, 2);
assert.throws(() => summarizeRuns([fixtures[0], fixtures[0]]), /duplicate/);
console.log(JSON.stringify({ kind: 'manual-statistics-fixture', report, safety }));
NODE
```

统计器中的 `successRate` 按 total 计算，成本是有测量值的求和，耗时使用有效样本的 nearest-rank 分位数。它没有实现真实运行采集、轨迹判分、置信区间或计费账单核对。解释这些字段时应保持这个范围，不能把 measuredCost 为零说成真实模型免费。

## 失败场景与质量控制

只留下完成任务会产生幸存者偏差；超时任务被脚本漏记，成功率会虚高。按模型最终自报“完成”打分，会漏掉错误文件和未运行测试。把权限拒绝算业务失败却不另列安全结果，会鼓励候选绕过规则。修复方式是运行前登记全体任务，运行后逐项结算，缺失保留，产物与安全独立验收。

共享工作区也会污染结果。候选读到了基线生成的文件，或并行运行互相修改输入，就不再是同一任务。每次运行需要独立工作树或隔离副本、固定输入摘要及输出归属。远端资源变化无法固定时，应记录变化并限制结论，不能在不同日期访问不同网页后宣称严格配对。

人工安全夹具应覆盖越权读取、未审批写入、提示注入、凭据输出和重复外部动作。真正安全失败必须以动作、访问或产物证据判定，不能只检查回复含不含敏感关键词。已被执行器拦截的尝试与实际越界应分别统计，二者都需要分析，但代表不同防线。

## 可观察验收与限制

运行实验应保留三份记录，成功率使用全部任务分母，并显示一个结果缺失、一个安全未知和一个 unsafe。将重复 taskId 输入应拒绝。再运行 `node --test test/labs.test.mjs`，确认统计契约通过；这只验证实现，不提供真实模型效果。

开展真实评测时应交付任务版本、配置、运行轨迹、实际产物、验收依据和缺失原因。没有模型运行就明确写“未测”，没有成本记录就保持未知，不填想象的排行榜。本章不提供厂商质量比较，生产决策必须基于实际运行和独立验收。

## 固定来源

- [DeepSeek session](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/session.md)与[session-projection](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/session-projection.md)：日志与模型表面阅读入口。
- [DeepSeek session telemetry](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/session-telemetry.md)：会话记录的授权与遥测边界。
- [Node.js 22 assert](https://nodejs.org/docs/latest-v22.x/api/assert.html)：统计器实验断言。

上一章：[第六十七章：契约测试、故障注入与回归](./67-contract-fault-tests.md)

下一章：[第六十九章：Skill、插件评测与消融对比](./69-skill-plugin-evals.md)
