---
title: 第 53 章：凭据隔离、插件与 MCP 供应链
description: 用凭据引用和 secret broker 收窄授权，审查安装脚本、插件激活与远程工具的供应链边界。
date: '2026-10-23'
category: 智能体工程
tags: [凭据隔离, 供应链]
series:
  order: 53
---

# 第 53 章：凭据隔离、插件与 MCP 供应链

## 53.1 不把秘密值交给规划者

凭据隔离的目标是让模型和普通工具不需要看到秘密值，也不能任意选择使用该凭据的目标。secret broker 是可信中介：它接收经过策略判断的操作，在内部取得最小凭据，对允许的服务发起请求，只返回必要业务结果。它不是一个把 token 换个名字再返回的接口，也不是通用 HTTP 代理。

DeepSeek Harness 的 credential seam 在配置中使用引用，消费者每次操作重新解析，从而支持轮换；面向界面的 describe 只返回是否配置、来源层与可写性，不返回值。这减少配置与 UI 的暴露，但同进程可信消费者解析后仍能获得秘密值。因此凭据引用是数据建模边界，不应宣称它本身已经把不可信插件与秘密隔离。

| 形式 | 暴露面 | 实际边界 |
| --- | --- | --- |
| 明文放入 prompt | 模型请求、日志与转述 | 已经暴露给规划层 |
| 凭据引用 | 配置只保留名字 | 解析者仍需被信任 |
| 继承整个环境 | 子进程与安装脚本 | 与账号权限一起扩散 |
| 操作型 broker | 固定操作与目标 | 中介必须独立执行授权 |

## 53.2 Broker 的授权不是请求者自报

broker 应从认证通道取得调用身份，验证操作、资源、目标 origin、方法和参数，绑定凭据用途与短期有效性。不能相信模型传来的 `principal: admin`，也不能因为 URL 看起来像受信域名就附加认证头。重定向到另一个 origin 时应重新检查且默认不转发凭据；错误信息、重试日志和完整响应也可能泄露秘密。

下面的 Node.js 22 代码只演示描述性 broker 的决策，不访问网络，不读取环境，也不保存任何秘密值。调用身份以对象身份映射，由宿主预先注册；这不是可以抵抗同进程恶意代码的隔离机制，但比相信参数中的自报身份更准确。

```js
import assert from 'node:assert/strict';

const connection = Object.freeze({});
const identities = new WeakMap([[connection, 'reader']]);
const catalog = new Map([['REPORT_API', {
  origin: 'https://reports.example.com', operations: ['read-summary'],
}]]);
function broker(channel, request) {
  const principal = identities.get(channel);
  const entry = catalog.get(request.credentialRef);
  if (principal !== 'reader' || !entry) return { status: 'denied' };
  if (!entry.operations.includes(request.operation)) return { status: 'denied' };
  let url;
  try { url = new URL(request.url); } catch { return { status: 'denied' }; }
  if (url.origin !== entry.origin || url.username || url.password) return { status: 'denied' };
  return { status: 'admitted', operation: request.operation, origin: entry.origin };
}
const request = { credentialRef: 'REPORT_API', operation: 'read-summary',
  url: 'https://reports.example.com/summary' };
assert.equal(broker(connection, request).status, 'admitted');
assert.equal(broker({}, { ...request, principal: 'reader' }).status, 'denied');
assert.equal(broker(connection, { ...request, operation: 'delete-report' }).status, 'denied');
assert.equal(broker(connection, { ...request, url: 'https://other.invalid' }).status, 'denied');
assert.equal('token' in broker(connection, request), false);
console.log('broker policy checks passed');
```

实际 broker 应用固定请求模板或细粒度参数校验，上例未检查路径，因此没有实现完整业务授权。真实部署还需独立进程或服务身份、最小存储权限和可信审计通道。客户端不能任意指定 credentialRef，操作返回值应按结构白名单裁剪，而不只用字符串替换隐藏某个已知 token。

## 53.3 安装之前就可能运行代码

供应链从包解析开始，不是从首次模型调用开始。市场条目、包名、版本范围、下载源、完整性摘要、依赖树、安装脚本与激活代码都是证据。固定版本能减少漂移，却不能保证代码无恶意；锁文件也不能阻止一个被锁定包的安装脚本执行危险操作。审查入口应覆盖下载、构建、激活和运行四阶段。

固定 DeepSeek tool catalog 说明 plugin manager 的安装可能执行获准构建脚本，改变会影响当前 profile 的所有会话；审批只对应该调用，不改变会话权限模式。版本要求不满足时会阻止安装与激活，豁免需要精确版本风险确认。这种 profile 级影响面大于一条普通文件读取，不能让模型基于工具描述自行安装最新插件。

