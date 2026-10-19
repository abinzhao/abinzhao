---
title: 第十一章：把 Harness 组合成 CLI
description: 用 scope 装配 provider、tools 和 session，明确环境变量、Ollama 前置条件、超时与退出语义。
date: '2026-10-17'
category: 智能体工程
tags: [Node.js, CLI 组合]
series:
  order: 11
---

# 第十一章：把 Harness 组合成 CLI

前面的模块各自能够测试，但用户不能靠手动导入五个函数来完成一次问答。可用入口要决定模型在哪里、工作区是什么、会话保存到哪儿，还要在出错或按下 Ctrl+C 时收拢资源。把这些决定散进 provider、工具和循环内部，模块就会逐渐依赖终端环境，难以复用到浏览器入口。

本章只讨论**组合根**：在程序边缘读取配置，建立服务所有权，把已经明确的依赖交给 runner，最后统一处理退出。CLI 不增加新的 Agent 能力，也不重新实现工具循环；它只是把已有 Harness 变成一个可预测的本机命令。

参考基线核验于 **2026-10-17**：DeepSeek Harness `0.2.1-alpha.5`，提交 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`。上游根清单声明 TypeScript `^6.0.3`，运行以 Cordis 插件树和配置层组合。本例是独立 Node.js 22 ESM 项目，既不要求安装上游，也没有使用其官方 SDK。

## 一、入口负责环境，模块负责行为

provider 接受 URL 和模型名，tools 接受工作区，session 接受目录和 ID，runner 接受这几个服务及运行参数。只有 `cli.mjs` 读取 `process.env` 和 `process.argv`。这让测试能够直接传依赖，而不必为了切换一个模型修改全局环境。

入口的完整代码就是最终可运行程序：

<<< @/../examples/agent-harness/src/cli.mjs{js}

组合过程按 provider、tools、session 的顺序挂载，再定义统一 `run()`。单次 CLI 和 Web 都经由这个 run 进入同一个 `runAgent()`。以后替换一种 provider，只需在组合点提供遵守契约的服务，而不是让循环了解每个模型的配置语法。

创建 provider 不等于已经连接模型。它验证配置并返回 `complete()`；网络请求发生在实际运行时。因此入口打印帮助或完成服务注册，不能作为模型健康检查。真正验收应观察一次请求是否产生完整结算，以及工具证据是否进入下一步。

## 二、scope 是所有权容器，不是上游 Cordis

`scope.mount()` 接受一个函数，函数通过 `ctx.provide()` 注册服务。runner 调用时用 `scope.get()` 取得这些服务；`finally` 执行 `scope.dispose()`，按反向顺序撤销挂载。第二章已讲清它的注册回滚，这里重点看入口为什么需要一个统一所有者。

```js
await scope.mount(async (ctx) => ctx.provide('provider', createProvider({
  model: process.env.MODEL ?? 'qwen3:4b', baseURL: process.env.MODEL_URL,
})));
```

若 provider 配置不合法，后面的 session 不需要继续创建；若 session 打开失败，已经挂载的服务也要在 finally 中撤销。反向清理与反向依赖相匹配，让组合失败不会留下半套注册。它不是依赖注入框架自动推断，而是入口显式决定的顺序。

当前三项挂载只注册服务，没有在这几行额外注册服务器关闭回调。Web 服务器由 CLI 自己持有并关闭；session 也没有一个长期打开的文件句柄等待 dispose，每次追加会自行打开、同步并关闭。不能把“scope 清理服务表”夸大成“自动关闭程序里所有资源”。

这个小 scope 借鉴 Cordis 的可逆效果所有权，但没有配置树、类型增强、插件包发现或热卸载系统。介绍它时应该明确这是参考实现的局部模式，不要让读者尝试使用不存在的 Cordis context 字段或上游插件配置文件。

## 三、五个环境变量的真实语义

当前入口只读取五个业务环境变量：

| 变量 | 默认值 | 影响范围 |
| --- | --- | --- |
| `MODEL` | `qwen3:4b` | provider 请求里的模型名称 |
| `MODEL_URL` | `http://127.0.0.1:11434/v1` | 本机 OpenAI 兼容接口地址 |
| `WORKSPACE` | 随包 `workspace/` | 只读工具允许访问的根目录 |
| `DATA_DIR` | 当前目录 `.harness/` | 本地 session 文件目录 |
| `SESSION_ID` | `default` | 文件名与完成历史复用 |

默认工作区用 `import.meta.url` 相对入口模块定位，所以换终端工作目录不会改变随包的示例工作区。默认数据目录则经 `resolve()` 相对当前工作目录计算。因此从两个不同目录启动，可能访问同一默认工作区，却写入两份不同会话文件。

这是一个常见排障点：看起来“同一个 SESSION_ID 没有记住历史”，实际是 DATA_DIR 变了。需要稳定会话时显式指定目录，或者保持启动目录一致。不要把文件不存在归结为模型失忆，也不要为了寻找历史去扫描无关用户目录。

