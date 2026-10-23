---
title: '第73章：版本治理与跨产品兼容验收'
description: 用官方发布证据、协议矩阵、SDK 迁移、故障夹具和恢复门禁控制 Harness 升级，区分已发布能力与实际验证结果。
date: '2026-10-23'
category: 智能体工程
tags: [版本治理, SDK 迁移, MCP, 兼容验收, 回滚]
series:
  order: 73
---

# 第73章：版本治理与跨产品兼容验收

升级 Harness 不是替换一个版本号。CLI、SDK、模型 API、MCP wire revision、插件和会话格式各自变化；其中任何一层改变默认权限、结果事件或恢复方式，都可能让“上次测试通过”的结论失效。本章把版本看成需要证据和准入条件的工程变更，而不是追逐 `latest`。

本章官方来源核验于 **2026-10-23**。代码是独立、无网络和无外部写入的契约夹具，不能证明四个产品已经实际互通。原 72 章固定源码保留为历史基线；下载包没有因此升级依赖或增加新能力。

## 73.1 版本是一个向量

同一 CLI 可以调用不同模型、加载不同插件、接入不同 MCP 服务。生产记录至少需要以下信息：

| 维度 | 应记录的身份 | 为什么仅有版本号不够 |
| --- | --- | --- |
| CLI / runtime | 产品、精确版本、平台、制品摘要 | 平台二进制和打包依赖不同 |
| SDK | 包名、精确版本、导出入口、锁文件摘要 | CLI 同号不保证 SDK 契约同号 |
| 模型 | Provider、模型 ID、API 协议、能力配置 | alias 可漂移；工具与结构化输出能力不同 |
| MCP | Server 身份、wire revision、协商扩展、transport | SDK 2.x 不是 MCP 协议 2.x |
| 插件 / Skill | 来源、版本、完整清单摘要、批准身份 | 同名不等于同一供应链主体 |
| 持久状态 | schema 版本、checkpoint、工具效果状态 | 回滚二进制不能自动回滚外部副作用 |
| 策略 | 文件 / 网络 / 进程权限、审批与继承规则 | 安装成功不证明隔离策略仍生效 |

不要把 Token、授权码或原始敏感提示放进版本记录。可记录凭据引用与授权状态，不能记录其值。证据材料也需要脱敏和访问控制。

建议让每次可恢复运行引用一个不可变的版本记录 ID。恢复前比较版本向量；兼容性未知时暂停并人工确认，而不是拿新解释器直接继续旧事件流。

## 73.2 发布证据不是运行证据

| 证据层 | 能支持的结论 | 不能支持的结论 |
| --- | --- | --- |
| 官方 release / changelog | 厂商宣布了某个版本与改动 | 用户机器已安装该制品 |
| npm 元数据 / package.json | 精确包已发布、入口与 engines | 声明范围内每个 Node 分支都受安全支持 |
| 固定 tag / commit / 类型 | 该快照的实现和静态契约 | 后续版本仍完全相同 |
| 动态官方文档 | 当前页面所描述的用法 | 页面与已安装版本没有漂移 |
| 本地确定性测试 | 某个状态机或字段约束成立 | 真实模型、OAuth、GPU 或 OS 沙箱成立 |
| 目标环境端到端测试 | 指定配置下观察到的实际结果 | 其他平台、权限和版本也成立 |

版本发布事实通常依赖厂商一手证据；release 和同一厂商 npm 记录是交叉核对，不算两个独立研究主体。发生冲突时记录原文、查询日期、固定地址和受影响结论，不“投票”产生一个不存在的 API。

操作顺序是：查官方发布渠道，查对应包元数据，读取固定制品的类型和配置，再建立目标验收。没有发布证据时写“未核实”；没有运行证据时写“待实测”。切勿把文档核对写成“集成测试通过”。

## 73.3 核验日的产品基线

