---
title: 第三十三章：工具懒加载与大结果 Spill
description: 将工具能力发现与执行授权分开，用完整存储、有限预览和可检索定位符控制大结果的上下文成本。
date: '2026-10-23'
category: 智能体工程
tags: [工具发现, Spill]
series:
  order: 33
---

# 第三十三章：工具懒加载与大结果 Spill

拥有很多工具，不等于每次都应把所有 schema 发给模型；得到很大的结果，也不等于必须整段塞进下一次请求。工具发现与大结果转存处理的是请求的两端：前者减少能力描述成本，后者减少结果内联成本。本章要求读者建立完整结果与模型预览的对应关系，并能解释发现、加载、授权和执行为何是不同状态。

## 概念与真实机制

工具懒加载可以先提供目录摘要，按任务补入具体定义；但名字被搜到，不表示模型有权执行。目录来源可能变更，工具可能被卸载，作用域限制也可能收紧。执行前必须重新从当前注册表解析工具并校验参数与权限。缓存的 schema 是观察，不是永不过期的能力凭证。特别是多个 MCP server 的同名工具，需要稳定命名空间，不能靠展示文字选择宿主。

DeepSeek Harness `0.2.1-alpha.5` 固定提交的工具源码明确区分当前可见集合和 knownNames，schema 还可以携带 deferLoading 元数据。knownNames 用于判断配置拼写错误与故意隐藏的工具，不能把隐藏集合直接展示给模型作为后门目录。具体发现行为由注册与消费方共同决定；仅看见字段不能推出任何产品都已经采用同一种搜索算法。

Spill 则是完整内容保存。已确认的 `SpillStore.saveText` 保存传入文本原文，返回不透明 locator、准确字节数和 retrievalHint。owner 表示保存时的存储命名空间，source 描述生产者，不是访问控制。消费者决定预览和替换；存储服务本身不负责裁剪、搜索或清理策略。不能把“保留了头尾”解释为“完整数据已经保存”。

## 数据流与状态契约

```text
任务 -> 搜索受限目录 -> 加载具体 schema -> 请求边界确认可见性
     -> 执行准入 -> 完整结果 -> 判定是否超内联预算
                            -> 保存成功 -> 预览 + locator + 字节数
                            -> 保存失败 -> 保留原结果或显式拒绝
需要更多证据 -> 按 retrievalHint 有界读取 -> 新观察进入历史
```

上游本地 Spill 后端使用受控根目录、按 session 哈希分组与排他创建，建议文件名会被处理为单一路径段。模型应把 locator 当不透明句柄，不假定所有后端都能用 read(path)。远程存储可能返回 URI 或操作令牌，检索方式由 retrievalHint 说明。这个提示仍是数据，宿主不能因为其中出现 shell 命令就跳过权限验证。

上游 Spill policy 保存失败时采取 best-effort：保留原始内联结果，不把成功工具变成错误。这是已确认行为，但教学实现可以选择明确预算拒绝，只要写清区别。两种选择的成本不同：保留结果可能导致后续上下文溢出，拒绝则会损失正常任务体验。无论选哪种，都不能返回不存在的定位符，或把磁盘已满伪装成转存成功。

## 自包含 Node.js 22 实验

