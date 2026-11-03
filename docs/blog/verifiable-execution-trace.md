---
title: 把可运行示例变成可验证的执行轨迹
description: 用异步生成器真实执行取消传播，以不可变事件驱动行号、变量和回放，拒绝旧任务更新。
date: '2026-11-03'
id: lab-verifiable-execution-trace
category: 前端实验
tags: [AbortController, AsyncGenerator, 可观测性]
level: advanced
demoIds: [execution]
source:
  path: examples/site-labs/execution.ts
  ref: working-tree
  command: pnpm dev
runtime: Vue 3.5.44；原生 AsyncGenerator 与 AbortController，无 eval
verification:
  kind: browser
  evidence: execution-trace.test.ts 验证确定性、取消、输入边界和源码行映射；data-labs.e2e.ts 检查断点、回看、重置和键盘操作。
---

## 把执行证据与动画拆开

教学型调试界面容易变成一段预先编排的动画：数字按照剧本跳动，却没有真正执行对应代码。本站选择一个有限的取消传播示例，让业务逻辑产生事件，UI 只展示事件。

示例按顺序处理 1 到 count，每次乘以 factor 后累加。cancelAfter 为零代表不主动取消，为正数时在处理该项后调用 AbortController。相同输入对应相同事件序列，改变输入会实际改变累加结果和终止路径。

## 生成器就是可暂停的执行边界

下面文件同时被实验运行时和正文引用。每次调用 next()，生成器才继续运行到下一个 yield。

<<< @/../examples/site-labs/execution.ts

例如 count=5、factor=2、不取消时，五次累加后的 total 是 30。若处理两项后取消，total 是 6；先观察到 `abort` 事件，再在下一次循环检查时观察到 `cancelled`。这说明取消请求与业务代码响应取消是两个阶段。

AbortController 不会抢占当前同步代码，也不会自动回滚已经累加的结果。协作式取消依赖逻辑在安全位置检查 signal。父 signal 已取消时，生成器把它同步到自己的 controller；finally 移除监听器，避免完成后继续保留引用。

## 事件携带快照，视图不推导结果

每个事件包含 kind、index、value、total、aborted。snapshot 每次创建新对象，UI 可以保存到事件数组中，回看旧事件时不会读到已经变化的变量。

实验中有两个位置：生成器执行到哪里，以及读者当前查看第几个事件。向后回看只移动 cursor，不倒退真实计算；下一步如果前方还有已记录事件，先读取旧快照，追到最新位置以后才继续 next()。这与时间旅行调试器的状态回滚能力不同，需要明确说明。

最大输入为 100，包含开始、取消请求和取消完成时最多 103 个事件。边界在生成器内部校验，不仅依赖 HTML input 的 min/max，因为脚本调用可以绕过表单限制。

## 用源码标记验证行号

事件产生处有 `@trace start`、`@trace value` 等标记。`trace-source.ts` 从真实源码提取行号，并检查预期事件是否都有唯一标记。显示层根据事件 kind 选择行，而不是把脆弱的固定数字写在组件里。

行号表达“事件在哪产生”，不是通用 JavaScript 调试器的真实调用栈。这里没有 eval、编译器插桩或浏览器 Debugger 协议。若扩展到任意用户代码，需要重新处理隔离、执行超时和安全权限，不能套用本例的可信源码假设。

## 重置要让旧任务失去写入资格

用户更改输入或点击重置时，取消当前 controller，调用 iterator.return()，清空事件并递增任务序号。旧的 await next() 即使稍后完成，也必须先比较序号，才能决定是否写入当前界面。

`advancing` 防止连续点击造成同时 next()。自动播放本质上是每 240ms 请求一次下一步，达到断点、结束、离屏或后台时停止 timeout；折叠实验会卸载组件并取消剩余任务。精简效果仍提供逐步操作，不会把核心示例隐藏。

## 实际复现

启动站点并打开 `/abinzhao/labs/execution.html`。先执行默认输入，核对 total=30；重置后将取消位置设为 2，核对 `value → abort → cancelled` 与 total=6。设置每次累加断点，回看第一条事件，再继续执行。

运行 `pnpm exec vitest run tests/execution-trace.test.ts` 验证生成器与行号映射，运行 `pnpm exec playwright test tests/e2e/data-labs.e2e.ts` 验证视图同步和取消。测试应断言业务事件和结果，而不是只确认高亮条移动了。

参考：[AsyncGenerator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncGenerator)、[AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)。受控轨迹适合解释已知算法，不能替代通用调试器。
