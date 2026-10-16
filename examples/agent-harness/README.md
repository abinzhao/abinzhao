# Local Harness：从零构建工作区助手

这是独立的教学项目，参考 DeepSeek Harness 的插件所有权、流式结算、工具边界和会话回放思想，不是其官方 SDK。参考版本：`1517a4dbca0a2789ff1d41ba439600f8547d23fa`，`0.2.1-alpha.5`，核验日期 2026-10-17。

## 运行

需要 Node.js 22 或更新版本。示例无第三方依赖，不需要 npm install。

```sh
node --version
npm test
```

安装并启动本机 Ollama 后，选择支持 tools 的模型。以下名称是一个可选模型，不保证你的硬件可运行；`MODEL` 必须与 `ollama list` 中的已安装名称一致。

```sh
ollama pull qwen3:4b
ollama list
MODEL=qwen3:4b npm start -- "阅读 guide.md，说明运行边界并引用路径"
MODEL=qwen3:4b npm run web
```

Web 地址：`http://127.0.0.1:8787`。按 Ctrl+C 停止。Ollama 未启动会失败，不会生成伪回答；首次 pull 需要联网下载模型，此后推理请求只发送到本机。

## 文件

| 文件 | 核心知识 |
| --- | --- |
| `src/index.mjs` | 服务契约与模块边界 |
| `src/scope.mjs` | 插件注册及反向清理 |
| `src/provider.mjs` | SSE 解码、工具增量和受限重试 |
| `src/tools.mjs` | 运行时校验与文件路径边界 |
| `src/agent.mjs` | 有限状态循环及运行事件 |
| `src/session.mjs` | NDJSON 追加、已结算消息回放 |
| `src/context.mjs` | 按完整用户轮次选择上下文 |
| `src/cli.mjs` | CLI 组合、超时及 SIGINT 传播 |
| `src/web.mjs`、`web/index.html` | SSE 传输与可取消界面 |
| `test/` | 确定性协议、工具、状态与运输层测试 |

## 配置与边界

`MODEL_URL` 默认 `http://127.0.0.1:11434/v1`，只允许 HTTP loopback，禁止重定向。`WORKSPACE` 默认随包 `workspace/`；`DATA_DIR` 默认当前目录 `.harness/`；`SESSION_ID` 默认 `default`，使用同名继续已完成的历史。

工具只读非隐藏的源码文本，文件类型、路径、大小均有校验。路径检查防止一般的目录穿越和静态符号链接逃逸；它不是操作系统沙箱，不支持攻击者并发重命名祖先目录的威胁模型。

会话目录只允许本项目一个进程写入。Web 在进程内拒绝并发运行；没有跨进程文件锁。每个 turn 把 assistant 及其全部 tool 结果一并追加；损坏记录拒绝回放，需要备份后人工检查。取消和失败运行不会进入后续模型历史，也不自动续做中断工具。

上下文预算按 UTF-8 JSON 字节估算，不是精确 token 计数；已有完整轮次可被裁掉，当前轮次超预算直接失败。默认保留 24,000 输入字节，必须按实际模型窗口另留输出预算。

事件包含运行编号、工具名、状态和耗时。默认不记录提示词或工具内容到日志，但本地会话包含这些内容，应像工作区文件一样保护。Web 仅同源本机访问，回答用 `textContent` 渲染。

## 验证范围

自动测试里的 HTTP 服务与 provider 替身用于确定性验证协议和状态转换，不是模型回答。真实 Ollama 的工具选择、事实引用及输出质量需要通过上面的实际问题另行检查；测试通过不代表模型质量通过。

## 参考

- [DeepSeek Harness 架构](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/architecture.md)
- [流式结算](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/llm-streaming.md)
- [工具扩展](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/cookbook/adding-a-tool.md)
- [Ollama 工具调用](https://docs.ollama.com/capabilities/tool-calling)
