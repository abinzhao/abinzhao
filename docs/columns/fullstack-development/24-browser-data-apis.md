---
title: "第 24 章：网络、存储与常用浏览器 API"
description: "使用 Fetch、AbortController、Web Storage、Clipboard、Web Share、structuredClone、Performance 与 Page Visibility。"
date: "2026-10-15"
category: 浏览器 API
tags: [Fetch, Storage, Performance]
series:
  order: 25
---
## 第 24 章 网络、存储与页面能力

这一章把博客最常用的浏览器能力串成一条完整路径：请求文章、取消旧请求、保存偏好、复制或分享链接、复制复杂数据、测量性能，并在页面进入后台时暂停工作。

### 24.1 学习目标

- 正确处理 Fetch 的状态码、JSON 解析、超时和取消。
- 理解 `localStorage` 与 `sessionStorage` 的边界和失败情况。
- 在安全上下文和用户操作中使用剪贴板与系统分享。
- 使用 `structuredClone()` 复制可克隆的复杂数据。
- 用 Performance API 建立可查询的性能标记。
- 根据 Page Visibility 暂停非必要任务。

### 24.2 Fetch 请求

```js
async function fetchPosts() {
  const response = await fetch('/api/posts', {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`文章请求失败：HTTP ${response.status}`);
  }

  return response.json();
}
```

`fetch()` 只会在网络错误、取消等情况下 reject。服务器返回 404、429 或 500 时，Promise 仍然 fulfilled，因此必须检查 `response.ok`。

发送 JSON：

```js
async function createComment(input) {
  const response = await fetch('/api/comments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.message ?? `提交失败：HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload;
}
```

只有同源策略允许，或服务端返回正确 CORS 响应头时，浏览器才允许前端读取跨源响应。前端代码不能绕过服务端 CORS 策略。

### 24.3 使用 `AbortController` 取消请求

搜索输入快速变化时，应取消上一次请求：

```js
let activeController;

