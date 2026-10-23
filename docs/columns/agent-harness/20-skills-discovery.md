---
title: '第20章：技能发现、来源与重名处理'
description: 为技能目录建立作用域、优先级、完整性和失效规则，避免同名覆盖与短暂发现失败污染模型视图。
date: '2026-10-23'
category: 智能体工程
tags: [Skill, 发现, 缓存]
series:
  order: 20
---

# 第20章：技能发现、来源与重名处理

当项目、用户目录和插件各提供一个 `code-review`，加载哪个不是文件系统遍历的小细节，而是决定实际流程的运行契约。若结果由异步读取先后决定，同一任务会因磁盘速度使用不同说明，诊断日志却只有相同名称。

原项目没有 Skill 发现机制。本章采用独立内存候选实验，把来源、作用域和优先级显式化；实验不会扫描真实用户目录，也不会安装任何技能。真实扫描的文件边界仍需独立实现和验证。

## 20.1 身份不能只剩显示名称

名称适合用户选择，内部候选还应保存 provider、来源、定位符和资源基准。定位符是 provider 私有句柄，registry 不应把它猜成路径；虚拟和远程技能未必对应宿主文件。加载时必须交回原 provider，而不是拿同名字符串重新搜索所有来源。

作用域与优先级也要分开。DeepSeek 固定版本先合并全局和当前 scope 链，较近层的同名候选胜出；同一层内部再按 rank、provider 注册顺序、本地顺序决胜。不能把某个 rank 表直接理解成全进程所有候选的总排序。

| DeepSeek 同层来源 | rank | 含义 |
| --- | --- | --- |
| 项目 `.dsh/skills` | 100 | 项目专用来源 |
| 项目 `.agents/skills` | 200 | 项目共享来源 |
| 运行时贡献 | 250 | 动态注册候选 |
| 自定义根 | 300 | 配置指定来源 |
| 用户 DSH / Agents | 400 / 500 | 用户层目录来源 |
| 配置的 bundled | 600 | 随包来源 |

数值越小优先级越高是该版本实现规则，不是 Skill 标准。项目根是最近含 `.git` 的祖先，找不到时使用 cwd。没有配置 bundled 根也不意味着宿主自动合成所有内置技能，分发 provider 与本地扫描应独立说明。

## 20.2 完整观察与不完整观察

发现失败有两种含义：技能确实不存在，或某个 provider 没有完成观察。把后者当成空集合缓存，会使一次短暂网络或 watcher 错误永久隐藏技能。目录快照需要 `complete`，只有完整且稳定的观察才适合替换权威视图。

```text
各 provider list -> 候选校验 -> scope 合并 -> 同层决胜
                                             |
                              complete=true -> 缓存并替换目录
                              complete=false -> 保留最后完整视图
                                             |
                                     按身份 get 正文
```

完整的空目录表示“当前确实没有技能”，应该替换旧目录；不完整的空目录表示“目前没观察到”，不应删除最后已知目录。保留目录也不代表旧技能仍可执行，加载时必须重新检查候选可用性和调用政策。

## 20.3 一个确定性重名实验

以下代码只模拟同一层候选比较，不包含 DeepSeek 的 scope 链和 watcher。字段由本章定义，可独立执行。排序采用显式输入顺序，避免依赖异步完成次序。

```js
import assert from 'node:assert/strict';

function winners(candidates) {
  const result = new Map();
  const sorted = [...candidates].sort((a, b) =>
    a.rank - b.rank || a.providerOrder - b.providerOrder ||
    a.localOrder - b.localOrder);
  for (const item of sorted) {
    if (!result.has(item.name)) result.set(item.name, item);
  }
  return result;
}

function replaceCatalog(previous, observation) {
  return observation.complete ? winners(observation.candidates) : previous;
}

const project = {
  name: 'code-review', provider: 'project', rank: 100,
  providerOrder: 1, localOrder: 0,
};
const user = {
  name: 'code-review', provider: 'user', rank: 400,
  providerOrder: 0, localOrder: 0,
};
const first = winners([user, project]);
assert.equal(first.get('code-review').provider, 'project');
assert.equal(winners([project, user]).get('code-review').provider, 'project');
assert.equal(replaceCatalog(first, {
  complete: false, candidates: [],
}), first);
assert.equal(replaceCatalog(first, {
  complete: true, candidates: [],
}).size, 0);
console.log('priority and observation checks passed');
```

生产代码还需验证名称、有限 rank、provider 所有权和输入结构；本例不接受模型提供候选，也不证明文件内容可信。省略输入验证是为了隔离排序实验，不能直接拿它当公共 registry。

实际 `labs/skills.mjs` 采用另一种明确策略：不选择同名赢家，而是保留 `project/review`、`personal/review` 这样的来源限定标识，未限定 `review` 有多个匹配时拒绝。这更适合观察歧义，不是 DeepSeek rank 的复刻。以下使用现有测试里的夹具，完整运行不用创建常驻目录：

