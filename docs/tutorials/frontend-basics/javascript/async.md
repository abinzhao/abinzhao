---
title: JavaScript：异步、取消与竞态
description: 用本地搜索实验理解事件循环、Promise、async/await 和 AbortController。
---

# JavaScript：异步、取消与竞态

## 学习目标

- 能预测同步代码、微任务和定时器任务的执行顺序。
- 能用 Promise 与 async/await 表达成功、失败和清理。
- 能用取消信号减少无用工作，用版本号阻止旧结果覆盖新结果。

前置：[函数与数据](./fundamentals.md)、[闭包](./closures-prototypes.md)。
本章纯静态运行，不请求外部接口；延迟是显式模拟，不是真实网络性能。

## 为什么异步不等于并行

浏览器主线程同时要执行脚本、处理事件并参与渲染。
等待网络或定时器时不必一直阻塞主线程，完成后再安排回调。
但普通 JavaScript 回调仍需逐个执行；耗时循环不会因为包在 async 函数里就自动离开主线程。

一次任务结束后，浏览器在适当检查点执行微任务队列。
Promise 的反应回调和 `queueMicrotask` 都进入微任务队列。
微任务产生的微任务也会在队列排空前执行，无限补入会饿死渲染与后续任务。
渲染不是“每个微任务后立即一次”，是否有绘制机会由浏览器调度。

## 先预测执行顺序

在空白页 Console 运行，或保存为 `order.js` 后用 Node 22.13+ 执行：

```js
console.log('同步开始');
setTimeout(() => console.log('定时器任务'), 0);
Promise.resolve().then(() => console.log('Promise 微任务'));
queueMicrotask(() => console.log('显式微任务'));
console.log('同步结束');
```

本例顺序：同步开始、同步结束、Promise 微任务、显式微任务、定时器任务。
`0` 表示尽早进入可调度状态，不保证零毫秒完成。
Node 的完整事件循环还包括其他阶段，不能用这个简例概括所有 Node 调度。

## Promise 与取消的边界

Promise 从 pending 变成 fulfilled 或 rejected，最终状态只决定一次。
构造函数里的 executor 立即执行，`then` 回调异步执行。
`async` 函数总返回 Promise；`await` 暂停的是当前函数后续执行，不是整个浏览器。
`try/catch` 能捕获 await 的拒绝，忘记 await 的独立 Promise 不会自动被捕获。

Promise 本身没有通用的取消方法。
AbortController 提供 signal，只有主动支持并检查 signal 的操作才会取消。
即使请求支持取消，已经完成的结果或后续工作仍可能到达。
因此取消和版本号是两层保护：前者减少工作，后者决定是否允许提交结果。

## 运行步骤

1. 创建 `async/index.html` 与 `async/main.js`。
2. 启动练习服务器，打开 `/async/`。
3. 输入 `h`，在 900ms 内继续输入 `html`。
4. 点击取消，再测试空输入与无匹配词。

## 完整搜索实验

::: code-group

```html [index.html]
<!doctype html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>异步搜索实验</title></head>
<body>
  <main>
    <h1>异步课程搜索</h1>
    <p>输入 h、html、css 或 javascript。短词故意更慢，用于观察竞态。</p>
    <label for="query">课程关键词</label>
    <input id="query" type="search" autocomplete="off">
    <button id="cancel" type="button">取消当前搜索</button>
    <p id="status" role="status">请输入关键词。</p>
    <ul id="results"></ul>
  </main>
  <script src="./main.js" defer></script>
</body>
</html>
```

