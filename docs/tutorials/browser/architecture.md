---
title: 浏览器导航、渲染流水线与事件循环
description: 从打开页面到响应点击，理解网络导航、DOM、布局绘制以及任务与微任务的关系。
type: tutorial
topic: browser
section: platform
order: 10
level: beginner
status: published
tags:
  - 浏览器
  - 渲染
  - 事件循环
prerequisites: []
comments: true
---

# 浏览器导航、渲染流水线与事件循环

页面出现得慢、按钮点击没有反应、动画不流畅，表面上都是浏览器问题，实际可能分别来自网络等待、主线程长任务或布局绘制成本。要定位它们，先把“浏览器加载网页”拆成可观察阶段，而不是把所有等待都归因于 JavaScript。

## 前置条件与版本范围

本文讨论现代浏览器的通用 Web 平台概念，实验使用支持 Promise、`queueMicrotask` 和 `requestAnimationFrame` 的 Chromium、Firefox 或 Safari。DevTools 名称以 Chromium 为例，不声称不同引擎内部架构完全一致。无需框架，准备一个本地 HTML 文件和任意文本编辑器即可。

示例可直接以文件方式打开，适合观察 DOM 与事件循环；涉及真实 HTTP 请求、缓存和跨源时必须使用本地服务器，下一章[网络、缓存与跨源](/tutorials/browser/network.html)会给出独立实验。`file:` 页面与 HTTP 页面不是相同安全环境，不要用文件模式推断线上网络行为。

打开开发者工具后清空 Console，避免旧日志影响判断。代码中的阻塞函数故意占用主线程约一小段时间，只用于新建演示页面，不应粘贴到业务系统或正在填写的重要表单中。下面描述的输出都是应观察的预期，不是对你的设备性能测量。

## 从导航到解析：谁在等待谁

输入 URL 后，浏览器先解析地址，决定是导航、搜索还是特殊协议。网络导航可能经过 DNS、代理、连接建立和 TLS 协商，也可能复用已有连接或直接从缓存取得响应。重定向会引入新的目标请求。并不是每次刷新都重新经历所有步骤，因此不能只根据一条简化时间线解释所有页面。

浏览器验证响应状态、类型及相关安全策略后，开始处理文档字节。HTML 解析器逐步构造 DOM，CSS 被解析为样式规则结构；浏览器还会提前发现部分资源并发请求。文档未完全到达时也可能开始解析与渲染，不应把加载想成严格“所有下载完，再统一显示”。

普通经典脚本可能阻塞 HTML 解析，因为脚本能访问或改变解析中的文档。外部经典脚本的 `defer` 让下载并行、执行延后到解析完成后，并按文档顺序执行；`async` 则下载后尽快执行，不保证多个脚本的相对顺序。模块脚本默认具有类似延后执行的行为，还要解析依赖图，不能把它当普通脚本直接替换而不考虑作用域与请求。

`DOMContentLoaded` 表示文档解析完成并完成相关延后脚本执行，不代表图片、所有网络请求和应用数据都完成。`load` 更晚，但也不意味着之后不会发请求。业务“可用”必须按界面状态定义，例如按钮已绑定、关键数据已显示，不能用一个事件替代全部完成标准。

多进程浏览器通常将浏览器管理、网络、渲染等工作划分到不同进程或线程，站点隔离也影响分配。具体数量和边界由引擎、平台与运行状态决定。“每个标签一个进程”只是粗略印象，iframe、扩展和跨站导航都可能改变关系。开发者更应关注页面可观测行为和线程阻塞，而不是凭标签数量推断性能。

## 渲染流水线：样式、布局、绘制与合成

DOM 描述结构，样式规则与继承决定元素呈现。样式计算确定属性值，布局计算位置与尺寸，绘制生成背景、文字、边框等绘制内容，合成则组合图层呈现结果。浏览器会跳过不需要的阶段，并不是每次属性变化都从头执行完整流水线。

改变宽度可能影响其他元素位置，需要布局；改变颜色通常不改变几何关系，但仍需要更新绘制。`transform` 和 `opacity` 在一些情况下能够主要通过合成处理，但不是永远免费：图层大小、内容、设备与浏览器决策都会影响成本。不能仅看属性名称就宣称动画一定流畅。

几何读取如 `getBoundingClientRect()` 可能迫使浏览器先处理尚未完成的样式和布局，以提供最新值。循环里交替写样式与读尺寸，容易产生多次同步布局。更合理的模式是先集中读取，再集中写入；是否真的产生强制布局，仍要在 Performance 记录中核对。

不要为了“优化”给所有元素添加 `will-change`。过多图层可能增加内存和合成成本，长期保留提示也会浪费资源。性能工作应围绕实际瓶颈与可重复的用户操作，而不是照抄属性清单。

## 一个可运行的事件循环实验

创建 `architecture-demo.html`，写入以下完整内容后在浏览器打开。没有第三方脚本或外部资源，日志同时输出到页面和 Console。

