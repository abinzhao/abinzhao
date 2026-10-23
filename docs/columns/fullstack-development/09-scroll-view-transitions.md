---
title: "第 9 章：滚动驱动动画与视图过渡"
description: "认识滚动时间线、View Transitions API、平滑滚动和渐进增强策略。"
date: '2026-10-23'
category: CSS
tags: [滚动驱动动画, 视图过渡, 渐进增强]
series:
  order: 10
---
## 第 9 章 滚动驱动动画与视图过渡

### 9.1 滚动驱动动画（Scroll-Driven Animations）

滚动事件中的 JavaScript 计算占用主线程，是否阻塞取决于工作量和调度。支持滚动时间线时可以直接用 CSS，但动画属性和绘制成本仍需测量。

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
if ('ScrollTimeline' in window &&
    !matchMedia('(prefers-reduced-motion: reduce)').matches) {
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
}
```

**兼容性核验（2026-10-23）**：MDN 仍将 `animation-timeline` 标为 Limited availability；CSS 时间线、JavaScript `ScrollTimeline` 和视图过渡是不同能力，不能用一个浏览器版本号代替全部支持判断。按实际 API 检测并保留降级，参考 [当前兼容资料](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/animation-timeline)：

```css
/* 默认状态是可见的，避免不支持的浏览器把内容永久隐藏 */
.reveal { opacity: 1; }

@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
  .reveal {
    opacity: 0;
    animation: fadeInUp linear both;
    animation-timeline: view();
    animation-range: entry 0% cover 30%;
  }
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
  scrollbar-width: none;        /* 标准属性；必须保留可发现的滚动入口 */
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

### 验证与官方参考

`animation` 简写会重置 `animation-timeline`，所以时间线应放在简写之后。同文档 `startViewTransition()` 与跨文档 CSS `@view-transition` 是不同机制；路由更新失败时要处理 `updateCallbackDone` 的 rejection，不能让视觉过渡遮住真实错误。减少动画模式应直接更新内容。

### 9.4 先明确进度的分母

阅读进度不是 `scrollY / 页面总高度`，通常应以可滚动距离为分母，即滚动高度减去视口高度。没有滚动距离时需要定义为完成或不展示，避免除零。CSS 时间线也依赖所选滚动容器；祖先加上 `overflow: auto` 后，默认最近容器可能发生变化。调试时先找实际改变 `scrollTop` 的元素，再判断时间线，而不是继续增加监听器。

异步图片、字体和折叠内容会改变滚动范围。同一滚动位置对应的百分比可能因此变化，这不是服务器阅读记录丢失。图片应提供尺寸以减少布局偏移，动态长文则要重新观察尺寸变化。目录高亮也不是进度条的副产品：高亮跟踪章节位置，进度条表达整体滚动，两者应有各自的计算和验收。

滚动驱动效果可逆，用户往回滚时动画也可能倒退。若需求是“出现一次以后一直可见”，应使用显式状态或 IntersectionObserver，而不是误用 view 时间线。短文、比视口还高的元素、嵌套滚动与横向书写方向都能暴露范围理解错误，应分别测试。

### 9.5 导航结果先于视觉过渡

视图过渡的更新回调负责实际 DOM 或应用状态更新，视觉结束 Promise 只表示过渡阶段结束。即使浏览器跳过动画，数据仍应正确更新；发生请求失败时也要保留可读错误和重试入口。框架会批处理更新，需要在回调中等待框架把目标状态提交，不能只触发一个异步更新便立即返回。

共享元素名称必须在一次快照中唯一；列表上给所有图片设置同一个名称会使快照失败。只有当前选中的缩略图与详情图共享名称，其余元素恢复为 `none`。连续两次点击还要处理旧过渡被跳过的情况，并把焦点移到新页面的合理位置；截图动画不能替代焦点和浏览历史管理。

练习用同一篇文章验证根滚动、容器滚动和零滚动距离，再模拟路由请求失败、连续导航和减少动画。记录最终 URL、标题、焦点、错误信息和进度范围。所有情况下内容都可见、导航可恢复，才算完成；平滑滚动不应接管用户的原生滚动，也不要隐藏唯一的滚动提示。

- [Scroll-driven Animations 规范](https://drafts.csswg.org/scroll-animations-1/)
- [CSS View Transitions](https://drafts.csswg.org/css-view-transitions-1/)
- [Chrome View Transitions 指南](https://developer.chrome.com/docs/web-platform/view-transitions/)

---
