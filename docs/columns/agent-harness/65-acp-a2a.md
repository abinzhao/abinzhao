---
title: 第六十五章：ACP、A2A 与 Agent 互操作
description: 区分编辑器与智能体协议、跨智能体任务协议和工具协议，设计不会扩大权限的适配边界。
date: '2026-10-23'
category: 智能体工程
tags: [ACP, A2A]
series:
  order: 65
---

# 第六十五章：ACP、A2A 与 Agent 互操作

协议互通不能只看是否都使用 JSON。编辑器需要显示差异、请求用户授权和操作工作区；远程智能体协作需要发现能力、追踪长期任务并取回产物；工具调用则关心某个函数的输入和输出。三者的对象、生命周期和信任边界不同。把它们都命名为 agent API，会隐藏最关键的授权和恢复责任。

## 三种协议解决三种关系

Agent Client Protocol 的官方站点是 `agentclientprotocol.com`。ACP 标准化代码编辑器或 IDE 与 coding agent 的通信，意图类似 LSP 对编辑器和语言服务器的解耦。本地常见模式为编辑器启动子进程，通过 stdio 承载 JSON-RPC。官方 introduction 也讨论远程场景，并明确完整远程支持仍在推进中；不能把“协议适用于远程”写成所有远程部署契约已经稳定。

A2A 的官方站点是 `a2a-protocol.org`。它面向客户端应用或智能体与远程智能体服务的交互，公开 Agent Card、Task、Message、Part 和 Artifact 等概念。远端内部工具和记忆可以保持黑盒，客户端通过任务状态、消息和产物验收协作结果。A2A 中的 skill 是能力发现元数据，不能等同于第十九章的 `SKILL.md` 文件格式。

MCP 则是宿主连接能力服务器的协议，工具、资源和提示模板分别有契约。ACP 可以面向用户交互，A2A 可以承载委派，MCP 可以服务某个 Agent 的工具执行，它们可以组合，但不意味着互相替代。一个系统同时支持三者时，需要三份边界映射，不能简单把所有 RPC 方法透传。

| 关系 | 主要对象 | 关键验收 |
| --- | --- | --- |
| ACP：编辑器与 coding agent | 会话、内容更新、工作区操作 | 显示与授权正确，取消可收敛 |
| A2A：客户端与远程 Agent | 能力卡、任务、消息、产物 | 任务终态、结果可取回 |
| MCP：宿主与能力服务器 | 工具、资源、提示模板 | 输入输出与工具权限正确 |

以上比较是职责抽象，不是三个协议的完整 schema。版本、传输绑定和扩展能力需按当前规范核验。不要从一种传输推断所有版本都只支持该传输，也不要根据缩写相似把 Agent Client Protocol 与其他同名协议混为一谈。

## 当前协议与包版本不能混用

`2026-10-23` 核验 ACP 最新 Schema 发布为 `schema-v1.26.0`，TypeScript SDK npm `latest` 为 `2.0.1`。该 SDK 默认导出仍是 `dist/v1/stable`，固定 Schema 的 `schema/v1/meta.json` 线上版本是整数 `1`；`/unstable` 和 `/experimental/v2` 是不同接入面，不因包主版本 2 就自动成为默认稳定线。新接入先明确选哪条协议线，再协商非破坏性能力。

下面是 **ACP v1 的消息样本**，不是 MCP `2026-07-28` 的初始化方式。先 initialize，再创建会话；不支持返回版本就停止连接，不在字段丢失后继续使用危险能力。

```json
{
  "jsonrpc": "2.0",
  "id": 0,
  "method": "initialize",
  "params": {
    "protocolVersion": 1,
    "clientCapabilities": {
      "fs": { "readTextFile": true, "writeTextFile": false },
      "terminal": false
    },
    "clientInfo": { "name": "tutorial-reader", "version": "1.0.0" }
  }
}
```

`session/load` 需 `loadSession: true`，并在响应前通过 `session/update` 重放历史；`session/resume` 需 `sessionCapabilities.resume`，**不重放**历史；`session/close` 又有独立 capability，承担停止与释放。三者不能映射为同一个 resume 按钮。`session/cancel` 是通知，客户端须将未决权限请求回复为 cancelled，仍接收收尾更新，最终以原 `session/prompt` 的 `stopReason: 'cancelled'` 确认取消，而非等待通知回执。

A2A 固定稳定发布为 `v1.0.1`，HTTP 服务版本按 Major.Minor 使用 `A2A-Version: 1.0`，不是 `1.0.1`；缺失版本头按旧 `0.3` 解释，不应依赖隐式默认。1.0 的 JSON-RPC 名称是 `SendMessage`、`GetTask`、`CancelTask` 等，状态使用 ProtoJSON `TASK_STATE_*`，不能直接发送旧 `message/send` 与小写状态。

