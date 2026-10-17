---
title: 第七十二章：完整项目验收、生产交付与技术地图
description: 以本地只读证据审查任务串联技能、权限、上下文、恢复和评测，形成产物验收与未实现生产门槛。
date: '2026-10-17'
category: 智能体工程
tags: [Agent Harness, 综合实训, 生产验收]
series:
  order: 72
---

# 第七十二章：完整项目验收、生产交付与技术地图

学完七十二章，不应只得到“知道很多名词”的印象，而应能完成一个边界清楚、证据可取回的任务。本章的 capstone 是本地只读证据审查：读取指定资料，生成含输入摘要、运行边界与验收结果的报告；任务中途停止后恢复，不重复已完成步骤，也不产生未授权外部动作。它不是重造目录，而是把前面机制串成可验收交付。

## 任务与完成标准

任务读者是准备接入工作区助手的开发者。输入固定为示例项目的 `README.md` 与 `labs/README.md`，输出是含来源摘要、教学限制和检查结果的 JSON 报告。允许读取和内存计算，禁止执行命令、联网、修改原资料和发布。文件发布若将来加入，必须另行授权并作为非安全重放动作处理。

完成标准不是报告说“通过”，而是输入摘要可复算、每条限制能定位来源、恢复时第一步执行次数不增加、上下文必需事实未丢失、错误审批不能消费、缺失评测不被当成成功。独立机制验证使用实际 `labs/`；模型生成解释的质量则另用真实任务验收，不能拿确定性输出代替模型效果。

## 从输入到验收的完整数据流

技能目录提供发现与来源，审批门绑定可信动作，上下文装配器选择完整组，工作流复用已完成结果，评测器保留缺失与安全结果。它们在本项目中仍是独立实验，下面只组合上下文与工作流形成只读实训；技能和权限通过已有运行器单独验收，不声称已经接入 `src/agent.mjs`。

```text
固定输入 + SHA-256
  -> 必需规则与目标装配
  -> read 步骤完成
  -> 预算暂停与快照
  -> 恢复 report 步骤
  -> 产物摘要复算
  -> 限制检查 + 机制验收
  -> 教学交付，不自动发布
```

capstone 的报告应区分完成、失败、待协调与未验证。可运行机制通过，但真实模型没有运行，就报告“模型质量未测”。没有实际沙箱测试，就不能把只读工具的路径检查写成强隔离。报告的缺失项是交付事实，不是需要用想象内容填满的空白。

## 可直接运行的综合实验

