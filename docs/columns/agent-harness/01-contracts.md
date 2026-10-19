---
title: 第 01 章：用服务契约拆分 Agent Harness
description: 从零建立 Node.js ESM 项目，用明确的输入、输出和副作用边界组合本地工作区助手。
date: '2026-10-17'
category: 智能体工程
tags: [Node.js, 服务契约]
series:
  order: 1
---

# 第 01 章：用服务契约拆分 Agent Harness

本章只讲一个核心概念：**Harness 的模块边界，应由服务契约决定，而不是由某个模型 SDK 的调用方式决定。** 完成这一章，你会得到可运行项目的目录、公开入口和服务形状，并能说明一次回答中的网络、文件读取、持久化分别由谁负责。

我们要解决的真实问题是：让一个本地助手阅读指定工作区，回答“这个项目如何运行”，并引用文件路径。模型能提出读取文件的请求，却不能直接拥有整个文件系统；终端需要显示增量文本，却不能把尚未完成的回答当成历史；下次运行需要接续对话，却不能继承上次失败的半条工具调用。把这些要求塞进一个 `chat()` 函数，最初容易运行，之后很难确认责任和失败边界。

[下载完整项目](/downloads/agent-harness.zip)。解压后进入 `agent-harness/`；在本站仓库中，对应目录是 `examples/agent-harness/`。全文命令均从这个示例根目录运行。项目使用 Node.js 22 原生 ESM，没有新增第三方依赖，也不是 DeepSeek Harness 官方 SDK。运行时调用真实的本机模型接口，不会在连接失败时返回预写答案。

## 1.1 先描述承诺，再选择文件

服务契约至少回答四个问题：接收什么、返回什么、可能产生什么副作用、失败由谁处理。只写参数类型还不够，例如一个返回字符串的函数，可能来自网络生成，也可能来自文件读取，两者的授权、取消和重试策略完全不同。

本项目把一次运行拆成四个主要服务。provider 接收模型消息和工具定义，返回已经结算的 assistant 消息；tools 接收工具名和参数，只读取允许的文件；session 追加运行事实，并从完成的运行派生历史；agent 消费前三者，控制有限循环。CLI 则是组合入口，不决定文件能否读取，也不解释 SSE 字节。

这不是为了追求更多模块，而是让真实变化只影响一个责任边界。更换兼容模型地址不应修改路径检查；改变会话存储不应修改模型工具参数；增加浏览器入口不应复制另一套 agent 循环。反过来，若两个模块都能“顺便”执行文件读取，就已经无法准确解释访问控制在哪里生效。

还要区分模型承诺和程序承诺。系统提示词可以要求引用证据，但不能保证模型一定引用准确；程序可以保证工具只读、越界参数被拒绝、无终止标记的流不被提交。教程中可确定性验证的是后者，回答质量需要真实模型验收。

## 1.2 从零建立最小项目

项目没有打包器、转译器和依赖注入框架。目录直接表达责任：

```text
agent-harness/
├── package.json
├── README.md
├── src/
│   ├── index.mjs
│   ├── scope.mjs
│   ├── provider.mjs
│   ├── tools.mjs
│   ├── session.mjs
│   ├── context.mjs
│   ├── agent.mjs
│   ├── cli.mjs
│   └── web.mjs
├── test/
│   ├── harness.test.mjs
│   ├── cli.test.mjs
│   └── web.test.mjs
├── workspace/
│   └── guide.md
└── web/
    └── index.html
```

从空目录重建时，先建立这些文件位置，再按各章完整源码填入实现。前六章建立核心运行能力，第七至十二章依次讲上下文预算、取消重试、可观测性、行为测试、CLI 组合和 Web 传输。需要立即运行全部能力时，下载包包含所有文件，不要求先拼接十二篇片段。

当前 `package.json` 的完整内容如下：

<<< @/../examples/agent-harness/package.json

`type: "module"` 明确包使用 ESM；`.mjs` 又明确每个源码文件的模块解释方式。相对导入保留扩展名，避免借用某个打包器的隐式解析规则。这里没有 `dependencies`，所以不需要执行 `npm install`。`npm` 只是运行脚本，执行能力来自 Node 自带的 `fetch`、Web Streams、文件 API 和测试运行器。

本项目声明的运行门槛是 Node.js 22，不要把上游 monorepo 的 pnpm、TypeScript 和构建命令移植进来。那是另一套产品工程配置，不能因为教程参考它的思想，就声称本地例子依赖同样的工具链。

## 1.3 公开入口不负责启动程序

完整的 `src/index.mjs` 是一个导出入口：

