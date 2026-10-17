---
title: 第 52 章：权限策略、审批与 Auto-review
description: 将执行能力、资源沙箱与一次性审批正交建模，比较不同产品的策略含义和自动审查边界。
date: '2026-10-17'
category: 智能体工程
tags: [Agent Harness, 权限策略, 审批]
series:
  order: 52
---

# 第 52 章：权限策略、审批与 Auto-review

## 52.1 审批不是沙箱开关

权限策略决定哪些动作直接允许、拒绝或需要决策；approval 是对指定动作作出的同意；sandbox 是执行期间的系统约束。三个概念可以组合，但不能合成一个“安全等级”。关闭交互提示不表示退出沙箱，批准一次越界动作也不表示永久扩大整个会话权限。只有将这些变化分别记录，审计才能回答一次操作为何获得执行资格。

DeepSeek Harness 固定版本有独立的 `sandbox/mode` 和 `approval/policy`，permission preset 只是把它们组织成界面选项。其 `ask` 交给 answerer 链，无 answerer 时为 `unavailable`；`never` 表示从不询问，所有审批请求都返回 `rejected`，不是“自动批准”。因此 `danger-full-access + never` 的实际含义是无文件 confinement 且审批请求被拒绝，不能按其他产品的同名印象理解。

| 配置维度 | 决定什么 | 不决定什么 |
| --- | --- | --- |
| 工具权限 | 哪类调用可进入执行管线 | 系统调用是否被隔离 |
| 文件 sandbox | 哪些文件效果可发生 | 用户是否同意外部写操作 |
| 审批策略 | 如何回答需要授权的请求 | 模型回答是否正确 |
| Auto-review | 对候选动作自动作出审查 | 不可信代码获得安全保证 |

## 52.2 授权必须绑定不可变动作

安全的一次性授权至少绑定执行者、会话、工具、目标资源、完整参数、策略版本与有效期。仅保存“允许 Bash”会把一个精确批准扩大成命令家族；批准之后又允许模型改变参数，会让用户看到的动作与真实执行脱节。动作快照应在审批前冻结，参数发生变化就产生新请求，不能沿用旧决定。

状态推进应是“请求校验、形成快照、判断策略、等待决定、验证决定新鲜度、消耗一次性资格、在沙箱中执行、记录结果”。拒绝、取消、答复不可用和格式错误都不能进入执行分支。等待期间若会话结束或策略改变，旧答复必须失效；迟到的允许结果不能复活已经撤销的动作。

下面是独立 Node.js 22 实验，只接受声明过的动作字段，并用固定数组绑定 session、tool、target、revision、argv 和 effects。它不调用 shell，不依赖 `labs/policies.mjs`，也不是通用 JSON 规范化方案。扩展工具参数时必须同步扩展这个契约，未知字段拒绝；不能省略有副作用的参数再复用旧批准。

```js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const consumed = new Set();
function fingerprint(action) {
  const fields = ['session', 'tool', 'target', 'revision', 'argv', 'effects'];
  if (Object.keys(action).some(key => !fields.includes(key))) throw new Error('UNKNOWN_FIELD');
  if (!['session', 'tool', 'target'].every(key => typeof action[key] === 'string') ||
      !Number.isSafeInteger(action.revision) ||
      !Array.isArray(action.argv) || !action.argv.every(value => typeof value === 'string') ||
      !Array.isArray(action.effects) || !action.effects.every(value => typeof value === 'string')) {
    throw new Error('INVALID_ACTION');
  }
  const tuple = [action.session, action.tool, action.target, action.revision,
    action.argv, [...new Set(action.effects)].sort()];
  return createHash('sha256').update(JSON.stringify(tuple)).digest('hex');
}
function admit(action, grant, now) {
  if (!grant || grant.outcome !== 'allowed-once') return 'DENIED';
  if (grant.expiresAt <= now) return 'EXPIRED';
  if (grant.digest !== fingerprint(action)) return 'ACTION_CHANGED';
  if (consumed.has(grant.id)) return 'ALREADY_USED';
  consumed.add(grant.id);
  return 'ADMITTED';
}
const action = { session: 'lab', tool: 'publish', target: 'draft-7', revision: 1,
  argv: ['publish', 'draft-7'], effects: ['network', 'write'] };
const grant = { id: 'grant-1', outcome: 'allowed-once',
  digest: fingerprint(action), expiresAt: 2000 };
assert.equal(admit({ ...action, target: 'draft-8' }, grant, 1000), 'ACTION_CHANGED');
assert.equal(admit(action, { ...grant, expiresAt: 900 }, 1000), 'EXPIRED');
assert.equal(admit(action, null, 1000), 'DENIED');
assert.equal(admit(action, grant, 1000), 'ADMITTED');
assert.equal(admit(action, grant, 1000), 'ALREADY_USED');
assert.equal(admit({ ...action, argv: ['publish', 'draft-8'] },
  { ...grant, id: 'grant-2' }, 1000), 'ACTION_CHANGED');
assert.throws(() => fingerprint({ ...action, env: { MODE: 'changed' } }), /UNKNOWN_FIELD/);
console.log('approval binding checks passed');
```

