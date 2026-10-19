---
title: '第17章：模型路由、认证与兼容网关'
description: 把模型选择、协议、端点、凭据引用和数据出域政策绑定成一次请求快照，设计不扩大权限的失败处理。
date: '2026-10-17'
category: 智能体工程
tags: [模型路由, 凭据, 网关]
series:
  order: 17
---

# 第17章：模型路由、认证与兼容网关

“换个模型再试”看似简单，却可能同时改变协议、数据去向、上下文容量和认证方式。一个本地助手在连接失败后自动把文件内容发往远端，并不是普通重试，而是越过隐私边界。模型路由必须把这些变化变成显式配置。

原项目的 `assertLocalURL()` 只允许 loopback HTTP 地址，拒绝 URL 凭据、查询串、片段和远端地址；请求也拒绝重定向。本章不修改这些限制。讨论多路由是为后续宿主设计建立契约，不意味着教程已实现远端模型或认证管理。

## 17.1 路由是配置整体，不是一个模型名

一次有效路由至少包含提供方标识、模型标识、协议、端点、能力和凭据来源。模型名不能决定所有字段：同一个兼容网关可能提供多个模型，同一个模型名也可能对应不同部署。把路由用稳定标识管理，才能在日志里回答这次请求实际发给了谁。

凭据应通过引用在请求边界解析，不把值写进配置、提示词和会话。引用不存在属于认证配置失败；不能把空字符串发出后再让模型解释服务端错误。凭据也不应成为路由缓存键的明文部分，日志只记录引用名称与解析状态。

| 字段 | 属于谁 | 变更后的要求 |
| --- | --- | --- |
| 模型与协议 | 模型适配器 | 重做消息与能力准入 |
| 端点与出域政策 | 部署宿主 | 检查网络目的地 |
| 凭据引用 | 凭据服务 | 每次操作解析并隔离值 |
| 请求预算 | 请求控制器 | 用实际绑定路由重算 |
| 路由记录 | 会话或诊断层 | 不包含认证头 |

## 17.2 发送前绑定不可变快照

用户设置可能在运行中改变。如果序列化消息时读取一次模型，发送时读取另一个端点，计量时再读取新的容量，就会产生无法回放的混合请求。应在准入边界解析路由，形成这次操作的快照，随后使用同一快照完成序列化、发送和记录。

```text
用户选择 + 部署政策
          |
解析路由 -> 校验端点与协议 -> 解析凭据引用
          |
绑定请求快照 -> 能力与预算准入 -> 发起请求
          |
记录非敏感身份 + 结果或失败
```

路由快照不需要把凭据公开给全部插件。模型适配器可以获得发送能力，其他组件只获得非敏感描述。对大型宿主来说，谁能读取凭据与谁能知道“已配置凭据”必须分开，否则任何诊断插件都可能变成泄漏渠道。

## 17.3 一个不发送请求的本地路由实验

下面代码是本章独立的配置准入器，使用虚构模型标签和无效示例凭据引用，不访问网络。它故意只实现本地路由，避免为了演示引入远端副作用。

```js
import assert from 'node:assert/strict';

function bindRoute(route, credentialNames) {
  const url = new URL(route.baseURL);
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (!local || url.protocol !== 'http:' || url.username || url.password ||
      url.search || url.hash) throw new Error('Endpoint denied');
  if (route.api !== 'chat-completions') throw new Error('Unsupported API');
  if (typeof route.model !== 'string' || !route.model.trim()) {
    throw new Error('Missing model');
  }
  if (route.credentialRef && !credentialNames.has(route.credentialRef)) {
    throw new Error('Credential reference unavailable');
  }
  return Object.freeze({
    id: route.id, model: route.model,
    api: route.api, baseURL: url.href,
    credentialRef: route.credentialRef ?? null,
  });
}

const input = {
  id: 'local-demo', model: 'fixture-model',
  api: 'chat-completions', baseURL: 'http://127.0.0.1:11434/v1',
};
const bound = bindRoute(input, new Set());
input.model = 'changed-model';
assert.equal(bound.model, 'fixture-model');
assert.throws(() => bindRoute({
  ...input, baseURL: 'https://model.example.invalid/v1',
}, new Set()), /Endpoint denied/);
assert.throws(() => bindRoute({
  ...input, credentialRef: 'DEMO_MODEL_KEY',
}, new Set()), /unavailable/);
console.log('local route snapshot verified');
```

实验只判断引用是否存在，不解析真实密钥，也不证明 DNS 和网络隔离安全。`localhost` 的实际解析、代理环境与操作系统网络策略另有边界；原项目的 URL 校验也不等于 OS 沙箱。不可变快照这里只含标量字段，不能把浅冻结推广成任意嵌套配置的深冻结保证。

## 17.4 兼容网关需要逐项验收

“OpenAI 兼容”不是一个精确能力集合。需要分别检查 endpoint、认证头、工具参数、SSE 终止、usage、错误状态和模型能力。能生成一句文本，只证明最小聊天路径；工具调用组装和截断处理仍可能不兼容。

网关静默忽略不认识的字段尤其危险。调用方发送了输出上限或推理档位，服务却按默认值执行，日志仍显示“已配置”。应观察实际返回状态和 usage，并在适配层拒绝已知不支持的字段。无法验证的兼容项标记未知，不能因 HTTP 成功推定生效。

厂商私有 wire 扩展也不能变成通用配置。DeepSeek 固定版本单独记录自己的 LLM wire 扩展；这些字段的语义属于对应官方路由，不适用于 Ollama 或任意兼容服务。相同 JSON 字段名也可能有不同的生命周期含义。

## 17.5 失败处理不能偷换授权

认证失败、限流、连接失败和生成中断要分别处理。认证失败不应重复发送同一无效凭据，更不能自动换成另一个账号。限流可以在尚未产生响应流时按有限策略重试；已经收到部分输出后再整次重放，会使 UI 与会话出现重复或不完整事实。

自动降级还可能导致能力下降：视觉模型切到文本模型，工具模型切到只聊天模型，大窗口切到小窗口。必须重新做准入，拒绝不能表达的输入；不要为了“能回答”而静默丢弃图片、工具或必要指令。

更重要的是目的地变化。用户同意本地模型处理源码，不等于同意远端服务处理源码。端点 failover 应受部署出域政策约束，涉及新数据接收方时需要明确授权。网络失败是运行事实，不是拓展授权的理由。

## 17.6 实验与来源

运行独立代码，输入对象变更后已绑定模型应不变，远端端点和缺失凭据引用均拒绝。再从原示例根运行 `npm test`，检查 loopback 校验、重定向拒绝与部分流不重试的行为。真实网关端到端测试本章未运行；没有凭据、服务或具体部署时不宣称兼容。

DeepSeek 根包 `0.2.1-alpha.5` 的[凭据子系统](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/credentials.md)、[模型配置目录](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/config-catalog.md)与[官方 wire 扩展说明](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/deepseek-llm-api-wire-extensions.md)用于核对路由和认证所有权。[OpenAI Responses 官方接口](https://platform.openai.com/docs/api-reference/responses)仅提供该服务协议依据，不给其他网关背书。

本章未实现凭据存储、OAuth、多提供方 failover 和服务端容量探测。现有 `npm run labs` 不包含模型路由实验，`bindRoute()` 只是本文自包含示例；不能把它当作实验模块的导出函数，也不能把其他机制测试通过当作网关兼容证据。

---

上一篇：[第16章：Messages、Responses 与内容块协议](./16-model-protocols.md) · 下一篇：[第18章：指令层级、项目规则与环境事实](./18-instructions-architecture.md)
