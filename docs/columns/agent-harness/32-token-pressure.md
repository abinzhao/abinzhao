---
title: 第三十二章：Token 压力、视觉计量与输出预留
description: 区分字符、字节、启发式估算和供应商 usage，为文本、图片、工具 schema 与输出共同建立预算。
date: '2026-10-23'
category: 智能体工程
tags: [Token 预算, 多模态]
series:
  order: 32
---

# 第三十二章：Token 压力、视觉计量与输出预留

“上下文还剩两千字”不是有效的请求预算。模型窗口按 token 计量，中文、代码、JSON、工具定义和图片都有不同成本；响应还可能需要输出工具参数与推理内容。若直到供应商拒绝请求才发现超限，宿主已经浪费一次往返。本章建立可观察的压力估算，并要求每个数字注明它来自真实 usage、模型 tokenizer，还是保守教学假设。

## 概念与真实机制

字符数、Unicode 码点、UTF-8 字节数和 token 数是四种量。JavaScript 字符串 length 统计 UTF-16 code unit，一个表情可能占两个单位；Buffer.byteLength 统计字节；tokenizer 的切分取决于模型与版本。用字节数除以固定常数可以做启发式筛选，但不是实际 tokenizer，更不是计费凭证。不能把“预计用了多少”写成“供应商已收取多少”。

DeepSeek Harness `0.2.1-alpha.5` 固定提交的 `TokenMeasurement` 是脱离实时对象的不可变快照，`logRevision` 标明消费到哪个日志位置。baseline 分 usage 与 estimated；`surfaceTokens` 是当前模型表面的定价之和，`totalTokens` 描述请求与响应压力，`surfaceDeltaTokens` 是相对锚点的有符号变化。摘要变短后该变化可以为负，不能把所有更新都简单累加成永久增长。

已确认的 usage 复用要求当前规范化请求信封与最近成功调用匹配，并满足保守锚点条件。更换 provider、model 或请求能力后，旧 usage 不一定还能作锚。图片按路由声明的请求图像定价处理；未声明时保持固定启发式。图片不是把 base64 文本长度除以四就得到视觉 token，也不能把所有模型统一当作相同分辨率、相同切块规则。

## 数据流与状态契约

```text
日志修订 + 实际路由 -> 派生当前表面 -> 定价文本与图片
                      -> 匹配可用 usage 锚 -> 得到压力快照
                      -> 加输出预留与安全余量 -> 准入或收缩
供应商返回 usage -> 保存新锚点，不反写成请求前的真实计量
```

教学预算可以写成“输入估算 + 输出上限 + 安全余量不超过窗口”。输出上限是否含推理 token、工具参数是否计入、缓存命中 token 怎样展示，应以实际 provider 协议为准。不同模型的输出限制与总窗口限制可能是两个约束，宿主应分别校验。设置更大的 max output 不会自动让模型输出更多正确答案，却会减少输入可使用的空间。

视觉材料需要记录原始尺寸、实际发送尺寸、数量及处理模式。缩图可能降低成本，也可能抹去小字号错误信息；将截图转换成文字可以节省预算，却会丢失布局事实。预算器不能在没有明确降级标记时偷偷删除图片。对当前任务必须保留的视觉证据，应明确拒绝或要求缩小范围，让用户知道观察能力已经改变。

## 自包含 Node.js 22 实验

