---
title: 第 02 章：让插件注册拥有完整生命周期
description: 用所有权作用域管理服务注册，解释初始化失败回滚、反向清理和异步卸载边界。
date: '2026-10-17'
category: 智能体工程
tags: [Agent Harness, Node.js, 插件生命周期]
series:
  order: 2
---

# 第 02 章：让插件注册拥有完整生命周期

本章的核心概念是：**每一次注册都必须有所有者，每一个所有者都必须说明如何撤销它的副作用。** 我们通过 `src/scope.mjs` 建立最小插件生命周期，不讨论插件市场，也不把动态加载等同于安全隔离。

真实问题常发生在启动失败时：模型服务已经注册，工具也初始化了，会话目录却打不开，程序应该怎样退出？另一种问题发生在正常停止时：依赖 provider 的任务尚未结束，provider 就已经被清理，剩余任务开始访问失效资源。只在入口写几个 `close()`，很容易漏掉失败路径和依赖顺序。

[完整项目下载](/downloads/agent-harness.zip) 包含本章源码与测试。以下命令从解压后的 `agent-harness/`，或仓库中的 `examples/agent-harness/` 运行。环境是 Node.js 22 ESM，无需安装第三方依赖。这里的 `createScope()` 是教学项目自己的函数，不是 Cordis API，也不是上游同名函数的封装。

## 2.1 生命周期比“能注册”多什么

最简单的服务注册表是一个 Map：启动时 `set()`，使用时 `get()`。它回答了服务在哪里，却没有回答谁能够撤销、初始化一半时怎么办，以及卸载是否要等待异步资源释放。

所有权作用域在注册表之外保留一份效果清单。插件初始化时，每项可逆操作都向清单追加清理函数。初始化成功，就把整份清单纳入 scope；初始化失败，就立即撤销本次已经产生的效果。正常退出再按相反顺序撤销成功插件。

这里的“插件”不必是 npm 包。它只是一个接收 `ctx` 的可信函数，通过 `ctx.provide()` 注册服务，通过 `ctx.onDispose()` 声明清理。这个定义够小，却已经能把初始化和卸载放在一起，避免维护一份容易失同步的全局关闭列表。

不是所有副作用都可逆。发送网络请求、执行外部命令、改写文件，不能靠删除 Map 条目还原。本章的 scope 只承诺执行已登记的清理，不提供事务数据库式回滚，更不会撤销模型或外部系统已经发生的动作。

## 2.2 当前核心文件的完整实现

下面引入实际使用的完整源码，后面的分析与它对应：

<<< @/../examples/agent-harness/src/scope.mjs{js}

三个闭包状态分别承担不同职责。`services` 是当前可查询的服务；`mounts` 保存成功挂载的效果清单；`closed` 标记 scope 已经进入关闭状态。状态不直接暴露，消费者只能通过公开方法访问。

`get(name)` 在服务不存在时抛错，而不是返回 `undefined`。这样依赖缺失会在组合处暴露，不会等到一段更深的代码执行 `undefined.complete()` 才出现难定位的异常。它也不会替调用方选择默认服务，缺什么就明确失败。

`mount(plugin)` 是异步函数，因为初始化可能读取会话或建立服务。当前入口逐个 `await scope.mount(...)`，顺序先 provider、再 tools、再 session。这个顺序是调用方负责的，没有隐藏的拓扑排序或依赖自动发现。

## 2.3 注册的同时登记撤销操作

`provide()` 的关键实现只有几行：

```js
provide(name, service) {
  if (services.has(name)) throw new Error(`Duplicate service: ${name}`);
  services.set(name, service);
  effects.push(() => services.delete(name));
}
```

先拒绝重复名字，再发布服务，最后登记删除效果。重复注册不会替换原对象，也不会为原服务加入一条误删清理。因此第二个插件错误地提供同名 provider 时，失败不会悄悄覆盖第一个插件的能力。

这个删除操作是生命周期回滚，不是资源关闭。若服务内部持有计时器、文件句柄或服务器，还需要 `onDispose()` 登记真正的释放。最安全的习惯是资源成功获取后立即登记清理，再继续下一项可能失败的初始化。

反过来，先创建资源，等待另一个异步操作，最后才登记清理，会留下漏洞：中间操作抛错时，那项资源没有进入清单，scope 无从知道它存在。所有权管理并不能修正漏登记，它只是让登记位置变得明确。

