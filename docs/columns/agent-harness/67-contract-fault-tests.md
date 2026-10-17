---
title: 第六十七章：契约测试、故障注入与回归
description: 用确定性失败证据检查取消、检查点、权限和资源生命周期，避免将机制测试误报为模型质量。
date: '2026-10-17'
category: 智能体工程
tags: [Agent Harness, 契约测试, 故障注入]
series:
  order: 67
---

# 第六十七章：契约测试、故障注入与回归

智能体系统不能只测试顺利得到回答。真正的错误常发生在动作执行后、结果提交前，或用户取消后仍有后台任务继续运行。契约测试的目标是验证边界承诺：什么输入必须拒绝，哪个状态才允许执行，以及失败后哪些资源必须释放。本章使用确定性故障，不调用模型，也不通过替身数据推断真实任务成功率。

## 契约与模型效果分开

机制测试验证输入校验、协议序列、状态转换和资源清理；模型评测验证工具选择、任务结果与事实质量。前者可以用受控输入稳定复现，后者需要实际任务、固定配置和独立验收。把一次人工构造的成功结果喂给统计器，只证明统计器会计算，不证明 Agent 能完成任务。

先写可观察的不变量，而不是先写 Mock。例如审批绑定不得被换 argv 绕过；工具调用与结果不得被拆开裁剪；检查点持久化失败时不得执行动作；不确定副作用不得自动重放；取消必须阻止下一步选择。每条不变量都应有一个正常对照和一个失败触发，并检查真实执行计数，而非只检查错误字符串。

## 故障点来自真实数据流

DeepSeek Harness 固定提交 `1517a4dbca0a2789ff1d41ba439600f8547d23fa` 的 workflow 文档区分脚本结果、停止原因和 dispose。非完成结果应映射为错误工具结果，观察事件是数据快照而不是 live handle；订阅者抛错不得破坏后续订阅者。这些契约可以直接转成用例，但教学 `labs/workflow.mjs` 不是其工作流引擎，也没有子 Agent VM。

本地实验的实际顺序为：校验定义，选择依赖完成的任务，把 running 意图交给 checkpoint，执行动作，编码结果，再提交 completed。失败窗口集中在两次提交前后。第一份提交失败应完全不执行；动作后完成记录失败则不能伪造成功，应从最后耐久快照恢复并协调副作用。

```text
定义校验 -> running 检查点 -> 动作 -> completed 检查点
   |              |            |              |
非法依赖拒绝   提交失败不执行   失败/不确定    写失败不报成功
```

| 注入位置 | 应观察的结果 | 禁止的处理 |
| --- | --- | --- |
| 校验前 | 动作计数为零 | 先执行后验证 |
| running 提交 | 明确失败且未调用动作 | 忽略磁盘错误 |
| 非安全动作之后 | 恢复 blocked | 自动重复副作用 |
| 取消后选择下一步 | 不再调用新任务 | 只停界面动画 |

注入点不是随机抛错。随机故障可用于压力测试，但无法稳定定位契约被破坏的位置。小型回归优先控制提交回调、计时器和 AbortSignal，使失败原因可以重复。涉及真实进程或网络时，再增加集成用例验证终止和关闭，而不把内存测试写成进程隔离证据。

## 可直接运行的失败实验

在 `examples/agent-harness` 根目录运行以下代码，导入的是已经实现的 `runWorkflow`。它不创建文件、不执行 Shell、也不发网络请求；checkpoint 的错误是有意注入，失败结果是实验预期，不应删除断言让它“变绿”。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { runWorkflow } from './labs/workflow.mjs';
let calls = 0;
const safe = [{
  id: 'read', revision: '1', depends: [], replaySafe: true,
  run: async () => { calls++; return { bytes: 4 }; },
}];
await assert.rejects(runWorkflow({
  tasks: safe,
  checkpoint: async () => { throw new Error('injected-disk-full'); },
}), /disk-full/);
assert.equal(calls, 0);
let sends = 0;
const unsafe = [{
  id: 'send', revision: '1', depends: [], replaySafe: false,
  run: async () => { sends++; throw new Error('lost-after-effect'); },
}];
const first = await runWorkflow({ tasks: unsafe });
assert.equal(first.status, 'failed');
const resumed = await runWorkflow({ tasks: unsafe, state: first.state });
assert.equal(resumed.status, 'blocked');
assert.equal(sends, 1);
console.log(JSON.stringify({ calls, sends, resumed: resumed.status }));
NODE
```

`sends` 只是内存计数，不代表真的发送消息。它的用途是证明恢复路径不会再次调用一个非 replaySafe 动作。实际服务端仍需幂等键或查询动作状态；本地 running 状态只能说明存在歧义，不能判断远端是否已经发生效果。不能把本实验结论扩大为 exactly-once。

## 回归范围与诊断

修复契约后，先运行最小失败用例，再运行同模块测试，最后运行基础项目测试。若改动共享状态或取消传播，还应覆盖 CLI 和 Web 运输层。当前 `test/labs.test.mjs` 覆盖技能歧义、摘要变化、审批绑定、上下文组、DAG 恢复、取消及评测配对等确定性行为；数量应以当前命令输出为准，不在文档里长期写死。

测试失败要分类。断言检测到错误副作用是实现回归；Node 版本不满足项目要求是运行前提问题；模型服务未启动是外部依赖问题。报告应保留命令、退出码、首个有意义错误和复现输入。不得把关闭断言、吞掉异常、提高所有超时当成修复，也不得把相关路径尚未运行写成已通过。

故障恢复还需看资源。结果 failed 但仍有订阅、计时器或进程活着，不算完整失败处理。对资源拥有者做计数，在完成、拒绝、取消和异常四类路径检查回到基线。后台工作可晚于 turn 完成，因此必须检查拥有者的实际清理契约，不能只看一条 end 事件。

## 可观察验收与限制

运行上述实验，应得到 calls 为零、sends 为一、resumed 为 blocked。再执行 `node --test test/labs.test.mjs` 和 `npm test`，检查失败注入和基础行为是否都通过。`npm run labs` 是五个机制演示的汇总，不是故障矩阵的全部覆盖；报告应把三条命令用途分开。

教学检查点没有 fsync、跨进程锁或任意任务代码哈希。要证明进程崩溃和掉电恢复，需要独立进程与实际耐久存储实验，不能仅靠回调抛错。本章未对厂商 SDK、真实模型或操作系统沙箱做集成测试；这些属于第七十二章的生产门槛。

## 固定来源

- [DeepSeek workflow](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/workflow.md)：结果、错误和清理契约。
- [DeepSeek tool execution pipeline](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/tool-execution-pipeline.md)：工具边界阅读入口。
- [Node.js 22 test runner](https://nodejs.org/docs/latest-v22.x/api/test.html)：本地测试运行器。

上一章：[第六十六章：Web、IDE、桌面与附件交付](./66-clients-deliverables.md)

下一章：[第六十八章：真实任务、Trajectory 与结果评测](./68-agent-evaluation.md)