从 `examples/agent-harness` 根目录运行以下代码，所有导入对应已实现实验。它读取两个真实教学文件，不修改文件，也不调用模型、Shell 或网络。检查点是内存快照，明确不能验证掉电耐久；磁盘恢复的已有演示由 `npm run labs` 提供。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { packContext } from './labs/context.mjs';
import { runWorkflow } from './labs/workflow.mjs';
const hash = text => createHash('sha256').update(text).digest('hex');
const files = ['README.md', 'labs/README.md'];
const texts = await Promise.all(files.map(file => readFile(file, 'utf8')));
const sources = files.map((file, i) => ({ file, sha256: hash(texts[i]) }));
const packed = packContext([
  { id: 'rule', group: 'rule', source: 'instruction', required: true,
    priority: 100, text: 'read only; no network; no publish' },
  { id: 'goal', group: 'goal', source: 'user', required: true,
    priority: 90, text: 'report verified tutorial boundaries' },
], { limit: 4, reserve: 1, measure: () => 1 });
assert.equal(packed.blocks.length, 2);
const calls = [];
const tasks = [
  { id: 'inspect', revision: '1', depends: [], replaySafe: true,
    run: async () => { calls.push('inspect'); return sources; } },
  { id: 'report', revision: '1', depends: ['inspect'], replaySafe: true,
    run: async result => {
      calls.push('report');
      return { sources: result.inspect, kind: 'read-only-capstone',
        modelMeasured: false, productionReady: false };
    } },
];
let snapshot;
const checkpoint = async state => { snapshot = structuredClone(state); };
const first = await runWorkflow({ tasks, maxSteps: 1, checkpoint });
assert.equal(first.status, 'budget');
const final = await runWorkflow({ tasks, state: snapshot, checkpoint });
assert.equal(final.status, 'completed');
assert.deepEqual(calls, ['inspect', 'report']);
const report = final.state.tasks.report.result;
assert.deepEqual(report.sources, sources);
for (let i = 0; i < files.length; i++) {
  assert.equal(hash(await readFile(files[i], 'utf8')), report.sources[i].sha256);
}
assert.ok(texts[0].includes('单进程') || texts[0].includes('一个进程'));
assert.ok(texts[1].includes('没有') && texts[1].includes('模型'));
console.log(JSON.stringify({ status: final.status, calls, report }, null, 2));
NODE
```

报告中的布尔值是本实训的边界声明，不是模型得分。文件摘要复算检查输入未变，但程序并未提取所有限制，也不证明语义报告完整。读者应另行写出有原文依据的限制清单，并检查主 README 与实验 README 是否一致；发现文档和实现冲突，要先以代码与测试确认，不能改断言迁就错误文本。

## 技术地图与生产门槛

完整章节、三十八领域和 DeepSeek 六十六子系统的索引已在[教程入口](./index.md)维护。这里按交付决策归纳地图，而不重复全部条目。每条生产门槛都必须有实现和运行证据；阅读过章节只代表理解了问题，不代表项目具备能力。

| 能力域 | 教学证据与定位 | 未实现的生产门槛 |
| --- | --- | --- |
| 技能与插件 | [十九章](./19-skills-format.md)，发现、摘要与消歧实验 | 完整规范、脚本治理、供应链 |
| MCP 与身份 | [二十五章](./25-mcp-architecture.md)，协议分析 | 真实连接、OAuth、凭据隔离 |
| 上下文与持久化 | [三十一章](./31-context-assembly.md)，分组及 DAG 恢复 | 精确计量、跨进程锁、耐久提交 |
| 工具与安全 | [四十九章](./49-threat-model.md)，审批实验 | OS 强隔离、网络与进程限制 |
| 委派与协作 | 五十五至六十章的职责分析 | 真多 Agent、工作树隔离、调度 |
| 宿主与交付 | 六十一至六十六章的协议示意 | SDK 类型集成、远端授权、多端附件 |
| 评测与运维 | 六十七至七十一章的确定性实验 | 真实任务、安全评测、负载及恢复 |

原一至十二章仍是单进程只读 Node.js 22 原生 ESM 助手；扩展实验没有把它升级成生产平台。尤其没有真实厂商 SDK、远端认证、强沙箱和多 Agent。生产需求应逐项新增实现、威胁模型与验收，不通过修改 README 的能力描述提前宣称完成。

## 失败场景与验收执行

输入改变而报告仍引用旧摘要，应失败并重新读取；任务修订改变却恢复旧检查点，应拒绝；首次读取已完成却在恢复时又运行，说明结果复用失效。审批换参数、必需上下文超预算和非安全动作中断分别应拒绝或阻塞，不能统一映射成完成。产物缺少来源或实际文件不存在，也不能交付为成功。

在示例根目录依次运行综合实验、`npm run labs`、`node --test test/labs.test.mjs` 和 `npm test`。报告分别记录输入摘要、执行次数、终态与测试结果。基础 CLI 或 Web 的真实模型验收需要已安装模型服务和单独授权；没有运行就保留未验证。不要为了完成 capstone 自动下载模型、安装厂商包、推送或部署。

教程站点也要验收 frontmatter、章节链接、导航、类型检查和构建；这属于文档交付，不证明智能体运行质量。最终 Diff 应只包含授权文件，无凭据、调试日志或无关改动。需要发布时应先确认部署目标和回滚方式，保持教学产物与生产上线的权限边界。

## 固定来源与交付限制

- [DeepSeek subsystem index](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/README.md)：六十六子系统的固定基线。
- [DeepSeek architecture](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/architecture.md)与[tool catalog](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/tool-catalog.md)：职责与工具契约。
- [Node.js 22 文档](https://nodejs.org/docs/latest-v22.x/api/)：自包含实训运行基础。

本章没有模型效果数据，也没有远端集成或生产负载证明。教学交付完成的含义是来源、代码和边界可以核对，未实现门槛仍明确保留，而不是所有领域都已编写成生产功能。

上一章：[第七十一章：性能、限流、资源泄漏与运维](./71-performance-operations.md)

下一步：[返回教程入口与完整技术地图](./index.md)
