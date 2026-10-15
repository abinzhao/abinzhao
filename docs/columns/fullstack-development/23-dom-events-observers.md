---
title: "第 23 章：DOM、事件系统与观察器"
description: "操作 DOM，掌握捕获、冒泡、事件委托，并使用三类 Observer 响应页面变化。"
date: "2026-10-15"
category: 浏览器 API
tags: [DOM, Events, Observer]
series:
  order: 24
---
## 第 23 章 DOM、事件与观察器

DOM 是浏览器把 HTML 表示成的对象树。事件系统把用户操作沿树传播，Observer API 则在结构、尺寸或可见性变化时异步通知代码。

### 23.1 学习目标

- 安全地查询、创建、更新和删除 DOM 节点。
- 解释事件捕获、目标和冒泡三个阶段。
- 使用事件委托管理动态列表。
- 正确使用 `preventDefault()`、`stopPropagation()` 和监听器选项。
- 根据问题选择 Mutation、Resize 或 Intersection Observer。

### 23.2 查询和更新 DOM

```js
const main = document.querySelector('main');
const postList = document.querySelector('[data-post-list]');
const cards = document.querySelectorAll('.post-card');
```

- `querySelector()` 返回第一个匹配节点或 `null`。
- `querySelectorAll()` 返回静态 `NodeList`，之后新增节点不会自动加入。
- `getElementsByClassName()` 返回动态集合，循环修改 DOM 时更难推断。

写入纯文本时使用 `textContent`：

```js
const title = document.createElement('h2');
title.textContent = post.title;
```

不要把不可信内容直接交给 `innerHTML`：

```js
// 危险：post.title 可能包含脚本或事件属性。
card.innerHTML = `<h2>${post.title}</h2>`;
```

创建文章卡片：

```js
function createPostCard(post) {
  const article = document.createElement('article');
  article.className = 'post-card';
  article.dataset.slug = post.slug;

  const title = document.createElement('h2');
  const link = document.createElement('a');
  link.href = `/posts/${encodeURIComponent(post.slug)}.html`;
  link.textContent = post.title;

  const summary = document.createElement('p');
  summary.textContent = post.summary;

  const favoriteButton = document.createElement('button');
  favoriteButton.type = 'button';
  favoriteButton.dataset.action = 'favorite';
  favoriteButton.setAttribute('aria-pressed', 'false');
  favoriteButton.textContent = '收藏';

  title.append(link);
  article.append(title, summary, favoriteButton);

  return article;
}
```

批量插入时使用 `DocumentFragment` 或一次 `append()`：

```js
const fragment = document.createDocumentFragment();

for (const post of posts) {
  fragment.append(createPostCard(post));
}

postList.replaceChildren(fragment);
```

`replaceChildren()` 会清空旧内容并插入新节点，适合列表整体刷新。

### 23.3 读取属性、状态与样式

```js
card.dataset.slug;                    // data-slug
button.getAttribute('aria-pressed');  // 字符串或 null
button.disabled;                      // 布尔 DOM 属性
card.classList.toggle('is-active');
```

优先通过 class 改样式：

```js
card.classList.toggle('is-favorite', isFavorite);
button.setAttribute('aria-pressed', String(isFavorite));
```

只有动态数值才适合写行内自定义属性：

```js
progress.style.setProperty('--progress', String(percent));
```

读取布局信息会触发浏览器确保布局是最新的：

```js
const rect = card.getBoundingClientRect();
console.log(rect.width, rect.top);
```

批量操作时先读后写，避免布局抖动。

### 23.4 捕获、目标与冒泡

点击按钮时，事件传播路径可能是：

```text
window → document → html → body → article → button
            捕获阶段 → 目标阶段 → 冒泡阶段
```

默认监听器在目标和冒泡阶段执行：

```js
document.body.addEventListener('click', (event) => {
  console.log('body bubble', event.target);
});
```

传入 `capture: true` 可以在捕获阶段执行：

```js
document.body.addEventListener(
  'click',
  () => {
    console.log('body capture');
  },
  { capture: true },
);
```

常用事件对象属性：

```js
button.addEventListener('click', (event) => {
  console.log(event.target);        // 实际触发事件的最深节点
  console.log(event.currentTarget); // 当前正在执行监听器的节点
  console.log(event.type);          // click
});
```

### 23.5 事件委托

文章列表可能异步添加卡片。如果给每个按钮单独绑定监听器，需要在每次更新后重新绑定。事件委托只监听稳定的父节点：

```js
postList.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }

  const button = event.target.closest('[data-action="favorite"]');

  if (!button || !postList.contains(button)) {
    return;
  }

  const card = button.closest('[data-slug]');
  const slug = card?.getAttribute('data-slug');

  if (!slug) {
    return;
  }

  const nextFavorite = button.getAttribute('aria-pressed') !== 'true';

  button.setAttribute('aria-pressed', String(nextFavorite));
  card.classList.toggle('is-favorite', nextFavorite);
  updateFavorite(slug, nextFavorite);
});
```

`closest()` 很重要：用户可能点到按钮内部的图标，而不是按钮节点本身。