```js [main.js]
'use strict';
const courses = [
  { title: 'HTML 结构' },
  { title: 'CSS 布局' },
  { title: 'JavaScript 异步' },
  { title: 'HTML 表单' }
];

function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    function onAbort() {
      clearTimeout(timer);
      reject(signal.reason);
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function searchCourses(query, signal) {
  await delay(query.length < 3 ? 900 : 150, signal);
  signal.throwIfAborted();
  return courses.filter(course => course.title.toLowerCase().includes(query));
}

const input = document.querySelector('#query');
const list = document.querySelector('#results');
const status = document.querySelector('#status');
const cancel = document.querySelector('#cancel');
let version = 0;
let active = null;

function showResults(rows) {
  const fragment = document.createDocumentFragment();
  for (const row of rows) {
    const item = document.createElement('li');
    item.textContent = row.title;
    fragment.append(item);
  }
  list.replaceChildren(fragment);
}

async function runSearch() {
  const currentVersion = ++version;
  if (active) active.abort();
  const controller = new AbortController();
  active = controller;
  const query = input.value.trim().toLowerCase();
  showResults([]);
  if (!query) {
    status.textContent = '请输入关键词。';
    list.removeAttribute('aria-busy');
    active = null;
    return;
  }
  status.textContent = `正在搜索：${query}`;
  list.setAttribute('aria-busy', 'true');
  try {
    const rows = await searchCourses(query, controller.signal);
    if (currentVersion !== version) return;
    showResults(rows);
    status.textContent = `关键词 ${query}：找到 ${rows.length} 门课程。`;
  } catch (error) {
    if (currentVersion !== version) return;
    status.textContent = controller.signal.aborted
      ? '当前搜索已取消。'
      : `搜索失败：${error instanceof Error ? error.message : '未知错误'}`;
  } finally {
    if (currentVersion === version) {
      list.removeAttribute('aria-busy');
      if (active === controller) active = null;
    }
  }
}

input.addEventListener('input', runSearch);
cancel.addEventListener('click', () => {
  version += 1;
  if (active) active.abort();
  active = null;
  list.removeAttribute('aria-busy');
  status.textContent = '搜索已取消；已显示的结果保留。';
});
```

:::

## 为什么 finally 也要检查版本

旧请求不仅会覆盖结果，也可能在 finally 中关闭新请求的加载状态。
每次输入增加 version，捕获当次编号；仅当前编号能修改结果、状态和清理标记。
旧操作退出不等于最新操作退出，不能共享一个没有归属的“完成”逻辑。
示例不做防抖，以便直接观察每次输入产生的生命周期。
防抖减少请求频率，但不能替代竞态保护。

`Promise.all()` 任一输入拒绝时会拒绝汇总 Promise，但不会自动取消其他操作。
`Promise.allSettled()` 保留每个结果，适合允许部分成功的任务。
不要把串行依赖误写成并行；后一操作需要前一结果时仍应按顺序 await。

## 效果验证

快速从 h 改为 html，最终只能显示两门 HTML 课程，不出现旧词 h 的状态。
取消后等一秒，状态不应重新变成“找到课程”。
输入无匹配词，应显示“找到 0 门课程”，而不是报错或保留过期结果。
清空输入后应恢复提示，且 `aria-busy` 不残留。
Console 不应出现未处理的 Promise rejection。

## 常见错误

用 `forEach(async () => ...)` 后立即读取结果，并不会等待所有回调。
把 AbortError 当普通故障提示，会让主动取消看起来像系统错误。
旧请求的 catch/finally 不检查版本，会覆盖新请求的错误和加载状态。
同步循环里调用 abort 不会立刻抢占循环，长计算应拆分或交给 Worker。

## 练习与验收标准

增加 200ms 防抖：输入时立即使旧版本失效，稍后才开始新查询。
验收：快速输入仅执行最后查询；清空或取消立即停止等待；状态不会回退。
再加入一个会抛错的关键词，验证错误信息、busy 清理和下次搜索恢复。

## 延伸资料

- [MDN：执行模型](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Execution_model)
- [MDN：Promise](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Promise)
- [MDN：AbortController](https://developer.mozilla.org/zh-CN/docs/Web/API/AbortController)

下一章：[DOM 与事件应用](../browser/dom-events.md)。
