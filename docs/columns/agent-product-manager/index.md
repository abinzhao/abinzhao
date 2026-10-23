---
title: Agent 产品经理：从任务发现到受控上线
description: 16 章系统学习 Agent 产品经理的职责、调研、技术边界、需求与交互、权限恢复、评测统计、商业预算、安全合规、增长运维和求职作品集，以受控知识与工单助手完成全流程实战。
status: ongoing
featured: true
---

# Agent 产品经理：从任务发现到受控上线

Agent 产品管理的核心，是把不确定的模型行为转化为有价值、有边界、能验收、可恢复的用户任务。会调用模型、会写提示词或能演示工具调用，都不等于完成产品管理：还必须知道用户为什么需要它、哪些动作不能自动执行、如何证明效果，以及失败后谁来接手。

本课程面向希望转入 AI 产品岗位的产品经理、业务负责人、设计师与工程师。不要求预先掌握模型训练，但需要愿意阅读任务记录、理解 API 输入输出、核对业务状态和完成基础统计。课程覆盖产品全生命周期，不提供“行业统一岗位等级”“必考模型排行榜”或未经测量的收益承诺。

## 学习路线与交付物

建议按四个阶段推进。下表中的章节编号是连续的学习顺序，不代表岗位职级；学习周期由基础、可访问的数据与协作者决定，不承诺固定周数即可求职成功。

| 阶段 | 章节 | 完成后能做什么 | 必须交付 |
| --- | --- | --- | --- |
| 发现与判断 | 01–04 | 分清岗位责任、识别值得自动化的任务、决定是否需要 Agent | 能力地图、任务研究、价值假设、架构决策 |
| 规格与控制 | 05–08 | 把知识、工具、记忆、交互、审批和恢复写成可执行契约 | 知识规格、工具卡、PRD、状态与权限表 |
| 测量与经营 | 09–12 | 设计指标和评测，估算预算，选择模型与部署模式 | 数据字典、评测计划、统计报告、成本与选型记录 |
| 治理与交付 | 13–16 | 管理安全与合规、实验增长、上线运维和岗位作品集 | 威胁模型、实验卡、运行手册、完整案例档案 |

### 16 章完整目录

| 章 | 内容 | 该章核心交付物 |
| --- | --- | --- |
| [01 · 岗位职责与能力地图](./01-role-and-capability-map) | 结果责任、组织边界、能力分层、工作节奏 | 岗位责任书与能力证据表 |
| [02 · Workflow、Agent 与适用性](./02-workflow-agent-fit) | 控制权、自治程度、架构取舍、多 Agent 门槛 | 自动化适用性决策记录 |
| [03 · 用户研究与任务发现](./03-user-research-task-discovery) | 观察、访谈、任务拆解、反例和授权取样 | 研究计划与任务卡 |
| [04 · 价值主张与产品定位](./04-value-and-product-strategy) | 用户价值、替代方案、可证伪假设、机会排序 | 产品策略一页纸 |
| [05 · LLM、RAG 与知识边界](./05-llm-rag-knowledge) | 生成与检索、证据、权限、新鲜度和知识治理 | 知识回答契约 |
| [06 · 工具、MCP 与记忆](./06-tools-mcp-memory) | 执行契约、协议、连接信任、记忆生命周期 | 工具卡与记忆规格 |
| [07 · PRD 与 Agent 交互](./07-prd-and-interaction) | 用户故事、状态、澄清、证据、可访问性 | 可验收 PRD 与交互文案 |
| [08 · 人工介入、权限与恢复](./08-human-control-and-recovery) | 精确审批、幂等、未知结果、取消和交接 | 审批与失败恢复矩阵 |
| [09 · 数据体系与产品指标](./09-data-and-metrics) | 事件、分母、缺失、质量、任务漏斗和隐私 | 数据字典与指标说明 |
| [10 · 离线评测与统计判断](./10-offline-evaluation-statistics) | 数据集、评分、配对比较、置信区间和污染 | 评测设计及统计练习 |
| [11 · 在线实验、反馈与因果](./11-online-experiments-feedback) | 随机化、样本量、SRM、护栏、反馈偏差 | 预注册实验卡 |
| [12 · 成本、延迟、选型与隐私](./12-economics-model-selection-privacy) | 全成本、ROI、预算、模型组合、BYOK 与本地化 | 商业测算和选型决策 |
| [13 · 安全威胁与合规边界](./13-security-and-compliance) | 提示注入、外泄、供应链、法规适用性 | 威胁模型与合规待办 |
| [14 · 路线图、实验与增长](./14-roadmap-and-growth) | 阶段门、依赖、激活留存、定价与退出条件 | 有证据门槛的路线图 |
| [15 · 上线、运维与持续改进](./15-launch-operations) | 灰度、SLO、告警、事故、回滚与知识更新 | 上线清单和运行手册 |
| [16 · 完整案例、协作与求职](./16-capstone-collaboration-portfolio) | 串起完整产品案例、评审分工、作品集与面试 | 可审阅的案例档案 |