下面用内存 Map 验证转存协议，避免把实验扩展为实际磁盘修改。字符串是固定实验样本，不代表真实工具输出统计。内存存储故意不耐久；程序结束之后所有 locator 都失效，不能称为已实现本地 Spill 后端。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const store = new Map();
function saveText({ owner, content, fail = false }) {
  if (fail) throw new Error('storage unavailable');
  const digest = createHash('sha256').update(content).digest('hex');
  const locator = `demo-spill:${owner}:${digest}`;
  store.set(locator, content);
  return { locator, bytes: Buffer.byteLength(content), retrievalHint: 'Use bounded demo retrieval.' };
}
function present(content, fail = false) {
  if (Buffer.byteLength(content) <= 40) return { inline: content };
  try {
    const ref = saveText({ owner: 'session-a', content, fail });
    return { preview: content.slice(0, 12), truncated: true, ...ref };
  } catch {
    return { inline: content, spillFailed: true };
  }
}
function retrieve(locator, start, length) {
  assert.ok(Number.isInteger(start) && start >= 0);
  assert.ok(Number.isInteger(length) && length >= 0 && length <= 32);
  assert.ok(store.has(locator), 'unknown locator');
  return store.get(locator).slice(start, start + length);
}
const full = 'line with useful evidence\n'.repeat(8);
const shown = present(full);
assert.equal(store.get(shown.locator), full);
assert.equal(shown.bytes, Buffer.byteLength(full));
assert.equal(retrieve(shown.locator, 0, 12), shown.preview);
assert.equal(present(full, true).inline, full);
assert.throws(() => retrieve('missing', 0, 12));
assert.throws(() => retrieve(shown.locator, 0, 33));
console.log('spill contract: passed');
NODE
```

程序的 start 与 length 是字符串 code-unit 范围，不是 UTF-8 字节偏移，真实接口必须选择并标注坐标。这里用英文样本避免跨代理项切分影响主要实验。生产后端如果按字节读取，需要处理多字节边界；如果按行读取，需要说明换行规则与最大行长。准确总字节数不自动保证每次片段读取也采用相同单位。

## 失败案例与取舍

一种隐蔽失败是工具报告“测试全部通过”，但预览恰好只保留开头，结尾存在失败总结。头尾预览比只取头部好，但仍不能证明中间没有反例。模型应该先按问题检索关键模式，再读取邻近上下文，最后基于完整证据形成结论。预览应注明截断，不允许把省略部分默认解释为无异常。

另一个失败是把 locator 的生产者名称当访问权限。跨会话引用与 Fork 可能继承旧定位符，原始文件的所有权不会自动转移，清理也可能导致引用失效。读取端必须有授权和失效错误；清理端应考虑引用关系。不要让随意删除旧会话目录破坏仍可访问的分支，也不要因为 locator 看起来难猜就宣称有安全隔离。

懒加载与 Spill 都会多一次检索往返。对于少量短工具和小结果，直接内联更简单；对大型工具目录和长日志，受控加载通常更划算。应该测量 schema 字节、请求估算、检索次数与遗漏证据，不以“工具数量下降”当唯一收益。发现结果需在请求边界固定，而真正执行时仍做最新权限检查，兼顾可回放与安全。

转存还应保留结果类型与调用身份。两个内容相同的工具结果可以共享存储内容，但审计上仍是两次不同观察，不能因为摘要相同就合并 callId。检索片段进入下一请求时，也应注明来自哪次完整结果和哪个片段范围。这样才能区分完整结果、预览和后续补读，避免把一份旧日志中的成功行用于解释刚刚发生的失败调用。

## 实验验收与实现边界

完整命令应输出 passed。保存失败必须留下原文，未知 locator 与越界读取必须拒绝；改变头部预览长度，完整存储内容不能随之改变。进一步可将关键失败行放在中间，要求检索找到它，再验证结论。这个验收证明保存与展示解耦，不证明磁盘安全、跨会话授权或检索质量已经完成。

原 1–12 章 `local-harness-tutorial` 没有任意文件写入或真实 Spill 存储，本章实验没有扩大只读工作区权限。扩展 `labs/context.mjs`、`labs/policies.mjs` 和汇总 `labs/run.mjs` 已经落盘，可用 `npm run labs` 运行独立实验；本章不会修改这些文件，也不把内存 Map 当作耐久后端。本章不臆造 MCP 搜索端点，也不声称 deferLoading 等同于所有上游工具发现功能。

## 当前发现契约与缓存边界

2026-10-23 的推荐是将 Host 懒加载与 MCP 协议发现分开。固定 MCP `2026-07-28` 的 `server/discover` 返回服务器能力，不执行自然语言工具搜索；`tools/list` 提供可分页目录，`subscriptions/listen` 显式接收获确认的变化通知。`deferLoading` 是 Host 的 schema 装配策略，不是 MCP wire 的通用工具搜索方法，不能给任意 Server 发送臆造的 `tools/search`。完整流程见[第 26 章](./26-mcp-tools-resources#mcp-工具发现)与[第 29 章](./29-mcp-runtime-recovery)。

依据：[当前固定 tools 规范](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)与 [DeepSeek rc.2 Spill](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/subsystems/spill.md)。操作上先在当前授权内组装目录，再冻结一次请求的已加载定义；执行前仍从现行注册表校验。正常验收是同内容可共用存储但不同 callId 不合并；异常验收是授权撤销、目录过期和 Spill 保存失败时不返回虚假可读 locator。练习给内存 store 增加独立读权限检查，证明 owner 字符串和猜中的 locator 都不能自行授予读取权。排错分别统计发现次数、内联字节、完整保存状态和补读范围。

## 官方固定来源

- [DeepSeek Harness：Spill 保存与失败语义](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/spill.md)，核对原文保存、locator 和本地后端约束。
- [DeepSeek Harness：工具注册表源码](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/core/tools/src/index.ts)，核对 knownNames、可见性和 deferLoading。
- [DeepSeek Harness：跨会话引用](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/session-reference.md)，核对有界材料与来源身份。

上一章：[第三十二章：Token 压力](./32-token-pressure) · 下一章：[第三十四章：上下文压缩](./34-context-compaction)