`MODEL` 只是名字，不会自动下载或安装模型。入口用空值合并选择默认值，环境变量若被显式设置为空字符串，不会退回默认模型，而会在 provider 校验时失败。`MODEL_URL` 也不是任意远端服务：只允许 HTTP loopback，不允许凭据、查询、片段和重定向。

当前没有 `MAX_STEPS`、`CONTEXT_BYTES`、`PORT` 或 API Key 配置。runner 有 `maxSteps` 和 `contextBytes` 参数，不意味着 CLI 自动读取同名环境变量；`startWeb()` 的 port 参数也没有暴露为 CLI 环境变量。准确的配置文档必须按入口读取代码写，不能按习惯补齐一张虚构配置表。

## 四、先验证帮助，再准备模型

下载[完整源码](/downloads/agent-harness.zip)，进入 example 根目录：

```sh
node --version
node src/cli.mjs --help
```

Node.js 应为 22 或更新版本。项目使用 `.mjs`、原生 fetch、ReadableStream 和内置测试运行器，没有第三方运行依赖，不需要 `npm install`。包脚本只是调用 Node 入口，不能把 npm 成功执行脚本与模型可用混为一谈。

`--help` 分支在创建 scope、打开 session 和请求模型之前退出。当前检查方式是 `argv.includes('--help')`，所以只要参数中含有它就显示帮助。它不是一个完整参数解析器：没有 `--model`、`--workspace`、`--session` 这些开关，相关配置都用环境变量传入。

Web 模式要求第一个参数为 `--web`，而且参数总数只能为一；单次模式把其余参数以空格连接为 prompt。包含空格的自然语言建议用引号，避免 shell 拆分和特殊字符解释。不要把未知开关误认为已受支持，它可能只是被当作提示词文字。

模型准备应以本机真实状态为准：

```sh
ollama pull qwen3:4b
ollama list
MODEL=qwen3:4b npm start -- "阅读 guide.md，说明运行边界并引用路径"
```

这里 `qwen3:4b` 是可选示例，不保证任何硬件都能运行；模型名必须与 `ollama list` 的已安装结果一致，并确认该模型支持 tools。首次下载通常需要联网，此后默认推理请求只发送到本机。模型不存在或服务未启动时，程序报错，不会生成替代的假回答。

能生成普通文字也不证明模型符合工具协议。真实验收还要观察它是否给出合法工具名、完整 JSON 参数和可结算的调用，读取之后是否根据结果继续回答。如果模型只忽略工具而直接猜测，CLI 进程可能正常退出，但“用文件证据回答”的任务标准仍未满足。

首次运行建议保持默认工作区，只用随包 guide.md 检查完整闭环，再显式指定自己的只读源码目录。这样模型服务、工具能力和工作区路径可以分步定位，不会在首次接入时同时引入私密文件、超大上下文和复杂目录权限，让失败原因互相掩盖。

## 五、一次运行如何使用已有服务

入口创建的 run 函数每次从 scope 取 provider、tools 和 session，并合并进程级取消与这次调用的 signal。它把返回 Promise 保存为 `activeRun`，在关闭 Web 服务时能够等待当前工作结束，而不是关闭监听端口后立刻丢弃后台任务。

```js
const run = (prompt, { signal, emit }) => {
  activeRun = runAgent({
    provider: scope.get('provider'), tools: scope.get('tools'), session: scope.get('session'),
    prompt, signal: AbortSignal.any([controller.signal, signal]), emit,
  });
  return activeRun;
};
```

单次模式只调用一次 run；Web 模式反复使用同一组服务，但运输层锁保证进程内只有一个活动运行。`activeRun` 只有一个槽位，并不是多任务调度表，也没有排队能力。如果绕过 Web 锁并发调用，不能宣称这一入口仍具备完整并发管理。

重复使用 SESSION_ID 只继续 completed 历史，不会自动恢复取消的工具循环。两个独立 CLI 进程若同时写同一个目录和 ID，也不受 Web 进程内锁保护。当前没有跨进程文件锁，应该避免这种启动方式，而不是认为 NDJSON 追加天然等于多进程事务安全。

工作区工具只有 `list_files` 和 `read_file`。即使模型说“我运行了命令”或“我已经修改配置”，当前 Harness 也没有执行那种动作。真实验收需要核对模型陈述与工具能力，而不是给 CLI 入口添加一行成功提示便认为任务已经完成。

## 六、stdout、stderr 与退出码

文字增量写入 stdout，其他结构事件写入 stderr，成功后补一个换行。stdout 是流式回答，可能在运行失败前已经出现部分内容；管道消费者不能仅依据“有输出”判断成功，应同时检查进程退出码。

