---
title: '第30章：MCP Apps、Tasks 与 Skills 扩展'
description: 按官方扩展原文分别说明 UI、耐久任务和远程技能的协商、来源与安全契约，避免混用旧版任务语义及厂商 SDK。
date: '2026-10-23'
category: 智能体工程
tags: [MCP Apps, MCP Tasks, Skills over MCP]
series:
  order: 30
---

# 第30章：MCP Apps、Tasks 与 Skills 扩展

扩展并不等于“下一版 MCP 自动拥有的全部功能”。扩展有自己的标识、规范和实现支持，必须由双方明确启用；宿主只会读资源，也不代表能安全渲染 UI、恢复后台任务或激活远程 Skill。判断支持要检查完整链路，而不只看 SDK 包名。

截至 2026-10-23，官方目录列出 Apps、Tasks 和 Skills 扩展；Skills 的 SEP-2640 已为 Final，Tasks 仓库发布 `2026-07-28` Stable schema，Apps 有 `2026-01-26` Stable 规范。本文依据这些实际原文，不把它们笼统称为实验提案，也不声称所有 Host 已支持。

## 30.1 三种扩展增加不同责任

| 扩展 | 官方标识 | Host 新责任 |
| --- | --- | --- |
| Apps | `io.modelcontextprotocol/ui` | 隔离渲染、消息桥、能力控制 |
| Tasks | `io.modelcontextprotocol/tasks` | 保存任务句柄、跟踪终态、恢复查询 |
| Skills | `io.modelcontextprotocol/skills` | 来源限定、清单校验、加载与批准 |

官方扩展与厂商 SDK 不是同一层。OpenAI Apps SDK、社区 MCP-UI 和 MCP Apps 之间存在关联，不意味着 API 可互换；Tasks SDK 支持某一代 receiver，不意味着它覆盖所有协议时代；文件 Skill 支持也不意味着 Host 支持 Skills over MCP。

现代协商通过请求 `_meta` 中的 client capabilities 与 `server/discover` 返回的 server capabilities 表达。某个扩展不在双方有效集合时，应按其规定回退或拒绝，不能仅凭服务器正文写着“支持”就发送扩展方法。

## 30.2 Apps：UI 是新的执行表面

Apps 将工具与 UI 资源关联，资源通常用 `ui://` URI 和 `text/html;profile=mcp-app`。Host 读取 UI 资源后，在受控沙箱界面中渲染，通过消息桥传递工具输入、结果和交互。界面可以请求能力，但不能直接取得父页面 DOM、cookies 和无限工具权限。

```text
工具声明 UI 资源 -> Host 验证支持 -> 读取 UI
                                          |
                              sandbox + CSP + 消息桥
                                          |
                             用户交互 -> Host 再次准入

长操作 -> 任务句柄 -> 保存 -> 查询 -> 终态结果

远程技能目录 -> 保留清单 -> 批准 -> 按需读字节并校验
```

把返回 HTML 直接插进 Host 页面是严重误用。沙箱、来源检查、CSP 和桥接方法白名单都是实现责任；协议文档描述隔离模型，不代表任意 iframe 配置自动安全。App 请求工具调用也必须经过原 Host 政策，不能利用 UI 绕过模型工具审批。

不支持 UI 的 Client 应能获得有意义的文本或按明确规则拒绝，不是显示空白后宣布工具成功。原十二章 Web UI 仅显示本地运行事件，没有 Apps 的资源链接、沙箱桥或 UI 能力协商，不能称为 MCP Apps Host。

## 30.3 Tasks：断线后查询，不是自动重发

现代 Tasks 由 Server 在双方支持时决定返回 `resultType: "task"`，持久创建任务后发送句柄。Client 保存 task id，按建议间隔查询 `tasks/get`，遇到 `input_required` 处理输入并通过 `tasks/update` 提交，终态包含完成结果或失败错误。

