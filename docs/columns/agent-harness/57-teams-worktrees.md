---
title: 第 57 章：Teams、任务 DAG 与工作树隔离
description: 用无环依赖、任务修订和产物所有权组织协作，区分工作树冲突隔离与运行时安全隔离。
date: '2026-10-17'
category: 智能体工程
tags: [Agent Harness, DAG, Git Worktree]
series:
  order: 57
---

# 第 57 章：Teams、任务 DAG 与工作树隔离

## 57.1 Team 增加的是协作协议

Team 在多个 Agent 之间提供成员、消息和共享任务板。它不是把一次提示复制给多份模型那么简单：必须决定谁可创建成员、谁可认领任务、如何更新状态、哪些结果解除依赖，以及失败后由谁继续协调。任务图用 DAG 表示有向无环依赖，只有依赖完成的任务才能开始；如果存在环或不存在的依赖，应该在执行前拒绝。

并行并非总能提速。同文件编辑、高密度依赖和频繁讨论会增加协调成本。合理拆分应沿着可独立验收的产物，而不是机械地按“前端、后端、测试”角色复制完整目标。每个任务有具体文件范围、完成标准与结果提交方式，协调者负责集成与最终验证，不能把全部成员自报 completed 的数量当成交付证据。

原教程没有 Team。独立 `labs/workflow.mjs` 已实现 DAG 校验、步骤预算、修订和检查点恢复，但任务函数仍是本地单进程实验，不请求模型、不启动真实队友。`npm run labs` 可以观察这些机制，下面的例子则完全自包含，不依赖实验模块的导出函数。

## 57.2 任务状态与写入所有权

DeepSeek 固定 Team 使用完整 task snapshot 和逐次递增的 revision，更新通过 compare-and-set 避免过时观察覆盖新状态。pending 是未开始或已释放，in_progress 有 owner，completed 满足阻塞条件，deleted 是保留的墓碑。成员是否 active、当前是否 running 与任务状态是三个不同维度，不能合并成一个完成标记。

| 机制 | 解决什么 | 不能解决什么 |
| --- | --- | --- |
| DAG 依赖 | 控制先后关系 | 证明任务输出正确 |
| revision 比较 | 拒绝过时更新 | 自动合并文件冲突 |
| writeScopes | 提示范围重叠 | 强制文件锁或系统访问控制 |
| worktree | 分开检出目录与索引 | 分开账号、凭据和进程 |

固定 DeepSeek 的 writeScopes 是建议性规范化路径前缀，不是锁。即使任务板成功认领，同一工作区中另一工具仍可能编辑相同文件。要么用明确文件所有权避免同时改动，要么在独立 worktree 中产出 patch，由协调者串行集成；如果安全目标要求互相不能读写，还需要另外的运行时身份和沙箱。

产物归属还要覆盖共享文件。例如两个任务分别改组件和测试，却都要更新同一个导出清单，这个清单就应交给协调者，或者建立一个明确的后置集成任务。读取也可能依赖未提交变化，因此应记录输入基线而不只记录写入路径。队友声明完成后，协调者核对实际文件列表、差异和测试结果，再解除后续依赖；不要因为任务板没有范围重叠警告，就推断不存在隐式共享状态或集成冲突。

## 57.3 自包含的 DAG 与修订实验

以下 Node.js 22 示例不启动 Git，只验证依赖图和任务版本。DFS 检查不存在的依赖与循环，修订比较展示两个观察者竞争认领同一任务时如何拒绝旧观察。

```js
import assert from 'node:assert/strict';

function validate(tasks) {
  const byId = new Map(tasks.map(task => [task.id, task]));
  if (byId.size !== tasks.length) throw new Error('DUPLICATE_TASK');
  const active = new Set();
  const done = new Set();
  function visit(id) {
    if (!byId.has(id)) throw new Error('MISSING_DEPENDENCY');
    if (active.has(id)) throw new Error('CYCLE');
    if (done.has(id)) return;
    active.add(id);
    for (const dependency of byId.get(id).deps) visit(dependency);
    active.delete(id);
    done.add(id);
  }
  for (const task of tasks) visit(task.id);
  return [...done];
}
const tasks = [{ id: 'inspect', deps: [] },
  { id: 'patch', deps: ['inspect'] }, { id: 'verify', deps: ['patch'] }];
assert.deepEqual(validate(tasks), ['inspect', 'patch', 'verify']);
assert.throws(() => validate([{ id: 'a', deps: ['a'] }]), /CYCLE/);
assert.throws(() => validate([{ id: 'a', deps: ['missing'] }]), /MISSING/);
let task = { id: 'inspect', revision: 1, owner: null };
function claim(expected, owner) {
  if (task.revision !== expected || task.owner !== null) throw new Error('CONFLICT');
  task = { ...task, revision: task.revision + 1, owner };
}
claim(1, 'worker-a');
assert.throws(() => claim(1, 'worker-b'), /CONFLICT/);
assert.equal(task.owner, 'worker-a');
console.log(JSON.stringify({ order: validate(tasks), task }));
```