普通错误进入 catch 后设置退出码 1；单次运行被 `SIGINT` 控制器取消并进入 catch，显示 `Run cancelled` 并设置 130。单次九十秒超时不等于进程控制器已取消，因此会以普通错误出口退出为 1，虽然 runner 的持久化状态属于 cancelled。

这里没有调用 `process.exit()` 立即强杀进程，而是设置 `process.exitCode`，再让 finally 清理作用域。目的是保留异步结算和清理机会；这不保证忽略 signal 的任意自定义模块都能及时退出，协作取消仍依赖各组件遵守契约。

stderr 的结构事件之外还会包含异常文本。需要解析日志时应识别 JSON 行与普通错误行，不能假设整个文件天然是严格 NDJSON。stdout 和 session 都可能包含私密工作区证据，分流只是数据用途分离，不是脱敏或加密。

## 七、九十秒与 SIGINT 的入口差异

单次 CLI 使用 `AbortSignal.timeout(90_000)`，整个工具循环共享这个期限，不为每一步重新计时。Ctrl+C 通过 `process.once('SIGINT', interrupt)` 触发进程控制器，再经组合 signal 到达 fetch 与工具检查点。finally 移除监听，避免入口结束后遗留信号处理器。

Web 模式本身可以持续提供服务，每次 HTTP 运行由 `startWeb()` 创建独立的九十秒期限。Ctrl+C 后 CLI 关闭全部连接和监听服务器，等待 activeRun 结束，再清理 scope。它不是让整个 Web 服务器只存活九十秒。

Web 的正常 Ctrl+C 关闭路径会完成等待逻辑，不一定经过设置 130 的 catch。因此不能把“所有 Ctrl+C 都返回 130”写成统一承诺。进程正常关闭、单次运行取消和 HTTP 请求取消，是三个相互联系但不同的出口。

关闭连接会让 Web 请求的控制器取消，进程信号也取消同一运行。两条途径最终汇入 runner；当前只读工具采用检查点式取消，文件系统等待本身未必立即中止。排障时既要观察入口是否收到信号，也要检查最终执行组件是否合作结束。

## 八、可运行的验收与失败定位

在 example 根目录可做不依赖模型的验收：

```sh
node src/cli.mjs --help
node --test test/harness.test.mjs test/web.test.mjs
MODEL_URL=https://example.com/v1 node src/cli.mjs "这个请求应在本地配置校验处失败"
```

最后一条应报 loopback 地址限制并退出为 1，不向示例远端发送模型请求。它检查的是配置准入，不是网络可达性。帮助命令应退出为零；核心与 Web 测试验证已经组合的行为，不代替真实模型试运行。

CLI 测试以 `import.meta.url` 定位子进程入口，因此下载包根目录的 `npm test` 与网站仓库根目录的测试命令运行相同用例。十七项确定性测试覆盖核心、Web、CLI 帮助与工作区初始化失败；`node src/cli.mjs --help` 应独立退出为零。帮助路径不创建模型请求，真正推理还要使用已安装模型运行问题，不能用帮助文本代替模型接入验收。

具备模型后还应在生成中按 Ctrl+C，观察退出、会话状态和后续回放；启动 Web 后再正常关闭，检查监听端口和活动运行都已结束。当前核验环境没有 Ollama，真实工具选择、回答质量、生成期间取消和模型超时体验尚未验证。

模型请求失败时，先核对 MODEL_URL 和服务是否运行，再核对安装名称与 tools 支持；工具读取失败检查 WORKSPACE 与允许路径；历史缺失检查 DATA_DIR 与 SESSION_ID。按依赖边界排查，比把所有错误都解释成“模型连接失败”更准确。

本章的完成标准是入口配置真实、帮助离线可用、依赖装配有所有者、两个运行模式共享行为、退出等待与资源责任清楚。一个薄而明确的组合根，才能让下一章的 Web 运输层复用同一个 Harness。

## 固定来源

- [DeepSeek Harness：插件树与应用启动](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/architecture.md)：对照入口组合、所有权与不同应用 profile，本例不实现上游配置层。
- [DeepSeek Harness：固定版本根清单](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/package.json)：核对 `0.2.1-alpha.5` 和 TypeScript 版本声明。
- [Ollama：工具调用能力](https://docs.ollama.com/capabilities/tool-calling)：核对模型支持前提，文档能力不等于本机安装状态。
- [Node.js 22：进程信号与退出码](https://nodejs.org/docs/latest-v22.x/api/process.html#signal-events)：确认协作退出与信号处理边界。

深化阅读：[Harness SDK](./61-harness-sdk)、[Claude Agent SDK](./62-claude-code-sdk)、[Codex App Server](./63-codex-app-server)、[OpenCode Server](./64-opencode-server)。入口组合的思想可以迁移，具体 SDK 类型和授权契约不能混用。

上一章：[第十章：行为测试](./10-behavior-tests) · 下一章：[第十二章：Web 运输层](./12-web-transport)