| A2A 1.0 状态 | 宿主映射 | 后续动作 |
| --- | --- | --- |
| `TASK_STATE_SUBMITTED` / `TASK_STATE_WORKING` | 受理 / 执行 | 观察或查询，不结算成功 |
| `TASK_STATE_INPUT_REQUIRED` / `TASK_STATE_AUTH_REQUIRED` | 中断等待 | 请求输入 / 认证，不重建任务 |
| `TASK_STATE_COMPLETED` | 协议完成 | 另验收产物与安全 |
| `TASK_STATE_FAILED` / `TASK_STATE_CANCELED` / `TASK_STATE_REJECTED` | 对应终态 | 不继续向该任务发送消息 |
| `TASK_STATE_UNSPECIFIED` 或未知值 | 未知 / 不支持 | 协调状态，不默认 completed |

### 规范内部冲突要保留

`v1.0.1` 的说明有两处需要实接入确认：概述写消息操作立即返回，但具体 `SendMessageConfiguration.return_immediately` 及 proto 定义默认 `false`，等待终态或 INPUT/AUTH_REQUIRED；本课程按具体字段设计等待，不把概述当默认异步保证。订阅 REST 总表写 POST，而 `a2a.proto` 的 `SubscribeToTask` HTTP binding 写 GET；不能将两者拼成一个声称实测的请求。固定生成契约、记录差异并验证服务 OpenAPI/一致性结果，再选绑定。

官方 `1.0.1` 变更优先使用 `application/a2a+json`。流订阅的第一帧应是当前 Task，后续才是状态或 Artifact 更新；这能避免“先 Get 再 Subscribe”之间的观察缺口，但不证明通知永久耐久。发送消息的 `messageId` 去重是 MAY，不是所有服务器的 exactly-once 承诺。

## 适配器的真实数据流

进入适配器的请求先来自已认证连接，再映射成宿主的任务意图；不是从对话文本里提取一个 owner 字段就完成认证。会话 ID、任务 ID 与上下文 ID 也不应直接互换。关联信息帮助定位，不授予资源访问权。每次产物读取仍应检查请求者是否有权读取该任务和该对象。

```text
来源协议 + 版本 + 连接身份
  -> schema 校验与能力协商
  -> 宿主意图：会话/任务/审批/产物
  -> 权限与预算决策
  -> 目标适配器
  -> 结果映射 + 终态分类
  -> 原协议回应
```

转换过程中最危险的是丢失语义。例如把等待用户输入映射成失败，会触发重复委派；把取消请求的确认映射成任务已取消，会隐藏仍在运行的外部动作；把产物 URL 映射成直接可读路径，会绕过附件服务权限。无法无损表达的字段应明确标记不支持，不能自动降级成成功。

## 自包含映射实验

