---
title: 第六十一章：Harness SDK 与可编程宿主
description: 区分模型客户端、智能体运行时和远程宿主，设计可取消、可鉴权、可追踪的调用契约。
date: '2026-10-17'
category: 智能体工程
tags: [SDK, 宿主协议]
series:
  order: 61
---

# 第六十一章：Harness SDK 与可编程宿主

把命令行工具包进一个函数，并不意味着已经得到可嵌入的智能体。业务应用需要知道运行属于哪个用户、是否仍在等待审批、断线后能否继续读取结果，以及何时可以释放进程。SDK 的价值是把这些责任变成明确契约，而不是隐藏一次模型请求。本章面向准备把工作区助手接入应用的开发者，先确定调用边界，再讨论类型和传输。

## 三种不同的 SDK

模型客户端通常负责认证、请求序列化和响应解析；工具执行、消息历史与循环终止仍由应用实现。Agent SDK 提供更完整的循环和内置能力，但调用者仍负责租户隔离、业务授权与产物验收。宿主 SDK 则连接长期运行的服务，暴露会话、任务、订阅和审批等业务对象。这三层可以共存，不能因为某个包名含有 agent 就推断它实现了全部层次。

原教程的 `local-harness-tutorial` 是单进程、只读、Node.js 22 原生 ESM 教学项目。它不是 DeepSeek SDK，也没有远端身份认证。下载包的 `labs/` 展示局部机制，未接入基础循环。把实验函数导入业务程序不会自动得到多租户服务、强沙箱或耐久调度器；这些必须作为新的工程门槛独立验收。

## 真实宿主的数据流

固定基线 DeepSeek Harness `0.2.1-alpha.5`，提交 `1517a4dbca0a2789ff1d41ba439600f8547d23fa` 的 Typert 文档区分本地调用描述与线上请求。`InvocationDescriptor` 是本地反射信息；请求传递 endpoint 与具名 args，取消信号由载体另行提供，不塞进业务参数。共享类型解决表达问题，不能替代运行时参数校验和访问控制。

Gateway 的顺序尤其重要：载体解码后提交调用及 Peer 身份，宿主校验参数，解析涉及的资源，并在对象 lookup 或 scoped Context 解析之前作访问决策。已经释放的 Peer 必须拒绝。这样未经授权的调用不能借对象解析顺便读取资源；查不到服务也不能悄悄退化成另一个同名方法。对应的边界错误保留结构化 code，未知内部异常才折叠为内部错误。

```text
客户端意图
  -> 载体解码 + 连接身份
  -> 参数校验
  -> 资源访问决策
  -> 对象/Context 解析
  -> 方法执行 + 带外取消
  -> 结果编码或结构化错误
```

订阅还需要所有权。客户端关闭视图只代表它不再消费，不一定代表任务应停止；断开连接后保留任务必须是显式产品语义。取消通常是合作式信号，不能撤销已发生的外部动作。SDK 应分别暴露请求取消、任务终止和结果订阅清理，不能用一个 `close()` 混合三件事。

## 自包含边界实验

