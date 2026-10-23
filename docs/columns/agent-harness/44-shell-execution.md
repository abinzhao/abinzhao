---
title: 第四十四章：Shell、argv、环境与退出语义
description: 用显式进程参数、工作目录和环境构造区分直接执行与 shell 解释，并正确处理退出码、信号、超时与截断。
date: '2026-10-23'
category: 智能体工程
tags: [Shell, Subprocess]
series:
  order: 44
---

# 第四十四章：Shell、argv、环境与退出语义

模型生成 `read file.txt`，宿主究竟启动哪个程序、怎样解析空格、在哪里运行、继承什么环境？这些都是执行器契约，不是文字提示能解决的细节。把用户输入拼进 shell 字符串会引入额外解释层，把退出码零直接当成功又会隐藏取消与截断。本章建立直接 argv 执行和 shell 执行的明确区别，避免教学例子暗中扩大为任意命令权限。

## 概念与数据流

argv 是程序与参数数组，shell command 是交给 Bash、PowerShell 等解释器的源文本。直接 spawn 某个程序时，分号、美元符号和星号可以只是参数字符；通过 shell 时，它们可能代表命令分隔、变量展开或 glob。两种输入不能用简单 split 空格互相转换。转义规则也依赖平台与解释器，POSIX 引号不能直接当作 Windows 命令行的通用安全方案。

```text
argv 请求 -> 校验程序与参数 -> 明确 cwd/env/stdio -> spawn
shell 请求 -> 校验授权 -> 确定解释器 -> 解释 command -> spawn 子任务
执行 -> 有界 stdout/stderr -> close outcome
outcome = 退出码 + 信号 + 首次中止原因 + 输出完整性
```

cwd 应来自受控运行上下文，不让模型任意改变宿主目录。可执行文件也需要解析与验证：固定绝对路径减少 PATH 阴影风险，裸名称则必须依据明确环境查找。环境会携带凭据与工具配置，不能默认把宿主 process.env 全部交给不可信程序；显式白名单或去敏规则要与必要运行变量一起设计。脱敏日志不等于子进程没有收到敏感数据。

## 自包含 Node.js 22 实验