下面是自定义的桥接策略，不使用 ACP 或 A2A 的真实请求格式。它只演示 capability 是必要条件而非充分授权，以及不支持的请求应该拒绝而非透传。输入全部是人工协议夹具，不代表远程 Agent 的实际行为。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
function bridge(peer, capabilities, intent) {
  if (intent.owner !== peer.subject) throw new Error('owner-mismatch');
  if (intent.kind === 'inspect') {
    if (!capabilities.includes('read')) throw new Error('unsupported');
    return { operation: 'read-local', task: intent.task };
  }
  if (intent.kind === 'publish') {
    if (!capabilities.includes('publish')) throw new Error('unsupported');
    if (!peer.mayPublish) throw new Error('permission-denied');
    return { operation: 'publish-approved', task: intent.task };
  }
  throw new Error('unsupported-intent');
}
const peer = { subject: 'alice', mayPublish: false };
const intent = { owner: 'alice', task: 't1', kind: 'inspect' };
assert.equal(bridge(peer, ['read'], intent).operation, 'read-local');
assert.throws(() => bridge(peer, ['read'], { ...intent, kind: 'publish' }), /unsupported/);
assert.throws(() => bridge(peer, ['publish'], { ...intent, kind: 'publish' }), /denied/);
assert.throws(() => bridge(peer, ['read'], { ...intent, owner: 'bob' }), /owner/);
console.log(JSON.stringify({ mapped: 1, rejected: 3, kind: 'protocol-fixture' }));
NODE
```

这里的 owner 只作为与可信身份比对的目标，不作为认证来源。实际授权需要宿主通过任务对象查出归属，而不是完全信任请求声明。远程 Agent Card 同样只能描述能力与认证要求，不能替远端作安全背书；发现过程还应限制 URL、重定向、私网访问和下载大小，防止服务发现变成 SSRF。

适配表还应包括错误和终态的反向映射。来源请求格式正确但目标能力不可用，是不支持而非模型执行失败；目标收到任务后崩溃，可能是失败或状态未知；目标请求补充输入，则应继续等待用户，而非自动猜答案。每个映射都要保留原始分类供诊断，但对外避免泄露远端堆栈和凭据。

版本协商需要固定协议版本与扩展名称，不能只比较服务器产品号。扩展携带的字段若决定审批或产物安全，旧客户端不能静默忽略。双方能力不同可以减少功能，但不能减少授权检查。未知状态进入明确的不支持或待协调路径，通常比默认完成更可控。

在互操作报告中，应分别说明传输一致性、业务语义一致性和权限一致性。一个调用能经过桥接到达远端，只证明运输可达；最终产物正确与取消真正收敛还需独立证据。多 Agent 任务尤其要记录每次委派归属，防止“跨系统”成为审计空白。

## 失败与验收

跨协议重试必须考虑副作用。消息送达但连接断开时，重复创建 Task 可能产生两份工作；适配器应使用上游支持的请求去重与权威查询，否则将状态标为待协调。任务取消后收到迟到 Artifact 时，客户端要按明确产品语义处理，不能让它悄悄恢复成成功。订阅结束也不能自动撤销已经发布的业务动作。

执行实验应得到一个合法映射和三种明确拒绝。真实互操作验收还需固定双方版本，测能力缺失、未知字段、等待输入、取消竞争、断线重连和产物访问拒绝。合同应规定每个状态的映射及不能表达的状态；同时检查资源清理和权限未扩大，不能只验证双方都返回 JSON。

基础教学项目未实现 ACP、A2A 或真实 MCP server，`labs/` 也没有增加远程认证。自包含示意只能说明适配原则，不能称为协议一致性测试。生产接入需运行官方 schema 或相应一致性套件，并在受控端点上验证真实任务与最终产物。

练习：为 ACP load/resume/cancel 和 A2A INPUT_REQUIRED/AUTH_REQUIRED 各写一个时序验收。让旧 A2A 0.3 状态进入 1.0 解析器、让 ACP 缺少 resume capability，断言不会自动续跑。为订阅 GET/POST 冲突登记真实服务验证结果；没有结果时保留“未确认”。

## 官方来源

- [ACP introduction](https://agentclientprotocol.com/overview/introduction)：编辑器、Agent 与本地和远程边界。
- [ACP Schema v1.26.0](https://github.com/agentclientprotocol/agent-client-protocol/releases/tag/schema-v1.26.0)、[固定 v1 初始化](https://github.com/agentclientprotocol/agent-client-protocol/blob/e2d83349bc9e28a4059ea3acefa1c91c966f74e2/docs/protocol/v1/initialization.mdx)、[会话](https://github.com/agentclientprotocol/agent-client-protocol/blob/e2d83349bc9e28a4059ea3acefa1c91c966f74e2/docs/protocol/v1/session-setup.mdx)与[取消](https://github.com/agentclientprotocol/agent-client-protocol/blob/e2d83349bc9e28a4059ea3acefa1c91c966f74e2/docs/protocol/v1/prompt-turn.mdx)：本章版本和行为核验于 `2026-10-23`。
- [ACP SDK 2.0.1 元数据](https://registry.npmjs.org/@agentclientprotocol/sdk/2.0.1)：默认稳定与 experimental 导出的区分。
- [A2A 1.0.1 发布](https://github.com/a2aproject/A2A/releases/tag/v1.0.1)、[固定规范](https://github.com/a2aproject/A2A/blob/v1.0.1/docs/specification.md)与[固定 proto](https://github.com/a2aproject/A2A/blob/v1.0.1/specification/a2a.proto)：版本头、状态、绑定及内部冲突，核验于 `2026-10-23`。
- [A2A key concepts](https://a2a-protocol.org/latest/topics/key-concepts/)：Agent Card、Task 与 Artifact；`latest` 是移动文档入口。
- [A2A specification](https://a2a-protocol.org/latest/specification/)：集成时需固定版本与绑定，不将本章夹具冒充规范。
- [MCP 官方规范](https://modelcontextprotocol.io/specification/)：工具侧协议阅读入口。

上一章：[第六十四章：OpenCode、SDK、References 与 Policies](./64-opencode-server.md)

下一章：[第六十六章：Web、IDE、桌面与附件交付](./66-clients-deliverables.md)