| 产品 | 2026-10-23 可见基线 | 升级时必须核对的变化 |
| --- | --- | --- |
| DeepSeek Harness | `dsh-v0.2.1-rc.2`，`687f282e8625c6b8d11ff58211a90524be2e4317` | 仍为 RC；发布说明增加 `DeepSeek-V4.1-Flash-1017` 和 Search / Fetch API，不把 alpha 已有能力重写成 RC.2 新增 |
| Claude Code | CLI `stable: 2.1.308`，`latest/next: 2.1.309`；Agent SDK `latest/next: 0.3.309` | 包与渠道独立；权限、沙箱、MCP 重连与 Hooks 修复涉及安全边界 |
| Codex | 稳定 CLI / SDK `0.163.0` | `0.164.0-alpha.12` 是预发布；SDK Thread 与 App Server 的协议分别验收 |
| OpenCode | CLI / SDK `1.19.4` | 1.19.1 已移除 session 分享；1.19.4 更新 Bun 以处理安全问题；不能以 SDK 页面残留方法声称分享仍可用 |

DeepSeek 原 alpha.5 固定文件作为历史来源保留，当前章节另标 RC.2 的对应契约；要将某项结论提升为 RC.2 结论，必须对对应文件、配置、类型和验收逐项对账。`engines.dsh` 优先级、旧权限分类调整、SDK `resume` / `wd` 和团队 Inbox 行为不能仅因看见 RC 汇总说明就被称为 RC.2 首次出现。

OpenCode 1.x 不自动升级到 2.x；官方 1.19.2 记录将跨主版本升级与普通升级分离。本章不对未核验的 2.x 发布状态或 API 作承诺。手动选择主版本属于单独迁移，不是补丁升级。

### Node 准入需同时满足两个条件

一是依赖 `engines`；二是 Node 官方维护状态。2026-10-23，Node 22 与 24 均为 Maintenance LTS；26 仍是 Current，计划于 2026-10-28 进入 LTS；25 已于 2026-06-01 EOL。当日发行索引可见 `22.23.4`、`24.22.1`、`26.12.1`。

DeepSeek RC.2 声明 Node `^22.19.0 || >=24.0.0`、pnpm `11.28.5`；MCP v2 SDK 声明 Node `>=20`，Claude Agent SDK 声明 `>=18`，Claude CLI 声明 `>=22`。SDK 能加载不代表外置 CLI 能运行；这些宽范围也不是安全维护承诺。下载包仍采用独立 Node 22 基线，运行前检查实际补丁，不擅自改本站或其他工程配置。

## 73.4 跨产品比较从动作契约出发

不同 SDK 的 `run`、`query`、`session`、`thread` 不是可以按名称替换的统一接口。应用层只统一用户真正需要的动作，并保留厂商原始终态和错误证据。

| 验收动作 | DeepSeek | Claude Agent SDK | Codex SDK / App Server | OpenCode Server / SDK |
| --- | --- | --- | --- | --- |
| 运行身份 | SDK 会话与事件 | session ID 与消息流 | Thread ID / turn | session ID 与事件 |
| 工作目录 | 固定版本 `wd` 契约 | query options `cwd` | Thread options `workingDirectory` | Server / Client directory 作用域 |
| 恢复 | SDK `resume` 的精确语义 | resume 指定会话；检查结算消息 | `resumeThread` 与 App Server resume 分别核对 | 会话持久状态与 prompt 接口 |
| 权限 | permission preset、审批与沙箱 | permissionMode、tools、Hooks、managed settings | approval policy 与 sandbox | permission 配置与服务端认证 |
| 取消 | 运行与子任务传播 | 取消控制与流关闭不能混同 | SDK abort 与协议取消不能混同 | 会话中止和订阅关闭分别验收 |
| 结构化输出 | 按固定 SDK 类型确认 | schema 加最终 result 检查 | turn `outputSchema` 与完整结果检查 | 根入口 / v2 的类型和 `format` 字段分别确认 |

“有 SDK”不是跨产品兼容证据。至少覆盖只读任务、参数拒绝、用户拒绝、取消、断线、恢复、错误和清理八条路径。无法表达某项能力的适配器应返回“不支持”，不得静默降低成无审批 Shell。

以结构化输出为例：模型回复是合法 JSON，仅证明解析成功。还要验证 schema、终态成功、业务不变量、引用来源以及没有产生未批准副作用。若某产品在中间事件给出 JSON，之后运行失败，不能交付这个中间值。

Claude SDK `0.3.309` 的 result 需同时核对 `subtype` 与 `is_error`，不能把 `success + is_error: true` 当正常产物；多条 result 的累计 `total_cost_usd` 不能相加。DeepSeek `WorkflowRun.result` 不 reject，失败检查依赖 `stopReason`，并在所有路径 await dispose。两个 SDK 都返回“结果”，其失败分支并不相同，见[62](./62-claude-code-sdk.md)与[58](./58-durable-workflows.md)。