<<< @/../examples/agent-harness/src/index.mjs{js}

导入它会获得函数定义，不会启动 HTTP 服务器、读取某个默认会话或请求模型。这种“导入无启动副作用”的性质很重要：测试可以直接消费核心接口，CLI 可以选择何时初始化服务，未来另一个入口也不必先执行终端逻辑。

这里导出 `runAgent`，而不是导出一个已经连接默认模型的全局 agent。调用方必须明确提供 provider、tools 和 session；依赖在函数参数中可见，测试才可以用确定性替身核对状态协议。替身只是测试依赖，不是用户运行时的备用回答来源。

`SYSTEM` 同样从入口导出，便于核对当前系统指令。它不是可随意替换的权限开关：无论提示词如何描述，真正的文件访问范围仍由 `createTools()` 控制。公开导出也不意味着所有内部状态都公开，例如 session 的事件数组和 tools 的规范化根路径仍保留在闭包中。

## 1.4 核对各服务的实际形状

以下签名直接对应当前实现，不是 TypeScript 声明，也不是上游 API 的翻译：

| 服务 | 创建方式 | 对外成员 | 契约重点 |
| --- | --- | --- | --- |
| scope | `createScope()` | `get(name)`、`mount(plugin)`、`dispose()` | 服务注册有归属，卸载反向清理 |
| provider | `createProvider({ baseURL, model, fetchImpl })` | `complete(messages, tools, options)` | 只返回已结算回复，文本增量另走回调 |
| tools | `createTools(workspace)` | `definitions`、`execute(name, args, options)` | 定义给模型看，执行时仍校验输入 |
| session | `await openSession(directory, id)` | `history()`、`append(event)` | 历史是完成运行的派生结果 |
| context | `selectContext(messages, system, budget)` | 返回消息数组 | 按完整用户轮次选取历史 |
| agent | `runAgent(options)` | 返回最终回答字符串 | 有限步执行，发布事件并提交运行事实 |

provider 的 `options` 中实际支持 `signal` 和 `onDelta`，tools 的选项支持 `signal`。session 的 `append()` 返回 Promise，调用方必须等待成功后再依赖那条记录。不能从成员名称臆造 `session.save()`、`provider.chat()` 或 `tools.register()`，这些方法不在教学项目里。

消息使用 OpenAI 兼容的普通 JSON 形状。用户消息有 `role: 'user'` 和字符串 `content`；assistant 可以带 `tool_calls`；工具结果用 `role: 'tool'` 和 `tool_call_id` 对应调用。工具 arguments 在 provider 边界仍是 JSON 字符串，直到执行前才解析。保持这个边界，才能区分“已收到参数文本”和“已授权执行工具”。

## 1.5 契约怎样组合成一次运行

下面是直接使用公开入口的最小运行。它会创建本地会话文件，并请求本机 Ollama，因此只有准备好模型服务后才执行：

```sh
MODEL=qwen3:4b node --input-type=module <<'JS'
import {
  createProvider, createTools, openSession, runAgent,
} from './src/index.mjs';

const provider = createProvider({ model: process.env.MODEL });
const tools = createTools('./workspace');
const session = await openSession('./.harness', 'contracts');
const answer = await runAgent({
  provider, tools, session,
  prompt: '阅读 guide.md，说明运行边界并引用路径',
});
console.log(answer);
JS
```

这个片段不是完整 CLI 的替代品：它没有配置终端超时和 SIGINT 传播，所以日常使用随包 CLI。它的教学价值是把四个责任放在同一视野中。模型不拿到工作区绝对路径，只拿到工具 schema；tools 不拿到会话日志；session 不负责决定何时再次请求模型。

`runAgent()` 内部先取 `session.history()`，加上本次用户消息，再进入循环。每一步由 provider 结算回复；如果有工具调用，就解析参数、执行工具、生成对应结果；随后将 assistant 与结果作为完整组追加。没有工具调用的 assistant 才能结束本次运行。

因此“服务都返回 Promise”不意味着它们可以任意并行。模型下一步依赖工具结果，会话提交依赖完整工具组，结束记录依赖最后一个无需工具的 assistant。明确契约，也是在明确哪些工作有先后顺序。

可以用故障反向检查这个组合。模型地址格式不合法，应该在 provider 创建时失败，不应该到文件工具里才发现；工作区不存在，应该由文件能力明确报告，不应该自动改读另一个目录；会话无法追加，agent 不应把这次运行当成已经可恢复的成功。沿着副作用的归属找原因，通常比沿着调用栈里最后一个函数名找原因更可靠。

