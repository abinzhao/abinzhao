---
title: 第 50 章：文件系统沙箱与平台原语
description: 区分路径校验与系统强制隔离，理解符号链接竞争、执行完整性和失败关闭。
date: '2026-10-23'
category: 智能体工程
tags: [文件系统沙箱, TOCTOU]
series:
  order: 50
---

# 第 50 章：文件系统沙箱与平台原语

## 50.1 路径不是稳定的资源身份

文件系统沙箱限制执行期间可以产生的文件效果，而路径校验决定一次请求是否看起来符合应用规则。它们不是同一件事。路径是目录项的逐段查找过程，符号链接、挂载点和重命名都能改变它最终指向的对象。仅检查字符串是否以工作区前缀开头，既可能接受相邻目录，也可能在检查后读取不同的文件。

原教程只读工具用运行时参数检查与真实路径核对防止一般越界，并明确排除对抗性并发修改。那是合理的教学范围，不是强沙箱。本章讨论扩大威胁范围后需要什么原语，不修改原工具，也不把 JavaScript 路径检查升级为操作系统保证。只读限制主要保护完整性，若读取范围过大，机密性仍可能失守。

## 50.2 模式、执行事实与审批必须分列

DeepSeek Harness 的固定 `SandboxMode` 描述文件效果：`read-only` 拒绝写入，POSIX runner 还允许 shell 必需的 `/dev/null`；`workspace-write` 允许工作区与后端承诺的临时区；`danger-full-access` 绕过 confinement。这里的模式词汇不涵盖网络或进程可见性，不能从名称推断这些维度已经隔离。

| 层次 | 回答的问题 | 需要的证据 |
| --- | --- | --- |
| 应用路径校验 | 请求路径是否准入 | 参数与解析结果 |
| 文件效果模式 | 本次允许哪些写入 | 每调用策略快照 |
| 后端执行完整性 | 实际能否覆盖承诺 | `full` 或 `partial` |
| 审批 | 是否允许指定动作 | 一次性决策及调用身份 |

固定源码将 `partial` 明确用于旧 Landlock ABI 和 Windows ACL 后端等边界。`full` 也只是完整实施该模式承诺的文件效果，并不意味着整个系统安全。需要绝对保证的调用方必须拒绝 `partial`，不能把“后端启动了”写成“所有访问都隔离了”。审批允许一次动作，同样不会修复缺失的内核能力。

## 50.3 自包含的检查与使用竞争实验

下面用内存路径表表示文件系统竞争。它不创建符号链接、不读取真实文件，只用确定性状态变化展示 TOCTOU，也就是检查时与使用时之间的对象变化。代码可直接在 Node.js 22 ESM 中运行。

```js
import assert from 'node:assert/strict';
import { posix } from 'node:path';

const root = '/workspace';
const names = new Map([['/workspace/guide.md', '/workspace/guide.md']]);
function inside(path) {
  const relative = posix.relative(root, path);
  return relative === '' || (!relative.startsWith('../') && relative !== '..');
}
const checked = names.get('/workspace/guide.md');
assert.equal(inside(checked), true);
names.set('/workspace/guide.md', '/private/fixture.md');
const used = names.get('/workspace/guide.md');
assert.notEqual(used, checked);
assert.equal(inside(used), false);
function requireEnforcement(result) {
  if (!result || result.enforcement !== 'full') {
    throw new Error('SANDBOX_UNAVAILABLE_OR_PARTIAL');
  }
  return result;
}
assert.throws(() => requireEnforcement(null), /SANDBOX/);
assert.throws(() => requireEnforcement({ enforcement: 'partial' }), /SANDBOX/);
assert.equal(requireEnforcement({ enforcement: 'full' }).enforcement, 'full');
console.log('race-observed; fail-closed checks passed');
```

重新解析一次可以发现这次刻意安排的变化，却不能证明下一次解析和打开之间没有竞争。现实中的改进应把资源定位和访问绑定到内核执行边界，而不是无限追加“再检查一次”。目录描述符、受限路径解析与隔离挂载解决的是不同攻击面，使用它们之前仍要定义允许跟随哪些链接、跨哪些挂载点。

打开之后还要约束读取行为。路径落在允许目录中，并不保证对象是普通文件；设备、管道和持续增长的文件可能使一次读取无限等待或耗尽内存。工具应核对对象类型、限制实际读取字节并响应取消，不能只在打开之前检查文件大小。目录身份检查保护访问位置，内容摘要用于确认观察版本，两者也不能互换：摘要变化说明内容改变，不一定说明权限越界；摘要相同更不能证明系统路径隔离正确。

