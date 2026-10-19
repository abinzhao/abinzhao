---
title: '第16章：Messages、Responses 与内容块协议'
description: 通过同一个工具调用比较三种模型消息格式，建立关联标识、流式结算和不透明回放数据的适配边界。
date: '2026-10-17'
category: 智能体工程
tags: [Messages, Responses, 协议适配]
series:
  order: 16
---

# 第16章：Messages、Responses 与内容块协议

兼容接口最容易制造一种错觉：都是 JSON，都有消息和工具，所以只需改一下字段名。实际差异还包含消息归属、工具结果关联、结束语义、推理状态和流事件。若适配器丢掉这些信息，聊天测试可能正常，第二次工具调用却无法继续。

本章以“读取 guide.md”作为同一个语义动作，分别看 Chat Completions、Messages 和 Responses。原项目只实现第一种的文本与函数调用子集；下面协议片段用于对照，不是新的网络客户端，也不是三家服务共用的请求格式。

## 16.1 先定义语义，再序列化

宿主需要表达的事实是：模型提出了一个带标识的读取请求，工具产生了对应结果，结果再进入下一次模型输入。工具请求是模型输出，不是普通用户文本；工具结果是外部执行事实，不是助手自述。

| 语义 | Chat Completions | Messages | Responses |
| --- | --- | --- | --- |
| 工具请求 | assistant 的 `tool_calls` | `tool_use` 内容块 | `function_call` item |
| 参数 | `function.arguments` JSON 字符串 | `input` 对象 | `arguments` JSON 字符串 |
| 结果关联 | `tool_call_id` | `tool_use_id` | `call_id` |
| 结果载体 | tool 消息 | user 的 `tool_result` 块 | `function_call_output` item |

这个表只比较函数调用，不覆盖服务端工具、音频或所有模态。不同标识字段不能随意混用；Responses 的 item 标识和调用标识也不是同一个概念。宿主应保留自己的执行标识及提供方关联标识，避免把 UI 消息编号发回服务端。

## 16.2 三种工具组的具体形状

以下都是消息或 item 片段，省略网络请求所需的模型等配置。示例材料是教学文本，不声称已经调用真实文件工具。

```json
{
  "chatCompletions": [
    {
      "role": "assistant",
      "content": null,
      "tool_calls": [{
        "id": "call_read_1",
        "type": "function",
        "function": {
          "name": "read_file",
          "arguments": "{\"path\":\"guide.md\"}"
        }
      }]
    },
    {
      "role": "tool",
      "tool_call_id": "call_read_1",
      "content": "Only read operations are available."
    }
  ],
  "messages": [
    {
      "role": "assistant",
      "content": [{
        "type": "tool_use",
        "id": "call_read_1",
        "name": "read_file",
        "input": {"path": "guide.md"}
      }]
    },
    {
      "role": "user",
      "content": [{
        "type": "tool_result",
        "tool_use_id": "call_read_1",
        "content": "Only read operations are available."
      }]
    }
  ],
  "responses": [
    {
      "type": "function_call",
      "call_id": "call_read_1",
      "name": "read_file",
      "arguments": "{\"path\":\"guide.md\"}"
    },
    {
      "type": "function_call_output",
      "call_id": "call_read_1",
      "output": "Only read operations are available."
    }
  ]
}
```

这些载体的差异决定历史裁剪方式。不能把 Messages 的 user 工具结果当普通用户提问过滤掉，也不能在 Responses 中仅回传 `output_text` 而遗漏函数调用 item。宿主的语义分组应先识别完整请求与结果，再按目标协议序列化。

参数从对象转为字符串时只执行 JSON 序列化；字符串转为对象时在结算后解析，并走工具自己的运行时校验。格式转换不授予权限，JSON 能解析也不表示路径合法。第四章的工具边界在任何协议后面都必须存在。

## 16.3 流式事件不是可执行消息

流中工具名和参数可能分多次到达，同一回复也可能交错出现多个内容块。只有提供方完整结束并通过校验，工具请求才可执行。根据一段看似完整的 JSON 提前执行，会在流随后失败时产生没有完整模型请求依据的副作用。

