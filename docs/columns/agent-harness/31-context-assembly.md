---
title: 第三十一章：完整上下文装配与来源追踪
description: 从分层贡献到不可变请求，建立来源、作用域、修订号和信任等级共同约束的上下文装配契约。
date: '2026-10-17'
category: 智能体工程
tags: [上下文工程, 来源追踪]
series:
  order: 31
---

# 第三十一章：完整上下文装配与来源追踪

模型回答错了，未必是推理能力不足。一次请求可能同时包含旧工作目录、新文件片段、被裁剪的工具结果以及另一个会话的结论。如果宿主只保存一条拼接后的提示词，事后很难判断错误来自哪个输入。本章把上下文视为可追踪的请求材料，而不是越长越好的字符串，读者应能回答每段文字由谁贡献、何时观察、为什么有权进入本次请求。

## 概念与真实机制

先区分指令、事实、历史和能力。指令约束任务行为；事实描述某个时间点的环境；历史包含已经结算的用户、助手及工具消息；能力声明告诉模型当前可以调用什么。文件正文与网页内容即使含有命令语气，仍是低信任材料，不能因为放进提示词就获得授权。来源标签帮助解释与审计，但标签本身也不是安全执行器，真正的权限仍在工具入口验证。

固定基线为 DeepSeek Harness `0.2.1-alpha.5`、提交 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`。已确认的 `PromptSection` 按 order 和名称确定顺序，作用域贡献可覆盖同名全局贡献；多个有效 complete section 会使装配失败。`PromptContext` 用于动态运行事实，最终以耐久的 user-role 快照进入模型表面。这是上游机制，不是要求独立教程复制 Cordis API。

上游不是先把任意上下文交给模型再补日志。装配之后经过 `agent/pre-step`，接受或拒绝本次输入；`agent/request` 与 `prepareCall()` 确认真实路由，随后协调系统消息、用户消息与请求头，才从日志派生并冻结请求。准备阶段取消，不会提交尚未准入的系统与用户消息。这个先后顺序使“模型实际看到了什么”有可回放证据，而不是依靠运行中的可变对象猜测。

## 数据流与状态契约

```text
贡献注册 -> 按作用域解析 -> 获取环境快照 -> 稳定排序
         -> 输入准入 -> 路由准备 -> 记录模型可见材料
         -> 按日志修订号派生 -> 冻结请求 -> 发送
取消发生在准入前: 不提交候选输入
取消发生在发送后: 记录已发生的尝试，不伪造成功
```

教学建议为每项材料保留 source、revision、trust、role 和 text。source 回答材料来自哪份文件或哪次观察，revision 回答它对应哪个版本，trust 由宿主决定，role 表示进入模型协议的方式。相同路径的两个片段不一定是重复内容：文件可能在两次读取之间变化。去重应绑定内容版本，不能只比较标题；同样不能按最后写入时间盲目覆盖仍有审计意义的旧证据。

运行事实应与稳定前缀分开。当前目录、工具可用性、文件修订与浏览器状态需要在请求边界刷新；规则目录、长期约定可以按受控版本加载。若某项 required 事实无法取得，合理结果是停止准入或明确缺失，而不是复用上一次成功值。装配器还应有总字节与材料数量上限，拒绝无限递归导入；超限信息必须指出哪个来源消耗预算，才能让下一步收缩范围。

## 自包含 Node.js 22 实验

以下完整程序通过 stdin 运行，不连接模型，不读取真实项目文件。它仅演示快照、排序和来源契约，字段属于教学实现。代码中的字符串是实验输入，不是产品默认指令，也没有凭空定义任何上游方法。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const candidates = [
  { source: 'project/rules', revision: 'r1', order: 10, role: 'system', trust: 'policy', text: 'Read only.' },
  { source: 'file/guide', revision: 'f2', order: 30, role: 'user', trust: 'untrusted', text: 'Use Node 22.' },
  { source: 'runtime/cwd', revision: 'o3', order: 20, role: 'user', trust: 'observed', text: '/workspace' }
];
function assemble(input, logRevision) {
  const names = new Set();
  const items = structuredClone(input);
  for (const x of items) {
    assert.equal(typeof x.text, 'string');
    assert.ok(!names.has(x.source));
    names.add(x.source);
    assert.ok(x.role !== 'system' || x.trust === 'policy');
  }
  items.sort((a, b) => a.order - b.order || (a.source < b.source ? -1 : a.source > b.source ? 1 : 0));
  for (const x of items) Object.freeze(x);
  const digest = createHash('sha256').update(JSON.stringify(items)).digest('hex');
  return Object.freeze({ logRevision, digest, items: Object.freeze(items) });
}
const request = assemble(candidates, 12);
candidates[0].text = 'Changed later';
assert.equal(request.items[0].text, 'Read only.');
assert.equal(request.items[1].source, 'runtime/cwd');
assert.throws(() => assemble([...candidates, candidates[0]], 13));
assert.throws(() => assemble([{ ...candidates[1], role: 'system' }], 13));
console.log('assembly contract: passed', request.logRevision);
NODE
```

