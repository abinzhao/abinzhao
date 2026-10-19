---
title: 第六十三章：Codex Rust、SDK 与 App Server
description: 从固定源码区分 Rust 运行时、TypeScript SDK 和 App Server，建立请求、通知与运行终态的客户端契约。
date: '2026-10-17'
category: 智能体工程
tags: [Codex, JSON-RPC]
series:
  order: 63
---

# 第六十三章：Codex Rust、SDK 与 App Server

同一智能体可以拥有命令行、编辑器和桌面入口，但入口相同不代表接入方式相同。Codex 的 Rust 运行时、TypeScript SDK 与 App Server 应分别理解：运行时承担执行能力，SDK 提供编程入口，App Server 提供供客户端集成的服务协议。选择接口前先问业务是否需要持续订阅、审批、多个视图和恢复，而不是直接把 CLI 输出当成稳定 API。

## 固定证据与审查范围

本章记录产品版本 `0.163.0`，源码快照为 tree `83086188ae0614bd882818ff1aa23f3194962012`。发布版本与源码 tree 是两种记录，不应未经 tag 对账就声称完全等价。缓存中的 `codex-rs/app-server/README.md` 已实际读取；递归 tree 也确认存在 `sdk/typescript/src/codex.ts`、`thread.ts`、`events.ts`、`exec.ts` 及 SDK 测试目录。

本章进一步读取固定快照的 `codex.ts`、`thread.ts`、`threadOptions.ts` 与 `turnOptions.ts`，核对下面使用的调用和取消字段。未安装厂商包或运行模型；类型来源核验与真实集成验证分别记录。集成时仍应固定实际 SDK 版本，并检查其声明与快照是否一致。

## TypeScript SDK 的实际接入面

| 接口或字段 | 固定源码契约 | 宿主责任 |
| --- | --- | --- |
| `new Codex(options)` | 创建执行器，接受独立配置与环境 | 管理可执行文件及凭据来源 |
| `startThread(options)` | 创建尚未运行的 thread | 选择目录、模型与沙箱 |
| `resumeThread(id, options)` | 按已保存身份恢复 thread | 重新核对目录与当前权限 |
| `thread.run(input, options)` | 消费事件，返回 items、finalResponse、usage | 校验运行结果与产物 |
| `thread.runStreamed(input, options)` | 返回含 `events` 的异步生成器 | 完整消费事件并确认终态 |
| `TurnOptions.signal` | 传给底层执行器的 AbortSignal | 设期限，取消后观察退出 |
| `outputSchema` | 生成临时输出 schema 文件并在 finally 清理 | 区分结构合格和业务正确 |

下面是按固定源码字段编写的厂商接入样例，需在安装匹配 SDK、准备认证的隔离项目中编译与运行。它没有在本教程执行，不能作为模型验收结果。`approvalPolicy: "never"` 表示不交互申请例外，必须与只读沙箱一起理解，不能解释为允许任意操作。

```ts
import { Codex } from '@openai/codex-sdk';

const codex = new Codex();
const thread = codex.startThread({
  workingDirectory: process.cwd(),
  sandboxMode: 'read-only',
  approvalPolicy: 'never',
  networkAccessEnabled: false,
  webSearchMode: 'disabled',
});
const { events } = await thread.runStreamed(
  '读取 README.md，说明执行边界；不要编辑文件。',
  { signal: AbortSignal.timeout(60_000) },
);
let completed = false;
for await (const event of events) {
  if (event.type === 'turn.failed') throw new Error(event.error.message);
  if (event.type === 'turn.completed') completed = true;
  // 业务界面消费必要字段，不把完整工具输出写入公共日志。
}
if (!completed) throw new Error('Turn has no confirmed completion');
```

`thread.id` 初始为 null，在收到 `thread.started` 后赋值。因此开始前不能把它作为耐久恢复身份。输入可以是字符串，也可以是 text / local_image 数组；图片路径与内容是否可访问，仍由实际执行边界与模型能力决定。`run()` 的便利返回值与 `runStreamed()` 的事件流不是同一形状，不能对前者再寻找 `.events`。

该快照 `run()` 在 `turn.failed` 时抛错，却不独立断言一定收到 `turn.completed`；流中断和子进程退出还要结合底层执行器契约验收。需要严格交付门的宿主应保留完成证据，不能仅以 `finalResponse` 非空判成功。更复杂的双向审批和多客户端状态通常应使用 App Server，而不是在单向 exec 事件流上臆造权限回调。

## App Server 的真实机制

固定 README 展示了 JSON-RPC 错误、thread 资源、turn 通知和实验能力协商等具体契约。例如 `thread/list` 的 `excludedThreadIds` 上限为一百项，非法输入返回 `-32602`，不会静默截断。查询存储失败可返回 `-32603`，它不是“没有更多历史”；只有成功响应中的 `nextCursor: null` 才表示耗尽。客户端必须区分空结果和失败，否则会把暂时不可用的历史显示成永久丢失。

该快照还有明确的关闭拒绝语义：进入 graceful shutdown 后，新工作可收到 `-32600`，error data 的 reason 为 `serverShuttingDown`。这提醒宿主不要把所有 JSON-RPC 错误统一显示成模型失败。输入错误、服务关闭、策略拒绝和运行失败位于不同层，重试条件也不同。

read state 被标记为实验能力。`revision` 是限定在 thread 内的 opaque equality token，不是全局时钟；提交更新时应使用实际看到的修订，冲突后重新读取，不能盲目重试并抹掉新结果。这个原则也适用于审批和编辑：客户端展示的是历史快照，写操作必须携带新鲜度约束。

