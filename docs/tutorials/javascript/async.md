---
title: JavaScript 异步控制：Promise、并发限制与取消错误
description: 用可取消的本地任务理解 Promise、async/await、并发池和错误传播。
type: tutorial
topic: javascript
section: frontend
order: 20
level: intermediate
status: published
tags:
  - JavaScript
  - Promise
  - async
  - 并发
  - 取消
prerequisites:
  - /tutorials/javascript/language.html
comments: true
---

# JavaScript 异步控制：Promise、并发限制与取消错误

异步代码不是“运行得比较慢的同步代码”。调用方与任务完成时刻分离后，需要明确结果如何交付、失败如何传播、过时任务如何停止。`async/await` 改善书写方式，却不会自动创建并发、取消请求或捕获所有错误。本篇用无需网络的本地任务演示这些关系，让你能够解释任务生命周期，再把模型用于实际请求。

## 前置知识与适用范围

先学习 [作用域与闭包](./language.html)，会使用函数、数组和 `try/catch`。练习入口为 `index.html`，同级脚本为 `main.js`。使用普通外部脚本并加 `defer`，因此可以直接用浏览器打开本地入口，不需要接口服务或依赖安装。

本文使用常见现代浏览器的 Promise、`async/await`、`AbortController` 与 `DOMException`，不依赖特定最新版本。任务延迟仅用于安排先后，不是性能基准：计时器受主线程、后台节流和系统调度影响，不能承诺精确毫秒数。示例中的输出是待你核验的预期语义，没有实测耗时数据。

## Promise 与事件循环的因果模型

Promise 表示将来可能完成的结果，有等待、兑现和拒绝状态，最终状态确定后不会再次改变。Promise 构造器里的执行函数立即运行，真正异步的是任务及其后续反应。把同步计算放进构造器并不会让它离开主线程，大量计算仍然可能阻塞页面。

当前同步调用栈结束后，Promise 反应通常通过微任务执行；计时器回调属于另一类任务。`await` 会暂停当前异步函数的后续部分，让出执行机会，即使等待的 Promise 已经完成，也不能理解成整段完全同步继续。异步函数调用立即返回 Promise，而不是把最终值直接返回给调用者。

`then()` 返回新的 Promise。回调返回普通值时传递该值，返回 Promise 时继续等待，抛出异常时让新 Promise 拒绝。如果调用异步函数却既不返回也不等待，就切断了原本的结果链，外层 `try/catch` 未必能看到后来的失败。建立完整链比在任意位置增加一个日志更重要。

## 第一步：创建可取消的本地任务

将下列代码写入 `index.html`，提供一个启动按钮和文本输出。按钮在整个流程结束前禁用，避免多次点击让输出互相交错。示例没有真实网络请求，也不会写入外部数据。

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>异步任务实验</title>
    <script src="./main.js" defer></script>
  </head>
  <body>
    <main>
      <h1>异步任务实验</h1>
      <button id="run" type="button">运行本地任务</button>
      <pre id="output"></pre>
    </main>
  </body>
</html>
```

先在 `main.js` 写入任务函数。`signal` 在开始前可能已经取消，也可能在等待过程中取消，两种情况都要处理。取消时清除定时器并拒绝 Promise，正常完成时移除监听器。清理不是附加优化，而是防止任务完成后仍持有不必要引用和回调的生命周期责任。

```javascript
function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const abortError = () => new DOMException("任务已取消。", "AbortError");
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    function onAbort() {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(abortError());
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function task(name, milliseconds, options = {}) {
  await delay(milliseconds, options.signal);
  if (options.fail) {
    throw new Error(`${name} 业务处理失败。`);
  }
  return `${name} 完成`;
}
```

Promise 本身没有通用停止按钮。`AbortController` 提供取消信号，具体操作必须主动监听或支持该信号。`fetch` 支持信号，本例计时任务则由我们实现清理。把 Promise 放进竞争组合只决定调用方先得到什么结果，不自动停止另一个仍在运行的操作。

## 第二步：比较串行、并发与完整收集

继续在同一个 `main.js` 末尾添加下面代码。并发池先保存下一项索引，创建有限数量的工作循环，每个循环完成后领取新任务。结果按输入索引存储，而不是按完成顺序追加，因此更容易与原始项目对应。

```javascript
async function mapLimit(items, limit, worker) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError("并发数必须是正整数。");
  }
  const results = new Array(items.length);
  let nextIndex = 0;
  async function consume() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, consume)
  );
  return results;
}

