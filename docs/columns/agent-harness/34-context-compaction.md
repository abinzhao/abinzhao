---
title: 第三十四章：剪枝、摘要压缩与上下文交接
description: 用工具配对边界、位置范围和可追踪摘要替换控制上下文压力，区分剪枝、压缩与新窗口交接。
date: '2026-10-17'
category: 智能体工程
tags: [Agent Harness, Compaction, 上下文交接]
series:
  order: 34
---

# 第三十四章：剪枝、摘要压缩与上下文交接

长任务不会因为窗口满了就失去目标，但模型会失去早期证据。简单删除前半段消息，可能留下没有调用的工具结果；简单总结，又可能把待验证推断写成已完成事实。本章把压缩理解为模型表面的受控替换，要求压缩前后协议仍有效，重要约束仍可追踪，失败时原始证据不会被悄悄销毁。

## 概念与真实机制

剪枝、摘要和交接解决不同问题。剪枝移除冗长结果中的低价值内容，同时保留调用身份与可检索线索；摘要把一段已闭合历史转成较短材料；交接为新的上下文窗口说明目标、已确认事实、当前状态和下一步。摘要不是原始记录的等价副本，任何自动总结都有损失风险。交接也不是重开一次任务授权，更不能把上一个窗口里的猜测升级成产品事实。

DeepSeek Harness `0.2.1-alpha.5` 固定提交把 compaction 作为可选能力。`compaction/start`、summary、end 都是 log-only，真正进入模型的是带 surface replacement 的 user/message。摘要事务先记录 start，完成总结与表面替换后才记录 end；中途崩溃留下未配对锁，可被识别。人工压缩期间出现的新注入不应被整个日志截断吞掉，提交前要复核所选位置范围。

已确认的边界是工具 call/result 配对，而不必保留整个 turn。一个巨大 turn 内已经闭合的早期 step 仍可压缩。范围使用当前表面位置，不是数值 seq 区间：旧位置可能放入一条新高 seq 摘要，故 start 的 seq 可以大于 end。重放时要依赖位置与明确 shadowedSeqs，不能用 `start <= seq <= end` 自行猜范围。

## 数据流与状态契约

```text
压力或真实 overflow -> 可选结果剪枝 -> 重新计量
                    -> 选择配对闭合范围 -> 记录 start
                    -> 生成摘要 -> 复核范围未变化
                    -> 记录 summary 与替换节点 -> 记录 end -> flush
无有效缩减: 保留原错误，不无限重试
取消或失败: 关闭尝试，不能宣布摘要已提交
```

上游自动路径在 pre-step 检查压力，真实上下文溢出通过 request-error 恢复。只有表面替换 generation 前进才允许修复性重试；若请求信封或必须保留的单元本身太大，反复总结旧历史不会解决问题。剪枝成功而后续摘要失败也可能已经改变表面，因此日志必须描述真实部分结果，不能统一伪装为完全成功或完全没有发生。

教学建议摘要至少分目标与约束、证据与来源、已完成且验证的工作、活动状态、未解决项、下一步。失败假设应注明未证实，关键用户纠正应保留原意。密钥、完整终端噪声和已经排除的长推理通常不应进入交接。摘要中的文件路径还需绑定观察版本，下一窗口读取后可以发现文件变化；不能靠“之前已读”跳过新的观察。

## 自包含 Node.js 22 实验

