---
title: "第 20 章：JavaScript 变量、作用域与闭包"
description: "理解值、引用、词法作用域、暂时性死区与闭包，并用闭包封装博客状态。"
date: "2026-10-15"
category: JavaScript
tags: [JavaScript, 作用域, 闭包]
series:
  order: 21
---
## 第 20 章 变量、作用域与闭包

这一章解决三个基础问题：变量保存的是什么、代码在什么位置能访问变量、函数为什么能记住创建时的环境。

### 20.1 学习目标

完成本章后，你应当能够：

- 用 `const` 和 `let` 表达变量是否需要重新赋值。
- 区分原始值复制和对象引用共享。
- 判断一段代码访问的是哪一层作用域中的变量。
- 解释暂时性死区和变量遮蔽。
- 用闭包保存私有状态，而不是把状态挂到全局对象。

### 20.2 `const`、`let` 与 `var`

现代 JavaScript 默认使用 `const`，确实需要重新赋值时才使用 `let`：

```js
const siteName = '前端手记';
let currentPage = 1;

currentPage += 1;
```

`const` 限制的是“变量不能重新指向另一个值”，不会冻结对象：

```js
const settings = {
  theme: 'light',
};

settings.theme = 'dark'; // 可以修改对象内部
// settings = {};        // TypeError：不能重新赋值
```

需要不可变更新时，创建新对象：

```js
const nextSettings = {
  ...settings,
  theme: 'system',
};
```

`var` 是函数作用域，并且声明会提升。它容易产生超出预期的共享变量，新代码中不要主动使用：

```js
for (var index = 0; index < 3; index += 1) {
  setTimeout(() => console.log(index), 0);
}

// 输出三次 3，因为三个回调共享同一个函数作用域变量。
```

改成 `let` 后，每轮循环都会创建独立绑定：

```js
for (let index = 0; index < 3; index += 1) {
  setTimeout(() => console.log(index), 0);
}

// 依次输出 0、1、2。
```

### 20.3 原始值与引用

常见原始类型包括：

```js
const title = '理解闭包';       // string
const views = 1200;            // number
const published = true;        // boolean
const missing = undefined;     // undefined
const empty = null;            // null
const id = 10n;                // bigint
const token = Symbol('token'); // symbol
```

原始值赋值会复制值：

```js
let firstPage = 1;
let page = firstPage;
page = 2;

console.log(firstPage); // 1
```

对象赋值会复制引用，两个变量仍指向同一个对象：

```js
const originalPost = { title: 'JavaScript 入门' };
const samePost = originalPost;

samePost.title = 'JavaScript 核心';
console.log(originalPost.title); // JavaScript 核心
```

浅复制可以切断第一层引用：

```js
const copiedPost = { ...originalPost };
copiedPost.title = '新的标题';

console.log(originalPost.title); // JavaScript 核心
```

展开语法只做浅复制。嵌套对象仍会共享：

```js
const post = {
  author: { name: 'Ava' },
};
const copy = { ...post };

copy.author.name = 'Lin';
console.log(post.author.name); // Lin
```

需要复制浏览器支持的复杂结构时，第 24 章会使用 `structuredClone()`。

### 20.4 词法作用域与暂时性死区

JavaScript 使用**词法作用域**：变量能否访问，在代码写下来的位置就已经确定。

```js
const siteName = '前端手记';

function renderHeader() {
  const sectionName = '最新文章';

  function createTitle() {
    return `${siteName} · ${sectionName}`;
  }

  return createTitle();
}
```

查找变量时，JavaScript 会从当前作用域逐层向外查找：

1. `createTitle` 的函数作用域。
2. `renderHeader` 的函数作用域。
3. 模块或全局作用域。

代码块也会创建 `let` 和 `const` 的作用域：

```js
if (published) {
  const label = '已发布';
  console.log(label);
}

// console.log(label); // ReferenceError
```

同名内层变量会遮蔽外层变量：

```js
const status = 'idle';

function submit() {
  const status = 'submitting';
  console.log(status); // submitting
}
```

`let` 和 `const` 从代码块开始到声明执行前处于**暂时性死区**：

```js
{
  // console.log(theme); // ReferenceError
  const theme = 'dark';
}
```

声明被登记了，但在执行到声明语句之前不能读取。把声明放在使用位置之前，可以让数据依赖更清楚。

### 20.5 闭包：函数记住创建时的环境

函数和它创建时能访问的词法环境组合在一起，就是闭包：

```js
function createCounter(initialValue = 0) {
  let value = initialValue;

  return function increment() {
    value += 1;
    return value;
  };
}

const nextView = createCounter(100);

console.log(nextView()); // 101
console.log(nextView()); // 102
```

`createCounter` 已执行结束，但返回的 `increment` 仍引用 `value`，因此这份状态不会被回收。

闭包适合：

- 保存模块内部状态。
- 生成带配置的函数。
- 事件处理器记住绑定时的数据。
- 实现防抖、节流和缓存。

闭包不是“复制变量快照”。它通常保存的是变量绑定，之后读取的是最新值：

```js
function createMessage() {
  let message = '加载中';

  const read = () => message;
  message = '加载完成';

  return read;
}

console.log(createMessage()()); // 加载完成
```

### 20.6 实战：封装阅读进度

下面用闭包保存已读文章，外部只能通过公开方法操作：

```js
function createReadingTracker(initialSlugs = []) {
  const readSlugs = new Set(initialSlugs);

  return {
    markAsRead(slug) {
      if (typeof slug !== 'string' || slug.trim() === '') {
        throw new TypeError('slug 必须是非空字符串');
      }

      readSlugs.add(slug);
    },

    hasRead(slug) {
      return readSlugs.has(slug);
    },

    getCount() {
      return readSlugs.size;
    },

    getSnapshot() {
      return [...readSlugs];
    },
  };
}

const tracker = createReadingTracker(['html-basics']);

tracker.markAsRead('javascript-scope');
console.log(tracker.hasRead('javascript-scope')); // true
console.log(tracker.getCount());                  // 2
console.log(tracker.getSnapshot());               // 两个 slug
```

`readSlugs` 没有暴露出去，调用方无法执行 `tracker.readSlugs.clear()`。`getSnapshot()` 返回新数组，也不会泄漏内部的 `Set`。

### 20.7 效果验证

把以上代码保存为 `scope.js`，运行：

```bash
node scope.js
```

再尝试完成以下改动：

1. 为阅读记录增加 `unmark(slug)`。
2. 增加 `reset()`，清空全部记录。
3. 连续创建两个 tracker，确认它们的状态互不影响。

可以观察到每次调用 `createReadingTracker()` 都会创建一套独立的闭包环境。

### 20.8 常见问题

**为什么 `typeof null` 是 `"object"`？**

这是 JavaScript 早期遗留行为。判断空值应直接使用 `value === null`。

**闭包会造成内存泄漏吗？**

闭包本身不会。只有仍可访问的函数长期引用大对象，而程序又不再需要这些对象时，才会造成不必要的内存占用。

**什么时候不该用闭包？**

数据本来就应被多个模块共享、持久化或响应式更新时，应使用清晰的模块状态或状态管理方案，不要把所有状态都藏进多层闭包。

---
