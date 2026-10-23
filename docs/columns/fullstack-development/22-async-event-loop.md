---
title: "第 22 章：Promise、async/await 与事件循环"
description: "掌握 Promise 链、异步并发、事件循环以及微任务和宏任务的执行顺序。"
date: "2026-10-23"
category: JavaScript
tags: [Promise, 异步等待, 事件循环]
series:
  order: 23
---
## 第 22 章 异步与事件循环

JavaScript 在页面主线程上一次只执行一段代码，但浏览器可以并行处理网络、计时器和用户输入。事件循环负责把完成后的工作排回 JavaScript 执行队列。

### 22.1 学习目标

- 理解 Promise 的三种状态和链式返回规则。
- 用 `async/await` 编写可读、可捕获错误的异步流程。
- 根据依赖关系选择串行或并发。
- 预测同步代码、微任务、计时器和渲染的先后顺序。
- 避免未处理拒绝、重复提交和微任务饥饿。

### 22.2 Promise 是未来结果的容器

Promise 有三种状态：

- `pending`：进行中。
- `fulfilled`：成功并得到值。
- `rejected`：失败并得到原因。

状态一旦从 `pending` 变为 fulfilled 或 rejected，就不能再次改变。

```js
function wait(milliseconds) {
  return new Promise((resolve, reject) => {
    if (milliseconds < 0) {
      reject(new RangeError('等待时间不能为负数'));
      return;
    }

    setTimeout(() => {
      resolve(milliseconds);
    }, milliseconds);
  });
}

wait(300)
  .then((duration) => {
    console.log(`等待了 ${duration}ms`);
    return duration / 1000;
  })
  .then((seconds) => {
    console.log(`${seconds}s`);
  })
  .catch((error) => {
    console.error(error);
  })
  .finally(() => {
    console.log('计时结束');
  });
```

每次 `.then()` 都返回一个新的 Promise：

- 回调返回普通值：下一个 Promise fulfilled，值就是返回值。
- 回调返回 Promise：下一个 Promise 等待它完成。
- 回调抛出错误：下一个 Promise rejected。

```js
fetch('/posts.json')
  .then((response) => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  })
  .then((posts) => posts.filter((post) => post.published))
  .then(renderPosts)
  .catch(renderLoadError);
```

不要在已有 Promise 外再套一层无意义的 Promise：

```js
// 不必要
function loadPostsWrong() {
  return new Promise((resolve, reject) => {
    fetch('/posts.json').then(resolve, reject);
  });
}

// 直接返回
function loadPosts() {
  return fetch('/posts.json');
}
```

### 22.3 `async/await`

`async` 函数总是返回 Promise，`await` 会暂停当前异步函数，等待 Promise 完成，但不会阻塞整个页面：

```js
async function loadPosts() {
  const response = await fetch('/posts.json');

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

async function showPosts() {
  setLoading(true);

  try {
    const posts = await loadPosts();
    renderPosts(posts);
  } catch (error) {
    renderLoadError(error);
  } finally {
    setLoading(false);
  }
}
```

下面两个返回值等价：

```js
async function getCount() {
  return 3;
}

function getCountWithPromise() {
  return Promise.resolve(3);
}
```

不要忘记等待 Promise：

```js
async function publish() {
  await saveDraft();
  await sendPublishRequest();
}

// 调用方也要等待或返回它。
await publish();
```

如果直接调用 `publish()` 且没有 `await`、`return` 或 `.catch()`，错误可能成为未处理的 Promise rejection。

### 22.4 串行与并发

后一步依赖前一步结果时使用串行：

```js
const session = await createSession();
const profile = await loadProfile(session.userId);
```

互不依赖的请求应同时开始：

```js
const postsPromise = loadPosts();
const tagsPromise = loadTags();

const [posts, tags] = await Promise.all([
  postsPromise,
  tagsPromise,
]);
```

也可以直接写：

```js
const [posts, tags] = await Promise.all([
  loadPosts(),
  loadTags(),
]);
```

常见组合方法：

| 方法 | 结果 |
|---|---|
| `Promise.all()` | 全部成功才成功；任意一个失败就立即失败 |
| `Promise.allSettled()` | 等待全部结束，并保留每项成功或失败状态 |
| `Promise.race()` | 第一个结束的结果决定最终状态 |
| `Promise.any()` | 第一个成功即成功；全部失败才失败 |

这些组合方法不会取消已开始的工作。`all()` 提前拒绝或 `race()` 得到超时结果后，其他请求仍可能继续；取消网络请求需要把 `AbortSignal` 传给 Fetch。也不要对十万条数据直接 `Promise.all(items.map(...))`，应限制同时在途任务数。

首页多个区域允许独立失败时，可以使用 `allSettled()`：

```js
const results = await Promise.allSettled([
  loadPosts(),
  loadPopularTags(),
  loadRecommendations(),
]);

const [postsResult, tagsResult, recommendationsResult] = results;

if (postsResult.status === 'fulfilled') {
  renderPosts(postsResult.value);
} else {
  renderPostsError();
}

if (tagsResult.status === 'fulfilled') {
  renderTags(tagsResult.value);
}

if (recommendationsResult.status === 'fulfilled') {
  renderRecommendations(recommendationsResult.value);
}
```