### 插件与互操作的独立版本

当前 Agent Plugins 根 `plugin.json`、自动发现 `skills/` 和 `extensions.com.openai` 不与旧 `.codex-plugin` 清单混搭；Schema 与产品激活分别验收，见[22](./22-plugin-packaging.md)。ACP Schema 发布 `v1.26.0`、SDK `2.0.1` 与默认线上整数版本 `1` 也是三种身份，SDK `/experimental/v2` 不能自动代替默认稳定导出。

A2A 发布 `1.0.1` 使用 HTTP `A2A-Version: 1.0` 和 ProtoJSON 状态，不复用旧 0.3 方法名。该固定规范的订阅 REST 总表与 proto 存在 POST/GET 差异，消息概述与 `return_immediately` 默认阻塞定义也有冲突；必须记录并检查实际服务绑定，不能给出没有运行证据的“统一适配”。具体映射与取消验收见[65](./65-acp-a2a.md)。

## 73.5 MCP 双时代兼容矩阵

存在一处需要明确保留的官方资料冲突：通用 `specification/versioning` 页面仍将 `2025-11-25` 标为 Current，而固定 `2026-07-28` 页面已定义新协议，官方 TypeScript SDK 仓库也说明 v2 稳定线支持新代际。不能据此删除新规范，也不能断言所有部署都已升级。

| 契约 | 2025-11-25 | 2026-07-28 |
| --- | --- | --- |
| 建立协议关系 | initialize / initialized | 无 initialize；逐请求 `_meta` |
| 发现能力 | initialize 结果 | `server/discover` |
| 工具枚举 | `tools/list` 与 cursor | 仍用 `tools/list` 与 `nextCursor`；发现能力不是工具清单 |
| HTTP 元数据 | 旧版本与会话规则 | 版本、`Mcp-Method`、适用的 `Mcp-Name` 与 body 一致 |
| 交互请求 | 旧双向请求生命周期 | 通过 `input_required` 返回交互 |
| 订阅 | 旧订阅机制 | `subscriptions/listen` 显式请求流；首 ack 与通知须绑定 subscription ID |
| SSE 恢复 | 按旧 transport 契约 | 不支持 `Last-Event-ID` 恢复 |
| 扩展 | 按该代协商方式 | 逐请求与发现能力中的扩展协商 |

HTTP 现代探测遇到 400、404、405，且响应不是可识别的现代协议错误，才按规范考虑旧版回退。401、403 是授权问题，不得切换到无认证路径。现代“不支持版本”错误也不是进入 initialize 的理由。stdio 有自己的探测规则，不能直接套 HTTP 状态码。

现代 HTTP body 与头部不一致需要拒绝，不应在代理层修成“看起来能用”。非 ASCII 工具名的头部编码也有规范要求，应交给已验证 SDK 或按固定规范实现，不能把任意 Unicode 名直接写入 HTTP header。

