---
title: 第六十二章：Claude Code 与 Agent SDK 机制
description: 以官方公开契约解释内置工具循环、配置来源、权限与会话，避免把闭源产品描述成源码审计。
date: '2026-10-23'
category: 智能体工程
tags: [Claude Agent SDK, 权限]
series:
  order: 62
---

# 第六十二章：Claude Code 与 Agent SDK 机制

应用需要的往往不是一次聊天，而是能读取资料、调用工具并交付结果的运行过程。Claude Agent SDK 的定位是让开发者编程使用 Claude Code 所提供的智能体能力。`2026-10-23` npm 核验：CLI `stable` 为 `2.1.308`，`latest/next` 为 `2.1.309`，Agent SDK `latest/next` 为 `0.3.309`。这些是不同包和渠道；核心实现闭源，发布记录、官方文档和公开类型可以审查，但不能据此声称完成了内部循环的源码审计。

## 概念与能力边界

Anthropic 官方 overview 将 Agent SDK 与普通 Client SDK 分开：后者提供模型 API 调用，应用需要自行执行工具循环；前者提供内置工具执行、agent loop 和上下文管理。官方列出的能力包括读写文件、Shell、Hooks、子 Agent、MCP、权限和会话。能力存在不等于默认授予权限，也不意味着外层应用无需审查每次动作。

还要把三个版本分别记录：Claude Code 产品版本、Agent SDK 包版本和官方文档核验日期。它们不应写成同一个数字。本章读取了当前官方 TypeScript API，并从 npm 发布包读取 `0.3.309` 的 `sdk.d.ts`，核对 `query`、`Options`、`Query` 和结果联合类型；未安装包或编译厂商样例，不宣称完成端到端集成。SDK 包的 Node 要求为 `>=18`，CLI 包为 `>=22`，不能用 SDK 的最低要求证明外置 CLI 能启动。

文件配置也是一个信任入口。overview 明确说明，若使用文件系统配置能力，需要显式选择配置来源；TypeScript 名称为 `settingSources`，项目来源示例为 `['project']`。这会引入项目的技能、命令和指令材料，所以先读项目规则、再确认来源与权限。不能把陌生仓库中的配置当作宿主授权，更不能因为允许读取就自动允许执行它引用的脚本。

## 接入时的真实控制关系

SDK 负责产生并管理运行过程，业务宿主负责谁能创建运行、怎样显示审批、哪些数据能离开租户以及结果如何验收。内置工具返回成功只证明动作结束，不能证明产物满足需求；最终文本也不能作为修改已完成的唯一证据。外层应核查实际文件、Diff 和测试结果，必要时拒绝发布。

```text
业务用户 -> 宿主授权与工作目录选择
                 -> SDK 运行与工具循环
                 -> 权限/用户输入等待
                 -> 工具结果与运行消息
                 -> 终态分类
                 -> 产物检查 -> 业务交付
```

审批、工具限制和强隔离解决不同问题。`tools` 选择工具集合，`allowedTools` 是自动批准名单，不会把未列出的工具全部禁用；`disallowedTools` 才是优先拒绝规则。权限回调或模式表达是否同意动作，操作系统沙箱限制进程真正能碰到的资源。三者不能相互替代。任务等待审批时，应检查权限事件是否被客户端正确展示，以及授权是否绑定准确的目录和参数。

认证同样属于宿主边界。官方 overview 推荐平台 API key，并说明支持 Bedrock、Vertex AI 与 Azure AI Foundry 等相应认证路径。它也对第三方产品提供 claude.ai 登录作出限制。接入前应阅读当前服务条款，不能擅自借用用户订阅登录充当服务器凭据；Token 不进入示例、日志、模型上下文或产物。

## query、消息与控制面

| 官方接口 | 实际语义 | 常见误用 |
| --- | --- | --- |
| `query({ prompt, options })` | 返回扩展的异步消息生成器 `Query` | 把它当一次普通模型 HTTP 返回值 |
| `tools` / `allowedTools` / `disallowedTools` | 工具集合 / 自动批准 / 优先拒绝 | 把自动批准名单当唯一可用工具 |
| `settingSources` | 显式选择 user、project、local 配置来源 | 以为 SDK 默认加载全部项目规则 |
| `systemPrompt` | 自定义内容或 `claude_code` preset | 以为省略就是完整 Code 系统提示 |
| `resume` / `forkSession` | 恢复已有会话 / 恢复时创建新身份 | 把 Fork 当文件与外部操作回滚 |
| `abortController` / `Query.interrupt()` | 外部取消控制 / 中断当前查询 | 发出取消就声称全部资源已停止 |

