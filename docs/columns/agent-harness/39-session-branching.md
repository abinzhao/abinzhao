---
title: 第三十九章：Resume、Fork 与跨会话引用
description: 用会话身份、继承前缀和捕获修订区分恢复、分支与引用，避免复制历史时继承不存在的运行资源和权限。
date: '2026-10-17'
category: 智能体工程
tags: [Agent Harness, Session Fork, Resume]
series:
  order: 39
---

# 第三十九章：Resume、Fork 与跨会话引用

恢复昨天的任务、从某一步试另一条路线、引用同事会话中的结论，看起来都是“带着历史继续问”。它们却有不同身份和权限语义。Resume 延续原会话，Fork 创建新会话并继承确定前缀，引用只将另一个会话的有界观察作为材料。本章要求这些操作明确写出来源、捕获位置和资源边界，不能把历史复制等同于整个运行环境复制。

## 概念与数据流

会话日志、当前 Agent 与外部资源分属不同生命周期。日志可以耐久，Agent 是当前进程中的执行者，浏览器、终端和 MCP 连接通常由当前生命周期创建。恢复日志之后要重新初始化能力与校验权限，不应继续使用上次进程里的句柄。Fork 即使继承全部历史，也不天然继承活跃任务、当前登录状态或父 Agent 的处置权。

```text
Resume: stored identity -> 写所有权 -> 读取/迁移/平衡 -> 新 live Agent
Fork:   source snapshot -> 合法 cut -> 新 identity + inherited count -> 子日志
Recall: source observation -> 捕获修订 + 限额 -> 不可信上下文 -> 目标日志
```

合法切点必须保持模型协议和执行事实完整。若切在调用与结果中间，子会话不能直接向模型发送孤立结果；实现要拒绝，或按明确规则附加子会话拥有的中断补全。切点不仅是某个时间戳，还需要精确继承事件数和原始格式坐标。父会话后来继续追加，子会话的继承前缀应保持不变，不能变成一个隐式订阅。

## 自包含 Node.js 22 实验

以下程序验证 Fork 的独立身份、前缀快照与引用坐标；不运行模型，不创建真实 session 文件，也不实施任何上游 fork API。所有 id 与文本都是可公开实验值。它采用只允许 turn/end 的保守切点，未实现中途切点补全。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
const parent = {
  id: 'parent', format: 1,
  events: [{ seq: 0, type: 'user', text: 'inspect' }, { seq: 1, type: 'turn/end' }]
};
function fork(source, id, cut) {
  assert.notEqual(id, source.id);
  assert.ok(Number.isInteger(cut) && cut > 0 && cut <= source.events.length);
  assert.equal(source.events[cut - 1].type, 'turn/end');
  return { id, parent: source.id, inherited: cut, events: structuredClone(source.events.slice(0, cut)) };
}
function recall(source, target, limit) {
  assert.notEqual(source.id, target.id, 'self reference');
  const text = source.events.filter(x => x.type === 'user').map(x => x.text).join('\n');
  assert.ok(Buffer.byteLength(text) <= limit, 'reference budget');
  return { sourceSession: source.id, capturedFormat: source.format, capturedThroughSeq: source.events.at(-1)?.seq ?? null, trust: 'untrusted', text };
}
const child = fork(parent, 'child', 2);
parent.events.push({ seq: 2, type: 'user', text: 'new parent task' });
assert.equal(child.events.length, 2);
child.events[0].text = 'child local view';
assert.equal(parent.events[0].text, 'inspect');
const ref = recall(parent, child, 100);
assert.equal(ref.capturedThroughSeq, 2);
assert.equal(ref.sourceSession, 'parent');
assert.throws(() => fork(parent, 'bad', 1));
assert.throws(() => recall(parent, parent, 100));
assert.throws(() => recall(parent, child, 1));
console.log('branch and reference: passed');
NODE
```

真实引用可能聚合多个来源并采用预览或 Spill，而不是像实验一样超限直接拒绝；无论使用哪种策略，都应记录 retained、omitted、truncated 等事实。captureThroughSeq 属于来源会话的坐标，不能把它当目标会话的 seq 解释。若来源格式迁移，引用还需知道捕获时的 format generation，否则同一个数字可能被误读。

## 已确认的产品机制

DeepSeek Harness 基线为 `0.2.1-alpha.5`、固定提交 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`。其 Agent create/resume 由注册工厂提供，setup 在发布前完成作用域注册，初始化失败则回滚，不提前向外暴露半可用 Agent。Resume 先加载持久会话；Fork 的精确 inheritedEventCount 与父来源元数据共同定义继承关系，不能仅依赖显示名称。

