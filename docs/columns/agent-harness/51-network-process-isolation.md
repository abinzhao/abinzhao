---
title: 第 51 章：网络、进程、容器与虚拟机隔离
description: 用执行世界和访问矩阵审查网络、进程及宿主接口，避免把容器或只读模式当成完整隔离。
date: '2026-10-17'
category: 智能体工程
tags: [Agent Harness, 网络隔离, 进程隔离]
series:
  order: 51
---

# 第 51 章：网络、进程、容器与虚拟机隔离

## 51.1 隔离是多个维度的组合

文件系统写入受限之后，Agent 仍可能通过网络发送可读内容、访问本机服务、连接 Unix socket，或影响同账号进程。容器、沙箱和虚拟机是实施机制，不是可直接互换的安全等级。评估时应写出实际挂载、网络路由、进程身份、凭据来源和生命周期，明确哪些资源仍与宿主共享。

DeepSeek Harness 固定文件效果模式不包含网络与进程可见性。这意味着 `read-only` 是一项文件效果要求，不能推导出“无网络”或“看不见宿主进程”。原第 1–12 章仅限制模型地址为本机并提供只读工具，也没有实现网络命名空间、进程命名空间或虚拟机。本章示例只检查描述性策略，不会在本机建立这些设施。

## 51.2 让所有 provider 位于同一执行世界

执行世界指文件路径、命令启动、终端与相关服务实际工作的那台机器或隔离实例。若文件 provider 读远端工作区，shell provider 却在宿主本机运行，模型看到的路径就与命令触及的资源不一致。仅替换 Bash 而忘记 PTY、LSP 或后台 job，也会留下绕过新边界的入口。

固定 DeepSeek 架构要求文件系统与 subprocess provider 共享执行世界；远端替换应连带解释 shell、终端和 LSP 的落点。每个调用记录工作区标识、provider 与实例身份，出现不一致时拒绝执行，比在失败后猜测命令究竟跑在哪里更可靠。SSH 加密运输只能保护传输，不能自动限制远端账户已有的权限。

| 机制 | 可以建立的边界 | 不能默认推断 |
| --- | --- | --- |
| 域名代理 | 审核出站目的地 | 所有协议都经过代理 |
| 非特权容器 | 配置后的挂载与进程视图 | 没有宿主 socket 或凭据 |
| 独立虚拟机 | 独立内核与资源分配 | 共享目录和网络天然安全 |
| Git worktree | 独立检出目录与索引 | 身份、进程及账号隔离 |

## 51.3 自包含的执行策略准入实验

下面的 Node.js 22 示例只判断固定策略对象和 URL，不执行网络请求。地址使用保留示例域名，既不要求外部服务，也不读取环境变量。`origin` 精确匹配避免把相似后缀误当成同一目的地；它仍不是 DNS、路由和重定向的完整防护。

```js
import assert from 'node:assert/strict';

const policy = Object.freeze({
  world: 'disposable-lab',
  filesystemWorld: 'disposable-lab',
  subprocessWorld: 'disposable-lab',
  allowedOrigins: ['https://docs.example.com'],
  hostSockets: [],
  privileged: false,
});
function check(candidate) {
  if (candidate.filesystemWorld !== candidate.subprocessWorld) return 'WORLD_MISMATCH';
  if (candidate.privileged || candidate.hostSockets.length) return 'HOST_ACCESS';
  return 'ADMITTED';
}
function destination(text) {
  try {
    const url = new URL(text);
    if (url.username || url.password) return false;
    return policy.allowedOrigins.includes(url.origin);
  } catch {
    return false;
  }
}
assert.equal(check(policy), 'ADMITTED');
assert.equal(check({ ...policy, subprocessWorld: 'host' }), 'WORLD_MISMATCH');
assert.equal(check({ ...policy, hostSockets: ['/var/run/docker.sock'] }), 'HOST_ACCESS');
assert.equal(destination('https://docs.example.com/guide'), true);
assert.equal(destination('https://docs.example.com.evil.invalid/guide'), false);
assert.equal(destination('http://127.0.0.1:8787'), false);
console.log('world and destination checks passed');
```

