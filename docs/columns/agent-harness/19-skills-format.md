---
title: '第19章：Skill 规范与渐进式加载'
description: 从 SKILL.md 的开放格式到宿主加载契约，解释元数据、正文和资源的分层，以及厂商字段的兼容边界。
date: '2026-10-17'
category: 智能体工程
tags: [Agent Skills, SKILL.md, 渐进式加载]
series:
  order: 19
---

# 第19章：Skill 规范与渐进式加载

Skill 是可复用的任务说明及其配套材料，不是把任意 Markdown 换个文件名。它的价值在于让宿主先知道“何时值得加载”，再在实际任务需要时读取详细流程。把所有 Skill 正文放进初始提示，会消除这种分层，也让无关流程挤占当前证据。

本章先核对上游技能文档，再与第四章只读边界对照。原 `local-harness-tutorial` 没有技能注册、YAML 解析或 `skill` 工具；下方示例是作者可采用的资源格式，不代表原项目已自动扫描这些文件。

## 19.1 开放格式解决什么

Agent Skills 规范要求目录至少包含 `SKILL.md`，文件前部是 YAML frontmatter，后面是 Markdown 正文。`name` 和 `description` 必填：名称用于稳定寻址，描述同时说明做什么以及何时使用。目录还可以放脚本、参考资料和静态资源。

名称、描述的限制用于发现与路由，并不验证流程正确。一个格式合格的 Skill 仍可能要求泄漏数据、无限重试或跳过测试。许可证和兼容性说明帮助使用者判断能否采用，但不应被当作程序权限。宿主需要独立决定文件读取、代码执行及外部调用。

截至 2026-10-17，规范将 `allowed-tools` 标为实验字段，支持因实现而异。不能因为字段出现在开放规范中，就假设所有产品解释相同的工具名称、通配语法或授权效果。格式兼容是最低层，执行语义兼容需要逐产品核对。

## 19.2 写出可以执行的说明

下面是一份完整、仅提供只读分析流程的 Skill 示例。它应位于作者自己的隔离目录 `evidence-summary/SKILL.md`，本章不在项目中安装它。没有配套资源引用，读者不需要寻找缺失文件。

```markdown
---
name: evidence-summary
description: Summarize supplied text with exact quotations. Use for source-grounded summaries, not for editing or publishing.
license: MIT
compatibility: Requires a host capable of reading the user-authorized text.
metadata:
  author: tutorial
  version: "1.0"
---

# Evidence Summary

Input: a user-authorized text document and a summary question.

1. Read the document through the host's authorized read path.
2. Record its source identifier and any truncation indicator.
3. Select at most three quotations relevant to the question.
4. Separate quoted facts from interpretations.
5. If reading fails or material is truncated, describe the limitation.

Output: a short summary, quotations, and the source identifier.

Do not edit files, execute commands, or send the document to another service.
The instruction file grants no permissions beyond the host's existing policy.
```

这个例子规定输入、动作、失败与输出，而不是只有“你是专家”的人格说明。具体流程可以被观察：是否真实读取，是否标注来源，是否把推断与引文分开。正文写“不得修改”有助于模型理解，但真正阻止写入的仍是工具集合与执行政策。

## 19.3 渐进加载的运行时契约

发现阶段读取元数据，向模型提供可选择目录；选择阶段按身份加载正文；需要细节时再读取被正文明确引用的资源。脚本的存在不代表必须执行，更不代表宿主应该在发现时运行它。

```text
技能目录 -> 元数据解析 -> 可见目录
                             |
                      用户或模型选择
                             |
                     权限检查 -> 正文加载
                             |
                    按需读取参考或资源
                             |
                  普通工具准入 -> 实际动作
```

路径解析必须以技能资源根为基准，并保持来源。正文引用 `references/checklist.md`，不能让模型任意改变资源根；远程资源也不能悄悄映射成全局可信本地文件。第四章检查工作区文件的原则仍适用，但其简单工具没有 Skill 专用资源解析器。

生产解析 YAML 应使用真正的结构化解析器。用正则提取 `name:` 无法正确处理引用、折叠字符串、注释和重复键。原项目保持无依赖，独立 labs 因而只实现明确标注的单行元信息教学子集，不能把这个解析器用于完整规范验收。

实际文件读取、目录记录与正文加载全部见示例根 `labs/skills.mjs`：

<<< @/../examples/agent-harness/labs/skills.mjs{js}

`discoverSkills()` 返回名称、描述、来源限定标识、文件定位与全文摘要，不返回 `body`。它实际读过整个文件，因此“正文未进入目录”只表示没有把正文送进模型上下文，不表示省掉磁盘读取。`loadSkill()` 重读全文、比较摘要，成功后才返回正文；脚本和引用文件没有加载路径。