### 22.5 事件循环

浏览器中的关键组成可以简化为：

```text
调用栈：正在执行的 JavaScript
Web APIs：计时器、网络、事件监听等浏览器能力
任务队列：计时器、事件等任务
微任务队列：Promise 回调、queueMicrotask
渲染：样式计算、布局、绘制
```

一次典型循环：

1. 执行一个任务，直到调用栈清空。
2. 清空全部微任务。
3. 浏览器在合适时机渲染。
4. 取下一个任务执行。

分析下面的代码：

```js
console.log('A');

setTimeout(() => {
  console.log('B');
}, 0);

Promise.resolve().then(() => {
  console.log('C');
});

queueMicrotask(() => {
  console.log('D');
});

console.log('E');
```

输出顺序：

```text
A
E
C
D
B
```

原因：

1. `A`、`E` 是当前任务中的同步代码。
2. Promise 回调和 `queueMicrotask` 按入队顺序执行。
3. `setTimeout` 回调属于后续任务，即使延迟写 `0` 也不会立即执行。

“宏任务”是常用教学称呼，HTML 规范中通常称为 task。常见 task 来源包括：

- `setTimeout`、`setInterval`。
- 用户点击、键盘和网络事件。
- `MessageChannel`。
- 初始脚本执行。

常见微任务来源包括：

- `Promise.then/catch/finally`。
- `await` 后续代码。
- `queueMicrotask()`。
- `MutationObserver` 回调。

### 22.6 `await` 后面的代码何时执行

```js
async function run() {
  console.log('2');
  await null;
  console.log('4');
}

console.log('1');
run();
console.log('3');
```

输出：

```text
1
2
3
4
```

遇到 `await` 后，函数后续部分会安排到微任务中。即使等待的不是 Promise，也不会在当前同步代码之前恢复。

### 22.7 渲染与长任务

同步 JavaScript 长时间占用主线程时，浏览器无法响应输入和绘制：

```js
button.addEventListener('click', () => {
  const startedAt = performance.now();

  while (performance.now() - startedAt < 3000) {
    // 主线程被占用三秒，页面会冻结。
  }
});
```

可以把大量工作分片，让出主线程：

```js
async function processInChunks(items, chunkSize = 500) {
  for (let start = 0; start < items.length; start += chunkSize) {
    const chunk = items.slice(start, start + chunkSize);
    processChunk(chunk);

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}
```

这里必须让出到后续 task。连续使用 `queueMicrotask()` 仍会在浏览器渲染前清空，可能造成微任务饥饿。

动画更新应使用 `requestAnimationFrame()`：

```js
requestAnimationFrame(() => {
  progressBar.style.transform = `scaleX(${progress})`;
});
```

### 22.8 实战：防止重复提交

```js
function createSubmitHandler(saveComment) {
  let submitting = false;

  return async function handleSubmit(event) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);

    submitting = true;
    submitButton.disabled = true;

    try {
      await saveComment({
        name: String(formData.get('name') ?? ''),
        content: String(formData.get('content') ?? ''),
      });

      form.reset();
      showMessage('评论已提交');
    } catch (error) {
      console.error(error);
      showMessage('提交失败，请重试');
    } finally {
      submitting = false;
      submitButton.disabled = false;
    }
  };
}

commentForm.addEventListener(
  'submit',
  createSubmitHandler(saveComment),
);
```

闭包中的 `submitting` 保证同一时刻只有一个请求，按钮禁用则给用户明确反馈。

这个保证只覆盖当前页面中的当前处理器。刷新、多个标签页、网络重试都可能重复提交；可信后端需要在第 47 章使用幂等键和数据库约束防止重复业务效果。

### 22.9 效果验证

1. 在 Console 运行事件循环示例，先写下预测顺序，再核对输出。
2. 在 `Promise.all()` 中让一个请求失败，观察整体立即进入 `catch`。
3. 改用 `Promise.allSettled()`，确认其他成功结果仍可使用。
4. 快速连续点击提交按钮，确认只调用一次 `saveComment`。
5. 在 Performance 面板录制长任务示例，观察主线程中的 Long Task。

### 22.10 常见问题

**`setTimeout(fn, 0)` 是立即执行吗？**

不是。它只表示达到最小延迟后把回调放入任务队列，还要等待当前任务和全部微任务完成。

**`forEach(async () => {})` 会等待吗？**

不会。需要串行时使用 `for...of` 加 `await`；需要并发时使用 `Promise.all(items.map(async ...))`。

**是否应该在每个函数里都写 `try/catch`？**

不应该。只在能恢复、转换错误或补充上下文的边界捕获。否则让错误继续向调用方传播。

### 22.11 官方参考

- [HTML 标准：事件循环](https://html.spec.whatwg.org/multipage/webappapis.html#event-loops)。
- [MDN：Promise](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Promise)。
- [MDN：微任务指南](https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide)。

---
