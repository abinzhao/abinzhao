---
title: '第14章：从 ReAct 到可验证控制流程'
description: 把思考与行动循环变成有阶段、预算、失败语义和证据门的控制器，避免把模型自评当成验收。
date: '2026-10-17'
category: 智能体工程
tags: [Agent Harness, ReAct, 状态机, 验证]
series:
  order: 14
---

# 第14章：从 ReAct 到可验证控制流程

模型读到一个错误，然后改变下一步行动，这是智能体的优势；同一个机制也可能使它无限重试、不断扩张任务，或用新解释掩盖旧失败。控制模式的价值不在命名，而在把这些行为变成可以检查的转移。

ReAct 的原始研究讨论推理与行动交替，使行动结果参与后续推理。工程实现不必展示或持久化模型的内部思维链；需要记录的是行动、可观察结果、停止原因以及验证依据。本章沿用前十二章只读项目的边界，不给模型新增写入或 shell 能力。

## 14.1 自由循环与阶段约束

最自由的循环是“给模型观察，执行其工具请求，再继续”。它适合探索未知材料，却把何时足够交付也交给模型。计划后执行模式先形成候选步骤，有助于检查范围，但计划可能在第一次环境变化后失效。阶段状态机进一步规定当前阶段允许什么行动，代价是需要明确业务流程。

这些模式可以组合。比如先在只读探索阶段运行反馈循环，随后进入引用验证阶段，再允许最终回答。计划只是可修改的候选，阶段限制是程序约束。模型能够建议回到探索，但能否回退应由状态机决定，并消耗明确预算，而不是自动重置已经失败的检查。

| 模式 | 有利场景 | 必须补上的约束 |
| --- | --- | --- |
| 反馈循环 | 材料位置未知 | 步数、重复行动与拒绝处理 |
| 计划后执行 | 目标可以分解 | 计划修订与证据新鲜度 |
| 验证后交付 | 结果有客观检查 | 验证器不能由候选结果控制 |
| 人工门 | 关键副作用 | 授权必须绑定具体行动 |

## 14.2 状态是事实摘要，不是模型心情

一个阶段应由已结算事件导出。例如 `observed` 意味着拿到了所需读取结果，不是模型说“我已经读过”。`verified` 意味着检查器确认引用能够在材料中定位，不是模型写了“引用正确”。如果结果不足，应停在缺证据状态。

```text
collect -> 有效观察 -> verify -> 检查通过 -> answer
   |                    |
参数拒绝              引用不匹配
   |                    |
预算内修正          返回 collect 或 failed
   \____________________/
             总预算不重置
```

循环契约至少包含允许动作、输入结构、转移条件和终态。取消是一条独立的控制路径：它不是一种让模型继续修正的观察。验证失败则可以反馈为普通事实，但反馈不能同时授予更宽工具集合。

原项目 `runAgent()` 的 `maxSteps` 是模型请求次数限制，收到无工具调用的回答就结算完成。它没有本章的引用状态机，也没有“回答必须通过验证”的门。阅读代码时必须区分模型停止与任务验收，两者相等只能是特定应用的显式设计。

## 14.3 一个完整的阶段实验

下面代码使用内存材料验证引用，完整运行不需模型或依赖。`transition` 和状态名都是本章实验定义，不是 labs 或 DeepSeek 的 API。

