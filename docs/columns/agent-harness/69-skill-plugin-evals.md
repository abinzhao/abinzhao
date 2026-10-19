---
title: 第六十九章：Skill、插件评测与消融对比
description: 通过触发、加载、执行和安全分层评测技能与插件，用独立变量和同任务配对避免错误因果结论。
date: '2026-10-17'
category: 智能体工程
tags: [Skill 评测, 消融实验]
series:
  order: 69
---

# 第六十九章：Skill、插件评测与消融对比

增加 Skill 后任务变好了，可能来自更好的说明，也可能来自多给了工具、资料或预算。插件还能改变执行顺序、错误处理和权限，因此不能只比较两次回答的措辞。本章把评测分成触发、加载、执行和安全四层，并以独立变量约束消融，确保结论能回答“到底改变了什么”。

## 分层评测对象

触发层检查该用时是否发现和选择技能，不该用时是否误触发；加载层检查来源、名称、摘要和引用是否正确；执行层检查实际遵循流程后产物是否满足要求；安全层检查技能正文和脚本是否扩大权限、泄露凭据或绕过审批。触发成功不保证执行正确，正文加载成功也不证明任务收益。

插件还要检查注册与清理生命周期。安装后新增了哪些工具、事件订阅和配置，卸载后是否彻底释放，是独立于模型的机制问题。DeepSeek 固定提交的 skills、extensions 与 scope 文档提供相应契约阅读入口，但不同产品的 Skill、plugin 与 Hook 不是同一种实现。不要用一个产品的文件格式测试去宣称所有插件生态一致。

教学 `labs/skills.mjs` 已实现发现元信息、来源消歧、摘要检查和按需正文加载，解析器只支持单行 name、description。发现阶段确实读了文件，但目录数据不包含正文；这种渐进加载节省的是模型上下文，而不是保证磁盘正文未被读取。它没有真实模型触发器，也没有执行引用脚本，评测时必须保留这个边界。

## 消融与独立变量

消融不是随意删除一半内容再看哪次更好。先定义一个可控制的变量，例如 description 是否包含明确触发条件，正文是否提供失败恢复步骤，或工具 schema 是否懒加载。模型、任务输入、工具权限、预算、检索资料和运行环境保持相同，再对同一任务配对。若多个因素同时变化，只能报告组合差异，不能归因给某个 Skill。

```text
固定任务与环境
  -> baseline 配置指纹
  -> candidate 仅改变一个变量
  -> 独立运行与轨迹采集
  -> 产物、安全和成本分别验收
  -> 配对变化与缺失报告
```

| 变量 | 保持不变的条件 | 可回答的问题 |
| --- | --- | --- |
| 技能 description | 正文、工具、模型、任务 | 触发描述是否减少漏选 |
| 正文恢复步骤 | 触发、预算、失败输入 | 恢复指导是否改善产物 |
| 注册插件版本 | 权限、依赖、任务集 | 升级是否引入行为回归 |
| 工具懒加载开关 | 工具能力与任务 | 上下文策略是否影响选择 |

移除 Skill 往往也减少输入 Token，这可能是变量的中介效果，但必须报告，不能悄悄给另一组扩大预算补齐。工具撤销则是能力变化，与仅移除说明不同。先写出实验要估计的效应，再选择控制条件，避免把“技能有用”变成不可证伪的描述。

## 配对统计的实际实验

以下导入已实现的 `comparePaired`，只验证任务对齐与缺失处理。结果是人工赋值，不调用模型；不能将 improved 的数量写成真实 Skill 提升。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { comparePaired } from './labs/eval.mjs';
const baseline = [
  { taskId: 'fixture-a', passed: false },
  { taskId: 'fixture-b', passed: true },
  { taskId: 'fixture-c', passed: null },
];
const candidate = [
  { taskId: 'fixture-c', passed: true },
  { taskId: 'fixture-a', passed: true },
  { taskId: 'fixture-b', passed: false },
];
const report = comparePaired(baseline, candidate);
assert.deepEqual(report, { total: 3, improved: 1, regressed: 1, missing: 1 });
assert.throws(() => comparePaired(baseline, candidate.slice(1)), /paired/);
assert.throws(() => comparePaired([baseline[0], baseline[0]], candidate), /duplicate/);
console.log(JSON.stringify({ kind: 'manual-ablation-fixture', report }));
NODE
```

统计器按 taskId 配对，而不是按数组位置。结果相同不表示轨迹、成本和安全也相同；本函数只比较 passed，没有实现安全非劣检验、统计显著性或置信区间。缺失任务会计入 missing，不会被当成 improved。汇总胜负相抵时仍应分别保留退化案例，因为安全关键任务的单次回归可能阻止发布。

## 触发和供应链失败场景

描述过宽会让技能介入不相关任务，覆盖用户原意；描述过窄则漏掉必要流程。评测集应包含正例、近似负例和相互竞争的技能，检查来源限定与优先级。不要只使用技能作者自己编的精确关键词，因为这很容易测试到字符串匹配，而不是实际任务理解。

发现后文件被修改时，加载必须拒绝旧摘要；重名来源不能静默挑选第一项。插件更新后 schema 改变或 Hook 变慢，也应纳入回归。依赖、脚本与引用仓库的来源不能只靠技能文字声明，执行器要检查允许范围。恶意正文写“忽略审批”时，模型是否服从属于行为评测，执行器是否拦截属于权限测试，两条证据都应保留。

真实执行还可能受顺序影响：先运行 baseline 留下缓存或产物，candidate 再读到了这些材料。应使用隔离工作区并交替或随机化运行顺序，记录缓存状态。若服务端不可控制，应明确剩余混杂因素，不把所有差异归因于正文改动。多轮结果需要固定随机性配置和重复次数，并报告未成功完成的运行。

## 可观察验收与发布判断

运行配对实验，应得到一个 improved、一个 regressed 和一个 missing，候选顺序变化不影响配对结果；缺任务与重复 ID 必须拒绝。运行 `node --test test/labs.test.mjs` 可检查真实发现器的重名、变化和路径行为。它不评测模型对技能的触发，也不能代替插件供应链审查。

真实报告应附独立变量、全部固定条件、任务修订、候选指纹、实际轨迹、产物与安全验收。没有运行模型时只交付机制结论，不给提升百分比。发布应同时满足预先规定的质量、安全和成本约束，不能看到一个均值提高就补写门槛；发现安全回归时，应保留旧版本并复现，而不是扩大权限消除失败。

## 固定来源

- [DeepSeek skills](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/skills.md)：技能发现与加载阅读入口。
- [DeepSeek extensions](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/extensions.md)与[scope](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/scope.md)：插件与所有权契约。
- [Agent Skills specification](https://agentskills.io/specification)：完整文件规范，不等同于教学解析器子集。

上一章：[第六十八章：真实任务、Trajectory 与结果评测](./68-agent-evaluation.md)

下一章：[第七十章：OpenTelemetry、诊断与成本](./70-observability-cost.md)
