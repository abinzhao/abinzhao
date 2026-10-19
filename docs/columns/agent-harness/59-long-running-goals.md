---
title: 第 59 章：长任务、Goal 与跨窗口交接
description: 分离持久目标与进程内继续资格，用预算、修订、交接证据和可观察完成条件控制长任务。
date: '2026-10-17'
category: 智能体工程
tags: [Goal, 上下文交接]
series:
  order: 59
---

# 第 59 章：长任务、Goal 与跨窗口交接

## 59.1 长任务不是无限继续循环

长任务跨越多个轮次、工具调用甚至上下文窗口。Goal 表示需要达到的业务目标，run 表示某一次执行，checkpoint 表示可恢复状态，handoff 表示下一执行者需要的证据。它们可以相关，却不是同一个对象。保存目标文字不保证任务继续，交接摘要也不能取代尚未落盘的产物或真实调用结果。

无限“再试一次直到成功”没有可验证边界。长任务应定义轮数、时间、费用、工具步数和启动子任务总数，任何一项耗尽都进入明确停止状态。完成条件必须来自可观察验收，例如指定文件存在、结构校验通过且测试对应当前版本，而不是模型声称“全部做好”。没有客观完成信号时，应报告进度与待确认项，不能由模型自己扩大范围。

原教程只实现有限单进程循环与本地会话回放，不提供跨窗口自治任务系统。独立 labs 的 workflow 可以从磁盘恢复已完成 JSON 结果，context 演示完整组与必需事实选择，仍没有真实 Goal 续跑或模型上下文切换。本章保持这一能力边界，不把 `npm run labs` 宣称成长任务服务。

## 59.2 持久阶段与活跃资格正交

DeepSeek 固定 Goal 有 active、paused、blocked、complete 等持久阶段，使用目标 ID 与 revision 做精确更新。进程内 activation 另外回答是否允许 continuation consumer 开始下一轮。disarm 可以撤销继续资格而不改变持久阶段；恢复旧记录不能仅看到 active 就自动执行，需要按可信生命周期和人工授权重新建立资格。

| 信息 | 应如何保存 | 不能据此推断 |
| --- | --- | --- |
| 目标与修订 | 持久状态或版本化记录 | 当前进程仍可自动继续 |
| 轮次与预算 | 已接纳执行的事实 | 请求失败完全没有成本 |
| 当前 activation | 进程内生命周期 | 重启后资格仍有效 |
| 交接摘要 | 事实、引用和未完成项 | 旧审批可以再次消费 |

固定 Goal 的轮数由实际接纳的 continuation 输入推进，不是每次模型说“继续”就计数。重放拒绝轮数间隙、旧 revision、已停止阶段和上限溢出。预算计数必须有明确事件边界，避免启动后未记账造成超额，也避免把尚未接纳的尝试假装完成轮次。

## 59.3 自包含的恢复与轮次实验

以下 Node.js 22 示例展示持久目标与进程内继续资格的区别，数据都在内存，不创建持久服务，也不启动模型。重新读取 JSON 保留目标状态，但把 activation 重置为 false，随后由显式操作恢复继续资格。

```js
import assert from 'node:assert/strict';

let goal = { id: 'goal-lab', revision: 1, phase: 'active',
  objective: 'Verify the chapter artifact', roundsStarted: 0, maxRounds: 2 };
let armed = true;
function startRound() {
  if (!armed || goal.phase !== 'active') throw new Error('NOT_ARMED');
  if (goal.roundsStarted >= goal.maxRounds) {
    armed = false;
    goal = { ...goal, revision: goal.revision + 1, phase: 'blocked' };
    throw new Error('ROUND_CAP');
  }
  goal = { ...goal, roundsStarted: goal.roundsStarted + 1 };
  return goal.roundsStarted;
}
function resume(expectedRevision) {
  if (goal.revision !== expectedRevision) throw new Error('STALE_GOAL');
  if (goal.roundsStarted >= goal.maxRounds) throw new Error('ROUND_CAP');
  armed = true;
}
assert.equal(startRound(), 1);
const stored = JSON.stringify(goal);
goal = JSON.parse(stored);
armed = false;
assert.equal(goal.phase, 'active');
assert.throws(startRound, /NOT_ARMED/);
assert.throws(() => resume(0), /STALE_GOAL/);
resume(1);
assert.equal(startRound(), 2);
assert.throws(startRound, /ROUND_CAP/);
assert.equal(goal.phase, 'blocked');
console.log(JSON.stringify({ goal, armed }));
```

