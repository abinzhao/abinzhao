---
title: 第 54 章：安全探针、对抗评测与降级处理
description: 把安全承诺转成可观察探针，区分策略拒绝、基础设施故障、未支持平台与主动降级。
date: '2026-10-23'
category: 智能体工程
tags: [安全验收, 故障注入]
series:
  order: 54
---

# 第 54 章：安全探针、对抗评测与降级处理

## 54.1 安全验收验证不变量

安全探针是针对一个明确边界发出的最小请求，观察允许资源可用、禁止资源不可达，以及安全组件失败时系统是否停止。它不是任意攻击脚本，也不是让模型口头宣称“我不会泄露”。不变量应直接描述执行结果，例如未授权上传调用计数为零、缺失审批服务时工具不执行、runner 不可用时不回退宿主。

对抗评测则考察攻击者可控制的输入如何影响模型及执行轨迹。模型没有提出危险动作与提出后被工具层拒绝是不同结果；只看最终答案容易把真实副作用漏掉。验收必须同时记录候选调用、准入决定、实际执行与外部回执，并明确探针在哪个平台、哪种 provider 和哪项策略下运行。

原教程的只读边界可进行参数与静态链接测试，但不提供恶意代码隔离。`labs/eval.mjs` 可以承载独立判定实验，不能以它的通过状态证明操作系统沙箱。下例不使用该模块的未知函数，而是直接给出可运行的 Node.js 22 决策与断言。

## 54.2 将故障分类放进状态机

| 观察结果 | 正确分类 | 正确后续 |
| --- | --- | --- |
| 禁止文件写入被阻止 | 策略拒绝 | 保留限制，报告范围 |
| runner 未启动 | 隔离基础设施故障 | 停止，不切回普通 shell |
| answerer 断开 | 审批不可用 | 拒绝本次请求 |
| 正常程序非零退出 | 任务失败 | 在相同边界内排查 |
| 平台没有承诺能力 | 不支持或未验证 | 阻塞强保证需求 |

同一个非零退出码不能独自完成分类。DeepSeek 固定 sandbox 契约使用后端特定的 denial signatures，并先判断结构化 runner-failure evidence；若普通程序恰好打印类似文字，也不能凭跨平台混合关键词认定沙箱启动失败。日志应保留分类依据，又避免把文件内容、环境值与敏感参数复制进诊断。

部署准入可以经历未探测、探测中、通过、部分实施、不可用和撤销。部分实施不是无条件通过；探测过程中进程崩溃也不是“没有发现问题”。若安全报告未知，应按预先声明的失败关闭策略处理，而不是让需要执行的模型自行决定跳过检查。

## 54.3 自包含的降级门禁实验

下面把后端事实、审批事实与动作需求分开。代码只有内存数据，不运行真实 shell、不创建文件，也没有调用网络。表中的值是确定性教学 fixtures，不是产品性能指标。

```js
import assert from 'node:assert/strict';

function gate({ backend, enforcement, needsApproval, outcome }) {
  if (backend !== 'ready') return 'INFRASTRUCTURE_BLOCKED';
  if (enforcement !== 'full') return 'ENFORCEMENT_BLOCKED';
  if (needsApproval && outcome !== 'allowed-once') return 'APPROVAL_BLOCKED';
  return 'ADMITTED';
}
const cases = [
  [{ backend: 'missing', enforcement: 'full' }, 'INFRASTRUCTURE_BLOCKED'],
  [{ backend: 'ready', enforcement: 'partial' }, 'ENFORCEMENT_BLOCKED'],
  [{ backend: 'ready', enforcement: 'full', needsApproval: true,
    outcome: 'unavailable' }, 'APPROVAL_BLOCKED'],
  [{ backend: 'ready', enforcement: 'full', needsApproval: true,
    outcome: 'cancelled' }, 'APPROVAL_BLOCKED'],
  [{ backend: 'ready', enforcement: 'full', needsApproval: true,
    outcome: 'allowed-once' }, 'ADMITTED'],
];
let executions = 0;
for (const [input, expected] of cases) {
  const actual = gate(input);
  assert.equal(actual, expected);
  if (actual === 'ADMITTED') executions += 1;
}
assert.equal(executions, 1);
console.log(JSON.stringify({ probes: cases.length, executions }));
```

实验的关键不是通过数，而是每个禁止分支的执行计数没有增加。若将 `partial` 当作通过，断言会直接失败；若把不可用 approval 当成允许，第三个用例会失败。使用合并后的“安全模式”字符串，很难清楚表达这两种错误分别属于哪一层。

生产探针还需要正向控制：允许的无害操作确实能完成，否则全部拒绝也可能制造表面安全。负向控制使用无秘密的标记文件和自控响应端点，避免以真实凭据和真实破坏行为测边界。探针运行身份必须与负载一致，管理员在宿主跑出的结果不能代替 Agent 进程里的结果。

## 54.4 真实失败案例：策略 hook 崩溃却继续调用

