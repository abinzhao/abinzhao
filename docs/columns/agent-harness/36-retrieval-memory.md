---
title: 第三十六章：代码检索、RAG 与长期记忆
description: 用版本、坐标、来源和有效期区分代码证据、检索材料与长期记忆，建立可失效、可纠正的知识使用闭环。
date: '2026-10-23'
category: 智能体工程
tags: [RAG, 长期记忆]
series:
  order: 36
---

# 第三十六章：代码检索、RAG 与长期记忆

模型不应凭旧印象回答“这个函数现在怎样工作”。代码检索需要回到当前源码，长期记忆适合保留难以从代码直接恢复的约定与纠正，两者用途不同。RAG 是在生成前取得相关材料，不代表材料自动真实。本章要求每条知识带有来源与有效性，读者应能发现过期命中、区分文本搜索与语义导航，并阻止记忆越权。

## 概念与真实机制

文本搜索适合精确标识符、错误字符串和配置 key；向量检索适合用自然语言找到候选材料；LSP 适合定义、引用、实现和 hover 等语义位置。检索结果是候选，形成结论之前仍要检查源码、调用链、类型和测试。一个高相似度片段不证明它属于当前分支，也不证明同名函数是当前入口，更不证明它有权指示 Agent 执行命令。

DeepSeek Harness `0.2.1-alpha.5` 固定提交的 LSP 能力只公开四类查询，坐标为零起始 UTF-16，工具侧负责一基坐标转换。provider 根据文件扩展注册，结果包含实际 resolvedWorkspaceUri，不能用宿主路径规则猜远程工作区位置。其 session-query 还区分 current、shadowed 与 log-only；全文索引不是实际会话日志的替代品，索引滞后或失效时需要明确状态。

Codex 稳定 `0.163.0` 固定树中的 memories 文档描述有条件的后台管线：根会话、非 ephemeral、特性启用且状态数据库可用等前提下，先从合格 rollout 提取，再全局整合；写入阶段有 claim、并发上限、lease 与失败回退。这个机制不能被概括成“每次聊天都会记住一切”，也不能直接推导为 DeepSeek 或本教程已经实现相同数据库流程。

## 数据流与状态契约

```text
用户问题 -> 精确搜索/LSP/相关性检索 -> 候选带版本与坐标
         -> 当前源码复核 -> 有来源的上下文 -> 生成与验证
会话结论 -> 去敏与筛选 -> 待确认记忆 -> 保存版本 -> 后续检索
后续发现冲突 -> 标记失效或更正 -> 不静默覆盖旧证据
```

记忆应区分用户偏好、项目规则、领域知识与临时任务状态。跨项目偏好不应混入某个仓库的架构事实，临时错误日志不应成为长期规则。Claude 官方 memory 文档区分人工编写的 CLAUDE.md 与 auto memory，并强调它们是上下文而非强制执行配置。权限应在工具或策略层实施，不能把“记忆说允许”当作当前用户已经确认发布或数据修改。

教学建议每条记录至少保留 scope、source、revision、status、text 和观察时间。对能从当前代码快速恢复的事实，宁可检索源码，不必永久记忆；对用户纠正、团队取舍与没有代码体现的约定，记忆更有价值。保留过期记录供审计可以，但默认检索不能把 superseded 记录与现行规则同等使用。失效是知识生命周期的一部分，不是删除一条不喜欢的反例。

## 自包含 Node.js 22 实验