以下接入样例使用 SDK `0.3.309` 类型中的字段，需在匹配 SDK 的隔离项目中编译、认证和运行。本教程没有执行它。示例限制为 Read、Glob、Grep 三个工具，不开放 Bash 或编辑；这仍需要目标平台的文件访问边界，不能把工具选择当成目录沙箱。

```ts
import { query } from '@anthropic-ai/claude-agent-sdk';

const abortController = new AbortController();
const timer = setTimeout(() => abortController.abort(), 60_000);
let confirmed = false;
try {
  for await (const message of query({
    prompt: '读取 README.md，引用原文解释项目边界。',
    options: {
      cwd: process.cwd(),
      tools: ['Read', 'Glob', 'Grep'],
      allowedTools: ['Read', 'Glob', 'Grep'],
      settingSources: [],
      maxTurns: 4,
      abortController,
    },
  })) {
    if (message.type === 'result') {
      if (message.subtype !== 'success' || message.is_error) {
        throw new Error('Agent turn did not succeed');
      }
      confirmed = true;
    }
    // 不将完整消息或文件内容自动写入公共日志。
  }
  if (!confirmed) throw new Error('No confirmed turn result');
} finally {
  clearTimeout(timer);
}
```

样例刻意不打印“成功”。流结束、预算停止、执行错误和合法终态必须从实际结果消息分别判定，随后再核查引用与产物。默认 `settingSources: []` 不加载文件配置；需要 `CLAUDE.md` 与项目技能时，应明确启用 `project` 并核对项目材料。默认系统提示与 `claude_code` preset 也不同，选择哪个应由任务决定，不能悄悄复制 CLI 行为假设。

进程内 MCP 服务可通过 `tool()` 与 `createSdkMcpServer()` 定义，其输入 Schema 使用 Zod，handler 返回 MCP `CallToolResult`。这是一条额外集成路径，本下载包没有安装 Zod 或 SDK。工具 annotations 属于行为提示，不能据 `readOnlyHint` 或 `idempotentHint` 自动授权。需要真实工具时，应先检验 Schema、权限回调、取消与错误结果，再交给模型选择。

## 当前类型里的结果与兼容陷阱

`SDKResultMessage` 每 turn 一条，但其后仍可能有后台任务或提示等 informational 消息。`subtype: 'success'` 也可能伴随 `is_error: true`，因此上例同时检查两者；`error_max_turns`、`error_max_budget_usd`、执行错误和结构化输出重试耗尽不能算业务成功。取消或断线若没有确认结果，只能报告未完成，不得用已显示的文字补造终态。

`Options.maxThinkingTokens` 与 `Query.setMaxThinkingTokens()` 已标为 deprecated，新接入使用 `thinking`，例如 `{ type: 'adaptive' }` 或模型支持的 `{ type: 'enabled', budgetTokens: N }`，不能给所有模型强套同一预算。旧字段仍作为兼容入口讨论，不作为新方案推荐。`persistSession: false` 会禁用磁盘会话持久化，不能再承诺以后按 session ID 恢复。

`total_cost_usd` 是累计估算，不是账单；流式输入会话应读取最新累计值，不能逐条 result 求和。恢复或 Fork 还可能带入已保存历史累计，`/clear` 会改变生命周期。排查成本差异时同时记录 query、会话恢复和清除边界，不能把历史费用算成新 turn 的增量。

## 自包含生命周期实验

