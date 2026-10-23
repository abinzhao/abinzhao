---
title: 第六十四章：OpenCode、SDK、References 与 Policies
description: 理解 OpenCode 的服务器客户端架构，区分参考目录、工具权限和提供商策略，并处理版本与错误契约。
date: '2026-10-23'
category: 智能体工程
tags: [OpenCode, 策略]
series:
  order: 64
---

# 第六十四章：OpenCode、SDK、References 与 Policies

给智能体增加一个目录和一个提供商，表面上只是配置，实际上改变了它能读取的证据与数据可能流向的端点。本章以 OpenCode 为例，说明服务接口、引用材料与策略分别负责什么。目标不是列出所有方法，而是让接入者能说明一次请求用了哪个目录、为什么能访问、选择了哪个提供商，以及出错后怎样停止。

## 版本与真实服务边界

`2026-10-23` 核验的 `opencode-ai` 与 `@opencode-ai/sdk` npm `latest` 都是 `1.19.4`，对应固定提交 `148842ef7cb1bc34192b3fff57d0f9721ab9c801`。旧 `1.19.3` / `e3c4eb242585dcd77be1a867391b7c25fd47ce52` 保留为历史比较来源，不冒充当前发布。`1.19.4` 更新内置 Bun 至 `1.4.4` 并包含网络栈安全修复，不能将它只当作无行为差异的版本号替换。

官方 server 文档说明，TUI 是服务器的客户端，独立服务可暴露 HTTP API 与 OpenAPI 3.1 规范，SDK 类型从规范生成。已有服务器时应连接它，不能因为调用“创建实例”方便就不断启动新的服务。服务进程的生命周期、目录归属和端口应由宿主明确拥有，关闭页面不能随意关闭其他客户端正在使用的服务。

SDK 文档区分同时启动服务器与客户端、仅创建客户端两种模式。它还提供错误返回风格和抛错开关，因此不能只写 try/catch 就假设所有错误都会抛出。移动文档不同段落有 `format` / `outputFormat` 差异；固定版本 `v2/gen/types.gen.ts` 定义 `SessionPromptData.body` 和 prompt-async 的输入字段为 `format?: OutputFormat`，支持 `text` 或 `json_schema`。`outputFormat` 不能直接搬进这一版请求；包的 `/v2` 导出路径也不是 npm 包已经升到主版本 2 的证明。

## SDK 入口与服务所有权

| 官方入口 | 用途 | 需要管理的资源 |
| --- | --- | --- |
| `createOpencode()` | 同时启动 Server 与 Client | 新建子进程、端口、启动期限、关闭 |
| `createOpencodeClient()` | 连接已有 Server | HTTP 连接、身份与事件订阅 |
| `client.global.health()` | 读取健康与服务版本 | 兼容性检查，不能替代模型探针 |
| `client.event.subscribe()` | 消费服务事件流 | 断线、取消、快照恢复与终态 |
| `client.session.*` | 会话读取、提示、取消等 | 目录、权限、会话归属与副作用 |

以下是官方文档中已核对入口的最小只读健康检查。它需要另行安装匹配 SDK，并连接自行管理的本机服务；教程没有运行此厂商请求。`throwOnError: true` 明确选择抛错模式，避免同时假设“错误放在返回值里”与“所有错误都会进入 catch”。版本读取成功也不能证明模型认证或工具权限已经正常。

```ts
import { createOpencodeClient } from '@opencode-ai/sdk/v2';

const client = createOpencodeClient({
  baseUrl: 'http://127.0.0.1:4096',
  throwOnError: true,
});
const health = await client.global.health();
if (!health.data?.healthy) throw new Error('Server is not healthy');
console.log(health.data.version);
```

长期宿主通常先订阅事件，再提交需要观察的动作，避免丢失很快完成的状态变化；但事件流的先后仍不能代替权威快照。重连后读取会话与正在运行的状态，再恢复 UI，而不是把断线期间没有收到通知解释成失败。调用 `session.abort` 的回执只说明控制请求被处理，资源是否静止、外部效果是否发生需要继续验收。

