---
title: 第七章：上下文预算，保留完整用户轮
description: 用 UTF-8 JSON 字节预算选择连续历史，理解工具配对、当前轮超限与模型窗口的区别。
date: '2026-10-23'
category: 智能体工程
tags: [Node.js, 上下文预算]
series:
  order: 7
---

# 第七章：上下文预算，保留完整用户轮

一个工作区助手第一次回答很顺利，连续追问几次却开始报错。原因可能不是模型变笨，而是每轮读取的文件、工具调用参数和旧回答都在增长。把整个会话重新发送，会同时增加输入长度、延迟和内存占用；简单删除最旧几条消息，又可能留下没有调用来源的工具结果。

本章只解决一个问题：怎样在有限输入预算内，选择结构完整、时间连续的近期上下文。先不做摘要，也不引入向量检索。完成后，你应能解释一次请求保留了哪些轮次，为什么某段历史被裁掉，以及为什么当前轮太大时程序选择失败。

参考基线核验于 **2026-10-17**：DeepSeek Harness `0.2.1-alpha.5`，固定提交 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`。上游是使用 TypeScript 和 Cordis 的插件框架；本教程是独立的 Node.js 22 原生 ESM 参考实现，不是上游 SDK，也不复刻上游上下文压缩接口。

## 一、磁盘历史不等于请求上下文

上一章的 session 保存运行事实，`history()` 只投影已经完成的运行。现在再增加一层选择：本次模型真正收到的消息，可以只是这份已完成历史的一个后缀。磁盘记录、可回放历史、请求上下文是三个不同集合，不能用同一个数组概念含混带过。

`runAgent()` 先取得历史，再追加这次用户输入。工具执行后，已经结算的 assistant 和 tool 消息进入运行中的消息数组。每次调用模型之前，才重新计算预算并选择上下文。因此裁剪发生在请求边界，不是写盘边界，也不是用户输入框中。

这种区分有两个直接结果。被裁掉的旧轮仍然保存在会话文件中，重新打开 session 不会把它们删除；而一个中途失败的运行，即使磁盘已有部分审计记录，也不会被 `history()` 当作下一次请求的正常前提。裁剪和失败隔离解决的是不同问题。

不要把“完整会话已保存”理解成“模型永远记得全部会话”。模型只能看见实际送入请求的内容。若用户问一个已落在预算之外的旧结论，当前实现没有自动查找旧会话的工具，也没有摘要补偿。它可能需要用户重新提供线索，这是一条可解释的能力边界。

## 二、预算为什么先用字节

当前实现计算的是 `JSON.stringify()` 结果的 UTF-8 字节数，使用 `Buffer.byteLength()`，默认 `contextBytes` 为 24,000。中文、英文、转义字符的开销并不一样，字符串的 `.length` 不能替代这个指标。比如中文通常占多个 UTF-8 字节，换行在 JSON 中还可能被转义。

字节数不是 token 数。不同模型的 tokenizer、聊天模板、系统消息处理方式都会改变真实输入 token 数；工具定义也可能被适配器转换成另一种格式。这里的预算只是容易复现的工程估算，不能把“输入两万四千字节”写成“支持两万四千 token”。

这一估算也不是完整 HTTP 请求体的精确计量。选择器对系统数组和各用户轮分别序列化，调用方另行扣除工具定义；请求外围的 `model`、`stream` 等字段不在同一求和中。它适合控制消息和工具描述的规模，不是模型供应商的计费依据或窗口保证。

选择字节的取舍是避免加入模型专属运行依赖，让不同机器上的测试能稳定复现。在真正接入特定模型时，应依据模型窗口预留输出和模板空间，调整输入预算，再核对服务端的实际用量反馈。当前示例没有自动读取模型容量，也没有精确 tokenizer。

## 三、为什么裁剪单位是完整用户轮

完整实现只有一个导出函数，阅读时关注分组、逆序扫描、溢出处理这三个位置：

<<< @/../examples/agent-harness/src/context.mjs{js}

消息序列遇到 `role === 'user'` 就开启一个新分组。该用户消息之后的 assistant、tool，以及后续工具循环产生的消息，都归入同一组，直到下一个用户消息出现。这里的用户轮是一次用户请求的整个工作过程，不是单次模型调用，也不等于只有两条消息的问答。

假设一轮中模型先提出两个工具调用，得到两个结果后再次请求模型，最后形成回答。这些内容必须一起保留。单独保留结果会让模型不知道结果对应什么请求；保留调用却裁掉结果，又可能被接口认为工具结果尚未配齐。结构性错误不能靠增加一句系统提示修好。

选择器本身不重新验证工具 ID 或消息 schema。完整性来自前面的 session 校验和 runner 的结算策略；它负责在已有合法历史中保留整组。这是职责分工：不要让预算模块再次承担工具注册、持久化或协议装配的全部工作。

历史还必须从用户消息开始，否则直接抛出 `History must begin with a user message`。系统提示单独由参数传入，而不是混在用户历史里。这使“固定约束”和“可淘汰对话”拥有不同生命周期，删除旧轮不会顺便删除只读工具边界。

## 四、保留连续后缀，而不是挑最便宜的轮

核心循环从最新分组往前扫描：

```js
for (let index = groups.length - 1; index >= 0; index--) {
  const next = sizeOf(groups[index]);
  if (size + next > budget) {
    if (index === groups.length - 1) throw new Error('Current turn exceeds context budget; shorten the prompt or start a new run');
    break;
  }
  kept.unshift(...groups[index]);
  size += next;
}
```

最新轮必须进入；旧轮则在剩余空间足够时依次加入。虽然遍历顺序是从新到旧，最终使用 `unshift()` 恢复原来的时间顺序。返回给模型的结构始终是系统消息在前，保留的用户轮按发生顺序排列。

碰到一个装不下的旧轮就停止，而不是跳过它继续寻找更小的更旧轮。否则一次“继续解释刚才的方案”可能保留更早主题，却丢掉“刚才”的真实参照。连续后缀不是最高压缩率方案，但更容易解释上下文为什么存在、指代为什么成立。

即使连续保留，也不能保证所有指代都完整。最新问题可能引用更早被裁掉的决定，这时模型缺少事实，而不是消息格式坏了。当前程序不会分析自然语言依赖，也不会自动补回某个被引用的旧轮。需要区分协议完整性和语义完整性，前者可由程序守住，后者仍需质量验收。

这个预算也不是进程内存上限。选择器先遍历全部历史完成分组，session 又会读取本地记录并构建运行投影；只把少量消息送进模型，不代表此前的历史没有进入内存。会话文件的八 MiB 上限与请求输入预算属于不同层，应分别理解，不能拿其中一个替代另一个。

当前实现每个步骤重新选择，适合小型本地会话，不维护缓存的分组尺寸，也不增量更新预算。若未来优化这一点，必须同时守住原时间顺序、系统消息成本和最新轮完整性。仅仅减少序列化次数，却使第二步遗漏刚追加的工具结果，属于行为回归而不是性能收益。

系统消息首先占用预算，不能为了塞入更多历史而裁掉它。如果预算不是正的安全整数，程序抛出 `Invalid context budget`。工具定义占用太多空间，导致剩余预算无效，也会在请求模型前失败。调参不能绕过固定约束的成本。

## 五、当前轮为什么不能悄悄截断

旧轮被丢弃是一种选择策略，当前轮超限则是一种运行失败。这两件事刻意不对称。最新用户输入可能尚未完成，当前工具调用也可能已经拿到关键证据；把结果截成一半继续发送，会让程序看起来成功，却让模型基于残缺材料回答。

调用方在每个 step 都重新计算：

```js
const budget = contextBytes - Buffer.byteLength(JSON.stringify(tools.definitions));
const selected = selectContext(messages, SYSTEM, budget);
```

因此短提示词也可能在第二步超预算。`read_file` 最多读取 16 KiB，用户输入又允许最多 8,000 字节，加上系统提示、工具定义、调用参数和 JSON 结构，合计未必能装入默认预算。一次读取合法，不代表累计请求也合法。

这里没有“遇到超限自动开启新会话”的动作。错误文案中的 `start a new run` 也不能消除本轮已经很大的工具结果；若同一个问题继续读取同样多的文件，仍会失败。有效动作是缩小问题范围、减少需读取的证据，或确认模型窗口后显式调整程序调用的预算。

`contextBytes` 是 `runAgent()` 参数，不是当前 CLI 的环境变量。不要尝试设置 `CONTEXT_BYTES` 后以为配置生效，入口没有读取它。需要做程序级实验时直接导入函数；这里只说明已有参数，不另加一套未实现的配置系统。

## 六、在 example 根目录复现

下载[完整源码](/downloads/agent-harness.zip)，解压后进入 example 根目录。以下命令不联系模型，不需要安装第三方依赖：

```sh
node --version
node --test --test-name-pattern="context selection" test/harness.test.mjs
node --input-type=module <<'JS'
import { selectContext } from './src/context.mjs';
const history = [
  { role: 'user', content: '旧问题'.repeat(200) },
  { role: 'assistant', content: '旧回答' },
  { role: 'user', content: '新问题' },
];
console.log(selectContext(history, '只读助手', 180));
try {
  selectContext([{ role: 'user', content: '大问题'.repeat(200) }], '只读助手', 180);
} catch (error) {
  console.error(error.message);
}
JS
```

可观察结果应包括系统消息和“新问题”，不包括旧轮；第二次选择应打印当前轮超预算的错误。测试里的旧轮还带有 assistant 工具调用和 tool 结果，断言最后角色序列只有 `system`、`user`，说明旧工具组被整体移除，而不是留下孤立结果。

这项现有测试覆盖旧组整体淘汰和当前轮超限，不等于全面证明了所有边界。例如刚好等于预算、中文与转义字符混合、多个旧轮的连续后缀，都值得在扩展算法时另行写失败用例。不要用一条通过的测试替代对求和单位和调用位置的检查。

本机准备好 Ollama 且已安装支持工具调用的模型后，可以再运行：

```sh
ollama list
MODEL=qwen3:4b npm start -- "阅读 guide.md，说明上下文预算的单位并引用路径"
```

模型名必须与本机安装结果一致。检查回答是否引用 `guide.md`，是否把字节预算误写成 token 窗口。当前核验环境没有 Ollama 服务，所以这里只给出真实模型验收入口，没有声称工具选择或回答质量已经通过。

## 七、超限时怎样定位

先确认错误是在输入校验、预算选择，还是模型响应阶段发生。用户提示词超过 8,000 字节属于 runner 输入拒绝；`Current turn exceeds context budget` 属于本地请求选择失败；服务端上下文窗口报错属于实际模型约束。三者使用不同计量范围，不能统一归咎于“历史太长”。

再看事件。预算选择发生在 `step.start` 之前，所以出现 `run.start` 后立即 `run.end: failed`，可能尚未发送任何模型请求。若上一 step 已执行工具而下一 step 没开始，应检查这一轮工具结果的累计大小。当前事件没有记录请求字节数，不能凭空从日志读出它。

需要度量时，可以在本地调试器查看 `messages`、工具定义和 `selected` 的序列化字节数，不必把提示词原文打印进长期日志。会话文件含有真实输入和工具内容，调试时也应保护它。预算问题不能成为上传私密会话到外部系统的理由。

算法不会摘要、不支持检索旧记录、不永久删除历史，也不保证适配任意模型窗口。它的完成标准更具体：系统约束保留，近期用户轮成组且连续，当前轮不能被暗中截断，超限在模型请求前可观察地失败。这是后续做更复杂上下文管理的可靠起点。

## 2026-10-23：预算回归必须固定计量口径

依据 [Node.js 22 Buffer API](https://nodejs.org/docs/latest-v22.x/api/buffer.html#static-method-bufferbytelengthstring-encoding)，本章的 `Buffer.byteLength(JSON.stringify(...))` 仍是字节计量，不应因为新模型窗口变大就改称 token 计量。Provider 更换后重新核对聊天模板、工具 schema 和输出预留；模型 ID 与 tokenizer 身份也应进入[版本记录](./73-version-governance)。

练习：用中文、ASCII、换行和 emoji 构造同字符数但不同字节数的消息，在边界值与边界值减一处分别断言接受和拒绝；再加入两轮工具消息，检查整体淘汰而非拆组。验收需要同时记录本地估算与真实 provider usage，后者没有返回时标为未知，不能用字节估算补写实测 token。

## 固定来源

- [DeepSeek Harness：架构与请求装配](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/architecture.md)：对照模型历史来自会话投影的设计，不将示例函数冒充上游 API。
- [DeepSeek Harness：Session 与派生历史](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/session.md)：上游有更完整的 surface、投影和容量事件，本例仅保留用户轮选择。
- [DeepSeek Harness：模型请求与容量](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/llm-streaming.md)：区分请求协议、模型能力与本例的字节估算。
- [Node.js 22：Buffer.byteLength](https://nodejs.org/docs/latest-v22.x/api/buffer.html#static-method-bufferbytelengthstring-encoding)：确认 UTF-8 字节计算语义。

深化阅读：[上下文装配](./31-context-assembly)、[Token 压力](./32-token-pressure)、[Spill](./33-tool-discovery-spill)、[压缩与交接](./34-context-compaction)、[Prompt Cache](./35-prompt-caching)。基础字节预算需要结合模型真实计量和事实保留策略继续完善。

上一章：[第六章：会话与回放](./06-session-replay) · 下一章：[第八章：取消与受限重试](./08-cancellation-retry)
