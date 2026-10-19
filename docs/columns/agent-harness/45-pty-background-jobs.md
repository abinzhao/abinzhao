---
title: 第四十五章：PTY、后台任务与进程清理
description: 区分终端会话、单次 send 与后台任务，以所有权、输出游标和进程树清理构建可解释的取消语义。
date: '2026-10-17'
category: 智能体工程
tags: [PTY, 进程清理]
series:
  order: 45
---

# 第四十五章：PTY、后台任务与进程清理

执行器返回“等待超时”，命令就一定结束了吗？交互式终端可能仍在运行，前台任务也可能正等待输入；杀掉顶层 shell 后，子孙进程还可能持有输出管道。本章将 PTY 会话、一次 send 和后台任务分开，要求取消传播到已拥有的进程范围，并等资源静止后才报告清理完成。无输出不是成功，shell 存活也不证明命令还在计算。

## 概念与状态契约

PTY 模拟终端设备，程序会根据终端属性改变交互、颜色和缓冲行为。普通 stdout pipe 不是 PTY，给 pipe 发送换行也不会自动得到行规程、前台进程组与窗口尺寸。Node.js 22 的 child_process 提供进程与管道，不直接提供完整跨平台 PTY 后端。因此本章不把一个 spawn 包装函数命名成 PTY 后声称终端能力已实现。

```text
终端 owner -> spawn/setup -> 发布 terminal id -> 独占 send
send -> 输入/输出游标 -> readiness 或 timeout -> 返回控制
terminal status: running 或 exited，与 send waitReason 独立
cancel send -> 前台中断；close terminal -> 清理拥有的进程树 -> quiescence
后台 job -> producer handle -> 有界 read/stop -> 结算，不假装持久进程
```

终端身份不能靠名称授权。相同 name 可以由不同 owner 使用，必须比较精确 owner 与 service-minted id。一次终端只允许一个活跃 send，否则两段输入可能交织，输出也无法明确归属。后台任务只是允许调用者先获得句柄，工作仍在资源所有者控制下；返回 jobId 不表示任务已经成功，也不表示进程会跨应用重启恢复。

## 自包含 Node.js 22 实验

