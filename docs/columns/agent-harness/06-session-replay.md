---
title: 第 06 章：从追加日志回放已完成的会话
description: 用 NDJSON 保存运行事实，验证完整工具组与状态转换，并仅从已完成运行派生后续模型历史。
date: '2026-10-23'
category: 智能体工程
tags: [Node.js, 会话回放]
series:
  order: 6
---

# 第 06 章：从追加日志回放已完成的会话

本章只讲一个核心概念：**持久日志保存发生过的事实，模型历史是按明确规则从事实派生的视图。** 两者不能简单等同。

真实问题是用户昨天让助手读取 `guide.md`，今天希望继续追问。直接保存一个 messages 数组虽然方便，却难以判断最后一条 assistant 是否完成、工具是否执行、用户是否取消。另一种错误是把所有终端增量都写进去，下次请求得到重复前缀和半条工具调用。

[下载完整项目](/downloads/agent-harness.zip)，从解压后的 `agent-harness/` 根目录运行命令。示例是 Node.js 22 ESM，无新依赖，默认在当前目录 `.harness/` 保存会话。本章只实现单进程本地日志，不是数据库，也没有跨进程锁、完整格式迁移或自动崩溃修复。

## 6.1 为什么不直接保存模型消息数组

messages 描述模型接收什么，却不足以描述运行发生了什么。例如一条带 tool_calls 的 assistant，必须等到全部工具结果配齐才构成可继续使用的历史；它前面的文本可以已经显示，但整个运行仍可能失败。

追加日志保留运行边界，让恢复策略可解释。begin 表示本次输入进入运行，turn 表示一次结算消息组，end 表示运行如何结束。重启时先验证这些事实，再决定哪些消息进入 history。

教学实现采用保守规则：只有 status 为 completed 的完整运行进入模型历史。failed、cancelled 和缺失结束记录的 running 运行都被排除。排除不是删除，磁盘中仍可保留早先成功追加的步骤事实。

因此“回放”在这里指重新派生对话消息，不是重新执行工具，也不是把模型重新调用一次得到相同答案。读取工具结果来自记录的字符串，不能在恢复时重新读取文件替换旧证据，否则历史就悄悄变成了当前文件状态。

## 6.2 当前 session 完整源码

实际实现位于 `src/session.mjs`：

<<< @/../examples/agent-harness/src/session.mjs{js}

`openSession(directory, id)` 是异步创建函数，返回 `history()` 和 `append(event)`。id 只允许一到六十四位字母、数字、下划线和连字符，最终文件名是 `${id}.ndjson`。不接受 `../name`，避免把会话名当成任意路径。

directory 则由可信入口选择，CLI 对 DATA_DIR 做 resolve。函数创建目录时请求 `0700`，新文件请求 `0600`，但不会自动修复已有目录或文件的权限。已有数据目录仍需调用方保护，不能只看代码中的 mode 参数就认定全部历史都私密。

读取时不存在的文件视为新会话，其他文件错误继续抛出。整个日志超过八 MiB 就拒绝打开；当前代码先读取全文再检查大小，因此这不是流式、常量内存的加载器。它适合小型教学会话，不适合无限积累的长期归档。

## 6.3 三种记录怎样表达一次运行

下列数据是解释存储格式的最小结构样例，不是模型生成的回答：

```json
{"type":"begin","runId":"a","message":{"role":"user","content":"first"}}
{"type":"turn","runId":"a","messages":[{"role":"assistant","content":"done"}]}
{"type":"end","runId":"a","status":"completed"}
```

每个对象单独一行，这就是 NDJSON。运行时 runId 来自 agent 的 UUID；存储校验要求非空字符串，不强制只有 UUID 才合法，因此基础测试可以使用短编号。

一个 turn 可以包含 assistant 及若干 tool 消息。assistant 没有调用工具时，turn 只有一个成员；有工具时，结果必须全部配对。这个 turn 是消息结算组，不等同于上游一个用户 turn，也不包含本项目的完整 begin 到 end 生命周期。

记录没有单独的全局 seq、时间戳和格式版本。运行顺序来自文件行序，同一 runId 的状态在重放时折叠。不要从 NDJSON 后缀推断它与某个外部会话格式兼容，字段和验证规则才决定兼容性。

## 6.4 工具调用与结果必须一起验证

`validateEvent()` 校验事件形状。turn 必须从 assistant 开始，content 是字符串或 null；后续 results 数量等于 assistant 的工具调用数量；每个结果的 role、调用编号和字符串内容必须与对应调用一致。

调用 id 在同一组里不能重复，调用类型必须是 function，函数名和 arguments 必须是字符串。当前函数不提供任意第三方事件的完整 JSON Schema 校验，输入是本项目受控 agent 生成的普通 JSON。