还要注意公开对象的可变性。scope 管理服务存在与否，不冻结服务内部状态，也不阻止插件把引用传给外部。拿到引用的消费者即使在卸载后仍能保存它，因此调用方必须先让任务停止，再撤销其依赖。

## 2.4 为什么反向清理

假设一个插件依次提供服务、登记第一项资源清理、登记第二项资源清理，它的效果列表就是“移除服务、关闭资源一、关闭资源二”。退出时倒序执行，最后获得的资源先关闭，服务最后移除。

```js
async function unwind(effects) {
  const errors = [];
  for (const cleanup of effects.reverse()) {
    try { await cleanup(); } catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, 'Plugin cleanup failed');
}
```

反序有一个实用性质：插件的清理函数运行时，该插件的服务通常仍在注册表中。关闭依赖服务的资源，往往需要最后读取配置或调用服务成员；先删除服务会使这类清理失败。

scope 在更高一层也反向遍历成功的 `mounts`。后挂载的插件可能依赖先挂载的插件，先卸载消费者再卸载提供者，符合建立关系的相反顺序。它不是依赖分析器，若插件启动顺序本来错误，反向遍历不会自动修好。

清理函数被逐个等待，不是 `Promise.all()`。并行关闭可能让仍在收尾的消费者失去依赖。这里选确定的顺序，代价是某项清理过慢会推迟后续清理。当前实现没有清理超时，可信插件必须保证自己的释放能够结束。

## 2.5 初始化失败怎样回滚

`mount()` 只有在 `await plugin(ctx)` 成功后，才把 effects 加入 `mounts`。失败时调用相同的 `unwind()`，所以成功退出和失败回滚遵守同一套撤销逻辑。已经成功挂载的其他插件不会因此被立即删除，入口随后在 `finally` 统一关闭 scope。

如果初始化失败，清理也失败，代码返回包含两类原因的 `AggregateError`。这比只保留“初始化失败”更可靠，因为未释放的资源可能才是下一次启动失败的原因；只保留清理异常也不好，会丢失最初触发退出的事实。

但当前回滚不是“外部不可见的原子发布”。`provide()` 会立刻写入共享 Map，因此一个仍在初始化的插件，其服务可能已被其他代码查询。调用方采用串行挂载、初始化完成后才启动运行，才能避免消费者看到半初始化组合。

同样，scope 没有保护 `mount()` 与 `dispose()` 的并发交错。`closed` 在 mount 开始时检查，之后若插件仍在等待，另一个调用启动 dispose，并不能自动取消这个初始化。教学入口不会这样使用；扩展到动态插件系统时，需要额外的挂载状态与关闭屏障。

## 2.6 一个无需模型的生命周期实验

下面直接消费真实模块，不创建文件，也不联系模型：

```sh
node --input-type=module <<'JS'
import { createScope } from './src/index.mjs';

const scope = createScope();
const trace = [];
await scope.mount(async (ctx) => {
  ctx.provide('answer', 42);
  ctx.onDispose(() => trace.push('first'));
  ctx.onDispose(() => trace.push('second'));
});
try {
  await scope.mount(async (ctx) => {
    ctx.provide('temporary', true);
    throw new Error('mount failure');
  });
} catch (error) {
  console.log(error.message);
}
console.log(scope.get('answer'));
await scope.dispose();
console.log(trace);
try { scope.get('temporary'); }
catch (error) { console.log(error.message); }
JS
```

预期依次观察到挂载失败原因、仍存在的 `answer` 值、`second` 在 `first` 之前清理，以及临时服务查询失败。重点不在打印顺序本身，而在两个不变量：失败挂载没有残留服务，成功插件按反向效果顺序撤销。

把其中一个 cleanup 改成抛错，是理解聚合异常的实验方向，但不要通过删除失败断言来证明功能完成。已有测试核对基础回滚与反向清理；异步清理并发、永不结束的 cleanup 等不在这个基础用例的覆盖范围中。

## 2.7 关闭标记的真实含义

当前 `dispose()` 先设置 `closed = true`，再执行清理。其后新 mount 被拒绝，第二次顺序调用 dispose 不会重复清理，这满足日常入口的幂等关闭需求。即使某项清理失败，其余清理仍会尝试，最后汇总错误。

不过“重复调用不再执行”不等于“并发调用等待同一次完成”。第二个 dispose 看到 `closed` 后立即返回，可能第一个仍在异步释放资源。若需要所有调用者都等待完全卸载，应共享一个 disposal Promise；当前实现没有这个能力。