```js
import assert from 'node:assert/strict';

function transition(state, event) {
  if (state.phase === 'done' || state.phase === 'failed') {
    throw new Error('Terminal state');
  }
  if (state.remaining <= 0) return { ...state, phase: 'failed' };
  const next = { ...state, remaining: state.remaining - 1 };
  if (state.phase === 'collect' && event.type === 'observed') {
    if (!event.text) throw new Error('Empty observation');
    return { ...next, phase: 'verify', text: event.text };
  }
  if (state.phase === 'verify' && event.type === 'candidate') {
    if (!event.quote || !state.text.includes(event.quote)) {
      return { ...next, phase: 'collect' };
    }
    return { ...next, phase: 'done', quote: event.quote };
  }
  throw new Error('Illegal transition');
}

let state = { phase: 'collect', remaining: 4 };
state = transition(state, { type: 'observed', text: 'Tools are read-only.' });
state = transition(state, { type: 'candidate', quote: 'Tools can write.' });
assert.equal(state.phase, 'collect');
assert.equal(state.remaining, 2);
state = transition(state, { type: 'observed', text: 'Tools are read-only.' });
state = transition(state, { type: 'candidate', quote: 'read-only' });
assert.equal(state.phase, 'done');
assert.throws(() => transition(state, { type: 'observed' }), /Terminal/);
assert.throws(
  () => transition({ phase: 'collect', remaining: 2 }, { type: 'candidate' }),
  /Illegal/,
);
console.log('phase and evidence checks passed');
```

这个检查器验证的是精确子串，不是语义蕴含，也不是事实真实性。它会接受真实材料中的一句错误陈述。因此实验只解决“引用是否来自这次观察”，不能被宣传成通用防幻觉系统。真实性需要独立来源，语义结论需要更强的检查规则。

预算在修正后仍然减少很重要。若每次验证失败都创建新状态并恢复预算，攻击性输入或弱模型就能把有限状态机变成无限服务。生产实现还需要耗时、工具次数和输出大小边界，但不能把这些不同维度随意相加成一个没有单位的数。

## 14.4 失败案例：自我批评不等于外部验证

让同一个模型先写答案，再询问“答案有没有问题”，可以改善一些结果，却不是确定性验收。两个请求可能共享错误前提；第二次仅把第一段文字改得更自信。验证器应拿到原始证据和检查目标，而不只拿到候选回答。

另一种失败是无限修复：检查失败后加入更长提示，直到模型输出“通过”。这里优化的是检查器的措辞，不是环境结果。应固定检查器规则，保留每次失败原因，把修复预算耗尽设为明确终态，并向用户报告未完成项。

还有一种隐蔽错误是把行动摘要当成原始结果。工具返回拒绝，模型摘要写成“已检查文件，内容不符合要求”；下一阶段据此判定材料存在。必须保留成功标记和来源关联，拒绝仅说明该请求没有获准或完成，不能推导出文件内容。

## 14.5 实验与可观察验收

正常运行应看到两次探索、一次错误候选、一次成功候选，总预算消耗四次，终态不再接受事件。把初始预算改为二，下一次转移应进入失败而非重置预算；把候选事件放在收集前，应立即拒绝非法转移。

再用原项目的确定性测试检查步数上限。进入示例根运行 `npm test`，观察循环没有因本章实验发生变化。真实模型可以故意提出不存在的工具，检查工具拒绝后是否仍遵循原权限；回答中“已完成”的措辞不能覆盖拒绝事件。

`npm run labs` 汇总现有五个独立机制实验，具体边界见示例根 `labs/README.md`；它没有运行本章引用状态机。本章没有实现阶段状态持久化、验证器隔离、人工审批或跨进程恢复，不能把内存测试通过扩大成生产工作流可恢复。

## 14.6 固定来源

ReAct 的研究依据是作者原始论文 [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)。论文方法不等同于公开内部思维链，也不提供文件或副作用安全边界。

DeepSeek 根包 `0.2.1-alpha.5` 的[核心子系统](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/core.md)和[架构 turn flow](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/architecture.md)提供实际循环与停止契约；[计划模式](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/plan.md)明确属于软指导，沙箱和审批独立执行限制。本章状态机是教学模型，不能替代这些上游接口。

---

上一篇：[第13章：Agent、Workflow 与 Harness 的边界](./13-agent-foundations.md) · 下一篇：[第15章：模型能力、Token 与推理预算](./15-model-capabilities.md)