## 贯穿案例的教学假设

课程采用虚构的“澄明服务台”，为虚构租户 `tenant-lab` 设计受控知识与工单助手。用户是服务台专员；任务是检索已授权的内部手册、形成带证据的答复草稿，必要时建议工单字段修改。它不是某家企业的真实系统，也没有真实用户、订单、密钥、工单或效果数据。

首版默认只读。后续章节讨论的写入能力，只有在身份、租户、字段白名单、审批票据和幂等契约都通过后，才允许执行；不自动退款、不发送外部消息、不修改账户权限、不处理人事裁决。具体限制是教学设计，不是所有 Agent 的标准功能。

案例中的 `KB-LAB-*`、`TICKET-LAB-*`、政策文本和数字，均为明确标注的教学样例。第 10 章的合成夹具只用于验证统计口径与计算，不是模型实测；预算属于敏感性分析，不是市场价格或业务收入。没有执行的研究、模型调用、实验、安全攻防与上线，一律写“未执行”或“未测”，不能从模板推导已验证结论。

## 每章的使用方法

每章包含学习目标、机制原理、填好关键字段的交付样例、验收方法、失败案例、工作坊和完成标准。样例是可替换字段的起点，不是只留下几个空格的表格；迁移到实际项目时，必须重新取得授权、替换假设并保存证据。

1. 先读原理，能用自己的话解释因果与失效条件。
2. 再改交付样例，写清输入、输出、责任、拒绝和验收。
3. 用正常、边界、恶意与未知结果四类场景走查。
4. 留下产物与缺口，不能把“文档完整”当成“产品已上线”。

没有业务数据时，可以完成文档走查和明确标注的人工夹具练习。不得为了充实作品集编造访谈引语、模型结果、上线截图、付费客户或收益。

## 核验日期与证据等级

**资料核验日期：2026-10-23。** 本课程通过官方页面正文与官方发布信息核对机制；旧文章保留原始发布日期，不因本次访问而变成“2026 年新标准”。动态 API 页面可能继续变化，实施时应再核对实际账号、模型、区域、协议修订与 SDK 能力。

| 表述类别 | 证据使用方式 | 不可以推导什么 |
| --- | --- | --- |
| 官方契约 | 对应厂商 API 或 MCP 指定修订的文档 | 所有模型、SDK 和部署区域都可用 |
| 官方产品实践 | 厂商工程文章与 GitLab 公开岗位实践 | 行业统一职责、必然效果或普遍收益 |
| 统计方法 | NIST 统计手册与可靠实验研究 | 小样本夹具能证明真实用户效果 |
| 法规原文 | 官方发布文本，明确地域、角色与业务条件 | 教程构成法律意见或完整合规认证 |
| 教学建议 | 本课程推导的产品设计和案例假设 | 已经过真实模型、用户或生产验证 |

主要判断做交叉核对：Agent 的控制循环结合 Anthropic 的模式与评测实践、OpenAI 工具执行流程理解；安全结合 OpenAI、MCP 与 OWASP；评测结合 OpenAI、Anthropic、NIST 和 Microsoft Research。某一家厂商独有的能力仅在该厂商范围成立，不包装成跨厂商结论。

### 当前资料边界

MCP 的 `latest` 入口在核验时指向 `2026-07-28` 修订，本课程引用具体修订页，不沿用旧修订细节，也不把“入口指向该修订”解释为所有客户端已经支持全部扩展。接入必须核对目标客户端、服务端及其能力协商。

Anthropic 的 2024 年《Building effective agents》页面明确提示工具生态已经变化，并指向 2026 年 Managed Agents 实践。课程保留其 Workflow 与 Agent 的控制权区分，同时参考新的会话、执行与凭据分离思路；不照搬旧 SDK 接口。Claude Platform 工具 API 的具体接口与区域可用性未在本课程完成核验，接入前须查实际账号与区域对应的文档。

OpenAI 的模型名、价格、上下文长度和保留策略按模型、功能与账号变化，因此不固定“最新模型排行榜”或价格表。API 数据不用于训练的默认政策，不等于不传输、不保留或第三方 MCP 不接收数据。法规则需按实际产品和地域重新评估；本课程没有完成特定企业的法律尽调。

## 官方参考台账

以下来源均于 **2026-10-23** 核验。各章在事实附近引用相关原文，末尾保留阅读入口。除明确说明外，核验为网页正文阅读，不代表已经调用其 API、运行其 SDK 或逐段审计所有关联材料。

