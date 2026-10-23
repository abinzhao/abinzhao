---
title: 第四十三章：文件编辑、观察新鲜度与 Diff
description: 从目标身份、版本守卫和原子替换理解编辑工具，防止陈旧观察覆盖用户修改并让 Diff 对应真实执行结果。
date: '2026-10-23'
category: 智能体工程
tags: [文件编辑, Freshness]
series:
  order: 43
---

# 第四十三章：文件编辑、观察新鲜度与 Diff

Agent 读完文件之后，用户也修改了它。随后 Agent 按旧内容写回，用户的新改动可能消失。单纯规定“编辑前先读”不能防止这类竞态，观察必须携带版本，修改必须在同一个受控操作里验证版本。本章要求写工具说明目标身份、观察状态、替换范围与真实结果，不能把生成一个 Diff 当作实际修改成功。

## 概念与数据流

文件路径是输入，解析后的 target 是后端身份，version 是该身份的观察修订。相同字符串路径可能通过 symlink 指向不同对象，远程后端也可能用 URI 表达目标；消费者不能自己解析不透明身份。读到一个文件表示它曾在某版本存在，确认不存在则只允许有条件创建，两种观察不能互换。观察新鲜度解决覆盖风险，路径授权解决访问范围，两者都需要验证。

```text
路径 -> 授权与后端解析 -> 读取/确认不存在 -> 记录 version
编辑意图 -> 最新授权 -> 条件版本检查 -> 精确匹配 -> 原子替换
执行结果 before/after/version -> 生成结果 Diff -> 审计与再次观察
版本不符: 拒绝并重读，不能自动扩大替换范围
```

编辑还应区分整文件替换与局部文字替换。整文件替换容易覆盖无关改动，局部替换则可能出现零匹配或多匹配。默认要求唯一匹配，有意 replaceAll 才允许多个位置；失败时应保留原文件。不能用正则随意忽略空白、自动格式化整份文件，或找到相似片段就猜用户希望修改的位置。准确失败比误改更容易恢复。

## 自包含 Node.js 22 实验

