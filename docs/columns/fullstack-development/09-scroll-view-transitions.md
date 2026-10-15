---
title: "第 9 章：滚动驱动动画与视图过渡"
description: "认识滚动时间线、View Transitions API、平滑滚动和渐进增强策略。"
date: "2026-10-15"
category: CSS 动画
tags: [Scroll-driven Animations, View Transitions, Progressive Enhancement]
series:
  order: 10
---
## 第 9 章 滚动驱动动画与视图过渡

### 9.1 滚动驱动动画（Scroll-Driven Animations）

传统上滚动动画要靠 `scroll` 事件 + JS 计算，会阻塞主线程。现在可以直接用 CSS。

```css
@keyframes growProgress {
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
}

/* 滚动进度条 */
.progress-bar {
  position: fixed;
  top: 0; left: 0;
  width: 100%;
  height: 3px;
  background: #3b82f6;
  transform-origin: left;
  animation: growProgress linear;
  animation-timeline: scroll(root block);   /* 跟随根滚动容器 */
}
```

#### `scroll()` —— 基于滚动进度

```css
/* scroll(<scroller> <axis>) */
animation-timeline: scroll();               /* 最近的可滚动祖先，block 轴 */
animation-timeline: scroll(root);           /* 根滚动容器 */
animation-timeline: scroll(nearest inline);
animation-timeline: scroll(self block);     /* 元素自身可滚动时 */
```

#### `view()` —— 基于元素在视口中的可见进度

元素刚进入视口时进度为 0，完全离开时为 1。

```css
@keyframes revealFromLeft {
  from { opacity: 0; transform: translateX(-60px); }
  to   { opacity: 1; transform: translateX(0); }
}

.reveal {
  animation: revealFromLeft linear both;
  animation-timeline: view();
  animation-range: entry 0% entry 60%;   /* 只在进入阶段的前 60% 播放 */
}
```

`animation-range` 常用值：

- `cover`：元素从接触到完全离开视口（默认）
- `contain`：元素完全在视口内
- `entry`：元素开始进入视口到完全进入
- `exit`：元素开始离开到完全离开
- `entry 0% entry 50%`：在 entry 阶段的前半段播放

```css
/* 常用组合：元素进入视口时淡入上移 */
.reveal {
  animation: fadeInUp linear both;
  animation-timeline: view();
  animation-range: entry 0% cover 30%;
}
```

#### 滚动进度时间线（不写 @keyframes 也能用）

```css
.progress {
  position: fixed;
  top: 0; left: 0;
  width: 100%;
  height: 4px;
  background: #3b82f6;
  transform-origin: 0 50%;
  scale: 0 1;                                  /* 初始横向缩放为 0 */
  animation: scaleX linear;
  animation-timeline: scroll(root);
}

@keyframes scaleX {
  to { scale: 1 1; }
}
```

#### 用 JS 创建时间线（跨滚动容器共享）

```js
const timeline = new ScrollTimeline({
  source: document.documentElement,
  axis: 'block'
});

document.querySelectorAll('.animated').forEach(el => {
  el.animate(
    [{ opacity: 0, transform: 'translateY(30px)' },
     { opacity: 1, transform: 'translateY(0)' }],
    { duration: 1, fill: 'both', timeline }
  );
});
```

**兼容性说明**：截至 2025 年，Chrome/Edge 115+ 支持，Safari 和 Firefox 尚未完全支持。使用时需要降级：

```css
/* 默认状态是可见的，避免不支持的浏览器把内容永久隐藏 */
.reveal { opacity: 1; }

@supports (animation-timeline: view()) {
  .reveal {
    opacity: 0;
    animation: fadeInUp linear both;
    animation-timeline: view();
    animation-range: entry 0% cover 30%;
  }
}
```

### 9.2 视图过渡 API（View Transitions）

用于页面状态切换时的平滑过渡，尤其是 SPA 路由切换和列表项增删。

#### 基础用法

```js
function updateUI() {
  // 这里做真实的 DOM 更新
  document.querySelector('.content').textContent = '新内容';
}

// 包在 startViewTransition 里
if (document.startViewTransition) {
  document.startViewTransition(() => updateUI());
} else {
  updateUI();   // 降级
}
```

浏览器会自动对新旧状态截图并做交叉淡入淡出。

#### 用 CSS 定制过渡

```css
/* 旧快照 */
::view-transition-old(root) {
  animation: fadeOut .25s ease both;
}

/* 新快照 */
::view-transition-new(root) {
  animation: fadeIn .25s ease both;
}

@keyframes fadeOut { to { opacity: 0; } }
@keyframes fadeIn  { from { opacity: 0; } }
```

#### 共享元素过渡（核心玩法）

给新旧状态中「同一个元素」设置相同的 `view-transition-name`，浏览器会自动计算位置尺寸差异并做位移过渡。

```css
/* 列表页的缩略图 */
.thumbnail { view-transition-name: hero-image; }

/* 详情页的大图 —— 同名 */
.detail-image { view-transition-name: hero-image; }
```

```js
document.querySelector('.card').addEventListener('click', async () => {
  const transition = document.startViewTransition(() => showDetail());
  await transition.finished;
  console.log('过渡完成');
});
```

浏览器会自动让缩略图「飞」到大图位置。整个过程中不需要你写任何 `transform` 计算。

**注意**：同一时刻，页面上同名 `view-transition-name` 只能有一个元素。列表场景需要动态分配唯一名称：

```js
cards.forEach((card, i) => {
  card.style.viewTransitionName = `card-${i}`;
});
```

#### 视图过渡类型

```js
document.startViewTransition({
  update: () => updateUI(),
  types: ['slide-forward']   // 标记过渡类型
});
```

```css
/* 只在特定类型时应用 */
::view-transition-old(root) { }
:active-view-transition-type(slide-forward)::view-transition-old(root) {
  animation: slideOutLeft .3s both;
}
```

### 9.3 滚动行为与视差

```css
/* 平滑滚动 */
html { scroll-behavior: smooth; }

/* 对减少动画用户关闭 */
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
}

/* 滚动捕捉：轮播图、整屏滚动 */
.gallery {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
}
.gallery > * {
  flex: 0 0 100%;
  scroll-snap-align: center;
}

/* 滚动容器隐藏滚动条 */
.no-scrollbar {
  scrollbar-width: none;        /* Firefox */
  -ms-overflow-style: none;     /* IE/Edge */
}
.no-scrollbar::-webkit-scrollbar { display: none; }   /* Chrome/Safari */

/* 自定义滚动条 */
::-webkit-scrollbar { width: 10px; }
::-webkit-scrollbar-track { background: #f1f1f1; }
::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 5px;
  border: 2px solid #f1f1f1;
}
::-webkit-scrollbar-thumb:hover { background: #a1a1a1; }
```

**滚动到指定位置的 JS**：

```js
// 立即跳转
el.scrollIntoView();

// 平滑滚动到顶部
window.scrollTo({ top: 0, behavior: 'smooth' });

// 滚动到元素，考虑固定头部的高度
const headerH = document.querySelector('header').offsetHeight;
const top = el.getBoundingClientRect().top + window.scrollY - headerH - 16;
window.scrollTo({ top, behavior: 'smooth' });
```

配合 `scroll-margin-top` 更简单：

```css
section[id] { scroll-margin-top: 80px; }   /* 锚点跳转时自动留出头部高度 */
```

---