这里的赋值发生在同一线程，不能证明跨进程 compare-and-set；持久实现应在可信事务或受控锁中完成读、判定和写。认领锁也不等于业务代码只能执行一次：任务开始后进程崩溃，另一个执行者恢复时还要判断原动作有没有副作用。DAG 决定允许何时开始，幂等与未知结果由下一章处理。

## 57.4 真实失败案例：worktree 并没有复制脏文件

Git 官方 worktree 文档说明多个工作树连接同一仓库，共享多数 refs 和仓库配置，分别持有 HEAD 与 index 等数据。DeepSeek 固定 worktree 创建会固定本地 revision，不自动 fetch，也不会复制源检出的 staged、unstaged、untracked 或 ignored 文件。因此一个队友在新树中运行测试，可能看到旧代码并缺少另一个队友刚生成的未跟踪产物。

可复现的错误流程是协调者先在源目录修改文件，随后按 HEAD 创建新树，再要求队友验证“当前修改”。队友确实完成测试，却没有测试那份修改。修复应把准确 commit 或明确 patch 作为输入，记录基线和产物摘要，再进行验证；不能靠一句“使用同一个项目”保证内容一致。

另一个风险是把 worktree 当成凭据和进程隔离。不同检出目录仍可能继承同一 HOME、环境、凭据助手、daemon socket 和本机账号，进程也没有自动进入独立命名空间。即使采用每树配置，安全边界仍需显式实施。工作树创建失败或取消可能留下部分目录和分支，不能无条件删除未核对的路径作为清理。

## 57.5 产品 Team 的实验边界

Claude Code 官方 Team 文档将其标为实验且默认关闭，列出会话恢复、状态协调和退出等限制。DeepSeek 固定 Team 与 worktree 也为 opt-in 实验组合，默认 composition 不意味着自动启用。Codex multi-agent 是另一种产品编排，不应因为也能并行就宣称它提供同样任务板、消息耐久性和 worktree 保证。

固定 DeepSeek Team 新消息直接进入 inbox，没有通用 outbox 重发去重。任务 DAG 与 roster 持久状态不能替消息处理提供 exactly-once。来源不明的新产品功能只能写成需核对安装版本的能力，不能把实验选项包装成稳定跨产品接口。

## 57.6 实验与可观察验收

1. 运行示例，确认正常顺序、循环拒绝、缺失依赖拒绝和第二次认领冲突分别通过。
2. 修改任务依赖形成两节点环，确认启动前失败；再增加重复 ID，确认不会静默覆盖任务。
3. 从 `agent-harness/` 运行 `npm run labs` 与 `node --test test/labs.test.mjs`，按 README 观察检查点恢复和任务修订拒绝。
4. 使用授权的独立 Git 测试仓库比对 worktree 的基线、未提交文件与共享配置；本章不在现有项目中创建或删除工作树。
5. 集成时核对每个产物对应任务与文件范围，最终运行实际组合结果的检查，不只收集各队友的成功消息。

完成标准是任务图合法、版本更新可追溯、同文件改动有明确所有权，验证确实对应目标代码。内存 DAG、单进程实验与 worktree 均不构成凭据或进程隔离，不支持未经协调的外部副作用只执行一次。

## 57.7 官方来源与边界

DeepSeek Harness 固定基线 `0.2.1-alpha.5`、提交 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`；相关功能为实验性，Git 与产品页面核验于 2026-10-17。

- [固定 Team 状态与 DAG](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/agent-team.md)
- [固定 worktree 创建边界](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/worktrees.md)
- [Git worktree](https://git-scm.com/docs/git-worktree)
- [Claude Code 实验性 Agent Teams](https://code.claude.com/docs/en/agent-teams)
- [Codex 实验性 multi-agents](https://developers.openai.com/codex/multi-agent/)

上一章：[第 56 章：子 Agent 消息、等待与取消](./56-subagent-control)

下一章：[第 58 章：脚本工作流、结果重放与失败语义](./58-durable-workflows)