const button = document.querySelector("#run");
const output = document.querySelector("#output");
const log = (message) => {
  output.textContent += `${message}\n`;
};

async function runExamples() {
  log("同步开始");
  const reaction = Promise.resolve().then(() => log("Promise 反应"));
  log("同步结束");
  await reaction;

  const first = await task("串行甲", 40);
  const second = await task("串行乙", 20);
  log(`${first}；${second}`);

  const parallel = await Promise.all([
    task("并发甲", 40),
    task("并发乙", 20)
  ]);
  log(parallel.join("；"));

  const settled = await Promise.allSettled([
    task("收集甲", 10),
    task("收集乙", 10, { fail: true })
  ]);
  log(settled.map((item) => item.status).join("；"));

  let active = 0;
  let maximum = 0;
  const pooled = await mapLimit([1, 2, 3, 4, 5], 2, async (item) => {
    active += 1;
    maximum = Math.max(maximum, active);
    try {
      return await task(`池任务${item}`, 20);
    } finally {
      active -= 1;
    }
  });
  log(`最大并发：${maximum}；结果数：${pooled.length}`);

  const controller = new AbortController();
  const pending = task("取消示例", 500, { signal: controller.signal });
  controller.abort();
  try {
    await pending;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      log("取消已识别，不当作业务失败。");
    } else {
      throw error;
    }
  }
}