async function searchPosts(keyword) {
  activeController?.abort();
  activeController = new AbortController();

  try {
    const url = new URL('/api/search', location.origin);
    url.searchParams.set('q', keyword);

    const response = await fetch(url, {
      signal: activeController.signal,
    });

    if (!response.ok) {
      throw new Error(`搜索失败：HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return null;
    }

    throw error;
  }
}
```

超时可以使用 `AbortSignal.timeout()`，兼容目标不确定时也可手动实现：

```js
async function fetchWithTimeout(url, milliseconds = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);

  try {
    return await fetch(url, {
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
```

取消表示“结果已不再需要”，不应展示成普通错误提示。

### 24.4 Web Storage

`localStorage` 在同一源下跨页面和浏览器重启保留；`sessionStorage` 通常只在当前标签页会话中保留。二者都只能存字符串，而且是同步 API。

```js
const THEME_KEY = 'blog:theme';

export function readTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export function writeTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (error) {
    console.warn('主题偏好无法持久化', error);
  }
}
```

隐私模式、浏览器策略、存储配额或安全设置都可能让访问失败，因此需要 `try/catch`。

存储结构化数据：

```js
const DRAFT_KEY = 'blog:comment-draft:v1';

function saveDraft(draft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function readDraft() {
  const raw = localStorage.getItem(DRAFT_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(DRAFT_KEY);
    return null;
  }
}
```

key 中加入版本号，数据结构升级时更容易迁移。不要存密码、访问令牌或大体积业务数据。

同源其他标签页修改 `localStorage` 时，当前页面可以收到 `storage` 事件：

```js
window.addEventListener('storage', (event) => {
  if (event.key === THEME_KEY && event.newValue) {
    applyTheme(event.newValue);
  }
});
```

### 24.5 Clipboard API

复制文章链接通常需要 HTTPS 或本地开发环境，并且应由用户操作触发：

```js
async function copyPostLink() {
  try {
    await navigator.clipboard.writeText(location.href);
    showMessage('链接已复制');
  } catch (error) {
    console.error(error);
    showMessage('复制失败，请手动复制地址栏链接');
  }
}

copyButton.addEventListener('click', copyPostLink);
```

读取剪贴板权限更敏感，不要在页面加载时主动请求。只有明确业务需要且用户发起操作时才调用。

### 24.6 Web Share API

在支持系统分享面板的设备上：

```js
async function sharePost(post) {
  const shareData = {
    title: post.title,
    text: post.summary,
    url: location.href,
  };

  if (navigator.share && navigator.canShare?.(shareData)) {
    try {
      await navigator.share(shareData);
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      throw error;
    }
  }

  await navigator.clipboard.writeText(location.href);
  showMessage('当前设备不支持系统分享，链接已复制');
}
```

用户关闭分享面板属于取消，不应显示红色错误。Web Share 支持范围和可分享数据类型会随平台变化，必须提供复制链接兜底。

### 24.7 `structuredClone()`

JSON 序列化无法正确保留 `Date`、`Map`、`Set`、循环引用和 `undefined`。现代浏览器可使用结构化克隆：

```js
const state = {
  selectedTags: new Set(['JavaScript', 'Browser']),
  lastVisitedAt: new Date(),
};

state.self = state;

const copy = structuredClone(state);

console.log(copy !== state);                        // true
console.log(copy.selectedTags instanceof Set);      // true
console.log(copy.lastVisitedAt instanceof Date);    // true
console.log(copy.self === copy);                    // true
```

函数、DOM 节点和部分平台对象不能被克隆，会抛出 `DataCloneError`：

```js
// structuredClone({ onClick() {} }); // DataCloneError
```

结构化克隆适合创建隔离副本，不等于不可变状态管理，也不是序列化到网络或磁盘的格式。

### 24.8 Performance API

使用标记测量一段异步流程：

```js
async function loadAndRenderPosts() {
  performance.mark('posts:start');

  const posts = await fetchPosts();
  renderPosts(posts);

  performance.mark('posts:end');
  performance.measure(
    'posts:load-and-render',
    'posts:start',
    'posts:end',
  );

  const [entry] = performance.getEntriesByName('posts:load-and-render');
  console.log(`文章加载与渲染：${entry.duration.toFixed(1)}ms`);

  performance.clearMarks('posts:start');
  performance.clearMarks('posts:end');
  performance.clearMeasures('posts:load-and-render');
}
```

测量函数执行时间也可以使用高精度时间戳：

```js
const startedAt = performance.now();
const result = buildSearchIndex(posts);
const duration = performance.now() - startedAt;
```

不要用一次本机测量得出性能结论。应在真实数据量、降速环境和多次运行下比较分布。

通过 `PerformanceObserver` 收集浏览器性能条目：

```js
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    console.log(entry.entryType, entry.name, entry.duration);
  }
});

observer.observe({
  type: 'longtask',
  buffered: true,
});
```

具体支持的 entry type 需要做特性检测。

### 24.9 Page Visibility

标签页进入后台后暂停轮播、轮询或动画：

```js
let refreshTimer;

function startRefresh() {
  if (refreshTimer) {
    return;
  }

  refreshTimer = setInterval(refreshStats, 30_000);
}

function stopRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = undefined;
}

function syncWithVisibility() {
  if (document.visibilityState === 'visible') {
    startRefresh();
    refreshStats();
  } else {
    stopRefresh();
  }
}

document.addEventListener('visibilitychange', syncWithVisibility);
syncWithVisibility();
```

移动端关闭页面时，`beforeunload` 不可靠。保存轻量草稿或停止任务时优先响应 `visibilitychange`。大量数据上报可结合 `navigator.sendBeacon()`，但仍要控制数据量和隐私范围。

### 24.10 完整练习：文章操作栏

```js
function setupPostActions(post) {
  const controller = new AbortController();
  const copyButton = document.querySelector('[data-copy-link]');
  const shareButton = document.querySelector('[data-share-post]');

  copyButton?.addEventListener(
    'click',
    () => copyPostLink(),
    { signal: controller.signal },
  );

  shareButton?.addEventListener(
    'click',
    () => sharePost(post).catch((error) => {
      console.error(error);
      showMessage('分享失败，请稍后重试');
    }),
    { signal: controller.signal },
  );

  return () => controller.abort();
}
```

初始化函数返回清理函数。单页应用切换文章时先清理旧监听器，可以避免重复响应。

### 24.11 效果验证

1. 在慢速网络下连续搜索，确认旧请求被取消且不会覆盖新结果。
2. 禁用存储权限或模拟异常，确认主题功能仍能使用，只是不持久化。
3. 在支持和不支持 Web Share 的设备上分别验证分享与复制兜底。
4. 克隆包含 `Date`、`Set` 和循环引用的对象，确认类型保持。
5. 切换到其他标签页，确认定时刷新停止；返回后立即刷新一次。
6. 在 Performance 面板核对自定义 measure。

---