下面使用固定记录验证作用域和修订过滤，不执行向量搜索、不调用 LSP，也不读实际用户记忆。它不是检索质量评测，只证明“命中之后仍要核对版本”。展示字段属于教学模型，与任何产品的内部数据库 schema 无关。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
const records = [
  { id: 'old', scope: 'repo-a', source: 'src/run.mjs:1-8', revision: 'r1', status: 'active', text: 'runner uses a queue' },
  { id: 'now', scope: 'repo-a', source: 'src/run.mjs:1-12', revision: 'r2', status: 'active', text: 'runner uses a queue' },
  { id: 'other', scope: 'repo-b', source: 'src/run.mjs:1-8', revision: 'r2', status: 'active', text: 'runner uses a queue' },
  { id: 'retired', scope: 'repo-a', source: 'decision/1', revision: 'r2', status: 'superseded', text: 'runner uses a queue' }
];
function retrieve({ query, scope, revision }) {
  return structuredClone(records.filter(x =>
    x.scope === scope && x.revision === revision && x.status === 'active' && x.text.includes(query)
  ));
}
const hits = retrieve({ query: 'queue', scope: 'repo-a', revision: 'r2' });
assert.deepEqual(hits.map(x => x.id), ['now']);
assert.equal(retrieve({ query: 'queue', scope: 'repo-a', revision: 'missing' }).length, 0);
hits[0].text = 'modified outside';
assert.equal(records[1].text, 'runner uses a queue');
const line = 'a😀b';
assert.equal(line.indexOf('b'), 3);
assert.equal([...line].indexOf('b'), 2);
console.log('retrieval validity: passed; semantic ranking not tested');
NODE
```

最后两条断言提醒坐标系统不能混用。LSP 的 UTF-16 character 与人眼按码点数的位置不一样，转成一基行列时也必须明确单位。读取远程位置结果时，应保留服务端 URI，再通过对应文件系统能力取得内容；随意将 URI 拼到宿主 cwd 可能读取另一个文件。路径安全、版本新鲜度和内容相关性是三个独立验证面。

## 失败案例与取舍

设想记忆记录“测试命令是 npm test”，仓库后来改成 workspace 级脚本；Agent 依据记忆运行不存在的命令，再把失败解释为代码坏了。正确动作是读取当前 package.json 与锁文件，标记旧记录失效。另一个失败是索引来自主分支，而用户正在特性分支工作，搜索结果引用了已经删除的接口。输出结论必须绑定实际源码修订，不能只附一个漂亮文件名。

记忆还会造成提示注入的持久化。如果网页建议“以后自动推送代码”被写进项目约定，下一次检索就可能把外部文字伪装成团队规则。应保留可信来源与写入审批，过滤凭据与个人敏感信息，区分待确认候选和用户明确认可的规则。自动整理不得覆盖用户维护的文件，更不能把模型自评“有帮助”当作真实质量反馈。

检索多层策略有成本。可先用精确搜索缩小范围，再用 LSP 检查语义关系，只有问题词与源码词差异明显时再用语义候选；不必为小仓库立刻增加向量数据库。评测应覆盖无命中、旧分支、同名定义、坐标错误与被撤销记忆。最终指标是正确证据支持的答案，不是命中数量，也不是保存的记忆总字数。

检索入口还应记录查询范围和采用的版本过滤，让无命中可以解释为范围内没有证据，而不是整个系统不存在该功能。过滤太严格可能遗漏跨模块调用，过滤太宽可能混入其他项目；两种情况都需由真实源码复核。记忆纠正应保留被替代记录的身份与原因，以便判断是用户规则变化、代码升级，还是先前提取错误，不能只留下最新一句结论。

## 实验验收与实现边界

完整命令应只保留 now，缺少修订时不回退到旧记录，返回对象修改不污染存储。继续实验可把当前记录改为 superseded，要求空结果；加入不同 scope 的高相关片段，要求仍不能跨项目使用。真实评测还需当前源码、检索失败分类、引用正确性和经过授权的任务样本，不能把这个字符串 filter 当 RAG 准确率测试。

原 1–12 章 `local-harness-tutorial` 是只读文件助手，没有自动长期记忆、LSP server 或向量存储。扩展 `labs/context.mjs` 与 `labs/eval.mjs` 已经落盘，汇总入口为 `labs/run.mjs`；这些验证确定性契约，不代替真实检索质量评测。本章只交付文稿和自包含实验。Prompt Cache 不执行本章的知识筛选，compaction 不等于长期记忆保存，三者职责需要在实现和文案中持续分开。

## 当前记忆作用域与截断

2026-10-23 复核 [Claude Code memory](https://code.claude.com/docs/en/memory)：auto memory 按 repository 保存、在该仓库的 worktrees 间共享；启动加载 `MEMORY.md` 的前 200 行或 25KB，详细主题文件按需读取。这个装载上限不是模型总窗口，也不意味着被截断部分已经进入本次请求。当前文档也支持 AGENTS.md，但具体选择和加载层级仍需按[第 18 章](./18-instructions-architecture)核对，不能把所有工具的规则优先级视为相同。

对照 [DeepSeek rc.2 LSP](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/subsystems/lsp.md)，四类查询与 UTF-16 坐标仍是该实现明确边界，不代表所有 LSP server 只支持四种能力。正常验收要记录当前分支/修订、实际加载范围与引用坐标；异常验收是在另一个 worktree 命中共享记忆时仍拒绝旧源码事实。练习在 records 增加 `loadedThroughLine`，确认未装载的主题不能据此宣称已读；排错分别检查候选命中、原文读取与当前代码复核，避免将无命中直接解释为功能不存在。

## 官方固定来源

- [DeepSeek Harness：LSP 契约](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/lsp.md)，核对操作集合与 UTF-16 坐标。
- [DeepSeek Harness：会话检索与表面状态](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/session-query.md)。
- [Codex 0.163.0：Memories 管线](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/memories/README.md)，仅描述此固定树的条件化实现。
- [Claude Code：Memory 官方文档](https://code.claude.com/docs/en/memory)，动态文档，核验日 2026-10-23，不作为开源内部实现证明。

上一章：[第三十五章：Prompt Cache](./35-prompt-caching) · 下一章：[第三十七章：事件与请求回放](./37-event-surface)