保存完整组的原因不是减少行数，而是维护协议关系。若分别写 assistant 和每个 tool，进程可能在中间停止，下次看到一个只有部分结果的 assistant。当前 agent 先收齐 settled，再通过一次 append 保存一个组，减少正常控制流中出现半组的机会。

但一次写入不等于磁盘事务原子性。进程或系统在写入中途损失，仍可能留下半行；重启时 JSON 解析失败，项目会明确拒绝，而不是猜测工具到底完成了没有。完整组是逻辑提交单位，不是防电源故障的事务保证。

## 6.5 状态转换必须在落盘前拒绝

`checkTransition()` 负责跨事件验证：同一个 runId 只能 begin 一次；turn 和 end 必须属于已经开始且仍 running 的运行；completed end 还要求最后一条消息为不带工具调用的 assistant。

```js
if (event.type === 'begin') {
  if (runs.has(event.runId)) throw new Error('Duplicate run');
} else {
  const run = runs.get(event.runId);
  if (!run || run.status !== 'running') throw new Error('Invalid run transition');
  if (event.type === 'end' && event.status === 'completed'
    && (run.messages.at(-1)?.role !== 'assistant'
      || run.messages.at(-1)?.tool_calls?.length)) {
    throw new Error('Cannot complete an unsettled run');
  }
}
```

append 在实际文件写入之前调用这个校验，accept 更新内存时也沿用相同规则。先写后检查会留下严重后果：调用方收到拒绝，但非法行已经污染磁盘，下一次会话打不开。验证必须守住持久化边界，而不只是保护内存 Map。

最后 assistant 带工具调用，即使该组结果完整，也表示还欠下一次模型解释，不能直接标 completed。步数耗尽时 agent 会记 failed，这与第五章有限循环一致。

当前状态机验证基本运行边界，不验证全部模型语义，也不实现签名防篡改。能够编辑日志的人仍可能编造一组结构合法的内容，所以会话目录的可信性与权限保护是必要前提。

## 6.6 追加队列解决同一实例的写入顺序

append 在入队前对事件做 structuredClone，避免调用方排队之后继续修改原对象，使最终写入内容与提交时不同。真正的工作接到 queue 后依次执行，因此同一个 session 对象的记录不会因为异步 file open 顺序乱序。

每项工作先校验、序列化为带换行的 JSON，再检查累计大小。随后以追加模式打开文件，写入、sync、关闭，成功后更新内存运行状态和 text。history 只会看到已经完成这些步骤的提交。

```js
await handle.writeFile(line);
await handle.sync();
```

`sync()` 请求刷新文件数据，代价是每条事件都有磁盘同步成本。例子选择简单的明确提交，不引入批量缓冲和后台刷盘。它没有完整的目录项持久化、事务或断电恢复协议，不能据此宣称所有系统崩溃都零丢失。

queue 使用 catch 将内部链恢复为可继续状态，但 append 返回的 job 仍向调用方报告错误。这不是吞掉失败制造成功，而是避免一项失败永久阻断后续排队项。若失败已经造成半行，继续写并不能自动修好磁盘，调用方应停止并检查。

这个队列只属于一个对象。同一路径在另一个 openSession 实例、另一个 CLI 进程或另一个 Web 进程中拥有另一份 queue。追加模式不解决跨实例状态一致性；本项目要求一个会话目录由一个进程写，Web 只提供进程内运行锁。

## 6.7 回放如何产生模型历史

打开文件时，按行 JSON.parse，并通过 accept 重建 runs。遇到损坏行或非法转换，会抛出包含行号的 `Corrupt session`，原始原因保留在 cause 中。代码不静默跳过错误记录，因为跳过的可能恰好是工具结果或结束状态。

成功折叠后，history 过滤 completed，再展开各运行消息并返回深拷贝：

```js
return structuredClone(
  [...runs.values()]
    .filter((run) => run.status === 'completed')
    .flatMap((run) => run.messages),
);
```

返回拷贝避免消费者通过改写数组影响内部 runs。它不是冻结 API，调用方可以修改自己的返回值，只是这些修改不回写到 session。append 的输入快照和 history 的输出快照分别保护两个方向。

进程在完整 begin 或 turn 后消失，旧 run 可能保持 running；重启后它不会进入 history，也不会自动重新执行中断工具。若磁盘末尾是不完整 JSON，则整个打开失败。项目没有自动尾部修复，不能擅自删最后一行后宣称会话恢复无损。

此外，本地日志并未保存 SYSTEM、实际模型路由、工具定义和每次选中的上下文。因此能恢复完成对话，不等于能够逐字重建所有旧模型请求。更换当前配置后继续运行，语义可能变化，这个差异必须与上游更完整的记录机制区分。