在同时创建服务的模式中，只有创建者关闭自己的 `server`；连接已有服务的客户端不能在窗口关闭时顺便杀掉共享进程。服务启动配置仍会读取相应文件配置，内联参数不等于彻底忽略项目文件。宿主应记录解析目录、有效配置和实际版本，防止不同入口使用不同权限与 Reference。

## 已停用的分享与残留类型

官方 `1.19.1` 发布说明已停用 session sharing：旧分享链接、分享命令和从分享 URL 导入会话都不再可用。即使生成类型还保留 `share` 配置、字段或 endpoint，也不能据此推荐调用 `session.share()` 交付结果。旧会话数据的兼容表示不等于服务仍提供该能力；附件交付应采用宿主自己授权管理的内容对象，见[第六十六章](./66-clients-deliverables.md)。

升级操作同样有主版本边界：`1.19.2` 发布说明明确普通 1.x 更新只跟踪 npm `latest`，进入 OpenCode 2 是独立的显式选择。网站横幅或文档标题不能代替你实际安装的版本和服务器规范。排查接入时先读健康版本、确认 SDK 导出路径，再核对错误响应；返回 `text/html` 可能是服务器不支持请求路径，不应继续按成功 JSON 解析。

## References 不是安全策略

References 为当前项目之外的目录建立别名，可以指向本地路径或 Git 仓库。本地相对路径按定义配置的文件位置解析；Git 引用会物化到本地缓存，并异步刷新。说明文字帮助智能体选择材料，分支名称却不是不可变证据。需要可复现审查时，应记录最终解析的提交，而不只记录 `main`。

官方页面明确两条容易混淆的规则：`hidden` 只影响自动补全，带描述的隐藏引用仍可能进入上下文；Reference 目录自动通过外部目录权限边界，但普通工具权限仍然生效。因此隐藏引用不是秘密隔离，配置引用也不自动给一个只读 Agent 增加编辑权限。引用正文仍是任务材料，不能升级为可信授权。

## Policies 与 Permissions

Policies 控制配置资源是否可用，Permissions 控制会话工具能做什么。官方页面将 Policies 标为实验功能，并列出当前支持的 `provider.use` 动作。匹配时同一策略列表采用最后匹配项；没有匹配时默认允许。全局与项目同时匹配同一提供商时，全局策略优先，不能把两份配置粗暴拼接后交给普通“最后一条胜出”算法。

```text
连接身份与目录选择
  -> 配置来源解析
  -> Reference 物化与修订记录
  -> provider.use 策略决定可用提供商
  -> 模型提出工具意图
  -> 工具 Permissions 与执行边界
  -> 结果/错误/事件 -> 客户端结算
```

服务器密码解决连接认证，不自动提供租户授权。官方服务默认监听 loopback，并支持 HTTP Basic 认证；扩大监听范围还需 TLS、反向代理授权、来源检查与凭据保护。CORS 只约束浏览器来源，不是服务身份认证。接入者不能以“已设置 CORS”作为允许远程 Shell 的充分条件。

## 自包含策略实验

