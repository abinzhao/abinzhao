---
title: '第24章：Hooks、中间件与 Mods 的执行边界'
description: 从执行位置、参数身份和失败策略比较 hooks、中间件与 mods，说明兼容桥不能自动继承原宿主的权限与事件。
date: '2026-10-23'
category: 智能体工程
tags: [Hooks, Mods, 中间件]
series:
  order: 24
---

# 第24章：Hooks、中间件与 Mods 的执行边界

“在工具执行前加一个 hook”还不足以定义安全行为。必须知道它位于参数验证之前还是之后、位于审批之前还是之后，以及失败时动作是否继续。相同事件名在不同宿主里位置不同，迁移一个能运行的插件，仍可能改变实际权限。

本章不向原只读循环接入 hooks 或执行第三方代码。示例是内存中间件实验，帮助观察委派次数和身份保护。DeepSeek 的 Claude Code 兼容桥属于实验能力，不应被描述成完整 Claude Code 引擎。

## 24.1 三种机制的执行世界

命令 hook 把事件 JSON 交给外部进程，读取退出码和结构化输出；中间件在宿主管线内围绕下一步执行；Claude Code mod 则通过 hooks module 注册进程内事件函数，还能参与界面等宿主能力。它们都有“拦截”，但权限面和故障隔离不同。

| 机制 | 接收与返回 | 关键风险 |
| --- | --- | --- |
| 命令 hook | stdin JSON、退出码、stdout | shell、环境变量和超时 |
| around 中间件 | 执行对象与 `next` | 重复委派、错误重写 |
| mod | 宿主事件与专用 API | 进程内代码与兼容差异 |
| 观察监听 | 事件通知 | 不能假定可阻断动作 |

外部进程不自动更安全：它可能继承完整凭据和文件权限。进程内 API 也不自动限制 Node 全局访问。真正的边界是运行环境、能力授予和执行管线，不是文件扩展名或“插件”这个称呼。

## 24.2 先审批后改参数会破坏授权

假设审批通过的是读取 `guide.md`，hook 之后把参数改成读取另一个目录。即使 hook 作者认为这是修正，实际执行已经不再是批准的请求。应该在最终参数确定后审批，并把执行绑定到相同身份；若允许重写，必须重新验证、记录和审批。

```text
候选调用 -> 参数准入 -> 政策 / 审批 -> 绑定身份
                                           |
                                   around 执行与观测
                                           |
                                  工具实现 -> 规范化结果
                                           |
                                 后处理 -> 记录和呈现
```

DeepSeek 的 `tools/execute` around 边界保护调用身份，中间件可以处理取消和结果，不能任意改名或参数。其实验 mod 桥把 `tool.call` 放在 Harness 权限决定之后，因此拒绝改参数和改工具。Claude Code 官方 mod 的对应事件位置和允许行为不同。

## 24.3 一个防止重复委派的实验

下面 Node.js 代码只读取内存字符串，不接入真实工具。它展示一次日志调用对应一次执行，且 approved 身份不能被下游替换。`once` 是教学函数，不是 Cordis 或 mods SDK API。

```js
import assert from 'node:assert/strict';

function once(fn) {
  let pending;
  return () => pending ??= Promise.resolve().then(fn);
}

async function guardedCall(approved, hook, execute) {
  const identity = JSON.stringify(approved);
  const call = structuredClone(approved);
  Object.freeze(call.args);
  Object.freeze(call);
  const next = once(() => {
    if (JSON.stringify(call) !== identity) throw new Error('Identity changed');
    return execute(call);
  });
  return hook(call, next);
}

let executions = 0;
const approved = { name: 'read_file', args: { path: 'guide.md' } };
const result = await guardedCall(approved, async (_call, next) => {
  const first = next();
  const second = next();
  assert.equal(first, second);
  return first;
}, async () => { executions++; return 'fixture'; });
assert.equal(result, 'fixture');
assert.equal(executions, 1);
await assert.rejects(guardedCall(approved, async (call, next) => {
  call.args.path = 'private.md';
  return next();
}, async () => 'unexpected'), TypeError);
assert.equal(executions, 1);
console.log('single dispatch and identity verified');
```

本例冻结的是已知浅结构，不能推广成任意深层参数不可变。JSON 字符串比较也不是通用规范化签名；生产审批需要可靠结构比较和可信副作用分类。实验目标只是观察重复 `next` 不会执行两次，参数改变在执行前失败。

## 24.4 兼容桥的“支持”要拆成表

DeepSeek 固定版本 mod 桥使用 `defineMod` 挂载，不读取 Claude Code 的 `plugin.json` 和 `hooks.json`。它只实际触发明确的事件子集；注册一个认识但从不触发的事件，会给出警告而不是实现该功能。能成功 import 并不等于插件完成迁移。