| 编号 | 官方来源与日期范围 | 核验用途及限制 |
| --- | --- | --- |
| S01 | [GitLab Product Manager](https://handbook.gitlab.com/job-families/product/product-manager/) · 动态岗位手册 | 决策、结果与协作责任；仅代表 GitLab 的公开实践 |
| S02 | [Anthropic：Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) · 2024-12-19 | Workflow、Agent 与复杂度；页面含新实践更新提示 |
| S03 | [OpenAI：Function calling](https://platform.openai.com/docs/guides/function-calling) · 动态 API 文档 | 模型提出工具调用、应用执行与回传；不保证业务正确性 |
| S04 | [MCP 2026-07-28 Specification](https://modelcontextprotocol.io/specification/2026-07-28) | Host、Client、Server、原语与信任原则；`latest` 入口另核对 |
| S05 | [MCP：Authorization Security Considerations](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations) | 令牌受众、权限和混淆代理；按传输及实际授权架构适用 |
| S06 | [Anthropic：Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) · 2025-09-29 | 上下文预算、检索、摘要与记忆；不采用泛化效果数字 |
| S07 | [OpenAI：Evaluation best practices](https://platform.openai.com/docs/guides/evaluation-best-practices) · 动态文档 | 任务评测、持续评测与人工校准；示例阈值不是本课程标准 |
| S08 | [Anthropic：Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) · 2026-01-09 | Task、Trial、Grader、Trace、Outcome 与重复运行 |
| S09 | [Microsoft Research：Three Key Checklists](https://www.microsoft.com/en-us/research/publication/three-key-checklists-and-remedies-for-trustworthy-analysis-of-online-controlled-experiments-at-scale/) · 2019 | 实验前、运行中与分析阶段的质量控制；研究实践，不是通用样本量或上线阈值 |
| S10 | [NIST：Confidence intervals](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm) | 二项比例 Wilson 区间；独立性和取样假设另行检查 |
| S11 | [OpenAI：Latency optimization](https://platform.openai.com/docs/guides/latency-optimization) · 动态文档 | 减少生成、请求、合理并行与非模型替代；不照搬示例改善比例 |
| S12 | [OpenAI：Data controls](https://platform.openai.com/docs/guides/your-data) · 动态文档 | 训练、滥用日志、应用状态与端点限制；需账号和合同复核 |
| S13 | [OpenAI：Safety in building agents](https://platform.openai.com/docs/guides/agent-builder-safety) · Agent Builder 文档 | 注入、数据外泄、结构化边界、审批；不是绝对安全保证 |
| S14 | [Anthropic：Scaling Managed Agents](https://www.anthropic.com/engineering/managed-agents) · 2026-04-08 | 会话、Harness、执行环境与凭据分离；是特定产品实践 |
| S15 | [OWASP GenAI Security 项目入口](https://owasp.org/www-project-top-10-for-large-language-model-applications/) | LLM 与 Agent 风险阅读入口；项目已扩展，不固定旧榜单为最新 |
| S16 | [NIST：Generative AI Profile](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence) · 2024-07-26 | AI RMF 配套风险治理资料；发布元信息与官方摘要核验，非全文合规审计 |
| S17 | [《个人信息保护法》](https://www.cac.gov.cn/2021-08/20/c_1631050028355286.htm) · 2021-08-20 | 第 3、24、38–40、55–56 条等；具体适用及后续规则由法务核对 |
| S18 | [《生成式人工智能服务管理暂行办法》](https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm) · 2023-07-13 | 第 2 条公众服务范围、第 17 条条件；不是所有内部应用都适用 |
| S19 | [《人工智能生成合成内容标识办法》](https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm) · 2025-03-14 | 第 2 条范围、显隐式标识与导出；自 2025-09-01 施行 |
| S20 | [GDPR：EUR-Lex 整合文本](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:02016R0679-20160504) | 第 3、22、35 条；整合文本是阅读工具，法律判断需正式公报与现行解释 |

法规参考不穷尽欧盟 AI Act、行业监管、劳动、医疗、金融、未成年人、知识产权、跨境数据和地方规定。不得把“表格中没有列出”解释为没有义务，也不得因内部部署就推断不受个人信息保护规则约束。

## 整体完成标准

毕业产物应能让另一名协作者复核：研究证据如何支持任务选择，架构为何需要或不需要 Agent，知识和工具如何受控，审批如何绑定实际动作，失败如何恢复，评测如何处理缺失，成本如何结算，以及何时停止扩量。

文档验收要求各项规则可追溯到输入、状态或证据；实践验收则需要真实且已授权的运行记录、目标环境检查和独立判定。课程提供完整学习材料与案例规格，不声称已经构建、发布或验证一款生产 Agent。

开始学习：[01 · 岗位职责与能力地图](./01-role-and-capability-map)。