```sh
node --test --test-name-pattern="skill discovery" test/labs.test.mjs
```

测试真实创建两个来源的同名技能，调用 `discoverSkills()` 后确认两项均保留、目录 JSON 不含正文；`loadSkill(catalog, 'review')` 因歧义拒绝，`loadSkill(catalog, 'project/review')` 才成功。运行位置是示例根，源码在 `labs/skills.mjs`，用例在 `test/labs.test.mjs`，没有假设额外实验 API。

两种策略的取舍应写进契约：自动优先级方便默认加载，但需要审计被遮蔽来源；拒绝歧义让选择更明确，却要求调用者传入限定标识。不能一边按名称缓存，一边在加载时才追加来源，否则缓存里已经丢失的候选无法恢复。

## 20.4 正文刷新与目录刷新不同

目录展示名称和描述，正文只有调用时才加载。正文改动不一定意味着目录改动，因而不应每次正文修改就追加新的完整目录消息。DeepSeek registry 不缓存完整 definition，每次 `get()` 调用获胜 provider 重读；名称与候选不符会拒绝并触发重新发现。

目录摘要则需要稳定渲染和摘要比较。同一个候选集合因顺序漂移反复追加目录，会增加上下文并破坏稳定前缀。应按确定性名称顺序输出，仅完整观察变化才发布替换，删除全部技能时发布明确空目录。

缓存键必须包含真正影响发现的上下文，至少关注 cwd、scope 链和 provider 版本。仅用 cwd 缓存会把一个 agent 的私有技能泄漏给另一个；仅用 provider 名会忽略重挂载后的新注册。失效通知应关联当前注册，旧 provider 的迟到回调不能清除新实例的缓存。

## 20.5 厂商重名规则不能推导为通用覆盖

Codex 官方技能页说明同名技能不会合并，两者都可能出现在选择器中。这与 DeepSeek 的获胜候选策略不同。Claude Code 有自己的同名解决规则和插件命名空间；OpenCode 也有自己的多目录发现与权限过滤，不能仅凭兼容目录名称推导覆盖顺序。

迁移时应做实际冲突夹具：两个来源同名、两个不同名描述相同、同一个目标经两个符号链接可见。分别观察目录、实际加载路径和诊断。测试结果只能绑定到具体宿主版本，不把“我这次看到项目技能”推广成永久规则。

## 20.6 失败案例与验收

常见失败是先把项目和用户技能读成一个对象，后写者覆盖。异步扫描顺序变化就会改变正文。另一种失败是把 provider 报错转换成空目录，覆盖最后完整视图；模型之后不再知道这个技能存在，也不会尝试恢复。

实验运行应确认无论输入顺序怎样，项目候选胜出；不完整空观察保持旧对象；完整空观察移除所有条目。增加一个相同 rank 的候选，验证注册顺序再决定结果。不要把保留旧目录误解成允许跳过调用时的政策检查。

真实扫描验收还应覆盖根目录缺失、权限拒绝、符号链接、正文名称改变和取消。现有 labs 覆盖同名歧义、加载摘要变化和符号链接拒绝，没有 watcher、LRU、远程初始化或 AbortSignal 参数。运行 `npm run labs` 可以观察正常链路，但不能据此声称目录实时更新、取消传播和所有文件系统竞争问题已经解决。

## 20.7 固定来源

DeepSeek `0.2.1-alpha.5` 的[技能文档](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/skills.md)、[registry 源码](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/skill/skill/src/index.ts)和[provider 配置目录](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/config-catalog.md)是优先级、完整观察与缓存契约的依据。

跨产品差异依据 [Codex skills](https://learn.chatgpt.com/docs/build-skills)、[Claude Code skills](https://code.claude.com/docs/en/skills)和[OpenCode skills](https://opencode.ai/docs/skills/)，核验日 2026-10-23。本章内存排序不实现这些产品的全套发现算法。

## 20.8 发现到加载的当前一致性检查

当前 OpenCode 文档明确 `deny` 同时隐藏技能并拒绝访问，`ask` 在加载前请求批准。迁移时不能仅过滤模型目录；所有按名称加载入口都应实施同一政策。Codex、Claude 的名称与来源选择则按各自文档，不将上表 DeepSeek rank 当通用标准。

练习：发现后修改正文、撤销技能权限，再使用完整来源标识加载。未变化且允许的技能应成功；过期摘要和撤销权限应拒绝，即使旧目录仍可见。发现失败时保留最后完整目录只服务于诊断，不授予使用旧正文的权利；排错记录选中来源、内容身份与当前权限，避免把三者都归咎于“缓存没刷新”。

---

上一篇：[第19章：Skill 规范与渐进式加载](./19-skills-format.md) · 下一篇：[第21章：技能触发、权限与生命周期](./21-skills-invocation.md)
