---
title: '第22章：插件格式、市场与版本分发'
description: 区分技能说明、插件组件、市场目录与运行组合，建立版本、路径、授权和升级验收的分发契约。
date: '2026-10-17'
category: 智能体工程
tags: [插件, Marketplace, 供应链]
series:
  order: 22
---

# 第22章：插件格式、市场与版本分发

一个 Skill 可以通过文件共享；当它还依赖工具、hooks、MCP 配置和界面资源时，就需要一个安装与加载单元。插件解决组件组合和分发问题，市场解决“去哪里找到插件”的问题。两者都不自动证明代码可信。

本章以只读证据总结插件为例，讨论如何声明组件和版本，不执行安装、发布或外部写操作。原教学项目的简易 scope 仍不是 Claude Code、Codex 或 Cordis 的插件安装器，不能把一个 manifest 放进目录就声称已经集成。

## 22.1 四层对象分别负责什么

Skill 是工作流程说明，插件是可一起安装的组件集合，marketplace 是来源目录，运行组合则决定实际启用哪些服务。市场里有某插件不代表本机装好了，安装成功也不代表当前会话加载了它。

| 对象 | 记录重点 | 不应承担 |
| --- | --- | --- |
| Skill | 触发、输入、流程和失败 | 全局依赖安装 |
| 插件 manifest | 标识、版本、组件位置 | 安全性证明 |
| 市场条目 | 来源、可安装版本、展示信息 | 授予执行权限 |
| 运行组合 | 启用状态、作用域、配置 | 替代包完整性验证 |

运行期应能够追溯最终组件来自哪个包、哪个版本、哪个配置层。只有用户看到的展示名称不足以定位问题：市场名称可能相同，组件名称也可能重复。升级后正文变了、hook 没变，或 MCP 配置仍来自旧缓存，都会产生混合版本行为。

## 22.2 两个厂商 manifest，不是一份跨产品配置

下面分别是 Claude Code 和 Codex 的最小 manifest 内容，放置位置写在表后。它们是两个独立文件的示例，不要把两个对象写到同一 JSON 文件。

```json
{
  "name": "evidence-kit",
  "version": "1.0.0",
  "description": "Read-only evidence summary skills"
}
```

Claude Code 使用 `.claude-plugin/plugin.json`；技能内容放在插件根的 `skills/evidence-summary/SKILL.md`，不是放进隐藏 manifest 目录。最小插件没有 hooks 和 MCP 配置，不需要为了展示格式加入会启动进程的组件。

```json
{
  "name": "evidence-kit",
  "version": "1.0.0",
  "description": "Read-only evidence summary skills",
  "skills": "./skills/"
}
```

Codex 使用 `.codex-plugin/plugin.json`，组件路径相对插件根。它也能分发 skills、MCP、hooks 和 app 映射，但具体字段、市场解析和安装缓存由 Codex 规定。相近的 manifest 不代表所有厂商支持同样组件和生命周期。

OpenCode 的插件是 JS/TS 模块，既可从本地插件目录加载，也可在配置中指定 npm 包。不能给 OpenCode 填入上述 manifest 并期待得到同一种插件。产品间迁移需要对照入口函数、配置格式、卸载语义和包安装行为。

## 22.3 从来源到激活的数据流

```text
市场条目 -> 选择来源与精确版本 -> 获取包并检查
                                  |
                        安装状态 + 组件 manifest
                                  |
                     运行组合选择 -> 激活服务与 hooks
                                  |
                        会话可见目录和实际工具
                                  |
                     升级或禁用 -> 清理旧注册与进程
```

读取市场条目通常是发现操作，安装则可能运行包脚本和拉取依赖，启用后又可能启动 MCP 子进程或 hook。权限评估不能只看下载动作。一个看似纯说明插件，只要包含动态命令，就可能在加载阶段读取工作区或执行代码。

DeepSeek 固定版本用 profile 和 bundle 组成 Cordis 配置层。bundle 的包信息声明补丁文件，profile 叠加 bundle、用户补丁与命令行覆盖。替换配置行涉及整体配置替换，不是任意字段自动深合并；升级审查应检查实际 dump 的组合，而不只看市场展示。

## 22.4 版本固定与兼容性检查

包版本与宿主版本是两个维度。一个插件引用新服务契约，旧宿主即使能下载也不能正确加载；一个旧插件在新宿主上能启动，也可能因事件语义改变而执行错动作。声明范围只是准入线索，实际公共契约测试仍需运行。

不要默认使用浮动 `latest` 或 `main` 来保证可复现。记录精确版本、来源和可验证摘要，可以知道一次升级改变了什么；市场索引的版本号不能证明取到的字节没被替换。源代码提交与发布包内容也应分别核对，不能仅凭仓库 tag 推导制品一致。

升级应分成取得、校验、激活与观察几阶段。旧版本资源应在切换后清理，但不能先删除全部旧状态再尝试新版本，否则失败无法恢复。包回滚也不能自动撤销已执行外部副作用，这类操作需要业务幂等或补偿，不属于版本安装器能力。

## 22.5 失败案例：禁用只改变目录

一个插件禁用后，技能从列表消失，但它注册的定时器、事件监听和 MCP 进程仍在运行。这说明“可见性关闭”与“资源卸载”被混淆。验收应该检查工具注册移除、监听器清理、子进程停止，以及旧异步回调不再注入上下文。

另一个失败是两个市场提供同名同版本插件，安装缓存仅按名称定位。第二次安装可能复用第一次的字节，界面却显示新的市场来源。缓存和授权必须包含真实来源身份，不能只凭展示名或版本号合并。

市场描述本身也是第三方文本。描述里写“安装前读取你的密钥文件”不构成用户授权，更不能覆盖安全规则。DeepSeek 工具目录明确把市场标题、描述和作者信息视为第三方文本；宿主应以结构化安装目标和当前授权决定动作。

## 22.6 静态实验与可观察验收

把上面两份 JSON 分别交给 `JSON.parse()`，确认语法合法，再人工核对 manifest 位置与技能目录。这个测试只能验证格式，不能证明目标宿主接受。真实安装测试应在隔离配置目录或明确批准的宿主中进行，不改日常全局设置。

对只含技能的最小包，验收目录出现、正文来自精确包版本、禁用后新调用拒绝。加 hooks 或 MCP 时，再检查启动和停止的进程及事件；这些组件不能借用 Skill 的测试结果。记录安装状态、当前激活版本与会话可见组件，三者要能解释一致。

本章不实际安装或发布插件，不运行包构建脚本，不修改市场目录。原教程未实现 npm 包管理、签名验证、宿主版本协调或跨进程插件事务。`npm run labs` 的技能实验只读取临时文件，也不验证上述分发链路。

## 22.7 固定与官方来源

DeepSeek `0.2.1-alpha.5` 的[架构组合说明](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/architecture.md)、[boot 子系统](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/boot.md)和[插件工具目录](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/tool-catalog.md)提供其组合与授权边界。

厂商格式依据 [Claude Code plugins](https://code.claude.com/docs/en/plugins)、[Codex build plugins](https://developers.openai.com/codex/plugins/build)和[OpenCode plugins](https://opencode.ai/docs/plugins/)，核验日 2026-10-17。此处不声称三个生态共享一个插件标准；开放 Skill 格式与插件分发格式是不同层次。

---

上一篇：[第21章：技能触发、权限与生命周期](./21-skills-invocation.md) · 下一篇：[第23章：Cordis 服务、事件与配置组合](./23-cordis-composition.md)