本地 MCP server 也是可执行程序。协议 schema 能描述参数，不能证明服务端行为；远程 server 即使只返回文字，也可能成为提示注入入口。工具 annotations 和“只读”名称是声明，不是系统授权。管理员应固定来源和版本、审查依赖与行为，并把可访问凭据、网络和工作区范围落实到运行身份。

## 53.4 真实失败案例：为了运行检查而执行安装脚本

npm 官方生命周期文档明确：`npm ci` 与 `npm install` 可运行安装及 prepare 等脚本；Git 依赖的 prepare 还可能先安装构建依赖。因此“只是安装测试依赖”本身就可能执行仓库或依赖作者的代码。若父进程带着开发者的长期服务凭据，安装程序可以继承环境，在正式 Agent 工作前造成泄露或修改。

另一个可核对的限制来自 Claude Code sandboxing 文档：hooks 与本地 MCP server 不在 Bash 沙箱范围内，shell 子进程默认可能继承包含秘密的环境。只在 Bash 中阻止读取某个文件，不能推断插件或 hooks 同样受限。修复应减少启动环境、移除不必要凭据，并在独立身份或外层隔离中运行不可信代码，而不是把一次 Bash 探针当成全面验收。

在隔离的干净副本中，关闭安装脚本可作为初次审阅措施，但不能当成依赖已经可用的结论。需要脚本的包可能没有生成必要产物；后续明确运行某个 npm script 仍然执行该脚本。原第 1–12 章没有第三方运行依赖，本章不会给它加入 broker SDK 或 MCP 安装流程。

## 53.5 实验与可观察验收

1. 运行 broker 示例，确认自报身份、未知操作与错误 origin 被拒绝，返回对象没有 token 字段。
2. 改用不同的对象冒充连接，确认操作不能仅靠知道凭据引用名获得资格。
3. 在不执行安装的情况下阅读目标包的锁文件、脚本和激活入口，记录准确版本与依赖来源；未知来源应阻塞激活。
4. 使用无敏感环境的授权副本验收安装和激活，分别记录它们发生的文件、进程与网络效果，不展示环境值。
5. 对凭据轮换、撤销、错误响应和跨 origin 重定向分别测试。日志只能记录引用、操作身份和状态，不记录真实 token、证书或私钥。

完成标准是规划层不获取秘密值，授权只到达规定操作，供应链各阶段有可信来源与副作用证据。内存 broker 只验证决策骨架，不证明秘密已经隔离；未运行的插件不能写成“安全通过”，官方未审计软件也不能被包装成生产级凭据防线。

## 53.6 当前协议元数据的泄露面

2026-10-23 对照 [MCP 2026-07-28 tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)，`x-mcp-header` 可将 primitive 工具参数映射为 `Mcp-Param-*` HTTP 头，中间代理能看到它。Server 不应标记密码、API key、token 和个人信息；Host 也不能因为这些字段存在于 schema 就当成可公开路由元数据。工具参数、HTTP 头、业务日志与模型结果有不同可见范围，需要分别审查，不把结果脱敏当成请求未泄露。

当前插件 manifest 布局见[第 22 章](./22-plugin-packaging)，固定安装身份不等于包已安全审计。对照 [DeepSeek rc.2 Credentials](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/subsystems/credentials.md)，消费者逐操作重新 resolve，空存储值视为不存在，不能跨操作缓存旧值。正常验收是轮换下一请求生效且 UI 不返回秘密；异常验收是撤销、空值、跨 origin 和敏感 header 映射被阻止。练习给 broker 的 catalog 增加允许路径与方法，证明同 origin 也不能任意选择接口；排错只记录引用和失败阶段，不打印真实秘密。

## 53.7 官方来源与边界

DeepSeek Harness 基线为 `0.2.1-alpha.5`、固定提交 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`；旧 npm 生命周期资料保留为来源，当前协议和凭据补充按 2026-10-23 复核，不声称运行过真实凭据实验。

- [固定凭据契约](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/credentials.md)
- [固定 plugin manager 工具说明](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/tool-catalog.md)
- [Claude Code 沙箱外进程与凭据](https://code.claude.com/docs/en/sandboxing)
- [npm 生命周期脚本](https://docs.npmjs.com/cli/v11/using-npm/scripts)
- [npm ci 的锁定与脚本行为](https://docs.npmjs.com/cli/v11/commands/npm-ci)

上一章：[第 52 章：权限策略、审批与 Auto-review](./52-permissions-approvals)

下一章：[第 54 章：安全探针、对抗评测与降级处理](./54-security-verification)