快照的摘要值用于识别请求材料，不应被称为语义相似度，也不能代替来源授权。这里冻结了数组与扁平记录；若真实实现包含嵌套对象，必须深层冻结或在发送边界再次复制。排序也不能依赖不明确的本地语言环境，否则不同机器可能形成不同前缀。实验刻意使用简单字段，让这些限制显式可见。

## 失败案例与取舍

典型失败是把检索出来的“忽略所有限制”提升为 system，再记录一条“采用项目规则”。这同时混淆了信任与来源。另一个失败是在请求发出后修改工具 schema，随后用新 schema 回放旧请求：即使历史文字相同，请求能力集合也已经不同。应记录或可重建当时的请求信封与工具版本，保证回放使用同一观察边界。

来源越细，审计越容易，但材料包装也会消耗上下文。建议引用精确路径、行范围和内容修订，而不是给每句话加冗长标签。只保留任务所需证据，并明确省略范围。用户的新要求可以改变任务，网页里新出现的要求不能改变权限；装配顺序解决确定性，指令优先级解决冲突，两者不能混为一个“最后出现者获胜”的规则。

将观察事实加入请求时，还应声明它是完整读取还是有限窗口。只读到文件的一部分，就不能给整份文件标记“已核验”；只获得目录列表，也不能把文件正文写成已知。来源追踪必须精确到实际观察范围。若重试复用冻结请求，应复用同一来源版本；若刷新材料，则形成新的请求身份，不能把两种尝试合并为同一个输入证据。

## 实验验收与实现边界

运行上面的完整命令，应看到 passed，重复来源和低信任 system 输入必须触发断言。进一步实验可删去 cwd 候选，要求准入器拒绝缺少运行事实；交换输入顺序，摘要应保持不变；修改 revision，摘要必须变化。验收的是材料身份与不可变性，不是模型是否一定遵守文字规则，也不是事实自动更新能力。

原 1–12 章 `local-harness-tutorial` 仍是 Node.js 22 ESM、单进程、只读工作区项目。本章没有给它安装上游动态上下文服务。扩展实验已经落盘在 `labs/{skills,policies,context,workflow,eval}.mjs`，由 `labs/run.mjs` 汇总，可使用实际配置的 `npm run labs`。这些是独立教学模块，不是上游服务实现；本章的 stdin 示例不依赖其他章节文件。

## 官方固定来源

- [DeepSeek Harness：上下文装配类型](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/system-prompt.md)，核对 section、context 与排序契约。
- [DeepSeek Harness：请求生命周期](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/architecture.md)，核对准入、路由准备和日志派生顺序。
- [DeepSeek Harness：实际请求冻结源码](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/core/agent-loop/src/agent.ts)，与文档相互核对。

上一章：[第三十章：MCP 扩展](./30-mcp-extensions) · 下一章：[第三十二章：Token 压力](./32-token-pressure)