下面只启动同一 Node 可执行文件，用固定脚本展示参数，shell:false 不解析参数中的元字符。没有下载、文件写入或外部服务调用。它使用 spawnSync 是为了让实验自包含，生产流式工具不应因此采用阻塞整个 Agent 事件循环的执行方式。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const value = 'space ; $HOME * literal';
const result = spawnSync(process.execPath,
  ['--input-type=module', '-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', value],
  { cwd: process.cwd(), env: { LANG: 'C' }, shell: false, encoding: 'utf8', timeout: 2000, maxBuffer: 4096 }
);
assert.equal(result.status, 0);
assert.deepEqual(JSON.parse(result.stdout), [value]);
assert.equal(result.signal, null);
function classify({ exitCode, signal, timedOut, aborted, truncated }) {
  if (timedOut) return 'timeout';
  if (aborted) return 'cancelled';
  if (signal) return 'signalled';
  if (exitCode !== 0) return 'failed';
  return truncated ? 'completed-with-incomplete-output' : 'completed';
}
assert.equal(classify({ exitCode: 0, signal: null, timedOut: true, aborted: false, truncated: false }), 'timeout');
assert.equal(classify({ exitCode: 0, signal: null, timedOut: false, aborted: false, truncated: true }), 'completed-with-incomplete-output');
assert.equal(classify({ exitCode: null, signal: 'SIGTERM', timedOut: false, aborted: false, truncated: false }), 'signalled');
console.log('argv and outcome: passed; arbitrary shell not executed');
NODE
```

该实验没有把不可信字符串交给 `-e`；执行源文本是固定作者脚本，value 只作为参数。若改成动态 `-e value`，即使 shell:false，仍是在执行代码，不能声称安全。安全性取决于程序对参数的语义，某些工具支持脚本、插件或响应文件参数，直接 argv 只是移除 shell 解释层，不等于所有参数都无副作用。

## 已确认的上游机制

DeepSeek Harness `0.2.1-alpha.5` 固定提交将 shell request 与 fully-resolved spec 分开，resolve 明确填充 workdir、期限、输出限额和策略。subprocess spec 不供应隐藏默认值，argv 不被 shell 解释。文件系统、子进程、LSP 与终端应处于同一执行世界；远程 provider 的目录和可执行路径不能由本机路径规则臆造。

上游环境处理清除继承的 DSH_*，再合并当前受控事实，避免旧 Agent 的目录或身份残留。普通 env、stdin 与 foreground stdout cap 属于可信 in-process 插件输入，model-facing bash 工具没有任意暴露这些字段。删除继承凭据之后显式传入仍可能保留凭据，这是可信调用者的决定，不应被描述成“所有环境变量自动安全”。

已确认的 shell outcome 分别记录 exitCode、signal、timedOut、aborted 与输出状态。超时和用户取消采用首次原因分类，不能仅依赖最终退出码；进程捕获终止信号后退出零，也仍是被中止的运行。stdout 与 stderr 有独立完整性，截断可以保留 tail 与可用 Spill，但不存在完整 Spill 时不能声称日志已完整保存。

## 失败案例与取舍

第一类失败是把文件名 `notes; extra-command` 拼进 command，解释器会把参数变成额外语句。应该优先使用已支持的 argv 调用，或在确需 shell 时建立明确允许范围与解析策略，不能以正则删除几个字符作为通用防注入。另一类失败是把 shell command 用 split(' ') 转成 argv，带引号、管道或换行的含义全部改变，结果既不安全也不正确。

退出语义也会误导任务结论。测试命令可能输出失败但 shell 最后一个 echo 返回零；管道退出状态取决于解释器配置，不能只看最后一段。工具应报告真实解释器、退出码与完整输出，Agent 还需检查测试工具自己的结果。stdout 有 JSON 时，stderr 诊断不能随意混入 stdout，否则协议解析会失败；截断 JSON 应明确拒绝完整解析，而不是尝试修补。

默认继承工作目录与环境会让同一任务在不同机器出现不同结果。用户 shell 配置可能改变 alias、PATH、代理和字符编码；执行器若使用登录 shell，要说明加载范围。为了可重复实验，应使用最少明确配置；生产场景则平衡必要工具链与凭据隔离。不要在日志输出全部环境来排障，只记录允许字段、来源与缺失状态。

命令执行还需要权限、超时、输出背压与进程树清理。用 Promise.race 返回超时不能停止仍运行的子进程；限制输出内存也不能代替终止无限写入。取消原因应进入最终结果，资源要等到 quiescence 后释放。对于外部副作用，信号终止只表示本地进程停止，不能保证它之前发出的网络请求也被撤销。

执行记录还应说明是否真正启动了程序。可执行文件不存在、目录无权限或准备阶段超时，与启动后返回非零是不同错误。前者通常没有程序副作用，后者则可能已经写入文件或发出网络请求。结果字段应保留这一差异，并将最终信号与首次停止原因分别记录；不能因为没有输出，就推断没有任何动作发生。

## 实验验收与实现边界

命令应证明元字符完整作为一个参数，固定子程序退出零，超时标记即使 exitCode 零也不归类成功，截断单独表达。继续实验可传含中文与换行的参数，要求 JSON 往返一致；让固定子程序返回非零，要求分类失败。真实 shell 验收还需平台解释器、PATH 阴影、取消升级、stdio 分流及大输出，不能由 argv 实验推导全部通过。

原 1–12 章 `local-harness-tutorial` 只有只读文件工具，不支持任意 shell。本文仅使用固定 Node 子程序作为教学契约，不增加命令入口或权限。现有 labs 通过不等于实现上游全部 shell provider；真实执行能力必须按平台与授权单独实现，PTY 和进程树将在下一章进一步区分。

## 当前首次停止原因与环境合并

2026-10-23 对照 [DeepSeek rc.2 Subprocess](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/subsystems/subprocess.md)：环境先清理继承的 `DSH_*`，再合并可信调用者显式值；普通变量可用显式 `undefined` tombstone 删除，刻意传入的凭据形状字符串仍可能保留。因此当前推荐是最小启动环境与精确覆盖，不是“执行器会自动清掉所有秘密”。

前面 classify 的 timeout 优先只是固定案例的简化，真实同时取消/超时必须保存**第一次观察到的停止原因**，不能在结算时按布尔优先级猜测。操作练习为运行记录增加只写一次的 `firstStopCause`，分别测试先 cancel 后 timeout、先 timeout 后 cancel；正常验收保留首次原因并独立记录信号和 exitCode。异常验收是进程捕获信号后退出零仍标 cancelled，以及 spawn 前失败不冒充已执行。排错记录实际解释器、cwd、可执行身份与允许环境字段的存在性，不打印整个 env。

## 官方固定来源

- [DeepSeek Harness：Shell 请求与结果](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/shell.md)。
- [DeepSeek Harness：Subprocess 显式 spec 与环境](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/subprocess.md)。
- [Node.js 22：child_process](https://nodejs.org/docs/latest-v22.x/api/child_process.html)，核对 spawn、shell、退出与 stdio，而非自创执行 API。

上一章：[第四十三章：文件编辑](./43-file-editing) · 下一章：[第四十五章：PTY 与后台任务](./45-pty-background-jobs)