下面内存文件验证版本守卫与唯一替换，完全不写当前工作区。它以整数 version 简化后端版本令牌，不具备磁盘原子性、symlink 防护或多进程锁。字段与方法属于教学实现，不是上游 FileSystem API。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
const file = { version: 1, text: 'left = 1;\nright = 1;\n' };
function observe() { return structuredClone(file); }
function edit(expected, oldText, newText, replaceAll = false) {
  assert.equal(file.version, expected, 'stale observation');
  assert.ok(oldText.length > 0);
  const matches = file.text.split(oldText).length - 1;
  assert.ok(matches > 0, 'no match');
  assert.ok(replaceAll || matches === 1, 'ambiguous match');
  const before = file.text;
  const after = replaceAll ? before.split(oldText).join(newText) : before.replace(oldText, () => newText);
  file.text = after; file.version++;
  return { before, after, version: file.version };
}
const old = observe();
file.text += 'user = 2;\n'; file.version++;
assert.throws(() => edit(old.version, 'left = 1', 'left = 3'));
assert.ok(file.text.includes('user = 2'));
assert.throws(() => edit(file.version, '= 1', '= 9'));
const result = edit(file.version, 'left = 1', 'left = 3');
assert.ok(result.before.includes('left = 1'));
assert.ok(result.after.includes('left = 3'));
assert.ok(result.after.includes('user = 2'));
assert.equal(observe().version, result.version);
assert.throws(() => edit(file.version, '', 'bad'));
console.log('guarded edit: passed; no filesystem mutation');
NODE
```

这里将检查和赋值放在同步临界区，只能说明单进程教学模型的行为。真实文件后端不能在检查版本后 await 一个不受控写入，再把“原子 edit”交给调用者组合；版本检查、文字匹配、换行处理与发布应由后端一起负责。内容哈希能帮助发现变化，但文件身份、权限与目录竞争仍需底层原语，不能靠哈希证明安全沙箱。

## 已确认的上游机制

DeepSeek Harness `0.2.1-alpha.5` 固定提交将 fs provider、observation policy 与 model-facing tool 分开。`FsTarget` 与 `FsVersion` 是不透明值，消费者可展示 displayPath，不能假设 targetKey 是本机绝对路径。provider 通过 processPath、fileUrl 与 contains 提供同执行世界的坐标，而不是让 shell、LSP 与工具自行推断路径。

已确认的 writeText 与 editText 可以带可选守卫；裸 provider 没有守卫时可无条件写入，默认 read-before-write 行为由 observation policy 提供。部署移除策略插件不会让工具无法启动，却会改变安全行为，因此“API 能用”不代表新鲜度保护仍在。guarded createIfAbsent 要拒绝后来出现的目标，replaceIfVersion 拒绝不匹配或不存在；编辑守卫先检查陈旧版本，再进行文字匹配。

上游结果 before/after 是 Diff 的真实基础，工具在结果时生成 contextual diff；不是把模型建议的补丁当实际执行结果。LF 标准化或二进制无法提供上下文时，展示需要说明降级范围。Diff 证明展示了某次变化，不证明测试通过、不证明用户授权，也不证明其他文件未被命令修改。验收还需检查最终内容与相关行为。

## 失败案例与工程取舍

一种失败是读到文件前十行，随后工具整文件覆盖，丢掉未观察部分。读窗口和整文件写意图必须分开，不能把有限预览当作全量旧内容。另一种失败是出现多匹配时自动选择第一个，修改了注释中的示例而非真实代码。应报告匹配数量、重新读取精确上下文，再由明确范围完成修改，不能以“patch 已应用”掩盖目标误判。

陈旧观察不一定意味着用户冲突，也可能来自另一个工具、格式化器或生成流程。恢复方法不是放宽版本断言，而是重新读取当前内容，重新评估原目标是否仍合理。用户已有改动应保留，生成文件应通过源文件或规定工具修改。重读后若方案不变，也要使用新观察产生新的受控意图；旧请求不能无限重试直到某次偶然匹配。

路径安全还涉及 TOCTOU：校验根目录后，攻击者可能替换目录项或 symlink。受控本地只读示例并不能提供对抗性写沙箱，生产后端需要相应平台原语和故障验证。lstat 最后路径段能帮助识别链接，却不自动解决所有中间目录竞态。新鲜度策略与沙箱都存在明确能力边界，应在工具结果中说明，不把“有版本令牌”作为隔离证明。

大型文件也需要限额。读取与结果 Diff 可以按范围展示，完整修改结果仍需保存或可检索；截断要有明确标记，不能省掉失败行后宣布无冲突。文件工具的错误应区分权限、过大、缺失、陈旧、零匹配和多匹配，让 Agent 选择重读、收缩或停止。统一报“编辑失败”会诱导无意义的重试，也让用户无法判断自己的改动是否受保护。

## 实验验收与实现边界

命令应证明旧观察拒绝，用户新增内容仍存在，多匹配拒绝，唯一替换成功，返回的 before/after 对应真实内存变化。继续实验可尝试同旧 version 再写一次，要求拒绝；使 oldText 不存在，要求保持文本不变；模拟已不存在目标，必须采用明确的缺失错误。真实验收还需 symlink、并发进程、换行、超大文件和原子发布故障。

原 1–12 章 `local-harness-tutorial` 只读工作区，不包含写入或编辑权限，本章不修改这一边界。扩展 labs 可以验证内存守卫，但不会因此变成生产文件后端；实际编辑能力、操作系统约束与 UI Diff 仍需独立实现和授权。本文只交付自包含实验及机制说明，不让教学工具执行真实文件覆盖。

## 当前窗口读取与新鲜度不是同一保证

2026-10-23 对照 [DeepSeek rc.2 Filesystem](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/subsystems/filesystem.md)：上游观察策略按文件版本授权，不区分 full/partial 读取，窗口读取也能在版本不变时成为后续写入的新鲜度依据，没有 `FS_PARTIAL_OBSERVATION`。这是实现事实，不等于 Agent 已理解未读取的全部内容；需要保护未观察内容的应用应另设完整读取或精确补丁约束，不能声称上游默认已经提供。

`fs/observed` 是同步的记录通知，监听器应只记录且不抛错；否则观察监听失败可能在修改已发生后表现为工具 `isError`。正常验收须核对实际 before/after 和当前版本，不仅看工具成功标签；异常验收应注入修改后监听失败，确认不重复执行写入。练习在原内存编辑函数返回后模拟审计失败，保留已修改事实并单独报告结算错误。排错分清缺少观察、陈旧版本、匹配歧义与执行后的通知失败，避免因一个错误文本误判磁盘从未改变。

## 官方固定来源

- [DeepSeek Harness：Filesystem 完整契约](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/filesystem.md)，核对 target、guard、原子 edit 与 Diff。
- [DeepSeek Harness：工具执行管线](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/tool-execution-pipeline.md)，核对策略与结果展示的不同阶段。
- [Node.js 22：文件系统 API](https://nodejs.org/docs/latest-v22.x/api/fs.html)，底层 API 能力不能代替应用权限契约。

上一章：[第四十二章：输入并发](./42-input-concurrency) · 下一章：[第四十四章：Shell 与 argv](./44-shell-execution)