## 6.8 用同名会话继续实际对话

先准备本机 Ollama 和支持工具调用的已安装模型，再从示例根运行：

```sh
ollama list
SESSION_ID=replay MODEL=qwen3:4b npm start -- "读取 guide.md，概括运行边界"
SESSION_ID=replay MODEL=qwen3:4b npm start -- "基于刚才的证据，哪些事情这个助手不能做？"
```

复用 SESSION_ID 和 DATA_DIR 才能找到同一日志。改变工作目录会影响默认 `.harness/` 的位置；改变 WORKSPACE 不会让历史工具内容自动重读。这些配置变化都应是明确操作，不是恢复函数的猜测。

可以只检查消息角色与数量，避免把全部会话正文打印出来：

```sh
node --input-type=module <<'JS'
import { openSession } from './src/index.mjs';
const session = await openSession('./.harness', 'replay');
const history = session.history();
console.log({ count: history.length, roles: history.map(message => message.role) });
JS
```

第二次成功运行应延续第一轮完成消息；失败或取消的运行不应成为模型上下文。真实模型是否正确理解“刚才”仍需验收，日志角色数量只验证数据结构，不能证明回答质量。

## 6.9 与固定版本上游对照

参考固定提交 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`，根包 `0.2.1-alpha.5`，历史快照核验日期 2026-10-17。[上游 Session 文档](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/session.md) 明确模型历史从 append-only 事件日志派生，可核对 [会话实现源码](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/core/session/src/index.ts) 和 [事件类型源码](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/core/session/src/types.ts)。

上游有 seq、时间、surface projection、请求 header、provider/model 身份以及精确 compact assistant stream。教学项目只有三种事件和完成运行过滤，不提供上游完整的请求重建、fork 或版本迁移。

尤其不能说上游与本项目一样排除所有取消内容。该固定版本允许取消时将安全可见前缀保存为带 interrupted 标记的 assistant/message，未派发工具不进入该前缀；无模型可见结果的失败尝试用 assistant/attempt 留作日志事实。教学项目采取更保守的整次未完成运行排除规则。

上游还把内存事件模型与 persistence seam 分离。教学实现为减少启动复杂度，把文件持久化与折叠放在同一模块。可借鉴的是“事实与投影视图分离”，不是认为任何 JSONL 都可以互相导入。

### 恢复需要校验版本，而不只校验 JSON

2026-10-23 核对[当前 DeepSeek 发布渠道](https://github.com/deepseek-ai/deepseek-harness/releases)，RC 不保证会话格式跨版本兼容。合法 JSON 只证明可解析，不证明工具、SYSTEM、工作区身份和权限仍对应原运行；本教学日志未保存这些完整身份，恢复时需要调用方另行核对。

练习：完成一个临时会话后改变工作区，再用同名 session 追问，观察旧工具内容不会自动刷新；另造缺少 end 的合法尾部与损坏 JSON 尾部，比较“排除在历史外”与“拒绝打开”。两类异常不要用同一种删行修复。版本向量、迁移和未知副作用处理见[第 73 章](./73-version-governance)。

## 6.10 排错与完成标准

从示例根运行确定性测试：

```sh
node --test --test-name-pattern="session replay|invalid session transitions|agent executes" test/harness.test.mjs
```

已有用例创建完成和取消记录，重开后核对历史只含完成消息，并验证损坏记录和非法 id 被拒绝；循环测试核对真实工具组持久化。它们验证存储和状态协议，不启动真实模型，也不承诺全部崩溃场景已覆盖。

状态转换用例还有一个关键检查：刚写入 begin 就请求 completed，必须因尚无最终 assistant 而拒绝；接着写 failed 并重新打开，日志仍然可读。这证明非法状态没有先落盘再报错，比只断言 append 抛出异常更能验证持久边界。

遇到 Corrupt session，先停止写入，备份后定位行号与原因，不直接清空文件；超过大小上限，使用新的 SESSION_ID，而不是关闭检查；历史为空，检查运行是否 completed、目录是否相同，以及是否误启动了多个写进程。

完成标准是重开得到同一份完成消息、失败运行不混入模型历史、工具调用与结果完整配对、坏记录明确失败。多进程锁、自动尾部修复、敏感内容加密和完整旧请求重建仍未实现。第七章将在这份合法历史之上讨论预算，保证裁剪也不破坏工具协议。

---

深化阅读：[事件日志与模型表面](./37-event-surface)、[耐久存储](./38-durable-storage)、[会话分支](./39-session-branching)、[副作用与检查点](./40-checkpoints-side-effects)。消息回放与动作重做是不同契约。

上一篇：[第 05 章：Agent 循环](./05-agent-loop.md) · 下一篇：[第 07 章：上下文预算](./07-context-budget.md)