现代工具变化订阅仍使用 `notifications/tools/list_changed`，但仅看到 discover 的支持声明不代表已收到变化订阅。`params.notifications.toolsListChanged`、首帧 ack、各帧 `_meta` 的 subscription ID 要分别测试，详见[26](./26-mcp-tools-resources.md#mcp-工具发现)。发现 cache TTL 缺省、零与负值也不能当作同一状态，旧列表必须在声明的失效边界更新，见[29](./29-mcp-runtime-recovery.md)。

### 一份无网络 wire 夹具

以下代码验证本教程明确选定的现代 `tools/call` 请求，不是完整 MCP 校验器，也不替代 SDK。只覆盖 ASCII 名、版本与方法一致性。

```js
import assert from 'node:assert/strict';

const request = {
  jsonrpc: '2.0',
  id: 'fixture-1',
  method: 'tools/call',
  params: {
    name: 'read_fixture',
    arguments: { path: 'guide.md' },
    _meta: {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientInfo': {
        name: 'tutorial-fixture', version: '1.0.0',
      },
      'io.modelcontextprotocol/clientCapabilities': {},
    },
  },
};
const headers = {
  'MCP-Protocol-Version': '2026-07-28',
  'Mcp-Method': 'tools/call',
  'Mcp-Name': 'read_fixture',
};
function validateFixture(body, h) {
  assert.equal(body.jsonrpc, '2.0');
  assert.equal(h['MCP-Protocol-Version'],
    body.params._meta['io.modelcontextprotocol/protocolVersion']);
  assert.equal(h['Mcp-Method'], body.method);
  assert.equal(h['Mcp-Name'], body.params.name);
}
validateFixture(request, headers);
assert.throws(() => validateFixture(request, {
  ...headers, 'MCP-Protocol-Version': '2025-11-25',
}));
assert.throws(() => validateFixture(request, {
  ...headers, 'Mcp-Name': 'write_fixture',
}));
const line = JSON.stringify(request) + '\n';
assert.equal(line.split('\n').length, 2);
assert.deepEqual(JSON.parse(line), request);
console.log('fixture metadata and stdio framing verified');
```

运行方式：将代码放进独立 `.mjs` 后用 Node 22 执行。正常路径应无断言失败；两个篡改路径必须被拒绝。还应增加缺失头部、错误方法和非 ASCII 名用例。这个结果不包含实际 Server、代理、OAuth 或重连测试。

## 73.6 MCP TypeScript SDK v2 迁移清单

2026-10-23 核验，官方 npm 的 `@modelcontextprotocol/client` 与 `@modelcontextprotocol/server` 为 `2.3.1`；旧整包 `@modelcontextprotocol/sdk` 为 `1.32.1`。官方仓库说明 v2 已是稳定线，v1 在 v2 发布后至少六个月保留安全支持。不能再把整个 v2 统称未发布实验版。

| 旧写法 / 习惯 | v2 迁移动作 | 失败时检查 |
| --- | --- | --- |
| 从整包导入所有角色 | 改为 client / server 分包及已导出的入口 | 不照搬不存在的深层导入路径 |
| 手工零散 schema shape | 按注册 API 提供 Standard Schema；Zod 用完整 `z.object(...)` | 检查固定类型，不只检查 JSON 示例 |
| handler 依赖旧 request schema 选择方法 | 按官方方法字符串注册契约迁移 | 确认请求类型与方法配对 |
| `extra` 上混用请求与 HTTP 字段 | 区分 `ctx.mcpReq` 与 `ctx.http` | stdio 下不要假设有 HTTP 信息 |
| 所有失败都按 `McpError` 处理 | 区分 `ProtocolError`、`SdkError`、`OAuthError` | 保留取消、授权、wire 和本地实现差异 |
| 旧核心 experimental tasks | 使用独立 Tasks 扩展并核对协议代际 | 不把 receiver 支持范围推断为 requester 的范围 |

官方 codemod 不能保证自动处理 monorepo 所有成员或通过依赖注入取得的无 import 用法。先在独立迁移分支盘点调用点，再执行工具，随后人工审查导入、错误分支、取消传播和授权。生成补丁只是候选变更，不是验收结果。

Apps v2 可兼容其上一代 wire，不能由此推断核心 MCP 全部兼容。Tasks 扩展的 Stable schema 是 `2026-07-28`，但官方 TypeScript SDK 文档仍限制 receiver 为 `2025-11-25`，且没有根入口导出。规范版本、npm 主版本、requester 和 receiver 四项必须分别写进矩阵。Skills SEP-2640 为 Final，同样不证明所有 Host 已实现。

## 73.7 安全更新要测试实际拒绝

Claude Code 2.1.309 的发布记录涉及 shell 启动文件、符号链接 `denyWrite`、`--mcp-config` 写权限、被禁用 MCP 的重连、teammate 工具限制继承和 PowerShell hook 的失败处理。测试应还原攻击条件：存在启动文件、链接、重连事件和子 Agent，而不只是读取最终配置。

Claude Agent SDK 0.3.309 修复了 managed settings 中 `disableAllHooks`、`disableSkillShellExecution` 及空 HTTP hook 白名单等字段的传递。空白名单是策略语义，不应被 truthy 判断丢掉。0.3.304 的 `suspendSseStream` / `resumeSseStream` 是传输暂停能力，不等于运行取消。

Claude Channels 仍是 research preview，当前支持 claude.ai 或 Console API key，并要求相应组织开关；第三方云认证不是等价路径。当前 Claude MCP 文档还说明，协商到 `2026-07-28` 的连接不注册 channel。新 MCP 能力存在不能推导 channel 也可用，详见[60](./60-schedules-webhooks.md)。

MCP OAuth 中动态 client registration 已被标为 deprecated；优先考虑 Client ID Metadata Documents 或已建立的注册信息。OAuth 2.1 仍为 draft，不将其描述成已经正式发布的 RFC。回调 issuer 必须精确比较，错误回调也要验证事务和 issuer，不能先处理 `error` 就跳过防混淆校验。

每项安全更新记录三份证据：修复前触发条件、修复后拒绝结果、合法动作仍能完成。只有拒绝而没有正常路径测试，可能只是把全部操作关闭；只有正常路径成功，则没有证明漏洞条件已被阻断。

## 73.8 升级门禁与未知结果

下面是应用层门禁夹具，不是厂商事件格式。它故意把“结果未知”保留为阻塞状态，不把网络断开折算成没有副作用。

```js
import assert from 'node:assert/strict';

function admitUpgrade(record) {
  if (!record.releaseEvidence || !record.exactArtifact) {
    return 'block:identity';
  }
  if (record.sideEffectState === 'unknown') return 'block:reconcile';
  if (record.pendingApproval) return 'block:approval';
  if (!record.schemaCompatible) return 'block:migration';
  if (!record.normalPath || !record.denialPath || !record.resumePath) {
    return 'block:verification';
  }
  return 'admit';
}
const fixture = {
  releaseEvidence: true, exactArtifact: true,
  sideEffectState: 'settled', pendingApproval: false,
  schemaCompatible: true,
  normalPath: true, denialPath: true, resumePath: true,
};
assert.equal(admitUpgrade(fixture), 'admit');
assert.equal(admitUpgrade({
  ...fixture, sideEffectState: 'unknown',
}), 'block:reconcile');
assert.equal(admitUpgrade({
  ...fixture, denialPath: false,
}), 'block:verification');
assert.equal(admitUpgrade({
  ...fixture, schemaCompatible: false,
}), 'block:migration');
console.log('upgrade admission fixture verified');
```

这些布尔值仅用于测试分支，不是实际测试报告。真实系统应引用具体证据对象、制品摘要、测试任务 ID 和结果位置，而非由操作人手动把所有值设为 `true`。

### 必须保留的正常与异常场景

| 场景 | 可观察完成标准 | 异常处理 |
| --- | --- | --- |
| 只读任务 | 相同夹具输入得到 schema 合法终态，文件不变 | 保留厂商错误，不从 partial event 交付 |
| 权限拒绝 | 文件、进程、网络均未出现被拒动作 | 停止而非降级到无约束工具 |
| MCP 断线 | 读工具按策略恢复，写工具效果次数有记录 | 未知写效果先查询 / 对账 |
| 旧会话恢复 | 已结算工具组保留；未结算步骤可识别 | 不兼容 schema 禁止续跑 |
| 用户取消 | 运行、子任务和临时资源状态分别可见 | 取消意图不冒充外部动作已停止 |
| SDK 结构化输出 | schema 与业务校验通过且运行成功 | 解析成功但终态失败仍是失败 |
| 回滚 | 旧制品、配置与可读 checkpoint 可用 | 不反向“撤销”未确认可逆的外部写入 |

## 73.9 回滚不是重放全部历史

升级前保存已结算 checkpoint 和旧制品身份；待审批票据不要无条件跨版本复用。新版本改变工具定义、路径解析或权限继承时，原批准范围可能已不对应实际动作，需要重新批准。

如果新版本已迁移会话格式，先确认旧读取器能否读取；不能就隔离新旧状态，使用已验证的迁移或人工交接。不要直接编辑事件日志令旧程序“解析成功”，也不要通过丢弃错误行掩盖数据损坏。

外部写入分为可查询、可逆和不可逆三类。回滚时先查询未知状态，再按服务的幂等或补偿契约处理；删除本地 checkpoint 不会撤回已经发出的邮件、发布或数据库写入。恢复操作需要自己的权限与审计。

## 73.10 排错与练习

| 现象 | 优先检查 | 不应采用的补救 |
| --- | --- | --- |
| 文档方法存在，Server 返回不存在 | 精确版本、导出入口、release 删除记录 | 盲目改 HTTP 路径或忽略错误 |
| MCP 401 后无法发现 | resource / issuer / metadata / 用户取消 | 回退到无认证旧协议 |
| 更新后旧会话不能续跑 | schema 与工具组、pending action | 截断日志直到程序能启动 |
| 取消 UI 后仍有工具效果 | 流关闭与运行 abort、子任务传播 | 把 UI 不再显示解释为已停止 |
| 升级后写工具次数增加 | 重连重试、幂等键、未知效果查询 | 把所有请求无限重发 |

练习一：为一个已安装产品制作版本向量，所有事实引用固定证据，没有实测的格子写“待验证”。练习二：给 wire 夹具加入缺失版本、错误工具名、换行参数，说明哪些只是本地断言，哪些需要真实 transport。练习三：设计旧会话恢复测试，注入“工具完成但响应丢失”，观察升级与回滚都不能重复副作用。练习四：选择一条安全发布记录，分别设计合法路径、漏洞触发和资源清理验收，不使用真实凭据。

完成本章不要求同时安装四种产品。最低交付是一个有证据的版本矩阵、明确的迁移差异、可重复的正常与异常验收，以及可执行的回滚 / 对账步骤；它们不能由“已升级到最新”一句话替代。

## 73.11 官方来源与核验边界

以下来源于 2026-10-23 核验；动态地址后续可能变化。产品 release 与包元数据用于发布事实，固定源码与类型用于 API 事实，规范用于 wire 事实，三者不互相替代。

- [DeepSeek RC.2 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.2)、[RC.2 package.json](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/package.json)。
- [Claude Code CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)、[Agent SDK changelog](https://github.com/anthropics/claude-agent-sdk-typescript/blob/main/CHANGELOG.md)、[TypeScript SDK reference](https://platform.claude.com/docs/en/agent-sdk/typescript)。
- [Claude CLI 渠道元数据](https://registry.npmjs.org/@anthropic-ai/claude-code)、[SDK 0.3.309 元数据](https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk/0.3.309)、[Channels 文档](https://code.claude.com/docs/en/channels)、[MCP 文档](https://code.claude.com/docs/en/mcp)：版本渠道、运行前提、类型制品与 channel 限制。
- [Codex 0.163.0 release](https://github.com/openai/codex/releases/tag/rust-v0.163.0)、[固定 SDK 类型](https://github.com/openai/codex/tree/rust-v0.163.0/sdk/typescript/src)。
- [OpenCode 1.19.4 release](https://github.com/anomalyco/opencode/releases/tag/v1.19.4)、[1.19.1 删除分享记录](https://github.com/anomalyco/opencode/releases/tag/v1.19.1)、[1.19.2 升级记录](https://github.com/anomalyco/opencode/releases/tag/v1.19.2)、[SDK 文档](https://opencode.ai/docs/sdk/)。
- [MCP 通用 versioning](https://modelcontextprotocol.io/specification/versioning)、[固定 2026-07-28 versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)、[现代 HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)、[authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)。
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)、[v2 migration](https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2)、[Apps SDK](https://github.com/modelcontextprotocol/ext-apps)、[Tasks SDK](https://github.com/modelcontextprotocol/ext-tasks)、[Skills 扩展](https://github.com/modelcontextprotocol/ext-skills)。
- [Node Release schedule](https://github.com/nodejs/Release/blob/main/schedule.json)、[Node 发行索引](https://nodejs.org/dist/index.json)。
- [Agent Plugins 1.0.0 Schema](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json)、[ACP v1.26.0](https://github.com/agentclientprotocol/agent-client-protocol/releases/tag/schema-v1.26.0)、[ACP SDK 2.0.1](https://registry.npmjs.org/@agentclientprotocol/sdk/2.0.1)、[A2A 1.0.1 规范](https://github.com/a2aproject/A2A/blob/v1.0.1/docs/specification.md)与[proto](https://github.com/a2aproject/A2A/blob/v1.0.1/specification/a2a.proto)：插件和互操作独立版本及冲突依据。

本章没有运行四产品 SDK、真实 OAuth、强沙箱或模型推理，也没有修改下载包。确定性夹具通过只能支持它们对应的断言，不构成生产就绪证明。

---

上一篇：[第72章：完整 Harness 工程验收](./72-production-capstone.md) · 返回：[课程路线](./index.md)