`completed`、`failed` 和 `cancelled` 是终态；取消是合作式请求，确认取消意图不保证外部工作已经停止。重连后应继续查询原任务，不是重新创建一个相同动作。任务 TTL 决定句柄可用期，Host 必须处理已过期或不可访问的状态。

这与 `2025-11-25` 的任务能力树和任务结果方法不能混用。现代官方 overview 明确按扩展标识协商，`tasks/get` 可承载终态结果。旧示例出现不同调用方法时，应使用旧固定规范核对，不向现代请求机械拼接。

## 30.4 Skills：资源读取不自动激活

Skills 扩展通过 `skills/list` 和 `skills/get` 返回条目，再用基础 `resources/read` 读取文件。条目保留原 frontmatter 和完整文件清单，包含 URI、SHA-256 与字节数；动态内容可以声明 `"dynamic"`，但不能把持久批准扩展到任意未来内容。

技能身份是 Host 分配的服务器身份与技能 URI 的组合，不是名称。两个 Server 可以提供相同 URI 或相同 name，Host 必须保留来源并消歧。只看到 `skill://` 也不能推断资源一定是已登记技能，应从条目或明确引用的 `skills/get` 确认。

Host 只在需要时读取清单内文件，使用前验证原始字节大小与摘要，并比较正文 frontmatter。内容变化需要刷新条目和必要的新批准；嵌套 `SKILL.md` 作为参考读取，不自动激活其调用字段。脚本执行和 `allowed-tools` 权限效果仍需明确用户批准。

缓存也是来源契约的一部分。远程技能字节即使落到本地，也必须保留服务器身份，并排除在普通文件系统 Skill 扫描路径之外；否则一次缓存就能把外部说明变成下次启动的本地技能。缓存需要不可被模型及工具修改，或在每次使用时重新核对字节，不能只在首次下载验证。

批准绑定完整清单，而不是只绑定主文件摘要。脚本增加、参考文件删除或任何清单内摘要变化，都可能改变执行行为，因此需要撤销旧批准并按规则重新确认。目录查询也不能自动扩充已批准清单：新文件可见与新文件可用是两个不同状态。

## 30.5 一个真实摘要校验实验

下面是本章自包含的字节实验，不是完整 Skills 扩展 Client。它只证明清单一致性；字符串来自内存，不是服务器质量或可信度测量。

```js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const sha256 = (bytes) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const bytes = Buffer.from(
  '---\nname: inspect\ndescription: Inspect a fixture\n---\nRead only.\n',
  'utf8',
);
const manifest = {
  uri: 'skill://inspect/SKILL.md',
  size: bytes.length,
  digest: sha256(bytes),
};
function verify(resource, received) {
  if (received.length !== resource.size ||
      sha256(received) !== resource.digest) throw new Error('Manifest mismatch');
  return received.toString('utf8');
}
assert.match(verify(manifest, bytes), /Read only/);
const changed = Buffer.from(bytes);
changed[changed.length - 2] ^= 1;
assert.throws(() => verify(manifest, changed), /Manifest mismatch/);
assert.throws(() => verify(manifest, bytes.subarray(1)), /Manifest mismatch/);
console.log('raw size and digest verified');
```

摘要与清单相符不代表内容安全：恶意服务器同样能给恶意文件发布正确摘要。完整实现还需来源、批准、frontmatter、缓存和资源边界检查。本地 `labs/skills.mjs` 有来源和全文摘要实验，但没有 MCP 文件清单、远程读取或扩展协商，不能说两者等价。

## 30.6 失败案例与验收

第一个失败是 Host 宣称支持 Tasks 却只识别 `content`，收到任务句柄后报告空成功；第二个是读取了 Skill 资源便自动激活动态命令；第三个是把 Apps 消息桥当任意工具代理。共同问题是只实现结果形状，没有实现授权与生命周期。

运行摘要实验应观察同长度变更和大小变化均拒绝。真实扩展验收应分别覆盖未协商降级、任务重连与终态、技能清单变化、嵌套批准和 Apps 沙箱消息来源。本文未运行任何远程扩展服务，不提供跨产品支持率。