再做一个替换思想实验：假设另一个 provider 仍接收相同消息，返回相同 assistant 结构，并遵守取消和结算承诺，agent 就不需要知道它的底层请求库。相反，即使某个对象也有 complete 方法，但在工具 arguments 没收齐时就返回，它已经违反契约。相同方法名不代表可替换，行为边界才决定替换是否成立。

入口配置也要停留在正确层次。MODEL 选择模型，WORKSPACE 选择授权的根目录，SESSION_ID 选择历史身份，它们不会凭空增加工具。把环境变量解释放在 CLI，核心函数接收明确值，可以避免测试与应用因隐式读取不同工作目录而产生两套行为。

最后核对输出归属：agent 的返回值是最终答案，emit 是过程观测，session 是可恢复事实。一个消费者可以只关心最终答案，也可以展示过程，但不能因为不展示事件就省略结果持久化。分开三种输出不是重复保存，而是让它们各自拥有不同的可靠性要求。

## 1.6 为什么暂不增加通用框架

目前只有一个固定模型适配器、两个只读工具和一个本地存储实现。用普通对象传参已经能表达替换关系，没必要为了可能的远端存储先设计插件市场、服务发现或配置 DSL。通用框架会额外引入版本、启动顺序和运行时反射问题，读者反而看不清最基本的不变量。

另一方面，完全不分层也有成本。例如 provider 直接把流片段写入 session，就会把显示更新和持久事实混在一起；tools 直接向终端打印结果，就会让 Web 入口无法复用。同样是少量代码，清楚的责任边界比“所有逻辑都在一个文件里”更容易验证。

本项目的 scope 只提供所有权管理，不提供类型注入、热更新、依赖图解析或安全隔离。普通 JavaScript 对象仍然可变，核心函数没有完整地验证任意第三方 provider 的每个字段。这是受控教学组合的约束，不应宣称它能直接接入不可信插件。

## 1.7 与固定版本上游准确对照

上游参考固定在 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`，根包版本 `0.2.1-alpha.5`，最新核验日期为 2026-10-17。这是本教程的可复查快照，不承诺 alpha 接口之后保持不变。

[上游架构](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/architecture.md) 将 capability 分成定义、提供者和消费者，并通过 Cordis 组织插件。对应到本项目，`complete()` 是模型能力契约，`createProvider()` 提供实现，`runAgent()` 消费它。这个对应是职责对应，不是函数签名兼容。

上游模型采用带身份和来源的内容块消息，可核对 [模型类型源码](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/llm/llm/src/types.ts)。教学项目只保留纯文本和函数工具调用，不实现 reasoning、图像、adapter 私有回放状态等完整词汇。

上游会话从事件派生模型历史，可核对 [会话类型源码](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/core/session/src/types.ts)。教学项目沿用“日志与历史分开”的思想，却没有实现上游全部事件、surface projection 或存储版本迁移。不能直接拿本项目的 NDJSON 导入上游。

## 1.8 运行、排错与验收

先检查不需要模型的能力：

```sh
node --version
node --input-type=module -e "import('./src/index.mjs').then(api => console.log(Object.keys(api).sort()))"
node --test test/harness.test.mjs
node src/cli.mjs --help
```

应看到公开函数导出、核心协议测试通过，以及 CLI 帮助信息。测试使用确定性 HTTP 服务和 provider 替身，验证真实代码的请求结构、状态转换和拒绝路径，不证明任何模型已经生成了答案。

准备本机 Ollama，选择已安装且支持工具调用的模型后，再运行：

```sh
ollama list
MODEL=qwen3:4b npm start -- "阅读 guide.md，说明运行边界并引用文件路径"
```

`qwen3:4b` 是具体可选名称，不保证当前机器已安装或硬件适合。模型不存在应检查 `ollama list`；连接失败应检查本机服务和 `MODEL_URL`；不要通过删除 loopback 检查解决远端地址拒绝。模型服务未启动时，失败是正确行为，项目没有伪回答降级。

验收本章要能回答三个问题：导入核心为何不会启动应用；每个服务的副作用由谁承担；测试替身为何能验证运行协议却不能验证回答质量。真实模型还应读取 `guide.md`、在回答中引用实际路径、不声称修改文件。只看终端出现文字，不足以确认这些承诺。

---

深化阅读：[Agent 与 Harness 的职责](./13-agent-foundations)、[Harness SDK 宿主契约](./61-harness-sdk)。前者解释控制权，后者把本章的服务边界扩展到可编程宿主。

上一篇：[专题入口与完整路线](./index.md) · 下一篇：[第 02 章：插件生命周期](./02-plugin-lifecycle.md)