button.addEventListener("click", async () => {
  button.disabled = true;
  output.textContent = "";
  try {
    await runExamples();
    log("全部示例流程结束。");
  } catch (error) {
    log(error instanceof Error ? error.message : "发生未知错误。");
  } finally {
    button.disabled = false;
  }
});
```

打开入口并点击按钮，预期先显示“同步开始”“同步结束”，再显示 Promise 反应。串行与并发都显示甲在乙前，这是结果保存顺序，不代表并发甲先完成。完整收集的状态为 `fulfilled` 与 `rejected`，并发池最大活动数为 2，结果数为 5，最后出现取消识别和流程结束文字。

## 并发组合各自承担什么责任

连续两次 `await` 通常把两个任务串行化，因为第二个任务在第一个完成后才创建。先创建两个任务，再统一等待则可以重叠执行。并发不等于多线程：本例在一个 JavaScript 主线程上处理回调，只是等待时间重叠。CPU 密集任务若要真正离开主线程，需要另行考虑 Worker 等机制。

`Promise.all()` 要求全部成功，并按输入顺序返回结果；其中一个拒绝会让组合拒绝，但其他操作不会自动被取消。`Promise.allSettled()` 等全部结束，适合展示部分成功或汇总批量结果。选哪个取决于业务是否允许局部失败，不应为了“不报错”一律使用完整收集然后忽略失败项。

本文并发池用于说明数量限制，若一个工作项拒绝，组合会拒绝，其他已启动循环仍可能继续工作。它不是生产级失败停止调度器。需要“首个失败后不再派发并取消在途任务”时，应增加共享取消信号、停止领取条件，并等待所有工作循环清理完成。这个边界必须写进接口契约，不能靠函数名字猜测。

`Promise.race()` 返回最早结算项，可用于调用方超时决策，但单独竞速不会终止耗时任务。对可取消请求，应在超时发生时触发控制器，并在正常结束时清理超时计时器。否则界面显示超时后，后台仍可能继续占用网络并产生过时结果。

## 错误传播与清理为什么要分层

`try/catch` 能捕获当前同步异常和已经 `await` 的拒绝，不能自动捕获任意未等待任务的失败。事件系统通常不会替你处理异步监听器返回的 Promise，因此本例在监听器内部等待并捕获整个流程。捕获后如果无法合理处理，应继续抛出，而不是转换成没有说明的空结果。

取消通常是预期控制流，业务拒绝、网络故障和代码错误则可能需要不同提示。根据可靠的错误类型或名称分类，不要只比较某条浏览器自然语言消息。`finally` 适合恢复按钮、减少活动计数和清理资源，避免成功与失败分支重复维护；但不要在其中随意 `return`，否则可能覆盖原本的返回值或错误。

重试也必须有边界。只对明确可重试且安全的操作设置有限次数与间隔，涉及支付或写入时还要考虑幂等性。本文没有加入自动重试，因为它会掩盖基础失败路径。只有掌握一次操作的结果和清理，才适合增加更复杂的恢复策略。

## 检查结果与错误排查

如果输出顺序不符合预期，先检查任务创建位置，而不是看计时数字大小。如果最大活动数超过限制，检查是否在进入池之前已经调用了全部任务；把已经运行的 Promise 数组交给池并不能限制启动数。限制器应接收任务描述或函数，决定何时启动操作。

如果取消后仍有后续输出，检查操作是否真的监听 `signal`，以及完成后是否有过时结果写入界面。取消也不保证服务端撤销已经收到的写操作，客户端停止等待与服务器事务回滚不是一回事。对于搜索这类读取，可以配合序号检查，保证旧响应不覆盖新响应。

如果控制台出现未处理拒绝，沿调用链检查每个异步任务是否返回、等待或明确捕获。不要通过添加一个空 `catch` 消除警告；那会让调用方拿不到失败证据。若清理没有执行，检查错误是否发生在资源建立之前，以及清理代码是否位于可靠的 `finally` 中。

## 任务生命周期与页面离开

请求取消不仅由用户点击触发，也可能来自页面切换、组件销毁或新的任务替换旧任务。任务拥有者应同时拥有控制器和清理逻辑，离开时停止无用工作，并避免结束回调写入已不再有效的界面。只在全局保存一个控制器会让无关操作互相取消，因此取消范围应与业务任务一致。

已经完成的任务再收到取消信号，不会把原 Promise 的最终状态改回拒绝；Promise 的结算只能确定一次。反过来，调用方已经放弃等待，也不代表底层工作必然停止。这两种方向的区别帮助你判断是否需要额外清理资源、阻止结果提交或通知服务端，而不是只修改一个布尔值就认为取消完整。

界面状态应与这些生命周期对应。等待时说明在做什么，取消时说明哪些结果保留，失败时提供合理恢复入口。重复点击、任务竞争和恢复按钮都属于正常使用路径，不应留到出现事故才补充。没有明确状态模型的异步代码，即使每次请求都成功，也可能让用户看见过时或互相矛盾的信息。

## 练习与官方参考

给页面增加取消按钮，让用户可以取消一组正在执行的本地任务。开始时创建一个新控制器，所有任务共享该信号，取消后仍恢复启动按钮。验收包括正常结束、立即取消、执行中取消和完成后再次点击取消，明确每种状态应该如何显示。

再扩展并发池：记录已启动、成功、失败和取消数量，保持输入顺序结果。不要声称达到某个性能倍数，只核验最大活动数和状态分类。完成后阅读 [DOM 事件与 fetch](./dom.html)，将异步生命周期连接到真实页面状态。

官方参考：

- [MDN：Promise](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Promise)
- [MDN：async function](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Statements/async_function)
- [MDN：Promise.allSettled()](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled)
- [MDN：AbortController](https://developer.mozilla.org/zh-CN/docs/Web/API/AbortController)

学习异步应核对结果、生命周期与错误边界，而不是只看是否打印了成功文字。
