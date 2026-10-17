---
title: '第13章：Agent、Workflow 与 Harness 的边界'
description: 从决策权、执行权与事实记录出发，区分智能体循环、确定性工作流和运行宿主，建立可验证的职责边界。
date: '2026-10-17'
category: 智能体工程
tags: [Agent Harness, Agent, Workflow, 运行时契约]
series:
  order: 13
---

# 第13章：Agent、Workflow 与 Harness 的边界

一个程序调用了大模型，并不自动成为智能体。关键问题是：下一步行动由谁选择，选择依据是什么，谁可以拒绝执行，以及执行结果怎样改变下一步。把这些问题拆开，比给项目贴上“自主”的标签更有用。

本章面向已经运行前十二章的开发者。`local-harness-tutorial` 仍是 Node.js 22 原生 ESM 的单进程只读助手；本章增加理解和独立实验，不把它升级成完整 SDK。它只能列文件和读文件，不能因后续教程讨论发布流程就获得发布权限。

## 13.1 三种职责不是三个产品

Agent 是基于观察选择行动的控制者。在原项目中，模型读取消息和工具定义，决定调用 `read_file` 还是输出回答；`runAgent()` 再把工具结果加入下一轮。这种反馈使路径不必预先写死，但也引入不确定性：模型可能选错工具、重复读取，或者过早回答。

Workflow 是预先约束的推进关系。比如“检查输入、读取材料、验证引用、形成结果”，步骤与允许的分支由程序决定；其中某一步可以使用模型。确定性不意味着全部输出相同，而是同样的已知状态允许哪些转移，应由代码解释，不能临时依赖模型的说法。

Harness 是承载两者的运行宿主，负责模型适配、上下文、工具边界、取消、记录与资源生命周期。它不一定拥有复杂界面，也不等于某个特定 SDK。Agent 的聪明程度与 Harness 的可靠程度是两个维度：更强模型无法补上一个从不检查路径的文件工具。

| 问题 | 决策责任 | 最终约束 |
| --- | --- | --- |
| 为解释文档还缺什么证据 | Agent | 已授权工具集合 |
| 未验证引用能否交付 | Workflow | 程序中的验收门 |
| 目录外文件能否读取 | Harness | 工具运行时校验 |
| 请求取消后能否继续 | Harness | 信号与终态规则 |

## 13.2 从意图到事实的数据流

用户意图不是执行记录，模型建议也不是结果。一次调用至少经过候选行动、准入、执行、结算四个阶段。只有工具真正完成后，观察才有资格成为下一次决策的依据。拒绝同样是观察，但其含义是“这个请求没有执行”，不能被改写成“目标不存在”。

```text
用户目标 -> 工作流当前阶段 -> 模型提出行动
                              |
                       Harness 校验与准入
                          /          \
                        拒绝        工具执行
                          \          /
                         已结算观察
                              |
                       记录 -> 下一步决策
                              |
                       验收门 -> 交付或失败
```

这条链要求明确的标识关联。模型给出工具调用标识，结果必须回答同一个调用；取消不能伪装成普通参数失败；未结算流不能当作完整回答保存。前五章的循环和第六章的记录已经体现了这些约束，但没有实现复杂工作流的持久化调度。

运行契约还必须回答谁拥有状态。工作流拥有阶段，工具拥有实际读取，会话拥有可回放消息，界面仅呈现事件。让界面上一个“完成”按钮直接决定外部操作成功，会把用户手势与环境事实混为一谈。可靠交付应关联到读取结果或验证结果，而不是关联到提示词中的完成措辞。

## 13.3 一个不依赖模型的最小验收门

下面是完整的内存实验。可在任意目录用 `node --input-type=module` 执行，不访问网络、不写文件。它不是原项目导出的 API，只展示工作流如何约束一个候选动作。

