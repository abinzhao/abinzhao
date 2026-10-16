---
title: "第 21 章：原型、类、ESM 与错误处理"
description: "理解 JavaScript 的原型委托、class 语法、ESM 模块边界和可恢复的错误处理。"
date: "2026-10-15"
category: JavaScript 核心
tags: [原型, 类, ESM, 错误处理]
series:
  order: 22
---
## 第 21 章 原型、类、模块与错误

对象如何共享方法、代码如何拆成模块、失败如何沿调用链传递，是组织中型 JavaScript 项目的三个关键问题。

### 21.1 学习目标

- 读懂对象的原型链和属性查找过程。
- 知道 `class` 是原型机制之上的语法。
- 用 ESM 建立明确的导入导出边界。
- 区分业务失败、程序错误和外部系统错误。
- 使用 `throw`、`try/catch/finally` 和自定义错误保留上下文。

### 21.2 原型链

读取对象属性时，JavaScript 会先检查对象自身；找不到时继续沿原型向上查找：

```js
const postMethods = {
  getSummary() {
    return `${this.title} · ${this.readingMinutes} 分钟`;
  },
};

const post = Object.create(postMethods);
post.title = '理解原型链';
post.readingMinutes = 8;

console.log(post.getSummary());
console.log(Object.hasOwn(post, 'title'));      // true
console.log(Object.hasOwn(post, 'getSummary')); // false
console.log(Object.getPrototypeOf(post) === postMethods); // true
```

属性查找路径是：

```text
post 自身
  ↓ 找不到 getSummary
postMethods
  ↓ 继续向上
Object.prototype
  ↓
null
```

给原型添加方法可以让多个实例共享同一个函数：

```js
function Post(title, readingMinutes) {
  this.title = title;
  this.readingMinutes = readingMinutes;
}

Post.prototype.getSummary = function getSummary() {
  return `${this.title} · ${this.readingMinutes} 分钟`;
};

const first = new Post('作用域', 6);
const second = new Post('闭包', 9);

console.log(first.getSummary === second.getSummary); // true
```

不要修改内建对象的原型：

```js
// 不要这样做：可能与平台未来新增的方法或第三方代码冲突。
Array.prototype.first = function first() {
  return this[0];
};
```

普通工具函数更清晰：

```js
function first(items) {
  return items[0];
}
```

### 21.3 `class` 与继承

`class` 提供了更清晰的构造器和原型方法写法：

```js
class Post {
  #views = 0;

  constructor({ title, slug, readingMinutes }) {
    this.title = title;
    this.slug = slug;
    this.readingMinutes = readingMinutes;
  }

  recordView() {
    this.#views += 1;
  }

  get views() {
    return this.#views;
  }

  getSummary() {
    return `${this.title} · ${this.readingMinutes} 分钟`;
  }
}

const post = new Post({
  title: 'JavaScript 类',
  slug: 'javascript-class',
  readingMinutes: 10,
});

post.recordView();
console.log(post.views); // 1
```

- `constructor` 在 `new Post()` 时执行。
- 实例方法实际放在 `Post.prototype` 上。
- `#views` 是真正的私有字段，只能在类内部访问。
- `get views()` 暴露只读访问方式。

继承适合存在稳定“是一个”关系的模型：

```js
class FeaturedPost extends Post {
  constructor(options) {
    super(options);
    this.featuredUntil = options.featuredUntil;
  }

  isFeatured(now = new Date()) {
    return now < this.featuredUntil;
  }
}
```

前端组件和业务数据通常更适合组合，不要为了复用一两个方法建立很深的继承树：

```js
function createPost(options, analytics) {
  return {
    ...options,
    recordView() {
      analytics.track('post_view', { slug: options.slug });
    },
  };
}
```

### 21.4 ESM：明确模块边界

将博客工具拆成三个文件：

```text
src/
├── format.js
├── post-service.js
└── main.js
```

`format.js` 使用具名导出：

```js
// src/format.js
export function formatDate(isoDate) {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'long',
  }).format(new Date(isoDate));
}

export function formatReadingTime(minutes) {
  return `${minutes} 分钟阅读`;
}
```

`post-service.js` 使用默认导出：

```js
// src/post-service.js
const postService = {
  async list() {
    const response = await fetch('/posts.json');

    if (!response.ok) {
      throw new Error(`加载文章失败：HTTP ${response.status}`);
    }

    return response.json();
  },
};

export default postService;
```

