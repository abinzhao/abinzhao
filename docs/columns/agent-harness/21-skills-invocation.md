---
title: '第21章：技能触发、权限与生命周期'
description: 以真实 skills 实验解释加载身份和摘要校验，再区分显式调用、模型选择、内容生命周期与执行授权。
date: '2026-10-17'
category: 智能体工程
tags: [Skill, 调用控制, 生命周期]
series:
  order: 21
---

# 第21章：技能触发、权限与生命周期

目录里看得见一个 Skill，不代表当前调用者可以加载；正文加载成功，也不代表正文中的脚本已经获准执行。技能生命周期至少有发现、选择、加载、行动和退出几个边界。把这些边界折成一个“启用”开关，会让权限和上下文状态难以解释。

本章使用实际的 `labs/skills.mjs`。它是独立机制实验，没有接入 `src/agent.mjs`，也没有实现自动触发或厂商调用字段。前十二章的本地只读循环仍只有两个文件工具，不会因实验发现了技能就自动增加权限。

## 21.1 显式意图不能由外部正文伪造

显式调用是用户通过宿主认可的入口选择技能；隐式调用是模型根据描述选择。两者有不同的信任来源。工具读到 `/deploy` 这样的文字，不能被扫描成用户手势；否则攻击者只需在文档里写一个命令，就能触发本来仅允许用户发起的流程。

DeepSeek 固定版本 consumer 只扫描 `source.kind === 'user'` 的输入，识别首行的技能调用，并检查用户调用政策。模型使用 `skill` 工具时，则先检查目录候选的模型调用政策，加载后再检查 definition 的政策，防止发现与读取之间规则变化。

| 模型可调用 | 用户可调用 | 目录与加载含义 |
| --- | --- | --- |
| 是 | 是 | 两个入口都允许 |
| 否 | 是 | 模型不应自主加载，用户可明确选择 |
| 是 | 否 | 不作为用户命令，不等于模型被禁止 |
| 否 | 否 | 仅可信内部调用路径可能取得 |

这个二维模型是上游的规范化表达。Codex 的 `allow_implicit_invocation` 与 Claude Code 的两个 frontmatter 控制不是相同配置文件；OpenCode 的 `allow`、`ask`、`deny` 又属于自己的技能权限。移植时需要转换语义，不能只复制键名。

## 21.2 实际 labs 做了什么

`discoverSkills(roots)` 接受 `{ source, path }` 数组，返回目录元信息；每项有来源限定的 `id`、摘要、根和文件位置。`loadSkill(catalog, id)` 接受完整标识或不歧义的名称，重新读取并比较发现时摘要，之后返回 `body`。

发现阶段实际读取了整个文件来解析元信息和计算摘要，只是不把正文加入模型上下文。不能把渐进加载描述成磁盘从未读过正文。这里减少的是模型上下文中的正文暴露，不是文件 I/O 或全部读取权限。

```text
可信根目录 -> discoverSkills -> 来源限定目录与摘要
                                   |
                          loadSkill(目录, 标识)
                                   |
                         歧义检查 -> 重新读取
                                   |
                       摘要一致 -> 返回正文
                       摘要变化 -> 拒绝并要求重新发现
```

实验拒绝技能目录和文件的符号链接，限制文件大小并检查真实路径归属，但仍不构成 OS 沙箱。并发进程替换祖先目录属于路径检查无法完全封闭的竞争；第四章已经说明这种边界，不能因增加摘要就宣称解决所有竞态。

## 21.3 可运行的内容变更实验

从示例项目根目录执行下面代码。它只创建系统临时夹具，结束后清理；导入的是实际源码，不是假设的 API。教程解析器仅支持单行元信息，因此示例不使用复杂 YAML。

