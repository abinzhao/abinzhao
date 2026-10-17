---
title: 第三十七章：事件日志、模型表面与请求回放
description: 区分耐久事实、模型可见表面和临时流，按修订号重建请求并保持工具身份与失败尝试可审计。
date: '2026-10-17'
category: 智能体工程
tags: [Agent Harness, Event Sourcing, 请求回放]
series:
  order: 37
---

# 第三十七章：事件日志、模型表面与请求回放

用户看到一段文字，不代表会话已经结算；日志保存一条事件，也不代表模型需要看到它。Agent 同时存在展示进度、执行事实和下一次请求材料。混用这三种状态，会让失败重试重复回答、回放遗漏工具定义，或者把诊断信息当作用户指令。本章通过一个可执行折叠实验，建立原始日志与模型表面的明确关系。

## 概念与数据流

事件日志记录发生过的事实；模型表面是从这些事实派生的当前历史；临时流用于展示正在发生但尚未结算的增量。它们不是三个互相独立的真相源。模型可见内容必须能够从已记录材料重建，临时增量只有达到结算点后才具备相应耐久事实。恢复时不能把 UI 缓冲区里显示的半句话自动补成成功助手消息。

```text
模型增量 -> 临时 UI 展示 -> 结算消息或失败尝试 -> 原始事件日志
原始事件日志 + 纯投影 + 请求信封 -> 当前模型表面 -> 冻结请求
原始事件日志 -> 审计视图: 包含被替换材料与失败尝试
```

表面替换不应改写原始记录。例如一条旧用户消息被摘要覆盖，旧消息依然可用于审计，而下一次请求只使用新摘要。每次替换需指出目标身份或位置，以及替换者的来源。只保存“最新 messages.json”虽然简单，却会丢失替换过程，也无法解释模型为何在前后两个请求看到不同材料。

## 自包含 Node.js 22 实验

以下程序用教学事件验证三件事：失败尝试不进入表面，替换不删除旧日志，某个请求修订只读取当时前缀。代码无网络、无磁盘写入，不是上游 SessionEvent 完整格式，也不是再次调用模型的轨迹复现。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
const events = [
  { seq: 0, type: 'header', data: { model: 'demo', tools: ['read'] } },
  { seq: 1, type: 'message', id: 'u1', role: 'user', text: 'Inspect' },
  { seq: 2, type: 'attempt', text: 'unfinished text' },
  { seq: 3, type: 'message', id: 'a1', role: 'assistant', text: 'Checked' },
  { seq: 4, type: 'replace', target: 'u1', id: 's1', role: 'user', text: 'Task: inspect' }
];
function replay(log, revision) {
  assert.ok(Number.isInteger(revision) && revision >= 0 && revision <= log.length);
  let header;
  const nodes = [];
  for (const [i, e] of log.slice(0, revision).entries()) {
    assert.equal(e.seq, i, 'non-contiguous log');
    if (e.type === 'header') header = structuredClone(e.data);
    if (e.type === 'message') nodes.push(structuredClone(e));
    if (e.type === 'replace') {
      const index = nodes.findIndex(x => x.id === e.target);
      assert.ok(index >= 0, 'unknown replacement');
      nodes[index] = structuredClone(e);
    }
  }
  return { revision, header, messages: nodes.map(x => ({ role: x.role, content: x.text })) };
}
const before = replay(events, 4);
const after = replay(events, 5);
assert.equal(before.messages[0].content, 'Inspect');
assert.equal(after.messages[0].content, 'Task: inspect');
assert.equal(after.messages.length, 2);
assert.equal(events[1].text, 'Inspect');
assert.deepEqual(after.header.tools, ['read']);
assert.throws(() => replay([{ seq: 1, type: 'attempt' }], 1));
console.log('surface replay: passed');
NODE
```

在真实工具历史里还需保留 assistant tool-call block、callId 和对应结果，不能只看消息 role 与文本。上面的实验故意不包含工具，因此不宣称已经验证工具组完整性；配对验收与第三十四章组合才覆盖这一部分。恢复一个请求还需要当时有效的模型路由、工具 schema、投影版本和图像材料，单纯比较最终回答文本并不足够。

## 已确认的产品契约

DeepSeek Harness 基线是 `0.2.1-alpha.5`、固定提交 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`。其架构明确以 Session append-only log 为真相源，`deriveMessages()` 派生历史。`request/header` 负责重建请求信封，而 `request/context` 是路由与容量快照，不参与同样的请求重建规则；不能仅因二者名字相近就互相替代。

