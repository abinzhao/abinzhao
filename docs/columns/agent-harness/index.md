---
title: Agent Harness：从基础运行时到完整工程体系
description: 73 章系统学习 Agent、Skills、MCP、插件、上下文、沙箱、多 Agent、SDK、评测与版本治理，结合 DeepSeek Harness、Claude Code、Codex 和 OpenCode。
status: 系统教程 · 73 章
featured: true
---

# Agent Harness：从基础运行时到完整工程体系

模型提出行动，Harness 决定行动如何获得上下文、通过权限检查、执行、记录、恢复和交付。构建一个可靠 Agent，需要理解模型调用之外的整条链：指令与技能怎样装配，MCP 与插件怎样连接，沙箱限制什么，工具失败如何恢复，多 Agent 如何合作，以及最后如何验证任务确实完成。

本教程面向有 JavaScript / TypeScript 基础的开发者。前 12 章从零构建可运行的本地只读助手；13–73 章展开完整工程知识，并用独立代码实验、协议样例和官方实现对照讲清设计与失败边界。原 72 章地址保持不变，第 73 章补充版本治理与跨产品兼容验收。

[下载完整项目源码](/downloads/agent-harness.zip)

下载包使用 Node.js 22 原生 ESM、`fetch`、Web Streams、`AbortSignal` 和 `node:test`，没有第三方运行依赖。基础助手连接本机 Ollama，工具只能列出和读取指定工作区的文本文件；扩展实验在 `labs/` 中独立运行，不需要模型服务。

## 教程怎样连接实现与知识

| 层次 | 读者得到什么 | 能证明什么 |
| --- | --- | --- |
| 基础项目 · 01–12 | 插件作用域、流式适配器、文件工具、循环、会话、CLI 与 Web 的完整源码 | 本地只读助手的执行与拒绝契约 |
| 扩展实验 · `labs/` | 技能发现、精确审批、上下文分组、DAG 恢复与评测统计 | 五组机制的确定性行为 |
| 深入教程 · 13–73 | 协议、数据流、失败案例、代码与验收方法 | 如何设计、实现和验证更完整的 Harness |
| 产品对照 · 官方来源 | 固定版本的 DeepSeek、Claude Code、Codex、OpenCode 机制 | 特定产品的已公开行为，不是通用 API 承诺 |

“知识覆盖”与“已实现功能”分别验收。基础项目没有加入任意 Shell、操作系统强沙箱、远端 OAuth、多租户、真实多 Agent 或生产持久工作流；讨论这些能力的章节提供设计与验证路径。章内自包含实验会声明是否接入基础项目，示意消息不会被写成实际请求结果。

## 13 个学习单元

| 单元 | 章节 | 学习目标 |
| --- | --- | --- |
| 01 · 基础运行闭环 | [01–12](./01-contracts) | 从模块到 CLI、Web，完成本地只读助手 |
| 02 · Agent、模型与指令 | [13–18](./13-agent-foundations) | 控制模式、模型能力、消息协议、路由与指令层级 |
| 03 · Skills、插件与扩展 | [19–24](./19-skills-format) | 规范、发现、触发、分发、Cordis、Hooks 与 Mods |
| 04 · MCP | [25–30](./25-mcp-architecture) | Host / Client / Server、原语、传输、OAuth、恢复与扩展 |
| 05 · 上下文、检索与记忆 | [31–36](./31-context-assembly) | 装配、Token 压力、Spill、压缩、缓存、RAG |
| 06 · 会话与恢复 | [37–42](./37-event-surface) | 日志与模型表面、耐久存储、Fork、幂等、迁移、Steering |
| 07 · 工具与计算机操作 | [43–48](./43-file-editing) | 文件新鲜度、Shell、PTY、管线、PTC、浏览器观察 |
| 08 · 沙箱、权限与安全 | [49–54](./49-threat-model) | 注入威胁、文件和网络隔离、审批、凭据、对抗验收 |
| 09 · 多 Agent 与长任务 | [55–60](./55-subagent-delegation) | 委派、取消、Teams、工作树、DAG、Goal 与触发器 |
| 10 · SDK 与客户端 | [61–66](./61-harness-sdk) | 四类宿主、App Server、ACP / A2A、Web / IDE 与交付 |
| 11 · 测试与评测 | [67–70](./67-contract-fault-tests) | 故障注入、轨迹与产物评测、消融、OTel 与成本 |
| 12 · 生产验收 | [71–72](./71-performance-operations) | 性能、运维、完整工程验收与能力取舍 |
| 13 · 持续治理 | [73](./73-version-governance) | 证据锁定、SDK 迁移、协议兼容、升级准入与回滚 |