```sh
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverSkills, loadSkill } from './labs/skills.mjs';

const root = await mkdtemp(join(tmpdir(), 'skill-lifecycle-'));
try {
  const dir = join(root, 'inspect');
  await mkdir(dir);
  const file = join(dir, 'SKILL.md');
  const head = '---\nname: inspect\ndescription: Inspect a fixture\n---\n';
  await writeFile(file, head + 'Read only.');
  const catalog = await discoverSkills([{ source: 'project', path: root }]);
  const loaded = await loadSkill(catalog, 'project/inspect');
  assert.equal(loaded.body, 'Read only.');
  await writeFile(file, head + 'Different instructions.');
  assert.equal(loaded.body, 'Read only.');
  await assert.rejects(loadSkill(catalog, 'project/inspect'), /changed/);
  const refreshed = await discoverSkills([{ source: 'project', path: root }]);
  assert.equal(
    (await loadSkill(refreshed, 'project/inspect')).body,
    'Different instructions.',
  );
  console.log('skill lifecycle verified');
} finally {
  await rm(root, { recursive: true, force: true });
}
JS
```

已返回的正文保持原字符串，新加载拒绝过期目录，重新发现后才接受新正文。这是本实验选择的版本一致性政策，不是所有宿主都要求发现摘要一致。DeepSeek registry 不缓存完整 definition，每次 get 重读；不能把 labs 的摘要绑定说成上游同款实现。

## 21.4 加载结束不等于影响结束

加载动作结束后，正文可能仍在模型历史中。关闭目录入口不一定删除已经加载的内容，删除磁盘文件也不一定消除会话影响。应该明确记录已加载来源与版本，并区分未来可调用性和当前上下文中仍存在的说明。

工具授权还应有更短生命周期。一个技能正文建议调用写工具，真正授权必须绑定本次具体操作和当前政策；不能因为“技能在会话里”就永久允许其所有后续脚本。摘要只证明读取内容与发现内容一致，不证明内容安全，也不代表用户批准。

如果 Skill A 引用 Skill B，要区分读取参考与激活流程。把 B 的正文当参考材料读入，不自动授予 B 的调用政策、hooks 或脚本权限。跨来源引用也需要保留原服务器或目录身份，不能让 A 利用同名标签冒充 B。

## 21.5 失败案例：只隐藏不拦截

一个宿主把禁用技能从模型目录移除，但 `load(name)` 仍允许任何名称。模型若记得旧名称，或者工具结果提示它调用，就仍能加载。这说明目录过滤是发现策略，运行时检查才是准入边界，两者应使用相同政策但各自执行。

另一个失败是把“用户显式选择技能”解释成批准全部外部副作用。用户可能只是想看流程说明；调用发布 Skill 也不一定批准某个具体环境、版本和账号的发布。操作审批仍应绑定实际参数，不能从名称推导广泛授权。

还有误判触发准确率的问题。一次相关提示触发正确不代表描述设计成功，需要正例、近似但应排除的负例，以及明确提及却没有执行意图的情况。测试至少区分目录可见、正文加载和行动执行，不把三者合成一个成功数。

## 21.6 验收与固定来源

运行上述实验应打印成功信息，摘要变化被拒绝，重新发现后得到新正文。再运行 `npm run labs` 和 `node --test test/labs.test.mjs`，核对真实实验拒绝歧义名称、变更内容和符号链接。测试验证机制，不测量模型的触发准确率。

实际源码在仓库 `examples/agent-harness/labs/skills.mjs`，下载包内为 `labs/skills.mjs`。第十九章直接嵌入该文件，第二十章引用同名消歧测试；完整运行边界以示例根 `labs/README.md` 为准。这三个观察面分别回答格式、发现和加载问题，不把一个成功返回值当成完整技能执行证明。

DeepSeek `0.2.1-alpha.5`：[consumer 源码](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/skill/tool-skill/src/index.ts)与[技能契约](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/skills.md)。厂商字段依据 [Claude skills](https://code.claude.com/docs/en/skills)、[Codex skills](https://developers.openai.com/codex/skills)和[OpenCode skills](https://opencode.ai/docs/skills/)，2026-10-17 核验。

本章与 labs 均未实现自动技能选择、YAML 全规范、调用政策执行、脚本加载和上下文移除。后续集成必须分别提供测试，不能由摘要实验推导这些能力已经存在。

---

上一篇：[第20章：技能发现、来源与重名处理](./20-skills-discovery.md) · 下一篇：[第22章：插件格式、市场与版本分发](./22-plugin-packaging.md)