示例只用轮数作为预算。生产中轮数不能替代 token、工具耗时与外部费用，子任务预算也应来自父任务总量而非另开无上限账户。`resume` 在例子中是明确操作，但真正系统必须验证调用身份与授权来源，不能让工具结果中的一句“请 resume”自动取得资格。

## 59.4 交接记录保持事实与未完成状态

交接至少包含目标、用户最新纠正、允许修改范围、事实基线、已完成产物位置、验证命令及结果、未确定副作用、剩余任务和继续条件。每个事实带来源与观察时间，易变状态在恢复后重新核对；不要把长日志原样复制，也不要只写一个“已完成大半”的摘要。上下文压缩后的第一步应验证最近产物，而非从零重复研究。

例如已完成某章不等于其 Markdown 已写入文件；文件存在不等于 JSON 能解析；测试通过不等于对应当前修订。交接应引用可重新读取的文件和结果记录，尚未提交的文本应明确标记为草稿。若执行者可能被中断，按可验收的小产物立即落盘，比把全部输出留到最后一次写入更可靠。

交接不应复制凭据、长期 token 或旧一次性审批票据。权限是恢复时宿主重新解析的事实，不能由摘要自报；来源于网页或子报告的建议仍需保留低可信标签。即使交接放进新窗口的高优先级消息，也不能让历史内容获得新的授权效力。

## 59.5 真实失败案例：记录可恢复，执行者不可恢复

Claude Code 官方 Team 文档明确列出 in-process teammates 不随 resume 或 rewind 恢复的限制。父会话恢复后，模型可能还记得队友名字并尝试发消息，但目标执行者已经不存在。正确恢复方式是核对持久产物和当前 roster，再创建新的明确任务，不能因摘要包含“队友正在处理”就继续等待一个不会返回的结果。

DeepSeek 固定 Goal 则分开持久 phase 与进程内 activation，正是为了避免类似混淆。一个旧 active 目标可能只说明尚未完成，不能说明已启动下一轮。再结合 workflow 的未知副作用窗口，恢复必须先确认外部动作状态，不能因为“最后一轮失败”就重复全部步骤。

上下文压缩还有另一种真实失败机制：摘要保留了目标却丢了“不得推送”的限制，下一窗口据旧惯例执行发布。防护应把硬约束纳入必需事实，在可信策略中继续落实；独立 context 实验能验证必需组超预算时报错，但不验证模型摘要准确，也不会修复调用方错误分组。

## 59.6 实验与可观察验收

1. 运行示例，确认 JSON 恢复后目标仍 active，但继续执行被 NOT_ARMED 阻止。
2. 使用旧 revision 尝试恢复，确认失败；达到轮数上限后状态 blocked，不出现第三次接纳。
3. 从示例项目运行 `node --test test/labs.test.mjs`，核对 workflow 的修订、步骤预算与未知副作用拒绝路径。
4. 给交接摘要删掉一项硬约束，用必需事实清单进行审阅，应判定不可交接，而不是让下一执行者猜测。
5. 模拟执行者退出，只依赖已落盘文件重新核验最近成果。没有文件或回执的事项应保持未完成或待协调。

完成标准是停止与恢复有明确权限、预算不会重置、产物可核对、硬约束不会随压缩丢失。实验不建立后台自治服务，不证明真实产品能恢复所有队友，也不允许借长期目标绕过新的外部操作审批。

## 59.7 官方来源与边界

DeepSeek Harness 基线固定为 `0.2.1-alpha.5`、提交 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`；产品实验特性按 2026-10-17 页面核验，不能推断未经文档确认的新能力。

- [固定 Goal 生命周期与 activation](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/goal.md)
- [固定 compaction 子系统](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/compaction.md)
- [固定 workflow 恢复相关边界](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/workflow.md)
- [Claude Code Agent Teams 恢复限制](https://code.claude.com/docs/en/agent-teams)

上一章：[第 58 章：脚本工作流、结果重放与失败语义](./58-durable-workflows)

下一章：[第 60 章：定时任务、Webhook 与 Channels](./60-schedules-webhooks)