首次学习建议先完成 01–12，再走 13–30，随后学习上下文和安全。实现扩展功能时，可以从 19、25、31、49、55、61、67 七个入口进入相应单元；各章保留前后导航和独立验收步骤。

### 基础项目的 12 个里程碑

| 章 | 一个核心知识点 | 该章得到的能力 |
| --- | --- | --- |
| [01 · 服务契约](./01-contracts) | 用边界拆分 Harness | 建立从零项目目录与服务接口 |
| [02 · 插件生命周期](./02-plugin-lifecycle) | 注册必须有所有权 | 失败回滚与反向清理 |
| [03 · 流式模型](./03-streaming-provider) | 增量与结算分离 | 解码 SSE、组装工具调用 |
| [04 · 工具边界](./04-tool-boundaries) | 模型参数是不可信输入 | 校验参数、路径与文件大小 |
| [05 · Agent 循环](./05-agent-loop) | 每一步都需终止条件 | 模型、工具、结果的有限循环 |
| [06 · 会话回放](./06-session-replay) | 历史来自已结算事实 | 保存完整工具组与恢复历史 |
| [07 · 上下文预算](./07-context-budget) | 裁剪不能破坏协议 | 保留完整轮次并明确超限失败 |
| [08 · 取消与重试](./08-cancellation-retry) | 运行必须可停止 | 传播取消并限制重试范围 |
| [09 · 可观测性](./09-observability) | 事件连接状态与结果 | 关联运行、工具状态与耗时 |
| [10 · 行为测试](./10-behavior-tests) | 用确定性验证不变量 | 测试协议、恢复和拒绝路径 |
| [11 · CLI 组合](./11-cli-composition) | 入口只负责组装与资源 | 配置本地模型、恢复会话 |
| [12 · Web 传输](./12-web-transport) | UI 与执行解耦 | 流式显示、取消与同源边界 |

## 从下载包开始

解压后进入 `agent-harness/`。不需要执行 `npm install`：

```sh
node --version
npm test
npm run labs
node src/cli.mjs --help
```

`npm run labs` 会在临时目录建立技能文件、审批票据和工作流检查点，输出真实机制执行结果。评测部分使用明确标注的人工夹具验证统计；其中成功率不能解释为模型实测效果。完整步骤与限制见包内 `labs/README.md`。

模型服务另行安装。选择硬件可承载且支持工具调用的模型，以下 `qwen3:4b` 是一个具体可选项；实际运行以 `ollama list` 中的已安装名称为准：

```sh
ollama pull qwen3:4b
ollama list
MODEL=qwen3:4b npm start -- "阅读 guide.md，解释运行边界并引用文件路径"
MODEL=qwen3:4b npm run web
```

Web 默认地址 `http://127.0.0.1:8787`。首次下载模型需要网络，运行时只允许 loopback 模型地址。工作区默认使用下载包内的 `workspace/`，会话保存在当前目录 `.harness/`。

## 四个参考产品与版本边界

来源核验日期为 **2026-10-23**。下表是该日期查询官方发布记录与包元数据得到的可见版本，不是永远成立的 `latest`。产品版本、协议修订与 SDK 版本分别记录；“已发布”“类型可用”“目标环境实测通过”是三个不同结论。