上面完整 Skill 示例含许可证和嵌套 metadata，不能直接拿来验证 labs 的完整 YAML 支持。实验夹具应采用其实际支持的单行名称与描述；开放格式正确性和教学解析器接受性是两个独立目标，后者通过不能推导前者全覆盖。

## 19.4 四个实现不能混为一种规范

| 实现 | 已核对行为 | 移植时不可假设 |
| --- | --- | --- |
| Agent Skills | 必填名称描述，元数据、正文、按需资源 | 实验授权字段普遍生效 |
| Claude Code | 开放格式加调用控制等扩展 | 动态命令、子 agent 字段跨产品有效 |
| Codex | 初始目录含名称、描述、路径，按需读正文 | Claude frontmatter 就是 Codex policy |
| OpenCode | 原生 skill 工具，支持明确的字段集合 | 未识别 frontmatter 会报错或执行 |

Claude Code 的 `disable-model-invocation` 和 `user-invocable` 是调用控制扩展；Codex 的可选 `agents/openai.yaml` 有自己的隐式调用政策；OpenCode 官方页面说明未知 frontmatter 被忽略。最危险的迁移不是立即报错，而是字段被忽略后使用者仍相信限制存在。

DeepSeek 固定版本本地 provider 既接受目录包，也接受平铺 Markdown，并不支持任意递归 `**/SKILL.md` 发现。其 registry 规范化模型和用户调用两个布尔值，consumer 负责目录和加载。这是该实现的明确行为，不是开放规范强制所有宿主采用的布局。

## 19.5 失败案例：省 Token 的目录反而触发错流程

描述过短如“处理文档”，会匹配总结、编辑、转换和发布等不同请求；模型无法据此选择。描述过长又可能被目录预算裁剪，把关键排除条件截掉。应把主要使用场景和关键边界前置，详细流程留在正文，不靠目录承担整份操作手册。

正文过度引用也是问题。引用链层层嵌套，会迫使模型先加载大量材料才知道下一步，渐进加载退化为隐式全量加载。资源应按任务阶段明确命名，并描述什么时候需要，不使用“先读完本目录所有文件”这种无界要求。

还有供应链错误：作者把发布脚本放在 `scripts/`，用户仅请求查看 Skill，宿主却在发现时执行脚本。扫描应该是读取元数据，不是插件安装，也不是预热脚本；执行必须走独立授权与工具管线。

## 19.6 实验与可观察验收

在已安装且获准使用的目标宿主中，以隔离目录放置上述示例。先问一般编程问题，确认不应触发；再明确请求对授权文本生成证据总结，观察正文加载；最后请求发布文档，确认描述边界和实际工具政策均不授予发布。

实验记录分开统计目录可见、正文读取、资源读取和工具执行次数。首次启动只出现元数据并不证明技能执行成功；正文读到了但没有结果也不算工作流闭环。修改正文后再次调用应核对当前读取内容，不能仅看目录名称未变化。

若没有目标宿主，就做静态验收：frontmatter 必填字段齐全、名称与目录一致、每步有输入输出、失败不扩大权限、资源引用可定位。从示例根运行 `npm run labs`，输出中的 `skills.metadataCount` 应为一，`skills.bodyLoaded` 应为 true；再运行 `node --test --test-name-pattern="skill" test/labs.test.mjs`，验证目录没有正文、歧义拒绝和内容变更拒绝。

这些命令使用临时夹具、不请求模型，不能测量自动触发质量。观察初始目录的 JSON 不含正文，可以证明渐进暴露；观察加载后的 `body` 非空，可以证明读取完成。若要证明宿主真的采用了流程，还需要模型轨迹和结果验收，本地 labs 没有接入基础循环完成这一步。

## 19.7 固定与官方来源

DeepSeek 根包 `0.2.1-alpha.5`：[技能子系统](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/skills.md)、[本地 provider 源码](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/skill/skill-filesystem/src/index.ts)、[consumer 源码](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/skill/tool-skill/src/index.ts)。

开放格式以 [Agent Skills specification](https://agentskills.io/specification) 为准；厂商差异依据 [Claude Code skills](https://code.claude.com/docs/en/skills)、[Codex skills](https://developers.openai.com/codex/skills)和[OpenCode skills](https://opencode.ai/docs/skills/)，均于 2026-10-17 核验。滚动文档不是固定提交，升级宿主应重新核对扩展字段。

---

上一篇：[第18章：指令层级、项目规则与环境事实](./18-instructions-architecture.md) · 下一篇：[第20章：技能发现、来源与重名处理](./20-skills-discovery.md)
