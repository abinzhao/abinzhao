---
title: "第 12 章：浏览器渲染流程"
description: "理解解析、样式计算、布局、绘制、合成以及页面生命周期。"
date: '2026-10-23'
id: fullstack-browser-rendering
updatedAt: '2026-11-03'
level: intermediate
demoIds: [rendering]
source:
  path: docs/.vitepress/theme/labs/RenderingPipeline.vue
  ref: working-tree
  command: pnpm dev
runtime: Vue 3.5.44；Web Animations API / SVG；CSS 滚动时间线按能力启用
verification:
  kind: browser
  evidence: labs-interactions.e2e.ts 与 lab-reading.e2e.ts 覆盖实际 width/transform 动画、hash、减少动态与阶段切换暂停；性能事件需按下文隔离录制。
category: 浏览器原理
tags: [渲染, 性能, 浏览器]
series:
  order: 13
---
<span id="第-12-章-渲染流程详解" aria-hidden="true"></span>

## 从结构到屏幕像素

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

### 12.10 运行本站的渲染管线实验

[打开渲染管线实验](/labs/rendering.html)，或者在本文末尾展开。五个阶段按钮是概念解释，不是浏览器内部实时探针。实际对照区域通过 Web Animations API 同时播放 `width` 与 `scaleX` 动画；手动进度滑块也可改变对应 CSS。

两条信号使用相同持续时间、缓动和变化范围，区别是前者改变布局宽度，后者保持布局尺寸只改变视觉比例。实验本身不会输出 FPS 或性能提升比例，因为 JavaScript 读取不到浏览器每一阶段的真实耗时。需要通过 Performance trace 定位事件。

局部滚动模式以滚动容器的可滚动距离为分母，映射到五个离散阶段；手动选阶段后退出滚动驱动。切换阶段、离屏或后台会暂停动画。CSS 滚动时间线仅增强局部进度线，不支持时仍能用原生滚动与步骤按钮完成探索。文章阅读进度仍按正文区域计算，不能借用这个实验的局部分母。

### 12.11 分开录制，避免互相污染

同时播放对照有助于看外观，却不适合把整页 Layout 事件归因于某一条信号。性能采样必须隔离变量：

1. 使用生产构建，关闭无关实验，固定浏览器、视口、DPR、主题和 CPU 条件。
2. 先录制两条都暂停的空闲组，再单独播放 width，最后单独播放 transform。
3. 每组先预热 500ms，再录制 5 秒。以 User Timing 标记界定窗口，只统计该页面主线程内的事件。
4. 交替重复三轮，记录原始 trace、事件数量和耗时。不要把 Layout、Paint、样式事件相加后当作总帧耗时。

下载包中的 `scripts/measure-rendering.mjs` 自动完成这一过程，调用 agent-browser 的 Chrome trace 录制能力。先安装并准备该 CLI，然后在另一个终端执行 `pnpm build` 与 `pnpm exec vitepress preview docs --host 127.0.0.1 --port 5202 --strictPort`：

```sh
node scripts/measure-rendering.mjs rendering-sample
```

脚本使用本页真实 WAAPI 动画实例，暂停其它对照项，保存每轮 trace 的 SHA256、原始记录路径、浏览器和源码哈希。若没有 agent-browser，也可以在 Chrome Performance 面板按相同隔离方法录制；不要拿开发服务器热更新期间的结果与生产构建混比。

### 12.12 一次实际录制的结果

2026-11-03，macOS、Headless Chrome 156、1440×900、DPR 1、浅色主题、生产暖页面，无 CPU/网络降速。每组 500ms 预热后记录 5 秒，交替三轮。完整条件和逐轮数据见[性能采样 JSON](/measurements/rendering-2026-11-03.json)。

| 独立运行项 | Layout 次数（三轮） | Paint 次数（三轮） | Layout 总耗时范围 | Paint 总耗时范围 |
| --- | --- | --- | --- | --- |
| 两项均暂停 | 0 / 0 / 0 | 0 / 0 / 0 | 0ms | 0ms |
| 仅 width | 303 / 300 / 302 | 600 / 600 / 600 | 31.553–42.302ms | 43.361–57.017ms |
| 仅 transform | 0 / 0 / 0 | 0 / 0 / 0 | 0ms | 0ms |

这些是采样窗口里记录到的主线程完整事件，不是整个浏览器全部工作的耗时。Paint 次数多于屏幕帧数也不表示每帧只绘制一次：同一画面可以对应多个绘制记录。

在这个有限、已经完成首次绘制的示例里，transform 路径避免了持续 Layout/Paint；它仍然有合成与 GPU 工作。零事件不等于零成本，更不能推导“所有 transform 都不会重绘”。本次没有记录真实手机帧率、现场 INP 或跨浏览器收益，第三轮耗时波动也说明不应把单次数据包装成固定加速比例。

- [WHATWG 文档就绪](https://html.spec.whatwg.org/multipage/parsing.html#the-end)
- [Page Lifecycle 指南](https://developer.chrome.com/docs/web-platform/page-lifecycle-api)
- [web.dev 布局抖动](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing)

---