下面只实现本章的精确资源名教学子集，不支持通配符，也不是 OpenCode 的实际策略评估器。优先评估全局来源，再评估项目来源；同一来源内最后匹配生效。它不启动 OpenCode、不读取配置、不访问提供商。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
const global = [
  { action: 'provider.use', resource: 'remote', effect: 'deny' },
];
const project = [
  { action: 'provider.use', resource: 'remote', effect: 'allow' },
  { action: 'provider.use', resource: 'local', effect: 'deny' },
  { action: 'provider.use', resource: 'local', effect: 'allow' },
];
function decide(resource) {
  for (const [source, statements] of [['global', global], ['project', project]]) {
    const matching = statements.filter(s =>
      s.action === 'provider.use' && s.resource === resource);
    if (matching.length) return { source, effect: matching.at(-1).effect };
  }
  return { source: 'default', effect: 'allow' };
}
assert.deepEqual(decide('remote'), { source: 'global', effect: 'deny' });
assert.deepEqual(decide('local'), { source: 'project', effect: 'allow' });
assert.equal(decide('unknown').effect, 'allow');
console.log(JSON.stringify(['remote', 'local', 'unknown'].map(decide)));
NODE
```

这段代码展示默认允许的风险，不代表推荐在生产中采用默认允许。团队若要求数据只进入批准的提供商，应明确配置兜底拒绝，并检查 fallback 路由、已有凭据和缓存是否也遵守策略。工具写权限仍需单独限制，不能从提供商允许结果推导出文件编辑许可。

Reference 的修订和工具观察也应保持一致。目录刷新后，旧检索片段可能已不再对应当前文件；执行编辑前应重新读取，报告引用要保留实际观察的内容摘要。缓存的仓库来源需要可信校验，不能因为别名叫官方文档就自动获得信任。异步更新失败应显示失败或旧缓存状态，不把缺少内容当成仓库本来为空。

配置实验适合使用临时隔离项目，但不能复制真实认证文件作为夹具。真正的提供商禁用测试应观察路由决策以及没有请求发出的证据，而不是只看模型列表隐藏了名称。界面隐藏、目录访问与数据出站是三种防线，每种都需要独立验收。

## 失败场景与可观察验收

References 异步更新时若把旧缓存误报为新分支，会造成错误来源归因；应输出解析修订与就绪状态。项目试图覆盖全局拒绝时若成功，说明配置优先级发生回归。事件流断开却继续重试 prompt，则可能重复执行任务；恢复应先读会话与运行状态，不以网络断开推断失败。

运行上述实验，应看到 remote 仍被全局拒绝，local 由项目最后一条允许，unknown 因未匹配而默认允许。真实接入的验收还应包括只读 Agent 引用外部目录、隐藏引用仍被上下文广告、被策略拒绝的提供商无法使用，以及错误返回与抛错两种模式。每条都应检查实际配置和结果，不能只检查界面按钮。

本教程没有安装 OpenCode SDK、启动其服务、克隆 Reference 或提交提供商凭据。实验仅解释规则，基础项目仍是单进程本地只读助手。生产的多客户端生命周期、远程认证与强沙箱没有被这些章节代码实现，必须单独测试后才可开放相应入口。

练习：在隔离接入环境列出本机服务版本、SDK 版本、实际 `format` 请求与错误模式。模拟旧分享 URL 和 HTML 响应，断言不会登记为已交付；再检查被全局拒绝的提供商没有收到请求。

## 官方来源

- [SDK](https://opencode.ai/docs/sdk/)与[Server](https://opencode.ai/docs/server/)：移动接口说明；不能覆盖固定依赖类型的证据。
- [1.19.4](https://github.com/anomalyco/opencode/releases/tag/v1.19.4)、[1.19.2](https://github.com/anomalyco/opencode/releases/tag/v1.19.2)与[1.19.1](https://github.com/anomalyco/opencode/releases/tag/v1.19.1)：安全运行时、显式主版本升级与停用分享，核验于 `2026-10-23`。
- [固定 v2 生成类型](https://github.com/anomalyco/opencode/blob/148842ef7cb1bc34192b3fff57d0f9721ab9c801/packages/sdk/js/src/v2/gen/types.gen.ts)与[客户端](https://github.com/anomalyco/opencode/blob/148842ef7cb1bc34192b3fff57d0f9721ab9c801/packages/sdk/js/src/v2/client.ts)：本章实际读取的 `format`、健康检查和 HTML 响应检查。
- [References](https://opencode.ai/docs/references/)与[Policies](https://opencode.ai/docs/policies/)：引用目录、来源优先级和实验策略。
- [固定 policy 源码](https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/core/src/policy.ts)与[reference 源码](https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/core/src/reference.ts)：已通过 tree 定位；本章不声称逐行审计。

上一章：[第六十三章：Codex Rust、SDK 与 App Server](./63-codex-app-server.md)

下一章：[第六十五章：ACP、A2A 与 Agent 互操作](./65-acp-a2a.md)
