---
title: 第四十七章：Code Mode 与程序化工具调用
description: 把程序编排与工具执行权分开，使用受控 RPC、无损 JSON 和分层取消解释 PTC，而非在宿主直接执行模型代码。
date: '2026-10-17'
category: 智能体工程
tags: [Agent Harness, PTC, Code Mode]
series:
  order: 47
---

# 第四十七章：Code Mode 与程序化工具调用

模型需要读取十个文件并统计结果，每次工具调用都往返模型会产生大量协议与上下文成本。程序化工具调用允许一段受控程序完成循环、过滤与汇总，但它不能获得任意宿主对象、文件系统和凭据。Code Mode 改变编排方式，不应改变工具权限。本章从受控 RPC 边界解释 PTC，明确程序停止与在途工具结算是两件事。

## 概念与状态契约

普通工具调用由模型给出参数，宿主执行并将结果返回模型；PTC 则让受控程序调用已公开的 bindings，在程序内部消费规范值，最终只将必要结果交回模型。程序的控制流可以灵活，但每次 binding 调用仍需参数、可见性、授权、预算和执行审计。若直接把 tools 对象与 process 放入 eval，就失去了这条边界，不是安全 PTC。

```text
模型程序 -> 受限 runtime -> RPC 请求(name,args,id)
                       -> host 白名单/参数/权限校验 -> 标准工具管线
                       <- 规范 JSON 结果/typed rejection
程序汇总 -> completion JSON -> 模型可见结果
取消 runtime: 停止发起新 RPC；在途 binding: owner 取消并等待结算
```

无损 JSON 边界拒绝函数、循环结构、不可表达数字和宿主对象，限制字节、深度与结果大小。名字查找必须是自有属性，防止 `__proto__` 或 constructor 访问原型。只限制文本长度还不够，深层嵌套、无限循环、并发洪泛和大日志都需要预算。真正执行不可信程序应选择可硬停止的隔离运行时，不能把 node:vm 本身宣称为安全沙箱。

## 自包含 Node.js 22 实验