DeepSeek `0.2.1-alpha.5` 明确不支持 MCP tasks；其技能 registry 和动态 Cordis Web 扩展是不同能力，不能代称 Skills over MCP 或 Apps。其 MCP 桥遇到需要 task 执行的工具会拒绝，不应声称能恢复任务句柄。

## 30.7 当前扩展与 SDK 的迁移矩阵

核验日为 2026-10-23。核心 TypeScript SDK v2 已稳定，但旧核心 experimental tasks 已移除；不能继续把旧 `GetTaskRequestSchema` 注册写法当 v2 API。扩展应使用自己的 SDK / 导出入口，并分别验证 requester、receiver、wire 和 Host。

| 扩展 | 当前证据 | 推荐与迁移边界 |
| --- | --- | --- |
| Apps | Apps SDK 2.x 保留上一代 wire 兼容 | npm 主版本不是 UI wire 版本；检查 CSP、桥方法与父页面来源 |
| Tasks | Stable schema `2026-07-28`；官方 SDK receiver 文档仍限定 `2025-11-25` | requester 与 receiver 不对称；根入口不导出不能靠猜路径绕过 |
| Skills | SEP-2640 Final 与 Stable 规范 | 文件规范兼容不能代替远程清单、来源、批准与资源校验 |

Tasks 的现代规范与 receiver 实现限制并不矛盾于“协议已发布”：它们回答的是不同层的支持。确需现代 receiver 时，必须提供受该修订约束的实现与互通证据，不能将旧 receiver 代码改一个日期就声称支持。

练习：制作三份扩展能力记录，写明对端 wire、协商标识和 SDK 入口；分别注入未协商、任务句柄过期、技能清单改变和 Apps 错误消息来源。正常扩展应保留身份并完整结算；异常应按规则降级或拒绝，不得执行未经批准动作。排错先对照支持矩阵，再查 npm 版本，不从包名推断 Host 已集成。

依据：[Apps SDK](https://github.com/modelcontextprotocol/ext-apps)、[Tasks SDK 支持说明](https://github.com/modelcontextprotocol/ext-tasks)、[Skills 扩展](https://github.com/modelcontextprotocol/ext-skills)与[核心 v2 迁移](https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2)。跨产品验收接[第 73 章](./73-version-governance.md)。

## 30.8 固定官方来源

官方总览：[Extensions](https://modelcontextprotocol.io/extensions/overview)、[Apps](https://modelcontextprotocol.io/extensions/apps/overview)、[Tasks](https://modelcontextprotocol.io/extensions/tasks/overview)、[Skills](https://modelcontextprotocol.io/extensions/skills/overview)，核验日 2026-10-23。

已核对并固定原文：[Apps Stable 规范](https://github.com/modelcontextprotocol/ext-apps/blob/82221c0c8ce7661efa6771c9d461511b1650495f/specification/2026-01-26/apps.mdx)、[Tasks 仓库与版本表](https://github.com/modelcontextprotocol/ext-tasks/blob/899c1bbc869567670093face3591b39c28ce3219/README.md)、[Tasks 2026-07-28 schema](https://github.com/modelcontextprotocol/ext-tasks/blob/899c1bbc869567670093face3591b39c28ce3219/schema/2026-07-28/schema.ts)、[Skills Stable 规范](https://github.com/modelcontextprotocol/ext-skills/blob/c1aa87e4c381c82b99aa37471d0eae4ab50f9985/specification/stable/skills.mdx)。

DeepSeek 的[MCP 限制](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/mcp.md)与[task-required 拒绝源码](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/mcp/mcp-client/src/tools.ts)固定到 `0.2.1-alpha.5`。标准已发布、SDK 已支持、Host 已集成和教程已实现，是四个需要分别证明的结论。

---

上一篇：[第29章：MCP 缓存、订阅与故障恢复](./29-mcp-runtime-recovery.md) · 下一篇：[第31章：完整上下文装配与来源追踪](./31-context-assembly.md)
