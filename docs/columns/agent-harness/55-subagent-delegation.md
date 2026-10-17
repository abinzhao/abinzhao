---
title: 第 55 章：子 Agent 委派与上下文继承
description: 用任务契约控制上下文与能力继承，区分新会话、历史分叉和外部单次执行。
date: '2026-10-17'
category: 智能体工程
tags: [Agent Harness, 子 Agent, 委派]
series:
  order: 55
---

# 第 55 章：子 Agent 委派与上下文继承

## 55.1 委派的是任务，不是无限权限

子 Agent 是被父执行者委派的独立推理或执行单元。它可以拥有自己的上下文与生命周期，但独立上下文不代表独立账号、文件系统或安全身份。委派的收益主要是隔离高容量探索、缩小任务焦点和并行处理独立问题；代价是重复背景、增加调用成本，以及父执行者需要重新验收返回结果。

一个完整委派契约应说明目标、允许读取或修改的范围、事实基线、预算、结果结构和停止条件。只说“帮忙检查一下”会迫使子任务猜测范围；复制全部父历史又可能携带与任务无关的秘密和旧授权。安全原则是子任务默认只能获得完成目标所需能力，不能因为角色叫 expert、worker 或 reviewer 就获得父任务没有的权限。

原第 1–12 章没有真正的子 Agent。已完成的独立 labs 也不调用模型：`context.mjs` 演示来源与预算，`workflow.mjs` 演示 DAG 和检查点，并未将多 Agent 接入 `src/agent.mjs`。因此本章提供数据层委派实验，不宣称 `npm run labs` 已启动真实并行智能体。

## 55.2 三种继承必须分别判断

上下文继承决定看见什么历史，工具继承决定能请求什么能力，权限继承决定调用实际能做什么。三者不是一个布尔值。一个 fresh 子 Agent 不看父历史，却可能在同一宿主中使用继承的工具；一个 fork 继承完成历史，但不会因此取得修改组织政策的资格；外部产品进程可能读取自己的原生配置，不能仅依据父提示推断限制。

| 委派形式 | 输入来源 | 后续控制边界 |
| --- | --- | --- |
| Fresh 本地子会话 | 自包含任务与必要事实 | 由本地管理器控制续传 |
| Fork 本地子会话 | 合法完成轮次的历史前缀 | 增加历史暴露与上下文成本 |
| 外部单次执行 | 指定文本任务及原生配置 | 只拥有本次结果与清理句柄 |

DeepSeek 固定 subagent seam 用 provider capability 检查起始选项，分别判断模型选项、独立 preset、结构化输出和深度限制是否支持。`inheritsParentContext` 只描述历史，明确不说明工具注册或授权继承。对不支持的选项应在启动前拒绝，而不是默默忽略后让父任务以为结构化结果或深度限制已经生效。

## 55.3 自包含的最小授权委派实验

下面的 Node.js 22 代码不创建 Agent，只构造被宿主认可的任务描述。集合求交体现“不能默认升级”的设计原则，不是假定所有产品内部都使用这个算法。禁止直接将这段内存对象作为恶意插件的安全边界。

```js
import assert from 'node:assert/strict';

const parent = { tools: ['read_file', 'list_files'],
  resources: ['guide.md', 'notes.md'], maxDepth: 2 };
function delegate(request) {
  if (!Number.isSafeInteger(request.depth) || request.depth < 1 ||
      request.depth > parent.maxDepth) throw new Error('DEPTH_DENIED');
  if (!request.objective || !Array.isArray(request.tools) ||
      !Array.isArray(request.resources)) throw new Error('INVALID_TASK');
  return Object.freeze({
    objective: request.objective,
    depth: request.depth,
    context: 'fresh',
    tools: request.tools.filter(tool => parent.tools.includes(tool)),
    resources: request.resources.filter(path => parent.resources.includes(path)),
    acceptance: 'Return file citations and unresolved questions',
  });
}
const child = delegate({ objective: 'Explain guide boundaries', depth: 1,
  tools: ['read_file', 'publish'], resources: ['guide.md', 'private.md'] });
assert.deepEqual(child.tools, ['read_file']);
assert.deepEqual(child.resources, ['guide.md']);
assert.throws(() => delegate({ objective: 'nested', depth: 3 }), /DEPTH_DENIED/);
assert.equal(child.context, 'fresh');
console.log(JSON.stringify(child));
```