`consumed` 只在单进程内存中存在，重新启动后会丢失；它也没有处理多实例并发。生产中的资格消耗需要可信存储和并发控制，但即使资格消耗原子化，也不能自动保证外部副作用只发生一次。审批记录证明许可，外部回执证明结果，两种事实应分开保存。

## 52.3 产品词汇不能直接互译

Codex 官方指南将 `--sandbox` 与 `--ask-for-approval` 分列，`never` 可与各 sandbox 模式组合，表示不交互询问。这不等于 `danger-full-access`。其实验性 multi-agent 文档还说明子 Agent 在非交互审批下运行，需要新批准的动作会失败并返回父流程。把“无人值守”解释成“可自行提权”会破坏委派边界。

OpenCode 用 `permission` 的 `allow`、`ask`、`deny` 管理工具，细粒度规则采用最后匹配优先，Agent 配置可覆盖全局配置。Claude Code 文档采用 deny、ask、allow 的评估顺序，并提供自动分类审查。不同产品的规则顺序与继承语义不同，不能复制一个表面相似的 JSON 后宣称等价；工具规则也不自动形成内核隔离。

固定 DeepSeek permission preset 的 Auto 选项由活跃集成注册，当前会话限定，不是未来会话默认项。其 bundle 使用 `danger-full-access + ask`，额外执行约束归 Auto-review 集成所有。因此 Auto 的名称不应解读为“在强沙箱内自动批准”。管理员需要核对实际集成是否存在、何时卸载、哪些调用被审查，以及子任务的策略是否被重新落实。

## 52.4 真实失败案例：审批服务消失后继续执行

固定 DeepSeek approval 契约专门处理缺失、抛错或不符合词汇的 answerer，统一返回不可用并要求调用者拒绝。可复现的错误实现是把 `undefined` 当作没有反对意见，或者使用“不是 rejected 就允许”的条件。UI 断线、插件卸载和异常都会被这种条件转成无意授权，模型甚至无需构造恶意内容。

更隐蔽的失败是超时后后台 answerer 返回允许，执行者已经取消却再次启动工具。正确服务应让取消立即结算，并丢弃迟到答复。用户审批动作的事实与一次 tool call 绑定，不能靠“之前看起来点过同意”补写审计，更不能在没有成功记录审计的情况下返回一个声称已授权的结果。

自动审查也可能错误判断或依赖服务不可用。降级策略必须由可信宿主预先规定：停止、转人工或缩减能力，不能由待审查的模型自己决定改为全放行。分类器可以减少交互成本，不应拥有修改强制隔离和凭据边界的隐式权限。

## 52.5 实验与可观察验收

1. 运行示例，确认目标变化、过期、无资格和重复使用都有独立拒绝码。
2. 改变动作的会话或策略版本，旧 grant 应失效；只修改显示文案不应悄悄改动真实目标。
3. 在实际宿主的无副作用工具中注入 answerer 缺失、抛错、迟到和取消，确认执行计数保持零。
4. 分别记录沙箱模式与审批结果。测试“禁止提问但保持只读”不能变成“无沙箱运行”。
5. 对自动审查保留输入摘要、策略版本、决定来源和最终调用身份；不要在日志中复制敏感参数值。

完成标准是只有新鲜且匹配的单次资格能放行动作，其余分支失败关闭。示例仅验证内存决策，不实现真实审批 UI、组织政策或持久授权服务；实验通过不能替代具体产品的权限集成测试。

## 52.6 官方来源与边界

DeepSeek Harness 基线固定为 `0.2.1-alpha.5`、提交 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`；产品文档核验于 2026-10-17，实验特性与安装版本需另行确认。

- [固定 approval 契约](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/approval.md)
- [固定 permission presets 与 Auto](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/permission-presets.md)
- [Claude Code permissions](https://code.claude.com/docs/en/permissions)
- [Codex sandbox 与 approvals](https://developers.openai.com/codex/security/)
- [OpenCode permissions](https://opencode.ai/docs/permissions/)

上一章：[第 51 章：网络、进程、容器与虚拟机隔离](./51-network-process-isolation)

下一章：[第 53 章：凭据隔离、插件与 MCP 供应链](./53-credentials-supply-chain)