## 50.4 平台原语与真实失败案例

Linux `openat2` 能基于目录描述符限制路径解析。`RESOLVE_BENEATH` 禁止逃出该目录，`RESOLVE_NO_MAGICLINKS` 禁止 `/proc` 一类特殊链接；按安全目标还可以禁止全部符号链接。`O_NOFOLLOW` 只处理最终路径段，不等于禁止祖先目录中的链接。Node.js 22 标准文件 API 不提供同名的完整 `openat2` 配置，本教程不伪造一个可移植包装器。

真实失败机制可直接从 Node.js 官方权限模型的已知限制核对：相对符号链接可能让访问走出获准路径，模型不对恶意代码提供安全保证，已有文件描述符也存在特殊边界。因此给 Node 进程加 `--permission`，再运行任意不可信插件，不能作为替代系统沙箱的证明。这不是虚构事故，而是官方明示的限制。

另一类真实故障是 sandbox runner 根本没有启动。固定 DeepSeek 契约要求无可用后端时产生 `SANDBOX_UNAVAILABLE`，禁止悄悄原样执行 argv。消费者还要区别“命令因策略被拒绝”和“runner 在命令执行前失败”，因为普通命令也会非零退出，退出码本身无法证明隔离状态。自动以无沙箱方式重试会把基础设施失败转化为权限扩大。

Claude Code 官方页面另有产品特定边界：本地命令沙箱支持 macOS、Linux 和 WSL2，覆盖 Bash、PowerShell、Monitor 及其子进程，原生 Windows 不提供同一沙箱。默认不可用时仍可无沙箱执行；要求强制边界时应同时设置 `sandbox.enabled: true`、`failIfUnavailable: true`、`allowUnsandboxedCommands: false`，并审查 `excludedCommands`，不能直接套用 DeepSeek 的失败关闭契约。文件工具、MCP 和 hooks 也不因命令沙箱启用而自动被包围。

## 50.5 实验与可观察验收

1. 运行内存示例，确认路径检查先通过、使用对象随后越界，两种无完整后端的请求均抛错。
2. 将第二个目标改成工作区内文件，确认“对象变化”与“目录越界”是两项不同事实，不能只记录布尔通过。
3. 检查目标平台的后端名称、内核版本与执行完整性声明。未安装或不可探测时记为不可用，不运行真实负载。
4. 在专门授权的无敏感临时目录中分别验收允许读取、拒绝越界写入和 runner 不可用；保留错误分类与退出状态。
5. 对抗性链接和重命名测试必须在隔离测试环境进行。普通本机权限探针通过，不等于所有竞争条件已被覆盖。

可观察完成标准是：请求策略与实际后端对应，失败没有绕过 confinement，测试涵盖拒绝路径。写入探针被拦截只能证明该探针的文件效果，不证明网络阻断、凭据不可见或进程不可干扰。安全报告必须把未测维度列出来，后续章节再逐项补齐。

## 50.6 官方来源与边界

DeepSeek Harness 基线固定为 `0.2.1-alpha.5`、提交 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`，仍是未审计的实验软件。2026-10-23 对照 [rc.2 sandbox](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/subsystems/sandbox.md)，Windows ACL、旧 Landlock ABI 的 partial enforcement 仍需明确拒绝或报告，不能把活跃后端当完整强制。

Claude [2.1.309 固定变更记录](https://github.com/anthropics/claude-code/blob/v2.1.309/CHANGELOG.md) 修复启动 shell 配置在沙箱外执行、macOS symlink 实际路径未应用 denyWrite glob，以及 `--mcp-config` 文件可被命令或自动接受编辑修改等问题。升级后的验收仍需在目标平台运行无敏感探针：允许工作区写、拒绝 symlink 实际位置写、缺依赖时启动失败。练习为内存模型添加“解析路径与真实位置”的策略快照；排错区分策略拒绝、partial 和 runner 启动失败。本章没有执行真实内核探针，修复记录不等于本机隔离已验证。

- [固定 sandbox 契约](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/sandbox.md)
- [Node.js 22 权限模型限制](https://nodejs.org/docs/latest-v22.x/api/permissions.html)
- [Linux 路径解析](https://man7.org/linux/man-pages/man7/path_resolution.7.html)
- [Linux openat2](https://man7.org/linux/man-pages/man2/openat2.2.html)
- [Claude Code Bash 沙箱](https://code.claude.com/docs/en/sandboxing)

上一章：[第 49 章：Agent 威胁模型与提示注入](./49-threat-model)

下一章：[第 51 章：网络、进程、容器与虚拟机隔离](./51-network-process-isolation)
