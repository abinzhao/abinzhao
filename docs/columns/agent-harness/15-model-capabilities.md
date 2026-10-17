---
title: '第15章：模型能力、Token 与推理预算'
description: 区分能力声明、实测兼容性和预算单位，为模型准入、输出预留及推理参数建立可检查的规则。
date: '2026-10-17'
category: 智能体工程
tags: [Agent Harness, 模型能力, Token, 推理预算]
series:
  order: 15
---

# 第15章：模型能力、Token 与推理预算

一个模型能聊天，不代表它能稳定生成工具参数；一个接口接受图片字段，也不代表后端真的处理了图片。选择模型时，首先要把能力变成契约，再把契约变成可观察的准入和失败行为。模型名称、宣传页与实际路由不能互相代替。

原教程以本机 OpenAI 兼容 Chat Completions 接口为入口，按字节裁剪上下文，并不实现模型 Tokenizer、视觉计量或推理预算控制。本章的计算示例独立于该项目，不能把新的预算名直接传给现有 `createProvider()` 并期待生效。

## 15.1 能力声明需要来源

能力至少分为输入模态、工具调用、结构化生成、上下文容量和输出限制。还要区分“模型支持”与“适配器已支持”：模型可以输出多个工具调用，但适配器可能只能组装一个；模型接受图片，而宿主没有附件校验和读取链路，就不能安全发送图片。

能力目录应记录信息来源与适用路由。同名模型经不同网关部署，容量或字段行为可能不同。未经证实的默认容量只能叫估计，不能写成厂商保证。能力缺失时，拒绝请求通常比静默删除图片更容易诊断，因为后者会让模型在没有证据的情况下回答视觉问题。

| 数值或声明 | 单位或含义 | 不能据此推导 |
| --- | --- | --- |
| 上下文窗口 | 路由接受的 Token 容量 | 所有长度输入都同样可靠 |
| 最大输出 | 单次生成上界 | 本次一定生成到该长度 |
| 推理 effort | 厂商定义的档位 | 可跨模型换算的 Token 数 |
| UTF-8 字节 | 传输或存储大小 | 精确的模型 Token 数 |
| 工具调用支持 | 协议及模型能力 | 参数已经获得执行授权 |

## 15.2 预算在发送之前装配

一次请求的压力包括系统指令、历史、工具定义、当前输入和可能的视觉计量。输出预留必须在输入准入时考虑，而不是请求超限后才缩短回答。还应留下明确的安全余量，覆盖序列化包装、估算误差和服务端实际计量差异。

```text
路由能力 + 已验证计量
          |
指令 + 历史 + 工具 schema + 当前输入 + 图片成本
          |
输入压力 + 输出预留 + 余量 <= 窗口？
          |                         |
        允许                      拒绝或裁剪完整组
          |
请求 -> 实际 usage -> 对照估算误差
```

预算不能破坏消息关系。裁剪掉工具请求却留下工具结果，不只是信息变少，而是协议失效。原项目以完整轮次选择上下文，是保持关联的简化方法；它使用字节预算，不能因此声称精确遵守某个模型的 Token 窗口。

能力检查与预算检查应使用同一个已经绑定的路由。先用大窗口模型计算，后因认证失败切到小模型，却继续沿用原准入结果，会让预算形同虚设。路由改变后必须重新计算，尤其是图片输入、工具格式和输出上限。

## 15.3 一个带单位的预算实验

下面数值是教学夹具，不是任何真实模型的参数或性能数据。代码只对给定 Token 计量做准入，不提供分词器；可直接用 Node.js 22 运行。

```js
import assert from 'node:assert/strict';

function admit({ windowTokens, inputTokens, outputTokens, marginTokens }) {
  const fields = { windowTokens, inputTokens, outputTokens, marginTokens };
  for (const value of Object.values(fields)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error('Expected nonnegative integer token count');
    }
  }
  if (!windowTokens || !outputTokens) throw new Error('Missing capacity');
  const used = inputTokens + outputTokens + marginTokens;
  if (!Number.isSafeInteger(used) || used > windowTokens) {
    throw new Error('Context budget exceeded');
  }
  return { remainingTokens: windowTokens - used };
}

assert.deepEqual(admit({
  windowTokens: 4096, inputTokens: 2600,
  outputTokens: 1000, marginTokens: 256,
}), { remainingTokens: 240 });
assert.throws(() => admit({
  windowTokens: 4096, inputTokens: 3000,
  outputTokens: 1000, marginTokens: 256,
}), /exceeded/);
assert.throws(() => admit({
  windowTokens: 4096, inputTokens: NaN,
  outputTokens: 1000, marginTokens: 256,
}), /integer/);
console.log('token admission verified');
```

这里每个字段都带 Token 单位，避免把字符数、字节数和 Token 数混合相加。整数校验也拒绝了 `NaN`：仅检查“大于窗口”时，非数值可能绕过条件。真实实现还需明确计量来源、估计置信边界和未知容量处理，不能只保留一个算式。

## 15.4 推理预算不是回答长度

推理模型可能把生成预算用于内部推理和可见输出。OpenAI Responses 文档明确 `max_output_tokens` 包含可见输出与推理 Token，因此预留一千并不保证能得到一千 Token 的正文。推理 effort 是路由支持的配置项，不是通用的温度替代品。

不同提供方对推理字段、允许档位、计费和回放要求存在差异。适配器应验证当前模型支持的值，拒绝无效档位；不能把一个模型的 `high` 转发给所有模型，也不能把厂商私有推理片段统一当普通正文展示。

原 provider 固定发送 `temperature: 0`，不暴露这些推理选项。温度较低也不保证工具选择、数值推断和事实引用确定。可重复的控制流应由测试替身验证，真实模型质量则在固定材料与固定请求配置下单独评估。

## 15.5 失败案例与实验

最容易误判的是“一个汉字等于一个 Token”。实际编码由分词器决定，代码、路径、数字和多语言混排会改变比例。可以比较同一字符串的 JavaScript 长度与 UTF-8 字节数，观察两者已经不同；在没有所选模型分词器时，不能把任一结果标成实测 Token。

第二个失败是收到容量错误后随机删除历史消息。这样可能删去授权限制或工具关联，却保留错误结论。应先确定哪些完整组可以移除，并保持当前目标与必要证据；无法在约束内装配时，明确停止或请求缩小任务。

运行上述实验，正常输入应留下两百四十个教学 Token，超限与非数值均被拒绝。把输出预留增加到一千五百，正常输入也应超限。然后在原示例根运行 `npm test`，核对上下文选择仍按字节和完整轮次处理，不把这个独立算式误接到原循环。

真实模型验收应同时记录路由名称、实际 usage、结束原因与正文是否截断；若本地服务没有返回 usage，应写“未取得”，不能用估计代替账单事实。独立 labs 可以演示准入，但本章未实现精确分词、价格计算、图片计量或多路由自动降级。

## 15.6 固定来源

DeepSeek `0.2.1-alpha.5` 的[LLM 类型源码](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/llm/llm/src/types.ts)、[Token meter](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/token-meter.md)和[模型配置目录](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/config-catalog.md)区分容量、计量及路由声明。配置目录里的默认值不能当作真实模型规格。

[OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses)用于核对输出预算与推理字段的语义，核验日为 2026-10-17。该页面是官方滚动文档，不是本地模型服务的兼容性承诺；具体服务仍需实测。

---

上一篇：[第14章：从 ReAct 到可验证控制流程](./14-agent-control-patterns.md) · 下一篇：[第16章：Messages、Responses 与内容块协议](./16-model-protocols.md)