桥接的 `tool.call` 可以观察、拒绝、提供或改写结果，但不能改工具和输入。其 `next` 第二次调用复用第一次结果，不重复执行；卸载应等待已启动工作静止。源码明确指出 bridge 没有对 mods 施加沙箱，Node 全局仍有进程权限，只能加载愿意当普通插件运行的代码。

命令 hook 桥是另一个包，不能与 mod 桥混为一谈。它读取启动时指定的配置路径，支持命令 hook 子集；官方 hooks 文档中的 HTTP、prompt、agent、MCP handler 不因此全部可用。配置读取失败或命令崩溃可能被记录后继续，不能拿它充当不可绕过的硬政策。

迁移报告还要记录配置的读取时机与路径基准。一个 hook 在 Claude Code 中来自项目配置，桥接后可能由进程启动目录解析一次 `configPath`，多个会话共享它；载荷中的当前目录又在每次事件开始时确定。配置路径和执行目录是两种状态，不能把后者变化误认为前者自动重新发现。

## 24.5 失败策略要按职责选择

格式化建议、状态显示或可选日志失败，可以降级继续；数据外发检查和越权拒绝失败，应按安全边界停止。把所有 hook 错误都吞掉，会让关键检查消失；把所有 UI hook 错误都当致命，又会降低可用性。每个边界应声明失败语义，并用测试确认。

后置 hook 的拒绝只能阻止结果继续传播，不能撤销已经发生的写入或网络请求。把 `PostToolUse` 当“操作批准”会使确认永远迟到。外部副作用的审批必须在执行前完成，后置检查负责验证和记录，而不是伪装回滚。

超时也不等于停止。Promise 超时返回后，底层进程或网络请求可能继续；宿主应传播取消并等待所属工作结算。取消后迟到结果必须不能重新标记成功，卸载后回调不能向新会话注入旧事实。

结果重写也应保留原失败属性。一个日志 hook 可能把错误文字整理得更清楚，但不能通过删除 `isError` 把失败工具变成成功。审计时应能看出哪些内容来自执行器、哪些是后处理；用户界面的简短提示不应反向改写实际操作结论。

## 24.6 实验与可观察验收

运行内存代码，应看到执行计数为一，重复委派返回同一 Promise，修改参数导致拒绝且不执行。把 `once` 删除再调用两次，可以观察计数增加，从而理解重复副作用如何产生。

真实 hook 测试应覆盖成功、拒绝、非法 JSON、超时、进程崩溃、取消和卸载。兼容迁移应逐事件核对输入字段、实际触发点和返回效果，不以一个示例能显示 UI 判断全部插件兼容。本章不运行 shell hook 或第三方 mod，也不修改基础只读工具。

## 24.7 固定与官方来源

DeepSeek 根包 `0.2.1-alpha.5`：[工具管线源码](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/core/tools/src/index.ts)、[mod 兼容差异](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/claude-code-mods.md)、[mod 桥源码](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/experimental/claude-code-mods/src/index.ts)和[命令 hook 桥](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/experimental/hooks-claude-code/README.md)。

厂商行为以 [Claude Code hooks](https://code.claude.com/docs/en/hooks)和[mods reference](https://code.claude.com/docs/en/plugins/mods/reference)为依据。2026-10-23 复核 hooks 与 [2.1.309 发布记录](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)；官方滚动 reference 与上游兼容基线版本不同，不能由桥接包能导入推断完整兼容。

## 24.8 当前 Hook 决策与失败回归

当前 Claude `PreToolUse` 的拒绝应通过事件对应的结构化决策表达。例如下面只表示决策结果，不是通用 hook 配置：

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Action is outside the approved scope"
  }
}
```

2.1.309 包含 PowerShell hook 失败处理修复；不能因此推导每个旧 hook 桥具备相同失败策略。事件 matcher、handler 条件、超时、退出码与 JSON 结果都需要按目标宿主类型核对，旧平铺决策字段不能未经迁移继续使用。

练习：对一个无副作用计数工具分别返回允许、拒绝、非法 JSON 和 handler 失败。正常允许应执行一次；拒绝应零次，失败如何影响执行必须与该事件契约一致。再在子 Agent 中触发同一工具，检查 hook 输入的 agent 身份及政策继承。排错先查事件是否实际触发、matcher 是否适用和决策字段位置，不能只检查脚本退出成功。

---

上一篇：[第23章：Cordis 服务、事件与配置组合](./23-cordis-composition.md) · 下一篇：[第25章：MCP Host、Client 与 Server](./25-mcp-architecture.md)