下面是自定义教学网关，不是任何厂商 SDK API，也不是 Typert wire format。在示例项目根目录把整段交给 Node 执行即可；它不访问网络、不读取文件、不执行 Shell。对象授权使用可信连接身份，不接受调用参数自报的 owner。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
const sessions = new Map([['s1', { owner: 'alice', text: 'ready' }]]);
const events = [];
async function invoke(peer, request, signal) {
  if (!peer || peer.disposed) throw new Error('peer-unavailable');
  if (request.endpoint !== 'session/read' ||
      typeof request.args?.sessionId !== 'string') {
    throw new Error('invalid-request');
  }
  const resource = sessions.get(request.args.sessionId);
  if (!resource || resource.owner !== peer.subject) {
    events.push('denied');
    throw new Error('access-denied');
  }
  if (signal?.aborted) throw new Error('cancelled');
  events.push('resolved');
  return { text: resource.text };
}
const request = { endpoint: 'session/read', args: { sessionId: 's1' } };
await assert.rejects(invoke({ subject: 'bob' }, request), /denied/);
assert.deepEqual(events, ['denied']);
const controller = new AbortController();
controller.abort();
await assert.rejects(invoke({ subject: 'alice' }, request, controller.signal), /cancelled/);
assert.deepEqual(await invoke({ subject: 'alice' }, request), { text: 'ready' });
console.log(JSON.stringify({ deniedBeforeResolution: true, events }));
NODE
```

这个实验有意使用内存 Map 来表达调用顺序，不能把它视为生产资源授权实现。生产服务应防止对象存在性泄露，绑定租户、作用域和策略修订；长时间调用还要判断授权是否需要在执行前重新检查。序列化后的普通对象也不能携带可信 Peer，身份必须由载体从已认证连接恢复。

## 失败场景与取舍

最常见的错误是只在 TypeScript 编译时检查类型。外部 JSON 可以缺字段、含未知枚举或超大正文，服务端仍须限制输入大小并执行 schema 校验。第二类错误是重连后复用旧请求编号，使迟到结果完成了新任务；应区分 connection、request、run 与 session 身份，并检查当前代际。第三类错误是业务异常被转换成成功的字符串，客户端再也无法区分拒绝、取消和正常回答。

进程内调用延迟低且易于调试，但共享内存与权限，插件故障可能拖垮宿主。独立进程能分离崩溃和生命周期，却增加握手、背压及日志治理成本。远程服务适合集中运维，但网络超时不等于动作未执行。选择应由故障域和部署需求驱动，不应为了所谓统一接口提前引入通用 RPC 框架。

宿主契约还应声明结果体积和存活时间。一个方法返回异步迭代，不代表客户端可以无限缓存；应规定单条帧大小、队列上限、终态帧和消费关闭语义。二进制结果宜使用附件身份，而不是把巨大数组塞进每次响应。错误码需要稳定分类，详细堆栈只能进入授权诊断，不能直接返回给不可信客户端。

接口升级时先比较旧客户端仍依赖哪些字段，再决定新增可选字段还是引入新版本。未知能力不能在客户端反序列化时丢弃后继续执行高风险动作；应显式拒绝依赖该能力的请求。删除方法、改变取消语义或更换资源身份格式都属于行为兼容变化，需要旧客户端回归。类型生成成功只是发布前检查的一部分，仍要测真实线上字节和失配响应。

最后要把嵌入式对象寿命写进契约：谁创建运行，谁负责停止，谁持有订阅，谁能读取最终结果。调用者异常退出时是否由宿主代管必须明确。否则同一个 SDK 在脚本中正常结束，在长期服务里却留下活跃连接，成为难以复现的资源泄漏。

## 可观察验收

先运行上述实验，验收未授权请求不会进入 resolved 阶段，已取消请求不产生结果，合法请求才返回 ready。再从示例根目录执行 `npm run labs` 与 `node --test test/labs.test.mjs`，确认审批绑定、上下文组和工作流恢复的机制测试通过。它们是本地确定性证据，不是远端 SDK 集成测试。

真正接入宿主时还应测连接关闭、服务卸载、身份释放、版本不匹配和迟到响应。每个失败都应得到有界终态，并释放订阅；未知版本不能自动进入宽松模式。只有部署了实际 SDK、完成类型核验和认证测试，才能宣称集成成功。本章没有安装厂商依赖，也没有测任何云端运行效果。

## 固定来源

- [DeepSeek Typert 契约与 Gateway](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/typert.md)：上述真实调用顺序的固定提交证据。
- [DeepSeek 架构](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/architecture.md)：宿主、服务和所有权边界。
- [Node.js 22 AbortController](https://nodejs.org/docs/latest-v22.x/api/globals.html#class-abortcontroller)：教学取消信号。

上一章：[第六十章：定时任务、Webhook 与 Channels](./60-schedules-webhooks.md)

下一章：[第六十二章：Claude Code 与 Agent SDK 机制](./62-claude-code-sdk.md)
