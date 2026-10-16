---
title: "第 12 章：浏览器渲染流程"
description: "理解解析、样式计算、布局、绘制、合成以及页面生命周期。"
date: "2026-10-15"
category: 浏览器原理
tags: [渲染, 性能, 浏览器]
series:
  order: 13
---
## 第 12 章 渲染流程详解

### 12.1 完整链路

```
1. 解析 HTML → 构建 DOM 树
2. 解析 CSS → 构建 CSSOM 树
3. DOM + CSSOM → Render Tree（只含可见元素，display:none 的被排除）
4. Layout（回流/重排）：计算每个节点的精确位置和尺寸
5. Paint：生成绘制指令列表，填充像素
6. Composite：按层合成，输出到屏幕
```

### 12.2 关键区分

**DOM 和 Render Tree 不是一回事**：

- `display: none` 的元素不在 Render Tree 中
- `visibility: hidden` 的元素**在** Render Tree 中（占据空间，只是不绘制）
- `::before` / `::after` 伪元素在 Render Tree 中，但不在 DOM 中

**Layout 一定会触发 Paint，但 Paint 不一定需要 Layout**：

- 改变 `width` → Layout → Paint → Composite
- 改变 `background-color` → Paint → Composite
- 改变 `transform` → Composite

### 12.3 重排（Reflow）与重绘（Repaint）

**触发重排的操作**：

```js
// 改变几何属性
el.style.width = '200px';
el.style.margin = '10px';
el.classList.add('big');        // 如果 .big 改了尺寸

// 增删 DOM
parent.appendChild(child);
parent.removeChild(child);

// 改变字体
el.style.fontSize = '20px';
el.style.fontFamily = 'Arial';

// 读取布局属性会强制同步重排（"layout thrashing"）
const h = el.offsetHeight;      // 浏览器必须立即重排才能给出准确值
const w = el.getBoundingClientRect().width;
const s = getComputedStyle(el).height;
```

**触发重绘（不重排）的操作**：

```js
el.style.color = 'red';
el.style.backgroundColor = '#eee';
el.style.visibility = 'hidden';
el.style.outline = '2px solid';
```

### 12.4 布局抖动（Layout Thrashing）

**问题代码**：

```js
// 每次循环都：读 → 写 → 读 → 写，强制同步重排 N 次
for (let i = 0; i < items.length; i++) {
  const h = items[i].offsetHeight;          // 强制重排
  items[i].style.height = h * 2 + 'px';     // 标脏
}
```

**修复：读写分离**

```js
// 1. 先批量读
const heights = items.map(el => el.offsetHeight);

// 2. 再批量写
items.forEach((el, i) => {
  el.style.height = heights[i] * 2 + 'px';
});
```

**批量写 CSS 的更好方式**：

```js
// 差：多次触发样式重算
el.style.width = '100px';
el.style.height = '200px';
el.style.background = 'red';

// 好：用 cssText 一次性写
el.style.cssText += 'width:100px;height:200px;background:red;';

// 更好：切换 class
el.classList.add('active');
```

**用 `requestAnimationFrame` 把写操作推迟到下一帧**：

```js
requestAnimationFrame(() => {
  el.style.transform = 'translateX(100px)';
});
```

**用 `fastdom` 之类的库自动批量**：

```js
fastdom.measure(() => {
  const h = el.offsetHeight;
  fastdom.mutate(() => {
    el.style.height = h * 2 + 'px';
  });
});
```

### 12.5 CSS 会阻塞渲染

```html
<!-- 阻塞：浏览器必须等 CSS 下载解析完才能构建 Render Tree -->
<link rel="stylesheet" href="style.css">

<!-- 媒体查询不匹配的 CSS 不阻塞渲染 -->
<link rel="stylesheet" href="print.css" media="print">
```

**关键 CSS 内联**：把首屏渲染必需的样式内联到 `<head>` 的 `<style>` 里，其余样式异步加载：

```html
<style>/* 首屏关键样式 */</style>
<link rel="preload" href="full.css" as="style" onload="this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="full.css"></noscript>
```

### 12.6 JS 会阻塞解析

```html
<!-- 阻塞：下载 + 执行完才继续解析 HTML -->
<script src="app.js"></script>

<!-- 异步下载，下载完立刻执行（可能打断解析） -->
<script src="app.js" async></script>

<!-- 异步下载，等 HTML 解析完按顺序执行 ← 推荐 -->
<script src="app.js" defer></script>

<!-- 模块默认 defer 行为 -->
<script type="module" src="app.js"></script>
```

**`defer` vs `async`**：

- `defer`：保证顺序，在 `DOMContentLoaded` 之前执行。适合有依赖关系的脚本（如先加载库再加载业务代码）。
- `async`：不保证顺序，谁先下载完谁先执行。适合完全独立的脚本（统计代码、客服组件）。

### 12.7 页面生命周期事件

```js
// DOM 解析完成（defer 脚本已执行）
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM 就绪，可以操作节点');
});

// 所有资源（图片、样式、字体）加载完成
window.addEventListener('load', () => {
  console.log('全部资源加载完成');
});

// 用户即将离开（可取消）
window.addEventListener('beforeunload', (e) => {
  if (hasUnsavedChanges) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// 页面进入后台/离开（不可取消，用于保存状态）
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    saveState();
  }
});

// 页面从往返缓存（bfcache）恢复
window.addEventListener('pageshow', (e) => {
  if (e.persisted) console.log('从 bfcache 恢复');
});
```

**优先用 `visibilitychange` 而不是 `beforeunload`**：移动端 `beforeunload` 不可靠，`visibilitychange` 在所有平台都触发。

---
