---
title: Agent Harness：从零构建本地工作区助手
description: 用 Node.js 原生 ESM 实现可运行的 Agent Harness，逐章掌握插件生命周期、流式模型、工具边界、会话回放、预算、取消与 Web 传输。
status: 完整教程 · 12 章
featured: true
---

# Agent Harness：从零构建本地工作区助手

模型可以生成文本，Harness 负责把生成变成有边界、可验证的程序：谁注册工具、工具能访问什么、流什么时候结算、失败怎样恢复、运行如何停止。这个专题围绕一个真实项目讲清这些问题，最终得到可在终端和浏览器使用的本地工作区助手。

[下载完整项目源码](/downloads/agent-harness.zip)

示例使用 Node.js 22 原生 ESM、`fetch`、Web Streams、`AbortSignal` 和 `node:test`，没有第三方运行依赖。模型默认连接本机 Ollama 的 OpenAI 兼容接口；工具只能列出、读取指定工作区的文本文件。所有章节引用同一份源码，测试、CLI 和 Web 界面随下载包提供。

## 参考项目与版本边界

本教程参考 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的相关机制。2026-10-17 核验的源码版本是 [`1517a4d`](https://github.com/deepseek-ai/deepseek-harness/tree/1517a4dbca0a2789ff1d41ba439600f8547d23fa)，根包版本为 `0.2.1-alpha.5`。上游使用 Cordis 组织插件，根包声明 Node.js `^22.19.0 || >=24.0.0`、pnpm `11.28.5`、TypeScript `6.0.3`；这些属于该参考版本的工程配置，并不代表本教程或本站使用相同依赖。

教程实现是独立的 `local-harness-tutorial`，服务名称和函数签名由本项目定义。每章将上游机制与教学实现分别说明；涉及上游源码时固定到上述提交，读者可核对变化，避免把 alpha 版本接口当成稳定契约。

## 学习路线

| 章 | 一个核心知识点 | 该章得到的能力 |
| --- | --- | --- |
| [01 · 服务契约](./01-contracts) | 用边界拆分 Harness | 建立从零项目目录与服务接口 |
| [02 · 插件生命周期](./02-plugin-lifecycle) | 注册必须有所有权 | 失败回滚与反向清理 |
| [03 · 流式模型](./03-streaming-provider) | 增量与结算分离 | 解码 SSE、组装工具调用 |
| [04 · 工具边界](./04-tool-boundaries) | 模型参数是不可信输入 | 校验参数、路径与文件大小 |
| [05 · Agent 循环](./05-agent-loop) | 每一步都需终止条件 | 模型、工具、结果的有限循环 |
| [06 · 会话回放](./06-session-replay) | 历史来自已结算事实 | 保存完整工具组与恢复历史 |
| [07 · 上下文预算](./07-context-budget) | 裁剪不能破坏协议 | 保留完整轮次并明确超限失败 |
| [08 · 取消与重试](./08-cancellation-retry) | 运行必须可停止 | 传播取消并限制重试范围 |
| [09 · 可观测性](./09-observability) | 事件连接状态与结果 | 关联运行、工具状态与耗时 |
| [10 · 行为测试](./10-behavior-tests) | 用确定性验证不变量 | 测试协议、恢复和拒绝路径 |
| [11 · CLI 组合](./11-cli-composition) | 入口只负责组装与资源 | 配置本地模型、恢复会话 |
| [12 · Web 传输](./12-web-transport) | UI 与执行解耦 | 流式显示、取消与同源边界 |

## 从下载包开始

解压后进入 `agent-harness/`。不需要执行 `npm install`：

```sh
node --version
npm test
node src/cli.mjs --help
```

模型服务另行安装。选择硬件可承载且支持工具调用的模型，以下 `qwen3:4b` 是一个具体可选项；实际运行以 `ollama list` 中的已安装名称为准：

```sh
ollama pull qwen3:4b
ollama list
MODEL=qwen3:4b npm start -- "阅读 guide.md，解释运行边界并引用文件路径"
MODEL=qwen3:4b npm run web
```

Web 默认地址 `http://127.0.0.1:8787`。首次下载模型需要网络，运行时只允许 loopback 模型地址。工作区默认使用下载包内的 `workspace/`，会话保存在当前目录 `.harness/`。

## 完成标准

项目应能真实发起模型流式请求、识别工具调用、拒绝越界参数、把结算消息保存到本地、在下一次运行恢复完成的历史，并在 CLI 或 Web 取消后终止请求。读者需要同时验收正常和失败路径：模型未启动、工具参数错误、流中断、上下文超限、重复请求和会话损坏。

自动测试使用确定性 HTTP 服务与 provider 替身验证协议和状态。它们不会代替真实模型推理，也不能证明事实引用准确率。本机模型的工具选择与回答质量，应使用随包 `guide.md` 的已知内容另行检查。

这是一个功能闭环的教学项目，设计范围是单进程、本地只读工作区。多进程文件锁、对抗性文件系统沙箱、任意命令执行、远端模型接入和多租户认证不在此项目范围内；相应取舍在各章和随包 README 中说明。
