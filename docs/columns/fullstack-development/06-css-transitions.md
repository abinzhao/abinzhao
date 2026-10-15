---
title: "第 6 章：Transition 过渡"
description: "掌握过渡属性、缓动函数及兼顾性能和可访问性的交互动效。"
date: "2026-10-15"
category: CSS 动画
tags: [CSS3, Transition, Motion]
series:
  order: 7
---
## 第 6 章 transition 过渡

### 6.1 语法

```css
.box {
  /* transition: property duration timing-function delay */
  transition: opacity 0.3s ease 0s;

  /* 多属性逗号分隔 */
  transition:
    opacity 0.3s ease,
    transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);

  /* all 会监听所有属性，性能差且有意外过渡，尽量明确写 */
  transition: all 0.3s;
}
```

### 6.2 可过渡属性

**只有「可插值」的属性才能过渡**。核心要求是：起始值和结束值必须是同一种数据类型，且中间状态有意义。

**可以过渡的**：

| 类型 | 属性举例 |
|---|---|
| 长度/尺寸 | `width` `height` `margin` `padding` `top` `font-size` `border-width` `line-height` `gap` |
| 颜色 | `color` `background-color` `border-color` `outline-color` `fill` `stroke` |
| 不透明度 | `opacity` |
| 变换 | `transform`（整体插值） |
| 阴影 | `box-shadow` `text-shadow` `filter: drop-shadow()` |
| 滤镜 | `filter` `backdrop-filter` |
| 圆角 | `border-radius` |
| 位置 | `background-position` `object-position` |
| 数值 | `z-index` `font-weight`（可变字体时）`flex-grow` `order` |
| 可见性 | `visibility`（离散但可过渡） |
| 裁剪 | `clip-path`（形状相同才能插值） |

**不能过渡的**：

- `display`（除配合 `transition-behavior: allow-discrete`）
- `position`
- `float`
- `content`
- `font-family`
- `background-image`（渐变之间不能插值，只能用 `@property` 自定义属性变通）
- `height: auto`（现代浏览器已支持 `calc-size()` 和 `interpolate-size`，见下）

**让 `height: auto` 可以过渡（新特性）**：

```css
:root { interpolate-size: allow-keywords; }

.accordion-content {
  height: 0;
  overflow: hidden;
  transition: height .3s ease;
}
.accordion.open .accordion-content {
  height: auto;    /* 现在可以过渡了 */
}
```

**让 `display` 可以过渡**：

```css
.dialog {
  opacity: 0;
  transform: scale(.95);
  transition: opacity .2s, transform .2s, display .2s;
  transition-behavior: allow-discrete;   /* 关键 */
  display: none;
}
.dialog.open {
  opacity: 1;
  transform: scale(1);
  display: block;
}

@starting-style {
  .dialog.open { opacity: 0; transform: scale(.95); }
}
```

`@starting-style` 定义元素首次出现时的起始值，否则从 `display: none` 到 `block` 不会有过渡。

### 6.3 缓动函数

```css
.ease {
  transition-timing-function: linear;
  transition-timing-function: ease;          /* 默认：慢-快-慢 */
  transition-timing-function: ease-in;       /* 慢起 */
  transition-timing-function: ease-out;      /* 慢收 */
  transition-timing-function: ease-in-out;   /* 两端慢 */

  /* 三次贝塞尔：cubic-bezier(x1, y1, x2, y2)，x 必须在 0~1 */
  transition-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);  /* 回弹 */

  /* 阶跃 */
  transition-timing-function: steps(4, end);   /* 分 4 步，每步结束跳变 */
  transition-timing-function: steps(4, start);

  /* 线性缓动函数（新）：用点描述任意曲线 */
  transition-timing-function: linear(0, 0.25 25%, 0.5 50%, 1);
}
```

**常用缓动速查**：

```css
:root {
  --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);       /* 通用顺滑减速 */
  --ease-out-expo:  cubic-bezier(0.16, 1, 0.3, 1);       /* 强减速，适合入场 */
  --ease-in-out-quart: cubic-bezier(0.76, 0, 0.24, 1);   /* 强两端缓，适合位移切换 */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);      /* 回弹过冲 */
  --ease-back: cubic-bezier(0.68, -0.55, 0.27, 1.55);    /* 先退后进 */
}
```

**`ease` 是最平淡的选择**。UI 动效的经验法则：

- **入场**（元素出现）：`ease-out`，因为用户注意力在结果上，快速到达更舒服
- **退场**（元素消失）：`ease-in`，慢起快收
- **位置移动**：`ease-in-out`
- **颜色/透明度变化**：`linear` 或 `ease`

**时长的经验值**：

- 微交互（按钮悬停、图标切换）：100–200ms
- 中等元素（卡片展开、下拉菜单）：200–300ms
- 大面积/整页过渡：300–500ms
- 超过 500ms 会明显感觉「慢」

### 6.4 性能与最佳实践

```css
/* 差的写法：触发 Layout，每帧重新计算几何 */
.menu { transition: width .3s, left .3s; }

/* 好的写法：只触发 Composite */
.menu {
  transform: translateX(-100%);
  transition: transform .3s var(--ease-out-quart);
}
.menu.open { transform: translateX(0); }
```

`transform` 和 `opacity` 通常可以避免每帧触发布局，并有机会只在合成阶段更新。**位移、缩放和淡入淡出优先考虑这两个属性。** 是否单独建立合成层由浏览器决定，不能把“使用了 transform”直接等同于“必然由 GPU 零成本完成”。

其他属性（`width`、`height`、`top`、`margin`）每帧都要重新计算布局并重绘，在低端设备上会掉帧。

---
