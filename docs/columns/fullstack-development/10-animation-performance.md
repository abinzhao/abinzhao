---
title: "第 10 章：动画性能"
description: "从 Layout、Paint、Composite 出发诊断卡顿并控制合成层成本。"
date: "2026-10-15"
category: 网页性能
tags: [性能, 渲染, 开发者工具]
series:
  order: 11
---
## 第 10 章 动画性能

### 10.1 渲染流程与动画的关系

```
JS → Style（计算样式）→ Layout（布局）→ Paint（绘制）→ Composite（合成）
```

每一帧（约 16.7ms @ 60fps）都要走完这条链路。哪个阶段被触发，决定了动画的流畅度：

| 改动属性 | 触发阶段 | 代价 |
|---|---|---|
| `width` `height` `top` `left` `margin` `padding` `font-size` | Layout + Paint + Composite | **最贵** |
| `color` `background-color` `box-shadow` `border-radius` | Paint + Composite | 中等 |
| `transform` `opacity` `filter` | Composite | **最便宜** |

**结论：性能敏感的场景只动 `transform` 和 `opacity`。**

### 10.2 合成层（Compositing Layer）

浏览器可以把某些元素提升到独立的合成层，由 GPU 单独处理。这类元素的动画即使主线程繁忙也能保持流畅。

**提升为合成层的方式**：

```css
.layer {
  will-change: transform;          /* 明确告诉浏览器提前提升 */
  /* 或 */
  transform: translateZ(0);        /* 经典 hack */
  /* 或 */
  backface-visibility: hidden;
  /* 或 */
  contain: paint;
}
```

### 10.3 will-change 的正确用法

```css
/* 正确：在即将动画时添加 */
.button { transition: transform .2s; }
.button:hover { will-change: transform; }   /* 悬停时提前提升，动画结束自动释放 */

/* 更正确：用 JS 在交互前添加，结束后移除 */
```

```js
element.addEventListener('mouseenter', () => {
  element.style.willChange = 'transform';
});
element.addEventListener('transitionend', () => {
  element.style.willChange = 'auto';
});
```

**`will-change` 的滥用代价**：

- 每个合成层都要占用显存。给页面上几十个元素都加 `will-change`，显存爆掉反而更卡。
- 长期存在的合成层会让浏览器无法优化该区域，文本渲染可能变模糊。
- **绝不要**在全局选择器或大量元素上写 `will-change`。

**规则**：只在真正需要时加，用完就删。如果没有明显卡顿，就不加。

### 10.4 动画性能检查清单

```css
/* ✅ 1. 只动 transform / opacity */
.toast { transform: translateX(100%); transition: transform .3s; }
.toast.show { transform: translateX(0); }

/* ✅ 2. 用 transform 替代 top/left/width/height */
.box { transform: translate(10px, 10px); }

/* ✅ 3. 避免动画 box-shadow，用伪元素预渲染 + 透明度切换 */
.card { position: relative; }
.card::after {
  content: '';
  position: absolute; inset: 0;
  border-radius: inherit;
  box-shadow: 0 8px 24px rgba(0,0,0,.15);
  opacity: 0;
  transition: opacity .3s;
  pointer-events: none;
}
.card:hover::after { opacity: 1; }

/* ✅ 4. 大面积模糊/滤镜会拖慢合成，谨慎使用 */
.blur-bg { backdrop-filter: blur(20px); }   /* 移动端很贵 */

/* ✅ 5. 用 contain 限制重排范围 */
.card { contain: layout paint; }

/* ✅ 6. 大量列表项动画时限制并发数，或用 CSS 交错延迟 */
```

**用 `content-visibility` 跳过屏幕外元素的渲染**：

```css
.below-fold {
  content-visibility: auto;
  contain-intrinsic-size: 0 500px;   /* 占位尺寸，防止滚动条跳动 */
}
```

长页面必备，能让初始渲染时间大幅下降。

### 10.5 实测动画性能

Chrome DevTools → Performance 面板：

1. 点击录制，操作页面，停止录制
2. 看 **Frames** 轨道：绿色竖条是流畅帧，红色是掉帧
3. 看 **Main** 轨道：长条的黄色块是 JS 执行，紫色是 Layout，绿色是 Paint
4. 如果 Layout 或 Paint 占了大头，说明动画属性选错了

**Rendering 面板（DevTools → 更多工具 → 渲染）**：

- 勾选 **Paint flashing**：重绘区域会闪绿，能直观看到动画是否触发了重绘
- 勾选 **Layer borders**：合成层显示为橙色边框，可以看到哪些元素被提升
- 勾选 **Frame Rendering Stats**：实时显示 FPS

**理想的动画**：Paint flashing 完全看不到绿色（没有重绘），Layer borders 只看到目标元素有橙框。

---