以下事件默认不冒泡或行为不同，委托前应查文档：

- `focus`、`blur` 不冒泡，可改用 `focusin`、`focusout`。
- `mouseenter`、`mouseleave` 不冒泡，可考虑 `mouseover`、`mouseout`。
- `scroll` 通常不能按普通冒泡事件委托。

### 23.6 默认行为与传播控制

阻止链接跳转或表单提交等默认行为：

```js
form.addEventListener('submit', (event) => {
  event.preventDefault();
  submitForm(new FormData(form));
});
```

`preventDefault()` 不会停止传播。`stopPropagation()` 会停止事件继续经过其他节点，但通常不应滥用：

```js
dialog.addEventListener('click', (event) => {
  event.stopPropagation();
});
```

过多停止传播会破坏统计、快捷键和外层组件。弹窗点击外部关闭可以直接判断目标：

```js
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) {
    dialog.close();
  }
});
```

常用监听器选项：

```js
window.addEventListener('scroll', handleScroll, {
  passive: true,
});

button.addEventListener('click', handleFirstClick, {
  once: true,
});

const controller = new AbortController();

window.addEventListener('resize', handleResize, {
  signal: controller.signal,
});

controller.abort(); // 自动移除监听器
```

被动监听器承诺不调用 `preventDefault()`，适合滚动相关事件。

### 23.7 `MutationObserver`

监听 DOM 结构、属性或文本变化：

```js
const observer = new MutationObserver((records) => {
  for (const record of records) {
    if (record.type === 'childList') {
      console.log('新增节点', record.addedNodes);
      console.log('移除节点', record.removedNodes);
    }
  }
});

observer.observe(postList, {
  childList: true,
  subtree: true,
});

// 不再需要时停止监听。
observer.disconnect();
```

适用场景：

- 第三方组件插入内容后进行集成。
- 监控编辑器或动态目录的结构变化。
- 在不能直接控制写入逻辑时观察 DOM。

如果代码本来就负责修改 DOM，应直接在修改后调用业务函数，不要绕一圈再用 Observer 发现自己的改动。

### 23.8 `ResizeObserver`

元素尺寸变化不一定来自窗口缩放，也可能来自容器、字体或内容变化：

```js
const cover = document.querySelector('.post-cover');

const resizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const width = entry.contentRect.width;
    entry.target.classList.toggle('is-compact', width < 480);
  }
});

if (cover) {
  resizeObserver.observe(cover);
}
```

优先用 CSS 容器查询处理纯样式变化。只有尺寸变化需要驱动 JavaScript 行为时才使用 `ResizeObserver`。

不要在回调中无条件修改被观察元素尺寸，否则可能产生循环：

```js
const resizeObserver = new ResizeObserver(([entry]) => {
  const width = entry.contentRect.width;

  requestAnimationFrame(() => {
    updateChart(width);
  });
});
```

### 23.9 `IntersectionObserver`

判断元素是否进入视口或某个滚动容器：

```js
const headings = document.querySelectorAll('article h2[id]');

const intersectionObserver = new IntersectionObserver(
  (entries) => {
    const visibleHeading = entries
      .filter((entry) => entry.isIntersecting)
      .sort(
        (left, right) =>
          left.boundingClientRect.top - right.boundingClientRect.top,
      )[0];

    if (visibleHeading) {
      setActiveHeading(visibleHeading.target.id);
    }
  },
  {
    root: null,
    rootMargin: '-80px 0px -70% 0px',
    threshold: 0,
  },
);

for (const heading of headings) {
  intersectionObserver.observe(heading);
}
```

图片进入附近区域后再加载：

```js
const imageObserver = new IntersectionObserver(
  (entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) {
        continue;
      }

      const image = entry.target;
      image.src = image.dataset.src;
      observer.unobserve(image);
    }
  },
  { rootMargin: '300px' },
);
```

原生图片懒加载优先使用 `<img loading="lazy">`。需要自定义预加载距离或处理非图片元素时再使用 Observer。

### 23.10 选择哪一个 Observer

| 需要观察的变化 | API |
|---|---|
| 子节点、属性、文字 | `MutationObserver` |
| 元素内容盒或边框盒尺寸 | `ResizeObserver` |
| 元素与视口/滚动容器相交 | `IntersectionObserver` |
| URL、表单状态或业务数据 | 不属于 DOM Observer，应在状态变化源头处理 |

三个 Observer 的回调都是异步批量触发。回调中只做必要工作，不要执行大规模同步计算。

### 23.11 效果验证

1. 异步插入一张文章卡片，确认事件委托无需重新绑定即可收藏。
2. 点击按钮内部的图标，确认 `closest()` 仍能找到操作按钮。
3. 用 DevTools 修改列表节点，观察 `MutationObserver` 记录。
4. 拖动容器宽度，确认 `ResizeObserver` 更新紧凑样式。
5. 滚动文章，确认目录随可见标题变化。
6. 移除页面模块时调用 `disconnect()` 或 `AbortController.abort()`，确认不再执行回调。

---