下面只模拟宿主消费事件的责任。事件名称是本章自定义格式，不是 Claude SDK 的实际消息类型。模型输出的文本只能进入显示区，不能凭一句 completed 就把工具中的等待审批状态直接变成成功。代码不安装依赖，也不发起模型请求。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
function reduce(state, event) {
  if (state.terminal) return state;
  if (event.kind === 'approval-needed') {
    return { ...state, phase: 'waiting', pending: event.actionId };
  }
  if (event.kind === 'approval-resolved') {
    if (event.actionId !== state.pending) throw new Error('stale-approval');
    return { ...state, phase: event.allowed ? 'running' : 'denied', pending: null };
  }
  if (event.kind === 'text') return { ...state, text: state.text + event.text };
  if (event.kind === 'result') {
    if (state.pending) throw new Error('unresolved-approval');
    return { ...state, terminal: true, phase: event.ok ? 'completed' : 'failed' };
  }
  throw new Error('unknown-event');
}
let state = { phase: 'running', pending: null, text: '', terminal: false };
state = reduce(state, { kind: 'approval-needed', actionId: 'read-1' });
assert.throws(() => reduce(state, { kind: 'result', ok: true }), /unresolved/);
assert.throws(() => reduce(state, {
  kind: 'approval-resolved', actionId: 'write-2', allowed: true,
}), /stale/);
state = reduce(state, { kind: 'approval-resolved', actionId: 'read-1', allowed: true });
state = reduce(state, { kind: 'text', text: 'fixture reviewed' });
state = reduce(state, { kind: 'result', ok: true });
assert.equal(state.phase, 'completed');
assert.equal(reduce(state, { kind: 'text', text: 'late' }).text, state.text);
console.log(JSON.stringify(state));
NODE
```

示意中的拒绝状态不是完整生产状态机。实际系统应明确拒绝一个动作后是继续寻找安全路径，还是结束整个任务；不能把两者混淆。SDK 若允许继续，宿主要跟踪当前动作和运行级状态，避免后续合法结果被之前的拒绝误判，也避免拒绝后直接把任务标为成功。

## 失败与恢复

一类故障是应用收到文本后提前关闭异步迭代，导致审批、工具结果或终态没有被消费。显示回答应与结算运行分离，并在释放资源前确认终态或主动中断。另一类是恢复了会话，却换了工作目录和配置来源，旧历史中的文件引用已失效。恢复必须记录目录、权限、配置修订和产物基线，不能只保留 session ID。

Hooks 与插件也会失败。超时、输出格式错误和异常都应有可观测记录；不能静默忽略本来承担安全职责的 Hook，再继续危险动作。MCP 凭据属于连接侧配置，不应作为普通参数传给模型。子 Agent 的工具可用性、消息传递与工作目录需要另行验收，不能假设天然拥有父任务全部权限。

配置来源与上下文来源也不能混为一谈。宿主主动加载的项目规则具有预先定义的角色，工具读到的同名文件仍然只是材料；不应因为名字相同就变成系统指令。运行记录应保留实际加载的配置修订与目录，便于排查同一任务在不同机器上的差异。权限设置变化后恢复旧会话，还应重新检查待执行动作，而不是沿用旧授权。

评审公开文档时应把“官方声明的能力”“本地验证的接口”和“尚未运行的行为”分开列出。产品发布日志可以证明版本变化，却不能证明每项新功能都已在业务集成中生效。接入报告必须附真实运行证据，不能用本章生命周期示意替代。

## 可观察验收

执行生命周期实验，应看到错误审批被拒绝、未决审批阻止成功结算、终态后的迟到文本不再改变显示结果。执行 `npm run labs` 可进一步观察一次性审批票据绑定，但该实验不执行任何 Claude 工具。把两者结果明确标为机制测试，不得转换成模型效果数据。

真实 SDK 验收应在隔离的测试目录完成，固定依赖版本并以安装后的类型定义核对参数。用只读任务检查工具选择与路径引用，再测用户拒绝、取消、Hook 故障和恢复。授权读取之外的写入、Shell 与网络动作必须分别批准。本章未进行这些联网实验，不能据此保证 SDK 端到端可用或特定模型质量。

练习：为结果消费器加入 `success + is_error: true`、预算停止、缺少 result 和多条累计费用四组输入。再在独立接入环境检查 `persistSession: false` 的恢复失败；不要把自定义 reducer 测试当作真实 SDK 集成通过。

## 官方来源

- [Agent SDK overview](https://platform.claude.com/docs/en/agent-sdk/overview)：能力与配置来源说明；当前接入面核验日期 `2026-10-23`。
- [TypeScript API reference](https://platform.claude.com/docs/en/agent-sdk/typescript)：集成时必须对照实际依赖类型；本章未声称核验全部签名。
- [SDK 0.3.309 发布元数据](https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk/0.3.309)与[CLI 渠道元数据](https://registry.npmjs.org/@anthropic-ai/claude-code)：版本、Node 前提和发布包 `sdk.d.ts` 的证据，核验于 `2026-10-23`。
- [Agent SDK permissions](https://platform.claude.com/docs/en/agent-sdk/permissions)：权限设计的官方阅读入口。
- [Claude Code 公开仓库](https://github.com/anthropics/claude-code)：产品发布证据，不代表核心源码公开。

上一章：[第六十一章：Harness SDK 与可编程宿主](./61-harness-sdk.md)

下一章：[第六十三章：Codex Rust、SDK 与 App Server](./63-codex-app-server.md)
