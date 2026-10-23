---
title: "第 12 章：浏览器渲染流程"
description: "理解解析、样式计算、布局、绘制、合成以及页面生命周期。"
date: '2026-10-23'
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

**布局变化通常使绘制结果失效，但并非任何 Layout 都必然产生新的可见 Paint**；浏览器可能复用绘制或跳过不可见区域。绘制变化则不一定需要重新布局：

- 改变 `width` → Layout → Paint → Composite
- 改变 `background-color` → Paint → Composite
- 改变 `transform` → 满足合成条件时可只更新 Composite，仍需核对实际绘制

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

// 在样式/布局已失效时，读取布局属性可能强制同步计算
const h = el.offsetHeight;      // 已有有效布局时可复用，不一定重新布局
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
// 连续写入通常会被浏览器批处理；关键是避免写后立即读取布局
el.style.width = '100px';
el.style.height = '200px';
el.style.background = 'red';

// cssText 便于成组修改，但 += 会读取并重新解析整段内联样式
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

**优先在 `visibilitychange` 变为 hidden 时保存草稿**，并按需补充 `pagehide`；移动端进程被杀时任何卸载事件都不能保证触发，关键数据应在编辑过程中增量保存。只在有未保存变更时添加 `beforeunload`，避免影响往返缓存。

### 官方参考与验证

`load` 不保证所有延迟加载图片或以后动态加载资源已完成；async 脚本也可能在 DOMContentLoaded 后执行。`requestAnimationFrame` 只安排渲染前回调，并不会自动消除回调中的同步布局。关键 CSS 的 onload 写法是示意，严格 CSP 可能禁止内联事件，应使用允许的外部脚本或 nonce 策略。

### 12.8 理解失效范围与同步读取

这条渲染链路是解释模型，不是浏览器每帧执行的一张固定清单。样式改变会使相关计算失效，浏览器可以在需要时批量更新；读取一个已有有效布局的矩形，不一定重新布局。问题在于写入几何之后立即读取，读取者要求现在就得到准确结果，可能迫使浏览器提前完成计算。`getComputedStyle()` 也不是所有属性、所有情况下都会引起布局，应以实际调用栈和 Forced reflow 证据判断。

读写分离不会消除本来就需要的布局，而是减少同一批数据中反复打断批处理。若计算依赖写入后的新尺寸，必须承认这条依赖：先提交一批变化，再在合理的阶段测量。简单地把每个回调都包进 requestAnimationFrame，仍可能在同一帧中产生多次读写交错。持续监听尺寸可以考虑 ResizeObserver，但回调内再次改变被观察尺寸时要避免反馈循环。

浏览器布局还包括内联文本、匿名盒子、伪元素等结构，因此 Render Tree 不应被理解为“给每个可见 DOM 节点贴一个框”。字体替换、滚动条出现和设备缩放也能改变几何，不只有 JavaScript 写 style 才会重排。排查按钮抖动时同时检查字体、容器约束和异步内容尺寸。

### 12.9 从可观察现象定位阶段

页面空白时先看 HTML 是否成功返回、脚本是否报错和 CSS 是否把内容隐藏；页面已有文字却卡顿时再检查长任务、布局和绘制。错误阶段不同，修复也不同。网络成功不证明脚本完成，脚本完成不证明首屏可交互，`load` 更不是业务初始化成功事件。

练习为一百个元素制作交错读写与批量读写版本，用相同内容录制 Performance，定位调用栈而非只比较总时长。然后设置慢字体和图片、从历史返回、切换后台，观察布局偏移和 `pageshow.persisted`。保存草稿应在编辑中增量执行，页面 hidden 时再补一次；刷新恢复的是内容状态，不是旧页面上的计时器和失效引用。验收时给出瓶颈证据、改动后 trace 和草稿恢复结果，并明确未模拟到的移动端进程终止行为。

练习：录制读写交错与读写分离的两个循环，比较 Forced reflow；切到后台、从 bfcache 返回和强制关闭移动端浏览器，观察哪些保存事件实际触发。

- [WHATWG 文档就绪](https://html.spec.whatwg.org/multipage/parsing.html#the-end)
- [Page Lifecycle 指南](https://developer.chrome.com/docs/web-platform/page-lifecycle-api)
- [web.dev 布局抖动](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing)

---