```js
import assert from 'node:assert/strict';

async function executePlan(plan, tools) {
  const observations = [];
  for (const action of plan) {
    const tool = tools.get(action.name);
    if (!tool) throw new Error('Unknown tool');
    const result = await tool(action.args);
    observations.push({ name: action.name, result });
  }
  const evidence = observations.find(
    (item) => item.name === 'read_file' &&
      item.result.path === 'guide.md' &&
      item.result.text.length > 0,
  );
  if (!evidence) throw new Error('Missing required evidence');
  return { status: 'verified', evidence: evidence.result.path };
}

const tools = new Map([
  ['read_file', async ({ path }) => {
    if (path !== 'guide.md') throw new Error('Path denied');
    return { path, text: 'Only read operations are available.' };
  }],
]);
assert.deepEqual(
  await executePlan([{ name: 'read_file', args: { path: 'guide.md' } }], tools),
  { status: 'verified', evidence: 'guide.md' },
);
await assert.rejects(executePlan([], tools), /Missing required evidence/);
await assert.rejects(
  executePlan([{ name: 'publish', args: {} }], tools),
  /Unknown tool/,
);
console.log('workflow gates verified');
```

候选计划可以由模型提出，但计划的来源不改变验收门。这里把文档材料写在内存中，是为了隔离控制流实验，不代表完成了真实文件访问验证。实验成功只能证明缺少证据和未知工具被拒绝，不能证明模型回答正确。

## 13.4 为什么“更自主”可能更不可靠

一个常见失败是给模型一个检查清单，然后把“模型说全部通过”当成验收。模型可以把未运行的检查描述成已经运行；检查清单没有形成任何运行时约束。应分别保存实际观察与模型解释，让交付条件读取前者，解释缺少证据时只能表达不确定。

另一种失败是工作流在读取失败后自动跳到更宽权限的 shell。这个分支并非恢复，而是改变授权边界。恢复应保持原操作的政策，或暂停请求新的明确授权。不能因为主路径“必须完成”，就把每个拒绝都解释成需要寻找绕行工具。

还要警惕“一个步骤就是一次模型请求”的假设。一次用户目标可能包括多次模型请求，每次请求又可能包含多个工具调用；工作流阶段未必与任一计数重合。步数上限防止无限循环，阶段验收防止错误交付，时间预算防止等待失控，三者解决不同问题。

## 13.5 实验与可观察验收

先运行上述代码，终端应只输出一行成功信息，且两个拒绝断言通过。再把正常计划的路径改成 `other.md`，程序应以路径拒绝结束，而不是返回已验证状态。最后删除所需证据门，观察空计划能够“成功”的差异，理解验收逻辑而非模型能力才是实验变量。

回到原示例目录运行 `npm test`，检查只读边界仍然成立。真实模型实验可以要求“读取 guide.md 后解释限制并引用路径”，再观察工具事件和回答引用。工具事件证明读取发生，回答引用是另一个需人工核对的质量目标；两者不能互相代替。

独立实验入口为 `npm run labs`，运行边界见示例根 `labs/README.md`。其中工作流实验与本章内存验收门独立，也未接入基础循环；本文不把 `executePlan()` 当成 `workflow.mjs` 的 API。长任务检查点、重启恢复、外部副作用幂等和多智能体调度均未在这个内存门中实现。

## 13.6 固定来源与实现边界

DeepSeek 参考版本统一固定为提交 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`，根包 `0.2.1-alpha.5`。其[架构](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/architecture.md)区分 session、turn、step；[核心契约](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/core.md)与[工作流子系统](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/workflow.md)说明工作流是可选能力，而非循环必备功能。

这些来源用于核对职责，不意味着教学项目具有上游的脚本工作流引擎。后续讨论首先扩展知识地图，再通过明确实验验证局部契约；只有真正加入源码并验证的能力，才能写入项目功能清单。

---

上一篇：[第12章：Web 传输](./12-web-transport.md) · 下一篇：[第14章：从 ReAct 到可验证控制流程](./14-agent-control-patterns.md)