下面不启动真实终端，使用状态模型检查 send readiness 与清理范围。模拟进程树只包含明确创建的节点，没有扫描或杀死本机进程。它用于验证契约，不用于证明操作系统进程组行为；真正 PTY 后端还需要平台依赖、权限和运行测试。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
const nodes = new Map([
  [10, { pid: 10, parent: null, alive: true }],
  [11, { pid: 11, parent: 10, alive: true }],
  [12, { pid: 12, parent: 11, alive: true }],
  [20, { pid: 20, parent: null, alive: true }]
]);
const terminal = { owner: 'agent-a', root: 10, status: 'running', sending: false, closed: false };
function startSend(owner) {
  assert.equal(owner, terminal.owner, 'foreign owner');
  assert.ok(!terminal.closed && !terminal.sending);
  terminal.sending = true;
  return reason => {
    assert.ok(terminal.sending);
    terminal.sending = false;
    return { waitReason: reason, sessionStatus: terminal.status };
  };
}
function close(owner) {
  assert.equal(owner, terminal.owner);
  if (terminal.closed) return;
  const owned = new Set([terminal.root]);
  let changed;
  do {
    changed = false;
    for (const x of nodes.values()) if (owned.has(x.parent) && !owned.has(x.pid)) { owned.add(x.pid); changed = true; }
  } while (changed);
  for (const pid of owned) nodes.get(pid).alive = false;
  terminal.sending = false; terminal.closed = true; terminal.status = 'exited';
}
const finish = startSend('agent-a');
assert.throws(() => startSend('agent-a'));
assert.throws(() => startSend('agent-b'));
const result = finish('timeout');
assert.equal(result.sessionStatus, 'running');
close('agent-a'); close('agent-a');
assert.ok([10, 11, 12].every(pid => !nodes.get(pid).alive));
assert.equal(nodes.get(20).alive, true);
console.log('terminal ownership model: passed; actual PTY not tested');
NODE
```

真实清理不能只在退出时按 parent pid 查询一次。父进程退出后子进程可能被重新托管，pid 也可能复用；必须在创建时建立平台支持的拥有范围，验证前台进程组并限定信号目标。Linux 进程组、容器与 Windows Job Object 有不同保证，不能用 POSIX 负 pid 技巧当作跨平台方案。示例中的遍历仅表达所有权，不提供这些系统能力。

## 已确认的上游机制

DeepSeek Harness `0.2.1-alpha.5` 固定提交的 terminal 契约区分 waitReason 与 top-level sessionStatus。stdin_read、inferred_idle、timeout、session_exit 描述一次 send 为什么返回，session_exit 才指顶层 shell 退出；其他原因不证明任意前台子任务结束。backend 在设置成功后才发布会话，初始化失败必须清理半启动资源，清理失败有独立错误分类。

上游一次 session 只有一个活跃 send，readOutput 是消费式游标，read 则针对有限 scrollback 分页。取消 send 请求 SIGINT，close 负责拥有的进程树清理并等待静止；所有权服务在清理完成后再移除身份。PTY 原始状态是进程内资源，输入与有界返回结果通过普通 tool/call、tool/result 等路径记录，不复制一个假耐久终端到 Session 日志。

subprocess 契约还给出 graceMs 与输出 drain 范围，避免顶层进程退出但幸存者持有管道导致等待永远不结束。取消需升级到已拥有的进程范围，而不是只 return 一个 aborted 对象；同时不能杀死无关进程。清理失败应暴露，不能以时间到了为由把资源标成已释放。真实策略是否分阶段升级或立即终止，要由具体 provider 文档与测试确认。

## 失败案例与工程取舍

最常见失败是用 Promise.race 在一秒后返回 timeout，但子程序继续写输出。调用者又启动新任务，同一工作区出现多个残留进程。应由所有者触发终止、关闭输入、排空或限额处理输出，并等待 quiescence。不能让日志已结束但后台异步 callback 继续修改状态；最后一次结果通知必须建立在执行工作真正结算之后。

另一个失败是收到静默就猜命令成功。程序可能等待密码、确认或网络，甚至正在后台工作。inferred_idle 是启发式等待结果，不是 exitCode；交互工具应在必要时再观察 prompt 或状态，并把不确定性传给模型。用户凭据不应通过日志或自动输入实验收集；遇到登录或需要人类判断时，应交由明确的人机交互边界。

输出也可能泄漏资源。只截断显示，却继续把全部字节堆进内存，会让长任务耗尽宿主；无限 scrollback 与无限 job 结果存储同样有风险。应分别定义内存保留、完整 Spill、总输出和读取游标上限，截断时说明证据不完整。某些终端控制序列会重写屏幕，原始字节与渲染 viewport 不能混为一种日志，重放目标需要明确。

后台 job 的取消不等于销毁整个终端。用户可能希望中断前台命令而保留 shell 状态，close 则应该结束会话及其资源；两种操作要有不同授权和结果。终端持久化名称不表示进程持久化，重启后返回旧 id 应明确失效，不用新终端顶替。跨会话共享终端更会引入隐私与输入竞争，未经设计不应开放。

资源清理可以设置有界等待，但超出等待后必须报告清理未完成，不能自动改成已关闭。后台任务列表应持续显示仍拥有的活动资源，使排障能够定位泄漏；释放身份只能发生在实际停止之后。若清理需要升级信号，必须限定在已验证拥有的范围，保留原取消原因，同时单独记录清理错误，避免后一错误掩盖用户为何停止任务。

## 实验验收与实现边界

命令应证明 timeout 返回时会话仍 running，重复 send 与外来 owner 被拒绝，close 清理模拟子孙节点但保留无关节点，重复 close 幂等。继续实验可让初始化在发布前失败，要求没有可用 id；模拟输出 cursor 被消费，重复读取不能重放已消费数据。真实验收还需 PTY 设备、窗口大小、信号升级、孤儿与管道残留，状态模型不覆盖这些事实。

原 1–12 章独立 Node.js 22 ESM 项目没有任意命令、PTY 或后台进程，本章不修改只读边界。现有 labs 可验证所有权模型，但不能宣称实现跨平台终端或进程树杀止。实际 PTY 需要明确 provider 与平台依赖，取消也不能撤销进程已经提交给外部系统的操作，这仍属于第四十章的副作用对账问题。

## 官方固定来源

- [DeepSeek Harness：Terminal 会话与 send](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/terminal.md)。
- [DeepSeek Harness：Subprocess 范围与 drain](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/subprocess.md)。
- [DeepSeek Harness：后台 Jobs 所有权](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/jobs.md)。

上一章：[第四十四章：Shell 与 argv](./44-shell-execution) · 下一章：[第四十六章：工具管线](./46-tool-pipeline)