```text
提供方 SSE / 事件
       |
协议适配器：按块或 item 标识组装
       |
规范化内容块 + 结束原因 + 回放元数据
       |
Harness 校验完整调用组
       |
工具执行 -> 结算结果 -> 目标协议序列化
```

原 provider 按 `tool_calls.index` 组装并要求 `[DONE]`，这只对应其 Chat Completions 子集。不能把 `[DONE]` 硬套给所有 API，也不能仅检查 HTTP 成功就确认生成完整。Responses 的完成或不完整状态，应由相应适配器解释。

DeepSeek 的内部 `ContentBlockMap` 与 `StreamChunk` 不是厂商线上协议。它们把文本、推理、图片、文件和工具调用分开，并以块结束和最终结束明确结算。新增模态还需要 UI、压缩和回放共同支持，不是给联合类型加一个名字就完成。

## 16.4 回放数据不能当普通正文

提供方有时需要响应标识、签名或不透明推理数据继续历史。这些数据属于适配器，不应该通过“统一成字符串”的过程泄露到用户正文，也不能在跨提供方迁移时无条件转发。原提供方产生的状态，不一定被另一个提供方理解。

Responses 的 `previous_response_id` 可以关联服务端状态，但本地历史仍需要明确持久化与隐私政策；它不是原项目 `.harness/` 会话的替代物。官方文档还说明使用该字段时此前的 instructions 不自动带入下一次请求，不能依赖第一次发送的规则永远存在。

本地适配器可以保存提供方专用回放字段，并只在原适配器认可的路由下使用。若必须降级到纯文本，应明确丢失哪些能力，不能把转换后的历史称为无损回放。工具关联、授权事实与来源标识则应保留在宿主记录里。

错误也需要保留语义位置。参数 JSON 解析失败发生在工具执行之前，工具返回失败发生在执行之后，模型流截断发生在生成结算之前。三者都可能产生“失败”文字，但只有第二种可能已经产生外部动作；把它们统一成一条可重试错误，会使恢复策略失去判断依据。

## 16.5 失败案例与验收

第一种失败是把 `tool_result` 转成 assistant 文本。模型会把外部事实误认为自己的先前陈述，调用关联也丢失。第二种失败是只保留一个工具结果：当回复提出两个调用时，历史里留下一个未回答的请求。第三种失败是把流式参数增量逐段 `JSON.parse()`，多数合法请求会在中间段被误判。

实验可以直接在 Node.js 内构造上面的三组数据，检查三种关联字段均等于 `call_read_1`，再故意修改结果标识，确认分组验证器拒绝。对消息转换的验收应检查请求数、结果数、标识一一对应及原文不变，不能只检查生成 JSON 可解析。

原示例根执行 `npm test`，重点观察流中断、重复调用标识和工具组回放测试。真实厂商互通不在这些测试范围；没有对应 SDK 或官方服务测试时，应写“协议对照已核对，端到端未运行”。

本章没有实现 Messages、Responses 网络适配器、多模态附件保存或跨提供方无损迁移。实际 `npm run labs` 验证来源和完整组选择等独立机制，不包含上述厂商协议转换。纯数据夹具可单独检查三种形状，但不能由本章片段推导出新的导出函数或网络支持。

## 16.6 官方来源

DeepSeek `0.2.1-alpha.5` 的[LLM 子系统](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/llm-streaming.md)与[类型源码](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/llm/llm/src/types.ts)用于核对内部内容块和回放所有权。

[Anthropic 官方 TypeScript SDK 类型](https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/resources/messages/messages.ts)用于核对 `tool_use` 和 `tool_result`；[OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses)用于核对 item、输出预算及状态关联。厂商页面和 main 分支是 2026-10-17 核验的滚动来源，不承诺后续版本字段不变。

---

上一篇：[第15章：模型能力、Token 与推理预算](./15-model-capabilities.md) · 下一篇：[第17章：模型路由、认证与兼容网关](./17-model-routing.md)