```html
<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>事件循环实验</title>
<style>
  body { font: 16px system-ui; max-width: 48rem; margin: 2rem auto; padding: 1rem; }
  button { padding: .7rem 1rem; margin-right: .5rem; }
  #box { width: 120px; height: 60px; background: steelblue; margin: 1rem 0; }
  pre { white-space: pre-wrap; }
</style>
<h1>事件循环实验</h1>
<button id="run" type="button">观察顺序</button>
<button id="busy" type="button">短暂阻塞主线程</button>
<div id="box"></div>
<pre id="output"></pre>
<script>
  const output = document.querySelector("#output");
  const log = (value) => {
    output.textContent += value + "\n";
    console.log(value);
  };

  document.querySelector("#run").addEventListener("click", () => {
    output.textContent = "";
    log("sync: start");
    setTimeout(() => log("task: timer"), 0);
    Promise.resolve().then(() => log("microtask: promise"));
    queueMicrotask(() => log("microtask: queued"));
    requestAnimationFrame(() => log("render: animation frame"));
    log("sync: end");
  });

  document.querySelector("#busy").addEventListener("click", () => {
    log("busy: start");
    const start = performance.now();
    while (performance.now() - start < 120) {
      // Deliberately blocks this demo's main thread.
    }
    log("busy: end");
  });
</script>
</html>
```

点击“观察顺序”，稳定的前四条应依次是同步开始、同步结束、Promise 微任务、显式排队微任务。它们在同一个点击处理过程中按上述顺序进入队列。计时器任务与动画帧回调之间不要写死统一先后：渲染机会、页面可见性、浏览器调度和节流都会影响实际时机。

点击阻塞按钮时，主线程同步循环完成之前不能处理下一次普通点击回调；日志修改了 DOM，也不代表每一行立刻被绘制到屏幕。浏览器往往要等当前执行阶段结束并获得渲染机会。名义上的 120 毫秒只是实验条件，实际耗时应自己记录，不作为性能改善指标。

## 任务、微任务与渲染机会

事件循环协调任务执行、微任务检查与渲染更新。点击事件、计时器等产生任务，Promise 反应与 `queueMicrotask` 产生微任务。当前 JavaScript 执行到适当检查点后，浏览器处理微任务队列，微任务里新增的微任务通常也会继续处理，然后才可能进入后续任务和渲染步骤。

这种机制能让异步结果在下一任务前完成，但微任务不是“后台线程”。在微任务里运行昂贵循环仍会阻塞页面，不断递归排微任务还可能让其他任务和渲染得不到机会。`await` 也不自动把 CPU 工作移出主线程；它只是暂停当前异步函数，后续执行通常经 Promise 调度恢复。

`setTimeout(fn, 0)` 表示在满足计时和调度条件后排队，不是马上执行，更不是精确零延迟。嵌套计时、后台标签和省电策略都可能使回调延后。需要绘制同步的视觉更新可考虑 `requestAnimationFrame`，但回调里也应少做工作，后台页面可能暂停或降低频率。

CPU 密集计算可考虑 Web Worker，把可独立计算的数据通过消息传递过去。Worker 不能直接操作页面 DOM，数据复制或转移也有成本。先减少不必要计算，再判断是否适合迁移；不能为了“异步”把每个短函数都放进 Worker。

## 在 DevTools 中验证模型

打开 Elements，观察 `#output` 的文本节点如何变化；打开 Console，确认没有语法或选择器错误。再打开 Performance，录制一次阻塞按钮点击并停止，查主线程中相应事件和脚本执行片段。长任务与页面响应延迟可以相关，但具体原因要看调用栈，不要只凭红色标记下结论。

如果想观察布局，在 Console 运行以下代码，只影响演示方块：

```js
const box = document.querySelector("#box");
const before = box.getBoundingClientRect().width;
box.style.width = "180px";
const after = box.getBoundingClientRect().width;
console.table({ before, after });
```

预期读取宽度从 120 变到 180。这里是有意示范写后读，单次操作不等于严重性能问题；在循环中大量重复才可能显著放大成本。要比较优化前后，应固定输入、设备条件和操作，采集多次，不能仅拿一次记录做普遍结论。

Network 的文档 Timing 可帮助区分请求等待和下载；Performance 可帮助区分脚本、布局与绘制。两者回答的问题不同，不能看见文档请求耗时短就宣称页面一定快。下一章会继续把请求层的证据补完整。

## 常见误解与练习

“Promise 比计时器快”只是对排队机制的过度简化，Promise 回调本身可能做很多慢工作。“DOM 已改变，所以用户已经看到”忽略了绘制时机。“用了 transform，所以不会卡”忽略了主线程与图层成本。“load 已触发，所以业务完成”则忽略了应用自身的数据流。

日志顺序与教程不同，先检查是否重复点击、是否保留旧日志、是否在后台标签以及是否修改了代码。不要调整浏览器安全设置来让实验符合猜测。DevTools 自身可能改变调度和性能，因此它是证据工具，不是零影响观察者。

练习把一个新的微任务放进 Promise 回调中，先预测它与现有显式微任务的顺序，再运行核对。把耗时循环移到 `setTimeout` 回调，观察页面仍会在回调期间阻塞，说明排队不等于并行。最后比较连续写后读与先读后写，记录实际观察而不编造帧率。

完成标准是能把导航等待、解析执行和渲染阶段分开，能解释同步、微任务与任务的稳定顺序，也能指出哪些顺序或耗时不作保证。后续学习[网络与缓存](/tutorials/browser/network.html)和[调试、性能与安全](/tutorials/browser/debugging.html)时，都用这个分层模型确定证据入口。

## 官方参考

- [MDN：浏览器工作原理](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/How_browsers_work)：导航、解析和渲染。
- [MDN：DOMContentLoaded](https://developer.mozilla.org/en-US/docs/Web/API/Document/DOMContentLoaded_event)：事件完成边界。
- [MDN：微任务指南](https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide)：任务与微任务检查。
- [MDN：requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)：回调时机与后台限制。
- [Chrome Performance 面板](https://developer.chrome.com/docs/devtools/performance)：录制和分析性能。