已确认的成功 assistant/message 与未形成表面消息的 assistant/attempt 都可以保存结算流；live assistant-stream chunk 是进程内增量，硬崩溃在结算前可能没有耐久 attempt。关于取消后的部分内容，类型中存在 interrupted 标记，具体是否形成表面消息取决于实现路径，不能一律推断成“所有取消内容都保存”或“所有取消内容都丢弃”。教程采用什么行为需要自己的测试证明。

纯投影只能根据输入记录与明确规则计算结果，不应读取当前 cwd、网络或时钟后改变旧请求。插件改变模型可见内容时，要有相应日志事实或确定性投影定义。否则同一日志在两台机器派生出不同历史，所谓 replay 就只是在回放一个不可解释的近似。投影版本与安装组合因此也是重建证据的一部分。

## 失败案例与恢复取舍

第一类失败是在重试之前将流式 delta 追加成 assistant/message，随后成功结果又追加一次，模型看见重复输出。第二类失败是在工具执行成功但后续日志失败时，恢复器重新执行工具来“补全历史”。日志缺失只说明证据不足，不证明外部操作没有发生；重建请求和重做业务是不同动作，需要副作用对账而不是自动猜测。

另一种失败来自用原始 seq 数值排序当前表面。摘要替换节点可以拥有新的高 seq，但位于历史头部；重新按 seq 排序会把摘要移到尾部，改变用户与工具关系。表面位置由折叠规则决定，seq 只标识原始追加顺序。审计视图可以按 seq 浏览，而模型历史必须保持派生的位置顺序，两种 UI 也应使用不同名称。

请求回放还分确定性重建与模型再生成。前者要求在指定修订下形成相同请求材料；后者受供应商版本、随机性、服务端状态与工具观察影响，未必产生相同输出。保存请求摘要能验证本地身份，但不是重现模型行为的保证。不得以“回放文本一样”宣称真实外部系统状态或模型推理已完全复现。

审计导出也应保留导出范围与尾部修订。若导出期间会话继续增长，读者需要知道结果只是一个一致前缀，而不是完整最终轨迹。将日志、请求材料和界面转录分别命名，能防止用户把少量展示事件当作全部事实。对于无法取得的附件或插件投影，应明确重建不完整，不根据当前环境猜一个替代内容让比较强行通过。

## 实验验收与实现边界

完整命令应输出 passed，两个修订下首条材料不同，失败尝试不出现，原日志没有删除。继续实验可把替换目标改成不存在的 id，要求拒绝；给日志插入 seq 缺口，要求拒绝；改变 header 中工具集合，要求新旧请求签名不同。真实验收还需错误尝试、空成功输出、工具配对和未知插件投影的兼容行为。

原 1–12 章独立 Node.js 22 ESM 项目只有自己的会话事件与只读工具，不具有全部上游表面替换协议。现有 `labs/context.mjs`、`labs/workflow.mjs` 与汇总 `run.mjs` 属于扩展实验的实际实现，本文不新增或改动它们；本章命令仍可单独运行。已完成实验测试不意味着完整 Session provider、跨进程恢复与供应商轨迹重现已经实现。

## 官方固定来源

- [DeepSeek Harness：Session 事件与表面](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/session.md)，核对 assistant、attempt 与请求头角色。
- [DeepSeek Harness：架构与重建原则](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/architecture.md)。
- [DeepSeek Harness：耐久事件完整目录](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/persistence-catalog.md)，核对插件事件而非臆造格式。

上一章：[第三十六章：检索与长期记忆](./36-retrieval-memory) · 下一章：[第三十八章：耐久存储](./38-durable-storage)