`main.js` 导入模块：

```js
// src/main.js
import postService from './post-service.js';
import { formatDate, formatReadingTime } from './format.js';

const posts = await postService.list();

for (const post of posts) {
  console.log(
    post.title,
    formatDate(post.date),
    formatReadingTime(post.readingMinutes),
  );
}
```

HTML 入口必须声明模块：

```html
<script type="module" src="./src/main.js"></script>
```

浏览器原生 ESM 的注意点：

- 相对路径必须写完整扩展名，如 `./format.js`。
- 模块默认使用严格模式。
- 模块有独立作用域，顶层变量不会自动挂到 `window`。
- 模块脚本默认延迟执行。
- 直接双击 HTML 可能遇到 `file://` 限制，应通过本地 HTTP 服务访问。

启动静态服务器：

```bash
npx serve .
```

循环依赖会让初始化顺序难以理解。如果 `a.js` 导入 `b.js`，同时 `b.js` 又导入 `a.js`，应优先提取双方共同依赖的第三个模块。

### 21.5 动态导入

不在首屏需要的功能可以按需加载：

```js
const shareButton = document.querySelector('[data-share]');

shareButton?.addEventListener('click', async () => {
  const { sharePost } = await import('./share.js');
  await sharePost(location.href);
});
```

`import()` 返回 Promise。构建工具会据此拆分代码，浏览器原生 ESM 也只会在执行到该语句时请求模块。

### 21.6 错误处理的边界

只捕获你能处理或补充上下文的错误：

```js
async function loadPosts() {
  try {
    const response = await fetch('/posts.json');

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('文章列表加载失败', error);
    throw error;
  }
}
```

`fetch()` 遇到 HTTP 404 或 500 不会自动 reject，所以必须检查 `response.ok`。

自定义错误可以携带稳定的错误码和上下文：

```js
class PostLoadError extends Error {
  constructor(message, options = {}) {
    super(message, { cause: options.cause });
    this.name = 'PostLoadError';
    this.code = options.code ?? 'POST_LOAD_FAILED';
    this.status = options.status;
  }
}

async function getPost(slug) {
  try {
    const response = await fetch(`/posts/${encodeURIComponent(slug)}.json`);

    if (!response.ok) {
      throw new PostLoadError('文章请求失败', {
        code: response.status === 404 ? 'POST_NOT_FOUND' : 'POST_LOAD_FAILED',
        status: response.status,
      });
    }

    return await response.json();
  } catch (error) {
    if (error instanceof PostLoadError) {
      throw error;
    }

    throw new PostLoadError('无法连接文章服务', {
      code: 'POST_NETWORK_ERROR',
      cause: error,
    });
  }
}
```

界面层根据可预期错误展示不同反馈：

```js
try {
  const post = await getPost('closures');
  renderPost(post);
} catch (error) {
  if (error instanceof PostLoadError && error.code === 'POST_NOT_FOUND') {
    renderEmpty('文章不存在或已下线');
  } else {
    renderError('加载失败，请稍后重试');
  }
}
```

`finally` 适合无论成功失败都要执行的清理：

```js
submitButton.disabled = true;

try {
  await saveDraft();
} finally {
  submitButton.disabled = false;
}
```

不要这样吞掉错误：

```js
try {
  await saveDraft();
} catch {
  // 什么也不做：调用方以为保存成功，调试信息也丢失。
}
```

### 21.7 效果验证

1. 用本地服务器打开模块示例，确认 Network 中分别请求三个模块。
2. 把 `/posts.json` 改成不存在的路径，确认界面进入错误状态。
3. 在错误对象上检查 `name`、`code`、`status` 和 `cause`。
4. 删除导入路径的 `.js` 扩展名，观察浏览器的 404，再恢复正确写法。

### 21.8 常见问题

**默认导出还是具名导出？**

工具函数和一个文件内的多个能力优先具名导出，重命名和自动补全更稳定。一个模块只有一个明确主对象时可以使用默认导出。

**所有对象都要写成 class 吗？**

不需要。只有对象需要维护内部状态、约束构造过程，并且会创建多个实例时，类才有明显价值。

**为什么不能只 `console.error` 后返回空数组？**

这会把“请求失败”伪装成“没有文章”。错误状态和空数据状态对用户含义不同，应分别处理。

---