| 产品 | 核验日可见发布 / SDK | 稳定性与教程边界 |
| --- | --- | --- |
| [DeepSeek Harness releases](https://github.com/deepseek-ai/deepseek-harness/releases) | `dsh-v0.2.1-rc.2`，提交 `687f282e8625c6b8d11ff58211a90524be2e4317` | RC 预发布，不能称稳定版；当前契约与原 alpha.5 历史证据分别标注 |
| [Claude Code changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md) | CLI `stable: 2.1.308`，`latest/next: 2.1.309`；[Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) `latest/next: 0.3.309` | 包与渠道独立，`latest` 不等同于该产品的 `stable`；闭源运行时按公开契约核对 |
| [Codex releases](https://github.com/openai/codex/releases) | 稳定 CLI / [SDK](https://www.npmjs.com/package/@openai/codex-sdk) `0.163.0` | `0.164.0-alpha.12` 为预发布，不替换稳定基线 |
| [OpenCode releases](https://github.com/anomalyco/opencode/releases) | CLI / [SDK](https://www.npmjs.com/package/@opencode-ai/sdk) `1.19.4`，提交 `148842ef7cb1bc34192b3fff57d0f9721ab9c801` | 1.x 已移除 session 分享；SDK 页面残留 share 方法不能证明服务仍支持 |

### 历史快照与当前能力分别阅读

章内 DeepSeek `0.2.1-alpha.5` / `1517a4dbca0a2789ff1d41ba439600f8547d23fa` 与 OpenCode `1.19.3` / `e3c4eb242585dcd77be1a867391b7c25fd47ce52` 链接是可复查的历史实现证据，不伪装成当前版本源码；Codex `83086188ae0614bd882818ff1aa23f3194962012` 则仍是当日稳定 `0.163.0` 基线。当前修订另引 RC.2 和 OpenCode `1.19.4` 固定文件，源码核验不等于厂商示例运行验收。

| 能力层 | 当前证据 | 使用原则 |
| --- | --- | --- |
| MCP 协议 | 固定修订页存在 `2026-07-28`；通用 [versioning 页面](https://modelcontextprotocol.io/specification/versioning)仍列 `2025-11-25` 为 Current | 官方入口有冲突；记录两者，按固定修订和对端实际协商，不把入口标签当唯一依据 |
| MCP TypeScript SDK | [v2 官方仓库](https://github.com/modelcontextprotocol/typescript-sdk)声明稳定线；分包 client / server `2.3.1`，旧整包 `1.32.1` | v2 是当前迁移方向；DeepSeek 固定依赖 client `2.2.0` 仍单独记录 |
| Apps / Tasks / Skills | 各自有 Stable 规范或 Final 提案 | 规范成熟不等于四个 Host 均支持；Tasks SDK receiver 有协议代际限制 |
| 自动审批 / Teams / 长任务 | 各产品机制和开关不同；Claude Teams 为实验能力，Channels 为 research preview | 实验功能单独准入；Channels 还有认证、组织开关和 MCP 代际限制，见[60](./60-schedules-webhooks.md) |
| ACP / A2A | ACP Schema `v1.26.0`、SDK `2.0.1` 默认 wire v1；A2A 稳定 `1.0.1` 使用 HTTP 版本 `1.0` | 包主版本与 wire 不同；A2A 绑定和异步说明内部冲突见[65](./65-acp-a2a.md) |

MCP SDK v1 是旧兼容线，不是新项目默认推荐。v2 迁移涉及包拆分、schema、handler 上下文、错误类型和扩展，详见[第 73 章](./73-version-governance)。没有目标平台实测时，教程只承诺说明公开契约与可执行验证方法。

### Node.js：Current 不等于 LTS

按 [Node.js Release schedule](https://github.com/nodejs/Release/blob/main/schedule.json)和[官方发行索引](https://nodejs.org/dist/index.json)，截至 2026-10-23：

| 分支 | 核验日状态 | 当日可见补丁 | 边界 |
| --- | --- | --- | --- |
| 22 | Maintenance LTS | `22.23.4` | 下载包的独立教学基线；EOL 为 2027-04-30 |
| 24 | Maintenance LTS，自 2026-10-20 起 | `24.22.1` | 不再写成 Active LTS；EOL 为 2028-04-30 |
| 26 | Current | `26.12.1` | LTS 计划日为 2026-10-28，核验日尚未到达 |
| 25 | 已 EOL | 不推荐作为新基线 | EOL 为 2026-06-01 |

DeepSeek RC.2 的上游清单声明 Node.js `^22.19.0 || >=24.0.0`、pnpm `11.28.5`；这些是安装约束，不是所有满足范围的 Node 分支都仍受安全支持。MCP v2 SDK 要求 Node `>=20`，Claude Agent SDK 要求 `>=18`，Claude CLI 要求 `>=22`；SDK 的最低要求不能证明外置 CLI 可运行，也不能据此推荐已 EOL 的运行时。下载包与本站不自动采用上游工程版本，不将上游类型名当作本项目导出 API。

版本来源包括 [Claude CLI 渠道](https://registry.npmjs.org/@anthropic-ai/claude-code)、[Agent SDK 0.3.309](https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk/0.3.309)、[ACP Schema 发布](https://github.com/agentclientprotocol/agent-client-protocol/releases/tag/schema-v1.26.0)、[ACP SDK 2.0.1](https://registry.npmjs.org/@agentclientprotocol/sdk/2.0.1)与[A2A 1.0.1](https://github.com/a2aproject/A2A/releases/tag/v1.0.1)。移动渠道以后会变化，应重新查询并记录日期。

## 完成标准与验证方法

项目应能真实发起模型流式请求、识别工具调用、拒绝越界参数、把结算消息保存到本地、在下一次运行恢复完成的历史，并在 CLI 或 Web 取消后终止请求。读者需要同时验收正常和失败路径：模型未启动、工具参数错误、流中断、上下文超限、重复请求和会话损坏。

自动测试使用确定性 HTTP 服务与 provider 替身验证协议和状态。它们不会代替真实模型推理，也不能证明事实引用准确率。本机模型的工具选择与回答质量，应使用随包 `guide.md` 的已知内容另行检查。

深入单元的完成标准不是背出术语。读者应能解释一条请求从来源、协议、准入、执行、结算到恢复的路径；给关键不变量写失败用例；区分错误、取消、未知副作用和成功；在真实模型或目标平台上验证确定性测试无法证明的部分。

| 验收对象 | 必须观察的证据 |
| --- | --- |
| 技能与扩展 | 来源、版本、触发、实际加载内容、权限和清理结果 |
| MCP | 协商修订、能力、原始调用与结构化结果、授权和断线恢复 |
| 上下文 | 实际请求表面、计量来源、完整工具组、被删除事实与交接材料 |
| 工具与沙箱 | 实际文件 / 进程 / 网络效果、拒绝原因、取消与资源回收 |
| 多 Agent 与工作流 | 委派边界、任务状态、依赖、工作树、恢复后的动作计数 |
| 评测与交付 | 任务集、轨迹、最终产物、验证命令、安全结果、缺失和不确定项 |

## Agent 与 Harness 知识地图

这张地图把常见能力拆成 39 个可检验领域。它覆盖本教程的工程范围；新的协议与产品能力仍需继续补充，不能把一个固定目录视为所有未来技术的穷尽证明。

| 领域 | 关键知识 | 章节入口 |
| --- | --- | --- |
| G01 · Agent 定义 | 决策、反馈、Workflow 与宿主职责 | [13](./13-agent-foundations) |
| G02 · 控制策略 | ReAct、规划、反思、验证门、终止 | [14](./14-agent-control-patterns)、05 |
| G03 · 模型能力 | Token、推理、工具、视觉、结构化输出 | [15](./15-model-capabilities) |
| G04 · 模型协议 | Messages、Responses、内容块与流式组装 | [16](./16-model-protocols)、03 |
| G05 · 路由与认证 | Provider、网关、降级、凭据引用 | [17](./17-model-routing) |
| G06 · 指令 | 系统层级、项目规则、环境事实、可信来源 | [18](./18-instructions-architecture) |
| G07 · Skill 格式 | 元信息、正文、引用、脚本、渐进加载 | [19](./19-skills-format) |
| G08 · Skill 生命周期 | 发现、冲突、显式调用、触发、权限 | [20–21](./20-skills-discovery) |
| G09 · 插件生态 | 格式、市场、版本、Cordis、所有权 | [22–23](./22-plugin-packaging)、02 |
| G10 · Hooks 与 Mods | 事件、中间件、拒绝、变换与清理 | [24](./24-hooks-mods) |
| G11 · MCP 基础 | Host / Client / Server、能力协商 | [25](./25-mcp-architecture) |
| G12 · MCP 原语 | Tools、Resources、Prompts 与结果 | [26](./26-mcp-tools-resources) |
| G13 · MCP 连接 | stdio、Streamable HTTP、版本迁移 | [27](./27-mcp-transports-versions) |
| G14 · MCP 授权与扩展 | OAuth、缓存恢复、Apps、Tasks、Skills | [28–30](./28-mcp-authorization) |
| G15 · 上下文装配 | 来源、工具定义、视觉输入、请求表面 | [31](./31-context-assembly) |
| G16 · 预算与 Spill | 真实计量、输出预留、工具懒加载、引用 | [32–33](./32-token-pressure)、07 |
| G17 · 压缩与缓存 | 剪枝、摘要、交接、稳定前缀 | [34–35](./34-context-compaction) |
| G18 · 检索与记忆 | 代码 / LSP、RAG、长期记忆与新鲜度 | [36](./36-retrieval-memory) |
| G19 · 事件与表面 | 事实日志、投影、模型消息与回放 | [37](./37-event-surface)、06 |
| G20 · 耐久存储 | 追加、flush、锁、崩溃恢复 | [38](./38-durable-storage) |
| G21 · 会话与迁移 | Resume、Fork、跨会话、格式与生命周期 | [39](./39-session-branching)、[41](./41-format-migrations) |
| G22 · 副作用与检查点 | 幂等、未知结果、结果重放 | [40](./40-checkpoints-side-effects)、[58](./58-durable-workflows) |
| G23 · 交互与并发 | Inbox、Steering、人类问答、计划模式 | [42](./42-input-concurrency) |
| G24 · 文件操作 | 路径、观察新鲜度、编辑、Diff | [43](./43-file-editing)、04 |
| G25 · 进程执行 | Shell / argv、环境、PTY、后台、SSH | [44–45](./44-shell-execution)、08 |
| G26 · 执行管线 | 校验、审批、工具结果、失败分类 | [46](./46-tool-pipeline) |
| G27 · 程序化工具调用 | Code Mode、PTC、受控 RPC 与资源预算 | [47](./47-code-mode-ptc) |
| G28 · 计算机操作 | 浏览器、截图、动作、观察闭环 | [48](./48-browser-computer-use) |
| G29 · 威胁与注入 | 数据与指令、混淆代理、越权 | [49](./49-threat-model) |
| G30 · 强隔离 | 文件系统、网络、进程、容器与虚拟机 | [50–51](./50-filesystem-sandbox) |
| G31 · 权限与供应链 | 审批、Auto-review、凭据、插件、探针 | [52–54](./52-permissions-approvals) |
| G32 · 子 Agent | 委派、继承、通信、等待、取消 | [55–56](./55-subagent-delegation) |
| G33 · Teams 与 DAG | 共享任务、工作树、结果协调 | [57–58](./57-teams-worktrees) |
| G34 · 长任务与触发 | Goal、预算、交接、Schedule、Webhook | [59–60](./59-long-running-goals) |
| G35 · SDK 与互操作 | 四产品宿主、App Server、ACP、A2A | [61–65](./61-harness-sdk) |
| G36 · 客户端与交付 | Web、IDE、桌面、附件、语音、资源 | [66](./66-clients-deliverables)、12 |
| G37 · 测试与效果 | 契约、故障、任务、轨迹、评测、消融 | [67–69](./67-contract-fault-tests)、10 |
| G38 · 运行与生产 | OTel、成本、性能、限流、泄漏、验收 | [70–72](./70-observability-cost)、09 |
| G39 · 版本与兼容治理 | 发布证据、迁移、协议矩阵、升级准入与回滚 | [73](./73-version-governance) |

## DeepSeek Harness 的 66 个子系统映射

以 alpha.5 历史提交的 [Subsystems 索引](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/README.md)为准。表中每个名称对应上游文档页，按职责映射到教程；它不是声称下载包实现了这 66 个子系统，也不是未经对账的 RC.2 子系统数量承诺。完整类型与事件应继续阅读固定源码。

| 子系统 | 教程映射 |
| --- | --- |
| boot、core、scope、typert | 01–02、13、23、61 |
| llm-streaming、token-meter、system-prompt | 03、15–18、31–35 |
| skills、extensions、claude-code-mods | 19–24、62 |
| mcp | 25–30 |
| session、session-query、session-title、session-reference | 06、37–39、41 |
| working-directory、worktrees、workspace | 39、43、50、57 |
| persistence、storage、settings | 17、38、41、61 |
| feedback、session-projection、conversation | 37、66、68 |
| compaction、spill、lsp | 33–36、43 |
| tools、filesystem、shell、subprocess | 04、43–46 |
| ssh、terminal、jobs、ptc-runtime | 44–47、51、56 |
| browser-use、computer-use、web | 36、48、51 |
| sandbox、approval、permission-presets、credentials | 49–54 |
| user-questions、commands、plan | 18、42、52、66 |
| subagent、agent-team、workflow | 55–58 |
| goal、schedule、todo、webhook | 57–60 |
| deliverables、attachment、office-to-pdf | 48、66、72 |
| voice-input、translation | 15、66 |
| web-server、web-client、client-modules | 12、61、66 |
| slots、client-resources、sidebar-right | 23、66 |
| session-telemetry、otel、product-telemetry | 09、70–71 |

选择生产能力时，从用户任务倒推最小集合。例如只读代码问答需要模型、检索、上下文、文件边界和引用验证；能够执行修改的代码 Agent 还需编辑新鲜度、进程隔离、审批、检查点与回归；长期自动化再引入调度、幂等、告警和恢复。第 72 章连接工程验收，第 73 章确保升级之后这些结论仍成立。