下面不执行模型代码，使用固定作者程序调用一个受控 dispatch，验证 binding 白名单与在途取消结算。它没有创建 Worker、子进程或操作系统沙箱，因而不验证不可信程序隔离。Map 中的工具都是教学纯函数，代码没有外部 RPC 或文件读写。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
const registry = new Map([
  ['add', async ({ a, b }, signal) => {
    assert.ok(Number.isFinite(a) && Number.isFinite(b));
    await delay(5, undefined, { signal });
    return { sum: a + b };
  }]
]);
function jsonValue(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  const ok = Array.isArray(value) ? value.every(x => jsonValue(x, seen)) :
    Object.getPrototypeOf(value) === Object.prototype && Object.values(value).every(x => jsonValue(x, seen));
  seen.delete(value); return ok;
}
const controller = new AbortController();
const pending = new Set();
async function dispatch(name, args) {
  controller.signal.throwIfAborted();
  assert.ok(registry.has(name), 'binding not allowed');
  assert.ok(jsonValue(args), 'non-JSON args');
  const promise = registry.get(name)(structuredClone(args), controller.signal);
  pending.add(promise);
  try {
    const value = await promise;
    assert.ok(jsonValue(value), 'non-JSON result');
    return structuredClone(value);
  } finally { pending.delete(promise); }
}
assert.deepEqual(await dispatch('add', { a: 2, b: 3 }), { sum: 5 });
await assert.rejects(dispatch('__proto__', {}));
await assert.rejects(dispatch('add', { a: Infinity, b: 1 }));
const call = dispatch('add', { a: 1, b: 1 });
controller.abort();
await assert.rejects(call);
assert.equal(pending.size, 0);
await assert.rejects(dispatch('add', { a: 1, b: 1 }));
console.log('controlled binding: passed; untrusted runtime not implemented');
NODE
```

实验中的 JSON 判断仅服务于固定样本，没有统一 depth、byte cap 或原型属性 schema；真实 RPC 必须在解码与编码两侧设置限制。取消后等待 call 拒绝再检查 pending 清零，才说明这次协作 binding 已静止。若 binding 忽略 signal，停止 runtime 不能自动结束 host promise，owner 仍要等待或使用进程级隔离，不能直接把 pending 清空伪造完成。

## 已确认的上游机制

DeepSeek Harness `0.2.1-alpha.5` 固定提交的 PtcRunRequest 携带 program、bindings、cwd、期限、signal 与可选 stateOwner，resolve 生成明确 spec。程序格式区分 async function body 与 REPL，不能把同一源文本假定为所有 provider 都支持的语法。stateOwner 是可选的进程内身份，消费者必须 release；保留状态不是耐久 Session 数据，恢复或崩溃后不能假称自动还原。

上游 completion value 通过无损 JSON 边界，错误以 PtcRunResult.error 表达；无效调用参数可以在执行前 reject，程序失败则是结果字段。沙箱 mode、观察到的 denied 与 enforcement completeness 是独立事实，程序成功不证明所有限制都被执行。文档明确 runtime 可以停止程序，但在途 binding 调用由调用者负责结算，因此取消必须在程序层和 host 工具层同时治理。

工具桥接仍使用标准执行管线，规范返回与模型展示不同。PTC 子调用审计不能随意变成重复的模型可见工具组；程序已经得到完整值，日志预览或 Spill 只影响记录副本，不能改变程序刚消费的结果。具体桥接字段与出错分类需要固定源码核对，不从“类似 RPC”臆造 HTTP 端点或 SDK 方法。

## 失败案例与安全取舍

失败案例之一是将不可信程序放入 new Function，让它捕获宿主的 fs、fetch 或凭据，然后声称只能用公开 tools。JavaScript 语言限制不是权限隔离，程序边界需要真实运行时与 host RPC 白名单。另一类失败是 registry lookup 使用普通对象的属性访问，没有 own-property 校验，特殊名字可以触达不应公开的成员。白名单必须与最新作用域工具可见性一致。

大量并发子调用也会放大资源压力。程序一次 Promise.all 数千项，宿主没有配额就会同时打开连接、读取文件或申请审批；PTC 减少模型轮次不意味着无限工具吞吐。应设置并发上限、总调用预算、期限和 per-binding 输出限额，取消后停止准入新的调用。对写操作同样需要独立授权，不能因为模型只调用一个 run_code 就绕过每个子动作的风险检查。

程序结果越精简，越需要可审计中间证据。只返回“全部通过”会隐藏某次子调用失败，应保留成功、失败与未知的结构，模型可依据它解释限制。不能把错误 catch 后当零值统计，也不能删除异常样本提高通过率。若汇总逻辑本身有错，工具调用都成功也不能证明任务正确，必须对固定输入验证汇总结果并检查真实证据。

保留 REPL 状态有便利，也有混淆。前一段程序留下缓存变量，后一段读取时可能引用旧文件观察或旧权限；状态应带版本与生命周期，必要时明确 reset。不同 owner 的变量不得互通，释放失败需要报告资源泄漏。PTC 不是长期记忆，也不是 durable workflow，后续任务需要明确恢复输入与已确认结果，不能依赖进程内变量永远存在。

程序边界还应将传输失败与工具拒绝分开。工具拒绝是一次已完成的受控判定，不能通过重新连接绕过；传输断开则可能留下已启动但结果未知的调用，需要按身份对账。程序日志中的报错字符串不能代替规范错误状态，也不能因为代码自行捕获异常就将整个任务归类成功。汇总必须保留未结算项，才能让模型诚实说明结果范围。

## 实验验收与实现边界

命令应证明允许 binding 返回规范值，未知名称与非 JSON 数字拒绝，取消传播并等在途调用结束，取消后新调用不再准入。继续实验可使用循环对象、超大结果与并发预算，要求边界拒绝；让工具忽略 signal，要求报告仍有活动工作而不是强行通过。真实 runtime 验收还需无限循环硬停止、隔离与 release 故障，本示例不提供这些能力。

原 1–12 章 `local-harness-tutorial` 不执行模型生成代码，没有 PTC sandbox 或受控远端 RPC。已完成 labs 属于确定性实验，不代表全部 runtime/provider 已实现；本章不安装依赖、不增加 eval 入口。任何实际不可信代码执行都需单独授权、明确平台能力与 fail-closed 策略，不能将本章教学 dispatch 直接部署为通用宿主。

## 官方固定来源

- [DeepSeek Harness：PTC runtime 契约](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/ptc-runtime.md)。
- [DeepSeek Harness：Node PTC provider](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/ptc-runtime/ptc-runtime-node/README.md)。
- [DeepSeek Harness：工具桥接与结果源码](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/core/tools/src/index.ts)。

上一章：[第四十六章：工具管线](./46-tool-pipeline) · 下一章：[第四十八章：浏览器观察闭环](./48-browser-computer-use)