代码中 `ADMITTED` 只表示描述满足本例规则，不表示容器已经启动。真正执行前还应探测实例状态和生效配置。网络代理要校验实际连接目的地、重定向的每一跳以及解析到本地或私网地址的情况；仅检查第一次 URL，后续连接依然可能转向不允许的位置。代理环境变量也不保证任意程序愿意使用代理。

## 51.4 真实失败案例：容器启动了，宿主通道仍开着

常见的真实失败机制是把宿主 Docker socket 挂载进开发容器。容器内程序随后可以向宿主 daemon 请求创建其他容器和挂载宿主资源，边界不再等价于“只有这个项目目录”。即使整个项目挂成只读，socket 仍是另一条有副作用的资源通道。不能以没有文件写权限为由忽略它，也不能靠审批命令名称涵盖所有 daemon API。

Claude Code 官方 sandboxing 页面指出，`docker` 命令因访问 daemon socket 可能在沙箱中失败，同时指出 hooks 与 MCP 进程运行在 Bash 沙箱之外。由此得到的排查顺序是先确认调用路径，再确认 socket 和进程实际在哪一侧，而不是一遇失败就排除命令、关闭限制。排除命令确实能让任务继续，却改变了执行边界。

Codex 官方安全指南区分 Cloud 容器与本地 CLI、IDE 的系统级约束。本地默认工作区写入与网络限制并不等同于 Cloud 的托管容器；在 Linux 容器里，宿主配置不支持相关系统调用时，本地沙箱也可能不能工作。该页对 Windows 推荐 WSL 或容器，但这不能成为所有发行版本都没有其他 Windows 实现的结论，应核对实际产品版本与对应文档。

## 51.5 资源与生命周期也是安全状态

一个可用的隔离实例应经历申请、准备、就绪、运行、停止和释放，资源分配失败不能跳过准备直接跑在宿主。运行期还要限制 CPU、内存、进程数、文件描述符和输出大小；网络禁止泄露并不能阻止 fork 或无限输出造成资源耗尽。退出后确认后台进程、代理与临时挂载释放，才能称为本次执行已停止。

长期账号凭据、浏览器 profile 和缓存目录不应无差别复制到实例中。专用账号和最小挂载通常比共享开发者 home 更容易解释；容器 root 也不能与宿主 root 简单等同，需要查看用户映射和 capabilities。虚拟机提供更独立的内核，但若授予任意共享目录和长期令牌，允许范围内的风险仍然存在。

## 51.6 实验与可观察验收

1. 运行示例，确认执行世界错配、宿主 socket 和相似域名被分别识别。
2. 在授权的隔离测试实例中核对文件、shell、终端与 LSP 的实例身份，任何一项落到宿主都应停止验收。
3. 使用无敏感内容的固定响应服务分别验证允许目的地、禁止目的地、重定向和本地服务访问，记录实际连接证据。
4. 停止任务后观察进程与资源是否回收；取消信号被接收不等于实例已经销毁。
5. 将没有运行的平台标为未验证。不能拿 macOS 结果替代 Linux、WSL2 或 Windows 的产品支持结论。

完成标准是访问矩阵与探针一致，且失败不会切回宿主执行。内存检查仅验收策略算法，真正网络和进程隔离必须由目标平台证据确认。本章不安装容器、不修改宿主网络，也不宣称已经建立可承载恶意代码的设施。

## 51.7 官方来源与边界

DeepSeek Harness 固定 `0.2.1-alpha.5`、提交 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`，平台能力均需按实际后端探测，安全声明仍适用。

- [固定架构与执行世界](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/architecture.md)
- [固定 sandbox 文件效果范围](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/sandbox.md)
- [Claude Code 沙箱范围与限制](https://code.claude.com/docs/en/sandboxing)
- [Codex 本地与 Cloud 安全边界](https://developers.openai.com/codex/security/)
- [Git worktree 官方定义](https://git-scm.com/docs/git-worktree)

上一章：[第 50 章：文件系统沙箱与平台原语](./50-filesystem-sandbox)

下一章：[第 52 章：权限策略、审批与 Auto-review](./52-permissions-approvals)