Claude Code hooks 官方文档说明，command hook 的普通错误、无效 JSON、缺失脚本与超时，在默认规则下可能成为非阻塞错误；`PreToolUse` 上的退出码 2 才是明确阻止动作的一种方式，具体事件仍需查表。将常规 Unix 退出码 1 当成硬门禁，可能导致 hook 已报错但工具仍进入普通权限流程。这是官方明示且可复现的失败语义，不应写成凭空编造的泄露事故。

修复要验证实际 hook 事件、返回协议及安装版本支持的失败处理，不能假设所有 hook 都可以阻止执行。后置 hook 运行时副作用已经发生，只能检查与反馈，不能撤销过去的命令。异步 hook 返回得更早时，也不能依赖之后打印的拒绝来保护已经启动的工具。

另一个失败来源是把沙箱依赖缺失当成普通任务环境问题，然后以 unsandboxed retry 继续。Claude Code 页面提供与不可用和无沙箱重试相关的设置，但默认行为不等于强制安全门禁；DeepSeek 固定 seam 则禁止 confined policy 静默透传。教程应逐产品记录这些差异，不能用某产品的 fail-closed 契约替另一产品背书。

## 54.5 从探针扩展到对抗场景

场景应覆盖不可信文件要求扩大读取、网页诱导外发、子报告伪造批准、路径变化、审批迟到、插件卸载和后台任务遗留。每个场景先定义攻击者控制的部分，再定义不允许改变的事实，例如工具集合与组织政策。真实模型实验要保存模型版本、提示来源和轨迹，重复实验也不能把一次失败解释成全部攻击都有效。

降级只应减少能力或改变交互方式：保留只读工具、停止外部调用、转可信人工审批，或者直接结束任务。若为恢复可用性而关闭隔离，必须明确这是新的授权与新的风险范围，不能在后台自动完成。安全组件不应被同一个待审模型改写或替换，否则探针通过也可能只是模型控制了裁判。

## 54.6 实验与可观察验收

1. 运行示例，确认五个探针只有一个允许执行，输出中的计数与断言一致。
2. 分别改变后端和 approval 条件，使两条拒绝路径独立触发，检查错误分类不混淆。
3. 在无敏感的授权实例中移除一个测试 hook 或关闭模拟 answerer，观察真实工具有没有启动，不能只看界面提示。
4. 对每个平台标记通过、部分实施、不可用或未测试，保留正向与负向控制结果。
5. 审查报告的表述：允许资源仍有风险，未测能力仍未知，没有证据的生产保证必须删除。

完成标准是既验证正常功能，又验证限制和组件失效路径；任何降级都不增加既有权限。内存实验只验证状态判定，未运行真实模型、操作系统攻击或多平台矩阵时，应明确保留这些限制。

## 54.7 当前安全回归矩阵

2026-10-23 对照 [Claude Code 2.1.309 变更记录](https://github.com/anthropics/claude-code/blob/v2.1.309/CHANGELOG.md)，回归应覆盖 macOS symlink 真实位置 denyWrite、Linux 后台命令跨 Session 结束后写拒绝仍在、split-pane teammate 继承 leader CLI 的 deny 和 `--tools`，以及 PowerShell hook 退出 2 真正阻止动作。它们是官方修复的具体路径，不应泛化成“升级后所有安全问题都解决”。

[当前 sandboxing](https://code.claude.com/docs/en/sandboxing) 区分 `failIfUnavailable` 与 `allowUnsandboxedCommands`，前者阻止依赖缺失时启动，后者关闭已运行命令的无沙箱重试；只测一个不覆盖另一个。操作练习在 cases 增加缺依赖、排除命令、hook 无效 JSON 和迟到 approval 四类故障，执行计数作为硬验收。正常控制需确认允许命令可用；异常控制需验证调用未启动且无降级扩大。排错记录平台、安装版本、命令是否开始和清理状态，真实 hook、内核和跨平台矩阵未运行时仍标未验证。

## 54.8 官方来源与边界

DeepSeek Harness `0.2.1-alpha.5` 固定提交 `1517a4dbca0a2789ff1d41ba439600f8547d23fa` 未经安全审计；2026-10-23 复核的 [rc.2 SAFETY](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/SAFETY.md) 仍保持同一预览边界，不提供生产安全认证。

- [固定 sandbox 错误与执行完整性](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/sandbox.md)
- [固定 approval 失败关闭](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/approval.md)
- [Claude Code hooks 退出与超时语义](https://code.claude.com/docs/en/hooks)
- [Claude Code sandboxing](https://code.claude.com/docs/en/sandboxing)
- [Node.js 权限模型安全限制](https://nodejs.org/docs/latest-v22.x/api/permissions.html)

上一章：[第 53 章：凭据隔离、插件与 MCP 供应链](./53-credentials-supply-chain)

下一章：[第 55 章：子 Agent 委派与上下文继承](./55-subagent-delegation)