上游 Session 的 end-seed 标记区分继承前缀与后续生命周期工作，继承前缀之后的合成补全由子会话承担。历史 parent lineage 与 live parentAgent 不是同一种关系，恢复的分支可以是运行时根 Agent。权限消费者不能因为 durable parent 字段存在，就推断当前有活跃父进程负责授权或清理。处置资源的能力也不应从可读会话 id 自动导出。

已确认的跨会话引用通过准备步骤取得 readable content 与聚合的不可信 additionalContext，保留来源会话、捕获格式、捕获 seq、截断与省略计量。候选发现主要使用元数据、标题和 cwd，不等于全文读取。来源可读权限应在捕获时验证；展示标签只用于界面，不能代替 authoritative sessionId。引用内容中若包含命令，也不能取得更高信任等级。

## 失败案例与取舍

失败案例之一是 Resume 时继续显示“浏览器已登录”，实际浏览器实例已经重建。历史中的登录观察仍可保留作为过去事实，但当前是否登录要重新观察。另一个失败是 Fork 后继续使用父会话的可变事件数组，父 Agent 追加一条用户消息，子 Agent 的已冻结请求材料也随之改变。必须使用验证后的快照或共享深冻结对象，不能共享可变容器。

引用也有隐私风险。一个用户只允许读取当前工作区会话，搜索器却返回另一个仓库的标题和正文；即使模型最后没引用该内容，信息泄露已经发生。应在候选发现、原始读取、Spill 检索和展示层保持同一访问范围。引用不是把其他会话全部“导入记忆”，用户对当前材料的授权不自动扩展为长期保存或跨项目传播。

分支通常比回滚更适合比较两种方案，但它不自动建立新的 Git worktree。两条会话若操作同一目录，仍可能相互覆盖；日志分支解决对话身份，文件系统隔离解决代码冲突。原项目只读，因此不存在编辑竞争，但扩展到真实写入后必须单独分配文件所有权或工作树。不能把 child sessionId 当作已隔离运行目录的证明。

恢复完成后，旧结论应作为待复核材料而非永真事实。当前代码、工具版本、权限策略和用户目标可能已经改变；宿主应生成新的运行观察，让模型知道哪些状态仍可靠。对无法恢复的终端或后台任务，要报告资源已失效，不用相同名称创建一个新句柄再假称它是原任务。可读历史与可继续执行是两个不同验收标准。

## 实验验收与实现边界

命令应证明父会话追加不改变子前缀，子对象修改不污染父对象，非法 cut、自引用与超预算引用都会失败。进一步实验可改变父 format，确保引用仍绑定捕获格式；给 child 增加自己的事件，不能修改 inherited count。真实恢复验收还需写所有权、未知未来格式、作用域初始化失败，以及引用源无权限和已过期 locator 的错误分类。

原 1–12 章 `local-harness-tutorial` 只有自身会话恢复，没有实现全部上游 Fork、Recall 与运行资源重建。已完成的 labs 是独立实验层，本文不修改其文件，也不臆造 CLI 参数。无真实持久后端与授权测试时，只能宣称本章的内存契约通过，不能报告跨进程会话分支、隐私隔离或外部任务恢复已经可用。

## 官方固定来源

- [DeepSeek Harness：Agent create/resume 与所有权](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/core.md)。
- [DeepSeek Harness：继承前缀与 Session 格式](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/session.md)。
- [DeepSeek Harness：跨会话引用契约](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/session-reference.md)。

上一章：[第三十八章：耐久存储](./38-durable-storage) · 下一章：[第四十章：检查点与副作用](./40-checkpoints-side-effects)