下面只验证替换边界，不调用总结模型。它演示为什么不能在一个工具组内部切开，以及如何在内存中保留原日志。事件名称为教学字段，不能当作上游完整 SessionEvent 格式。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
const log = [
  { seq: 0, kind: 'user', text: 'Inspect files' },
  { seq: 1, kind: 'call', id: 'a' },
  { seq: 2, kind: 'call', id: 'b' },
  { seq: 3, kind: 'result', id: 'b' },
  { seq: 4, kind: 'result', id: 'a' },
  { seq: 5, kind: 'user', text: 'Continue' }
];
function boundary(items, end) {
  const pending = new Set();
  const seen = new Set();
  for (const x of items.slice(0, end)) {
    if (x.kind === 'call') {
      assert.ok(!seen.has(x.id), 'duplicate call');
      seen.add(x.id); pending.add(x.id);
    }
    if (x.kind === 'result') {
      assert.ok(pending.has(x.id), 'orphan result');
      pending.delete(x.id);
    }
  }
  return pending.size === 0;
}
function compactPrefix(items, end, summary) {
  assert.ok(boundary(items, end), 'unbalanced tool group');
  const selected = items.slice(0, end).map(x => x.seq);
  const replacement = { seq: 99, kind: 'summary', text: summary, shadowed: selected };
  return [replacement, ...structuredClone(items.slice(end))];
}
assert.throws(() => compactPrefix(log, 4, 'too early'));
const surface = compactPrefix(log, 5, 'Inspected files; next step remains open.');
assert.deepEqual(surface[0].shadowed, [0, 1, 2, 3, 4]);
assert.equal(surface[1].seq, 5);
assert.equal(log.length, 6);
assert.ok(surface[0].seq > surface[1].seq);
assert.throws(() => boundary([{ kind: 'result', id: 'missing' }], 1));
console.log('compaction boundary: passed');
NODE
```

真实实现还要校验保留尾部、摘要字节上限、非空内容、事务身份与提交阶段取消。此实验仅替换前缀，不能直接推广为任意区域压缩；任意区域需要同时检查两端与外侧完整历史。边界正确也不证明摘要忠实，语义验收应使用已知目标与证据，检查重要纠正、未完成状态和失败结论是否保留。

## 失败案例与产品对照

假设助手先调用两个工具，结果逆序返回，只保留最后三条消息就可能剩下结果而没有调用。另一种失败是在总结时省掉“只是教学实现”的限制，下一窗口因此宣称已完成生产级沙箱。前者是协议损坏，后者是事实边界损坏，两者需要不同测试。不能用模型不报错来证明配对正确，也不能用摘要更短来证明任务知识被保存。

Claude 官方命令文档说明 `/compact [instructions]` 可指定总结重点；它是公开行为，不足以证明内部存储结构与 DeepSeek 相同。独立 `/docs/en/compact` 页面在核验时返回 404，应引用命令与 context-window 文档。Codex 稳定 `0.163.0` 固定源码有 compacted history metadata 与替换历史构建；OpenCode `1.19.3` 固定源码分别实现 prune、process 和近期材料保留。不能把其中常量当所有产品默认值。

交接验收应设计一个反例任务：原始历史明确说明某接口尚未确认，摘要后让新窗口回答该接口是否已实现。合格结果仍应表达未确认，并指向待查来源，而不是根据流畅摘要自行补齐。再加入一条最新用户纠正，要求它覆盖旧任务描述；保留一条未结算操作，要求新窗口先对账而不是重做。这样同时检查协议完整性、事实忠实性和行动约束，避免只测摘要字数。摘要生成过程也会消耗模型预算与时间，因此触发阈值、失败重试和人工选择范围都需要独立限额。

## 实验验收与实现边界

命令应输出 passed，未闭合的四项前缀必须拒绝，闭合五项前缀可替换，原日志保持六项。进一步将结果改成重复 id，应拒绝；向总结期间的尾部加入新用户消息，提交后应仍保留该消息。真实验收还应故障注入 start 后崩溃、摘要失败、flush 失败，以及已缩减后的重试次数上限。

原 1–12 章只实现自己的有限历史预算，没有上游摘要模型、表面事务与多窗口生命周期。扩展 `labs/context.mjs` 与 `labs/workflow.mjs` 已经落盘，可通过汇总脚本运行；本章不修改它们，stdin 示例仍自包含。压缩不会回滚文件、取消外部付款或自动重获权限；它改变模型接下来能看到的材料，不能替代检查点与副作用恢复。

## 官方固定来源

- [DeepSeek Harness：Compaction 契约](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/compaction.md)，核对位置范围、锁、剪枝和重试。
- [Claude Code：官方命令与 compact](https://code.claude.com/docs/en/commands)，动态官方文档，核验日为 2026-10-17，并非固定开源实现。
- [Codex 0.163.0：压缩源码](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/core/src/compact.rs)。
- [OpenCode 1.19.3：剪枝与压缩源码](https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/opencode/src/session/compaction.ts)。

上一章：[第三十三章：工具发现与 Spill](./33-tool-discovery-spill) · 下一章：[第三十五章：Prompt Cache](./35-prompt-caching)