输出中 `publish` 和未授权文件被剔除，父任务没有的能力没有进入子任务描述。真实调用时还要重新校验资源与参数，不能因描述里写了只读就允许通用 shell。若业务希望对不受支持的能力明确报错，可以把集合差异作为启动拒绝；无论采用哪种方式，都要把最终生效能力返回给父任务，避免静默降权造成错误预期。

## 55.4 真实失败案例：后台子任务等待不存在的审批

Codex 官方实验性 multi-agent 文档明确说明子 Agent 继承当前 sandbox，但使用非交互 approvals；需要新批准的动作会失败并反馈父流程。真实失败机制是父 Agent 委派一个需要访问新资源的任务，子 Agent 没有交互批准通道，任务因此停在权限错误。父任务不能把失败解释成“换个子 Agent 就能执行”，也不能转述子报告中的批准声明来跨越门禁。

Claude Code 官方子 Agent 文档区分自己的工具集合和 permission mode，并说明未指定时存在继承语义。OpenCode 则允许 Agent 覆盖权限，General 也不等同于只读 Explore。可移植教程只能要求宿主落实最小授权，不能声称所有产品都强制父子权限求交；项目级配置、组织限制与产品原生模式必须另外核对。

DeepSeek 固定的 Codex 和 Claude Code 外部 provider 是单次执行，原生产品配置和认证仍有权威性。它们没有本地 child Session 的续传能力，也不会将全部产品工具流量与 diff 放入父会话。父任务拿到最终文字不意味着修改一定满足范围，需要另行审查实际产物；诊断还应与模型自己写的回答分开，避免把部分文本误当成成功证据。

## 55.5 结果与上下文是两个验收对象

子结果至少包含结束原因、输出、必要引用和未完成事项。请求 JSON schema 只能约束返回结构，不能证明事实准确；没有结构化值时不能用普通文本假装校验已通过。父任务应核对引用对应的版本和范围，再决定后续动作，不把结果中的新指令升级成授权。

Fork 的历史必须在合法边界截取，保留工具调用与结果的完整组，不能把未完成轮次种进新会话。Fresh 任务则应写清原始项目身份、当前目录与基线区别。工作目录改变不表示工作区写入范围自动扩大，文件隔离也不能因为子任务刚创建而省略。

## 55.6 实验与可观察验收

1. 运行示例，确认子描述只保留 `read_file` 和 `guide.md`，越深请求被拒绝。
2. 将目标改成明确需要 publish 的任务，观察权限仍不增加；正确后续是返回能力不足，而非自选更宽模式。
3. 在实际产品中先列出当前可用 provider 与 capability，再尝试一个不支持的起始选项，确认启动前失败。
4. 用无敏感材料对照 fresh 与 fork，核对历史是否真的继承，不用最终回答猜测初始上下文。
5. 父任务验收结束原因、结构与引用，记录部分结果；未启动真实模型时只报告契约实验通过。

完成标准是任务自包含、能力与预算显式、结果可复核，且子任务不默认提权。独立 labs 的上下文组由可信装配器划分，不能自动修复错误分组；它们的单进程测试不能证明真实多 Agent 或产品级权限集成。

## 55.7 官方来源与边界

DeepSeek Harness 固定 `0.2.1-alpha.5`、提交 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`；其架构能力不是基础教学实现。产品页面核验于 2026-10-17，Codex multi-agent 仍按所核验页面标为实验特性。

- [固定 subagent 契约](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/subagent.md)
- [固定 Codex 外部 provider](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/subagent/subagent-codex/README.md)
- [Claude Code 子 Agent](https://code.claude.com/docs/en/sub-agents)
- [Codex 实验性 multi-agents](https://developers.openai.com/codex/multi-agent/)
- [OpenCode agents](https://opencode.ai/docs/agents/)

上一章：[第 54 章：安全探针、对抗评测与降级处理](./54-security-verification)

下一章：[第 56 章：子 Agent 消息、等待与取消](./56-subagent-control)