清理失败后 `closed` 仍为真，也不会自动再试一遍。有些清理副作用已经成功，重复执行整份清单可能造成二次关闭或误删，因此例子选择保留失败而不暗中重试。调用方应记录异常，检查具体资源，不把“再次调用没有报错”当成全部资源已经关闭。

scope 也没有单插件卸载接口。当前用途是固定组合的整体关闭。若要热替换 provider，需要先让在途任务静止、删除旧注册、挂载新注册，再解决失败恢复问题；单加一个 `unmount()` 名称，并不能实现这些语义。

把生命周期画成三个阶段会更容易检查：先构造资源并登记释放，再对消费者开放运行，最后停止消费者并撤销资源。当前 CLI 采用固定启动顺序，并在 Web 停止后等待 activeRun 收尾，再进入 scope 清理。scope 自己不认识 activeRun，因此不能代替入口完成“停止运行”这一步。

一个常见误解是 cleanup 只要发出关闭信号就算完成。若清理函数启动异步释放却不返回对应 Promise，unwind 会立刻继续，后续依赖可能提前消失。这里使用 await 的前提，是清理函数诚实地返回自己的完成边界；资源拥有者要把等待也包括在释放操作中。

另一个误解是错误聚合只为显示多条日志。它实际上保留了故障层级：挂载原因、插件内部多项清理失败、scope 下多个插件清理失败，可以形成嵌套 AggregateError。排错应查看 errors 中的真实原因，而不是仅根据最外层 message 判定所有失败都来自同一个资源。

服务注册也可能根本没有额外释放资源。当前 provider 和 tools 主要保存配置与函数，session 每次追加自行打开并关闭句柄，因此它们只撤销注册也能满足现有生命周期。不要为对称性臆造 close 方法；只有确实持有跨调用资源的服务，才需要额外清理。

## 2.8 与上游所有权机制对照

参考固定提交为 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`，根包 `0.2.1-alpha.5`，核验日期 2026-10-17。[架构文档](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/architecture.md) 明确注册属于插件效果，卸载时撤销。教学项目借鉴这一原则，但用 effects 数组表达最小所有权。

上游 [scope 源码](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/packages/core/scope/src/index.ts) 的 `createScope(ctx, key, options)` 返回带 Cordis context 的 scope，还有 `rawDispose`、scope 身份和父子关系；它不是本项目无参数 `createScope()` 的注册表。

上游的 `dispose()` 缓存共享 Promise，并通过 `quiesceFiber()` 等待异步 teardown；并发调用会等待相同完成边界。这个差异值得明确指出，不能把本项目的 `closed` 布尔标记描述成同等强度的卸载保证。

上游还使用 scope key 约束注册视图与事件路由，支持父子 scope 关系。教学项目没有这些机制，因此这里的“作用域”指资源所有权，不是模块安全沙箱，也不是每个 agent 的权限隔离区域。

## 2.9 排错与验证标准

从示例根运行本章已有的确定性测试：

```sh
node --test --test-name-pattern="plugin services" test/harness.test.mjs
```

应通过反向清理、失败挂载回滚以及卸载后服务不存在的断言。它不需要 Ollama，也不生成模型答案。运行核心全集可使用 `node --test test/harness.test.mjs`，检查作用域行为与其消费者是否仍兼容。

遇到 `Duplicate service`，检查组合是否重复挂载，不要删除重复检查；遇到 `Unknown service`，检查启动顺序和失败回滚；遇到 `Plugin cleanup failed`，检查 AggregateError 中的清理原因。它意味着清理确实有失败，不应被当成“应用已经完全退出”的成功消息。

验收时应能解释资源何时登记、失败时哪些效果被撤销，以及关闭为何需要先等待运行停止。还应能指出三项尚未提供的能力：并发挂载屏障、共享关闭 Promise、清理超时。本章建立的是可信固定组合的生命周期，真实模型输出是否正确仍需另行运行验收。

---

深化阅读：[插件分发与版本](./22-plugin-packaging)、[Cordis 组合](./23-cordis-composition)、[Hooks 与 Mods](./24-hooks-mods)。这些章节进一步区分生命周期所有权与外部插件的信任边界。

上一篇：[第 01 章：服务契约](./01-contracts.md) · 下一篇：[第 03 章：流式模型](./03-streaming-provider.md)
