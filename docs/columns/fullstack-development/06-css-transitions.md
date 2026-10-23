---
title: "第 6 章：CSS 过渡"
description: "掌握过渡属性、缓动函数及兼顾性能和可访问性的交互动效。"
date: '2026-10-23'
category: CSS
tags: [CSS3, 过渡, 动效]
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

属性的动画类型决定是否连续插值、离散切换或不可动画。连续过渡要求值可按该属性规则插值；离散属性在支持 `allow-discrete` 时也可以参加过渡，但不会产生连续的中间布局。

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
.accordion-content {
  height: 0;
  overflow: hidden;
  transition: height .3s ease;
}
.accordion.open .accordion-content {
  height: auto;    /* 基础行为：立即展开 */
}

@supports (interpolate-size: allow-keywords) {
  .accordion { interpolate-size: allow-keywords; }
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

/* 位移不改变布局；是否只更新合成阶段需实测 */
.menu {
  transform: translateX(-100%);
  transition: transform .3s var(--ease-out-quart);
}
.menu.open { transform: translateX(0); }
```

`transform` 和 `opacity` 通常可以避免每帧触发布局，并有机会只在合成阶段更新。**位移、缩放和淡入淡出优先考虑这两个属性。** 是否单独建立合成层由浏览器决定，不能把“使用了 transform”直接等同于“必然由 GPU 零成本完成”。

其他属性（`width`、`height`、`top`、`margin`）每帧都要重新计算布局并重绘，在低端设备上会掉帧。

### 验证与官方参考

`interpolate-size` 不意味着两个任意 intrinsic 关键字之间都可插值；`calc-size()` 也不能视为所有目标浏览器已支持。折叠面板应先验证关闭时内容是否仍可被 Tab 聚焦，必要时同步 `inert` 或 `hidden`，并让触发按钮维护 `aria-expanded`。

### 6.5 过渡的起点来自已提交样式

过渡需要浏览器看到两个不同的计算样式。创建元素后在同一个任务中立刻改为最终状态，浏览器可能只计算最终值，因此没有可观察的起点。`@starting-style` 用于首次渲染等没有上一帧样式的情况；普通悬停则已有前一状态。不要为了“让动画生效”在每次点击时强制读布局，先判断是否需要起始样式或明确的渲染阶段。

将过渡声明放在基础选择器上，进入和退出通常都会遵循同一套规则；只放在 `.open` 上，关闭时声明也可能消失，结果便是立即跳回。持续改变宽度不是离散切换，浏览器需要计算中间布局。`allow-discrete` 允许某些离散属性参加过渡，但不能把 `display` 变成连续尺寸，也不能使关闭面板中的链接自动失去焦点。

时长和缓动是设计选择，不能写成所有用户的统一阈值。微交互应及时反馈，长距离运动可稍长；已经等待网络的用户不必再等待动画。回弹曲线可能产生超出终点的视觉位置，检查它是否覆盖相邻操作区。颜色渐变和位置过渡也不一定适合相同缓动。

### 6.6 快速切换时验证最终状态

用户可能在过渡结束前再次点击。应用状态应立即更新到最新选择，浏览器再从当前插值位置转向新目标；不能用一个“正在动画”标记无期限丢弃后续操作。确需禁止重复请求时，依据请求状态与幂等规则处理，不能依据 CSS 时长决定。

`transitionend` 会按属性分别触发，并可能从子元素冒泡。监听时核对 `target` 和 `propertyName`；取消、元素移除、零时长和减少动画时未必有结束事件。必须由应用生命周期完成清理，过渡事件只补充视觉阶段的信息，不作为保存数据或释放关键锁的唯一入口。

练习实现展开按钮，分别执行慢速切换、连续五次切换、关闭时焦点留在内容内、禁用增强和减少动画。记录最终 `aria-expanded`、内容可见性及 Tab 顺序；关闭前把内部焦点移回按钮。完成标准是最后一次选择决定结果，异常路径不遗留焦点和事件监听，过渡失效时业务仍能立即使用。

练习：测试不支持增强的浏览器、减少动画模式和快速连续切换。完成标准是内容始终可达、隐藏内容不可误聚焦、没有等待动画结束才完成关键业务的依赖。

- [CSS Transitions Level 2](https://drafts.csswg.org/css-transitions-2/)
- [CSS Values intrinsic size 插值](https://drafts.csswg.org/css-values-5/#interpolate-size)

---