以下价格与窗口都是确定性实验输入，不是任何真实模型的报价或性能数据。程序检查输出预留、路由变更和负向差值；不发网络请求，也不使用隐藏 tokenizer。真实集成必须把 estimate 替换成已核对的模型规则，并仍保留 usage 与估算的区别。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
const textPrice = text => Math.ceil(Buffer.byteLength(text, 'utf8') / 3);
function measure({ route, revision, text, imageTokens, anchor }) {
  const surface = textPrice(text) + imageTokens;
  const matched = anchor?.route === route;
  const delta = matched ? surface - anchor.surface : 0;
  return Object.freeze({
    revision, surface,
    kind: matched ? 'usage-anchor-with-estimated-delta' : 'estimated',
    delta, pressure: matched ? Math.max(surface, anchor.total + delta, 0) : surface
  });
}
function admit(m, { window, output, margin }) {
  for (const n of [window, output, margin, m.pressure]) assert.ok(Number.isFinite(n) && n >= 0);
  return m.pressure + output + margin <= window;
}
const anchor = { route: 'demo/a', surface: 90, total: 120 };
const m = measure({ route: 'demo/a', revision: 8, text: 'small', imageTokens: 0, anchor });
assert.ok(m.delta < 0);
assert.equal(admit(m, { window: 100, output: 80, margin: 20 }), false);
const changed = measure({ route: 'demo/b', revision: 9, text: 'small', imageTokens: 20, anchor });
assert.equal(changed.kind, 'estimated');
assert.equal(changed.delta, 0);
assert.notEqual('😀'.length, Buffer.byteLength('😀'));
console.log('budget contract: passed', m.kind, changed.kind);
NODE
```

这里 pressure 带有输出历史锚，因此不能拿它与 surface 相减后直接解释成“下一次输出”。它只是保守控制信号。一个真实实现还要计算系统包装、工具 schema、协议边界以及路由特有图像文字成本。保存 revision 的意义是防止测量之后历史又增长，准入却继续使用旧快照；进入发送边界前应确认材料仍对应被测修订。

## 失败案例与取舍

常见失败是只统计用户问题，遗漏数百个工具定义与前面的大结果。另一个失败是将缓存命中输入从窗口使用量中减去：缓存可以减少重复计算或价格，但输入仍占模型上下文。也不能因为上一轮真实 usage 较低，就认为下一轮新增高清图片也便宜。价格锚有效性与材料增长需要分开验证。

估算超限时，不应默认全部调用压缩。先识别大头：工具集合可以收缩，结果可以 Spill，重复材料可以去重，输出预留可以按任务合理设置。如果单个必须保留的工具组或系统信封已经超过窗口，摘要旧历史无法修复。这样的不可修复条件应给出明确错误，避免在同一请求上无限“压缩后重试”。

安全余量是针对估计误差的工程选择，不是对服务商容量的猜测。余量太小会频繁收到真实 overflow，太大会过早损失信息。可以依据经过授权、去敏的实际 usage 与估算差异校准，但不能用几个短英文请求推广到中文代码和视觉任务。实验结果应按输入类型分组，报告缺少真实计量的样本，而不是填补虚构值。

预算报告应同时显示测量修订、输入范围与缺失项，避免一个孤立百分比掩盖估算前提。真实请求若未返回 usage，历史账本应保持未知，不用上次数字补齐。供应商明确报告溢出时，可以将错误作为收缩触发证据，但不能反推出精确输入 token。先承认计量缺口，再选择保守准入，才能保持控制指标与事实指标各自可信。

## 实验验收与实现边界

完整命令应输出 passed；路由变更必须失去旧锚，输出预留过大必须拒绝，表情的字符与字节统计必须不同。继续实验时可将 imageTokens 从零改为一个明确的实验值，观察准入变化；把 revision 增加后要求旧快照失效。通过这些断言只证明预算控制契约，不证明估算准确率或视觉 token 数。

原 1–12 章只有独立教学项目的预算与只读工具，不具备上游所有模型定价、真实 tokenizer 或多模态计量。扩展 `labs/context.mjs` 与 `labs/run.mjs` 已落盘，并已配置 `npm run labs`；本章 stdin 程序可独立验证，不要求导入实验模块。生产验收还需要真实 provider 的 usage 对账、最大输出限制和溢出错误归一化。

## 当前路由计量与实验补充

2026-10-23 对照 [DeepSeek rc.2 TokenMeasurement](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/subsystems/token-meter.md)，仍须同时满足规范请求信封相同和保守 anchor 条件，才复用真实 usage；仅比较模型名称不够。实验的 `anchor.route === route` 是简化，不应直接移植为生产匹配器。模型更新、tools schema 改动、图像定价变化都应重新计量，而不是把旧窗口和价格长期放进配置。

操作练习是在 `anchor` 与请求中增加 `envelopeDigest`，并将匹配条件改为路由与 digest 同时相等。正常验收是相同信封复用 anchor、短摘要产生负 delta；异常验收是在同路由下改变 schema digest，必须退回 estimated。排错同时打印去敏的测量来源、revision、输出预留和缺失的视觉定价，不输出正文或凭据。真实供应商 usage 与图像 token 尚未由这个实验测得，不能把估算偏差填成零。

## 官方固定来源

- [DeepSeek Harness：TokenMeasurement](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/token-meter.md)，核对 usage 锚、路由视觉价格与日志修订。
- [DeepSeek Harness：模型协议类型](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/llm/llm/src/types.ts)，核对适配器能力，而非推测通用计量。
- [Node.js 22：Buffer.byteLength](https://nodejs.org/docs/latest-v22.x/api/buffer.html#static-method-bufferbytelengthstring-encoding)，确认字节计数不是 tokenizer。

上一章：[第三十一章：上下文装配](./31-context-assembly) · 下一章：[第三十三章：工具发现与 Spill](./33-tool-discovery-spill)