```text
连接与能力协商
  -> 创建/恢复 thread
  -> 提交 turn 意图
  -> 请求响应：确认受理或拒绝
  -> 持续通知：运行、工具与等待
  -> turn 终态
  -> 读取耐久结果与校验产物
```

请求被接受不等于 turn 完成。通知可能晚于响应到达，也可能在断线期间丢失。客户端应保留 request、thread、turn 的不同身份，在重连后获取权威快照；不能简单重放每个未收到结果的写请求。外部副作用若已发生，超时后重发可能重复动作，详见第四十章的幂等边界。

## 自包含客户端实验

下面的 reducer 用自定义 `accepted` 和 `terminal` 事件表达控制逻辑，字段不对应 Codex 官方 schema。它不启动 Codex、不认证、不联网，适合在 Node.js 22 中观察“受理不是成功”和“迟到事件不能串线”。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
function accept(state, event) {
  if (event.connection !== state.connection) return state;
  if (event.run !== state.run) return state;
  if (state.terminal) return state;
  if (event.kind === 'accepted') return { ...state, phase: 'running' };
  if (event.kind === 'terminal') return {
    ...state, phase: event.ok ? 'completed' : 'failed', terminal: true,
  };
  throw new Error('unknown-event');
}
let state = { connection: 'c2', run: 'r2', phase: 'submitted', terminal: false };
state = accept(state, { connection: 'c2', run: 'r2', kind: 'accepted' });
assert.equal(state.terminal, false);
state = accept(state, { connection: 'c1', run: 'r2', kind: 'terminal', ok: true });
assert.equal(state.phase, 'running');
state = accept(state, { connection: 'c2', run: 'r1', kind: 'terminal', ok: true });
assert.equal(state.phase, 'running');
state = accept(state, { connection: 'c2', run: 'r2', kind: 'terminal', ok: false });
assert.equal(state.phase, 'failed');
console.log(JSON.stringify(state));
NODE
```

终态过滤只能防止显示串线，不能解决消息耐久性。生产客户端需要幂等事件标识、顺序或修订语义，以及在缺口出现时重新读快照的策略。连接代际由可信客户端维护，不应从模型文本推断；run 归属还必须在服务器校验，前端比较字符串不构成授权。

## 失败场景与接口选择

读取历史失败时若返回空数组，用户可能创建重复任务；恢复时若重复提交整个 turn，工具副作用可能执行两次；审批拒绝时若只显示 stderr，界面可能永久停留在运行中。这些问题说明结构化协议比抓取 CLI 文本更适合多视图产品。对于简单脚本，SDK 能减少胶水代码，但仍要消费完整终态并治理子进程生命周期。

实验能力不能根据客户端名称自动开启。固定 README 对不同连接能力有严格区分，且强调成功 initialize 不一定证明某项新能力已支持。集成应以协商结果和实际响应为准，遇到未知枚举或错误字段保守降级，不能将未知值映射为成功。安全能力不可用时应阻止依赖它的动作，而不是关闭检查。

固定快照还说明项目 trust 不会因为在缺少项目标识的目录启动 thread 就被提前持久批准。对接者应区分开始任务与信任后续新配置，不能把“曾经访问这个目录”视为永久允许它运行任意插件。启动时选择的提供商也会受到当前托管要求检查，缓存目录不能绕开要求变化；失败应提示重新核验，而不是偷偷切回旧端点。

服务器通知通常是状态快照，不是授权凭据。身份切换、工作区切换和队列等待都可能让通知迟到，客户端应重新读取当前权威状态，再更新界面。权限决定应留在服务端，不能根据一次账户通知就允许访问全部 thread。测试中可以故意交换通知到达顺序，检查新身份不会消费旧身份的结果。

协议适配报告应记录读取了哪个固定文件、哪些字段已运行、哪些仅通过目录定位。只有 tree 里存在 SDK 源码，不足以证明某个选项签名或事件枚举。把核验范围写清楚，比提供一个无法编译的示例更有助于后续集成。

## 可观察验收

运行实验，最终应为 failed，旧连接与旧运行的成功事件都不能改变状态。接着列一份实际适配器契约用例：输入超限、存储失败、服务关闭、受理后取消、通知缺口、重连快照和权限拒绝。每条都需同时断言终态与资源释放，而不是仅检查返回了文本。

本教程未安装 Codex SDK，也未启动 App Server；没有远程认证、实际 JSON-RPC 握手或模型效果证据。`npm run labs` 的工作流恢复可解释完成结果复用，但它不是 Codex thread 恢复实现。生产接入需另开隔离测试并核验真实 schema、进程退出、工作目录与操作系统沙箱。

## 固定来源

- [App Server README](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/app-server/README.md)：已读取的协议与错误契约。
- [TypeScript SDK 目录](https://github.com/openai/codex/tree/83086188ae0614bd882818ff1aa23f3194962012/sdk/typescript)：tree 定位证据；调用前仍需核验具体类型。
- [SDK thread 源码](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/sdk/typescript/src/thread.ts)、[主入口](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/sdk/typescript/src/codex.ts)、[thread options](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/sdk/typescript/src/threadOptions.ts)与[turn options](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/sdk/typescript/src/turnOptions.ts)：本章已读取使用字段，厂商示例未执行。
- [Codex CLI 官方文档](https://developers.openai.com/codex/cli)：产品使用与运行边界。

上一章：[第六十二章：Claude Code 与 Agent SDK 机制](./62-claude-code-sdk.md)

下一章：[第六十四章：OpenCode、SDK、References 与 Policies](./64-opencode-server.md)
