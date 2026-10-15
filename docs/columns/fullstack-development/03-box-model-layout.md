---
title: "第 3 章：盒模型与现代布局"
description: "系统掌握盒模型、Flexbox、Grid、定位和响应式布局。"
date: "2026-10-15"
category: CSS3
tags: [CSS3, Flexbox, Grid, Responsive Design]
series:
  order: 4
---
## 第 3 章 盒模型与布局

### 3.1 盒模型

```
┌─────────────────────────────────────┐
│            margin（外边距）           │
│  ┌───────────────────────────────┐  │
│  │        border（边框）          │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │    padding（内边距）      │  │  │
│  │  │  ┌───────────────────┐  │  │  │
│  │  │  │   content（内容）  │  │  │  │
│  │  │  └───────────────────┘  │  │  │
│  │  └─────────────────────────┘  │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

```css
/* 默认：content-box，width 只算内容区 */
.box {
  width: 200px;
  padding: 20px;
  border: 5px solid;
}
/* 实际占据宽度 = 200 + 20*2 + 5*2 = 250px */

/* 推荐：border-box，width 包含 padding 和 border */
.box {
  box-sizing: border-box;
  width: 200px;
  padding: 20px;
  border: 5px solid;
}
/* 实际占据宽度 = 200px，内容区 = 200 - 40 - 10 = 150px */
```

**全局重置**：

```css
*, *::before, *::after { box-sizing: border-box; }
```

#### 外边距折叠（Margin Collapsing）

**只有垂直方向的相邻外边距会折叠**，水平不会。取两者中较大的值。

三种折叠场景：

```css
/* 1. 相邻兄弟 */
.a { margin-bottom: 30px; }
.b { margin-top: 20px; }     /* 间距是 30px，不是 50px */

/* 2. 父子（父元素无 padding/border/内容分隔） */
.parent { }                  /* 子元素的 margin-top 会"穿透"到父元素外面 */
.child  { margin-top: 20px; }

/* 3. 空元素自身 */
.empty { margin-top: 20px; margin-bottom: 30px; }  /* 折叠成 30px */
```

**阻止折叠的方法**：

- 父元素加 `padding-top: 1px` 或 `border-top: 1px solid transparent`
- 父元素加 `overflow: hidden`（或其他非 visible 值）
- 父元素加 `display: flow-root` ← **最干净的方案**
- 用 Flex / Grid 容器（这两者的子项之间不折叠）

```css
.parent { display: flow-root; }   /* 建立 BFC，彻底隔离内外边距 */
```

#### BFC（块级格式化上下文）

BFC 是一个独立渲染区域，内部布局不影响外部。触发方式：

- `display: flow-root`（推荐）
- `overflow` 不为 `visible`
- `float` 不为 `none`
- `position: absolute` / `fixed`
- `display: inline-block` / `flex` / `grid` / `table-cell`

BFC 解决的经典问题：父元素高度塌陷（子元素浮动导致）、外边距穿透、浮动元素环绕文字。

#### 尺寸约束与溢出

响应式布局不要只设置固定 `width`。更稳妥的做法是同时表达理想尺寸和边界：

```css
.content {
  width: min(100% - 2rem, 72rem);
  margin-inline: auto;
}

.sidebar {
  width: clamp(16rem, 24vw, 22rem);
}

.thumbnail {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
}
```

- `min-width` / `max-width` 和 `min-height` / `max-height` 用于限制边界。
- `aspect-ratio` 先建立宽高比，图片加载前也能保留空间。
- `object-fit: cover` 保持图片比例并裁切；`contain` 保持完整图片但可能留白。
- `overflow: auto` 只在需要时显示滚动条；`hidden` 会裁切并建立滚动容器；只想裁切且不需要滚动容器时可用 `clip`。

Flex 和 Grid 子项默认有基于内容的最小尺寸。长链接或代码可能把容器撑开，此时应允许子项收缩，并处理长文本：

```css
.main {
  min-width: 0;
}

.main a,
.main code {
  overflow-wrap: anywhere;
}
```

不要把 `overflow-x: hidden` 当成通用修复。它会隐藏现象，还可能截断焦点轮廓、下拉菜单或粘性定位；应先在 DevTools 中找到真正超宽的元素。

### 3.2 Flexbox

一维布局（一行或一列）。**给容器设 `display: flex`，控制的是子项的排列。**

```html
<div class="flex">
  <div class="item">1</div>
  <div class="item">2</div>
  <div class="item">3</div>
</div>
```

#### 容器属性

```css
.flex {
  display: flex;               /* 或 inline-flex */

  /* 主轴方向 */
  flex-direction: row;         /* row | row-reverse | column | column-reverse */

  /* 换行 */
  flex-wrap: nowrap;           /* nowrap | wrap | wrap-reverse */

  /* 简写：direction + wrap */
  flex-flow: row wrap;

  /* 主轴对齐 */
  justify-content: flex-start;
  /* flex-start | flex-end | center | space-between | space-around | space-evenly */

  /* 交叉轴对齐（单行） */
  align-items: stretch;
  /* stretch | flex-start | flex-end | center | baseline */

  /* 交叉轴对齐（多行时控制行与行之间） */
  align-content: flex-start;
  /* stretch | flex-start | flex-end | center | space-between | space-around */

  gap: 16px;                   /* 行、列间距简写 */
  gap: 16px 24px;              /* 行间距 列间距 */
}
```

#### 子项属性

```css
.item {
  /* 放大比例，默认 0（不放大） */
  flex-grow: 1;

  /* 收缩比例，默认 1（空间不够时收缩） */
  flex-shrink: 1;

  /* 基准尺寸，默认 auto */
  flex-basis: 200px;

  /* 简写：grow shrink basis */
  flex: 1;            /* = 1 1 0%   ← 最常用，均分空间且忽略内容宽度 */
  flex: auto;         /* = 1 1 auto ← 均分空间，但考虑内容宽度 */
  flex: none;         /* = 0 0 auto ← 不放大不收缩，固定尺寸 */
  flex: 0 1 200px;

  /* 自身在交叉轴的对齐（覆盖容器的 align-items） */
  align-self: center;

  /* 排列顺序，默认 0，越小越靠前 */
  order: -1;
}
```

**`flex: 1` 与 `flex: auto` 的关键区别**：

`flex: 1` 的 `flex-basis` 是 `0%`，所有项从零开始分配空间，最终宽度**完全相等**。`flex: auto` 的 `flex-basis` 是 `auto`，先按内容宽度分配，再把剩余空间均分，内容多的更宽。

#### 经典布局

```css
/* 水平垂直居中 —— 一行搞定 */
.center {
  display: flex;
  justify-content: center;
  align-items: center;
}

/* 导航栏：logo 左，菜单右 */
.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

/* 圣杯布局：左右固定，中间自适应 */
.layout {
  display: flex;
  min-height: 100vh;
}
.layout > .left  { flex: 0 0 220px; }
.layout > .main  { flex: 1; min-width: 0; }   /* min-width:0 见下方说明 */
.layout > .right { flex: 0 0 200px; }

/* 卡片底部对齐按钮 */
.card {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.card .content { flex: 1; }   /* 撑开中间，把 footer 顶到底部 */
```

**`min-width: 0` 的坑**：Flex 子项默认 `min-width: auto`，即不小于内容的最小宽度。如果子项里有长文本或长代码不换行，它会把容器撑爆，`overflow: hidden` 和 `text-overflow: ellipsis` 都不生效。解决：

```css
.flex-child {
  min-width: 0;   /* 纵向排列时用 min-height: 0 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

### 3.3 Grid

二维布局（行和列同时控制）。**比 Flex 强大，但别什么都用 Grid——一维排列用 Flex 更简单。**

#### 基础

```css
.grid {
  display: grid;

  /* 定义列：3 列等宽 */
  grid-template-columns: 1fr 1fr 1fr;
  /* 简写 */
  grid-template-columns: repeat(3, 1fr);

  /* 定义行 */
  grid-template-rows: 80px 1fr 60px;

  /* 间距 */
  gap: 20px;
  gap: 20px 30px;      /* 行 列 */

  /* 网格对齐 */
  justify-items: stretch;   /* 单元格内子项的横向对齐 */
  align-items: stretch;     /* 纵向 */
  justify-content: start;   /* 整个网格在容器内的横向对齐 */
  align-content: start;     /* 纵向 */
}
```

#### 单位 `fr`

`fr` 表示剩余空间的份数。

```css
/* 侧栏固定 240px，主区域占满剩余 */
grid-template-columns: 240px 1fr;

/* 1:2:1 比例 */
grid-template-columns: 1fr 2fr 1fr;

/* 自动填满：每列最少 240px，能放几列放几列 */
grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));

/* auto-fit：与 auto-fill 类似，但会拉伸剩余列填满整行 */
grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
```

**`auto-fill` vs `auto-fit`**：容器很宽时，`auto-fill` 会保留空列（项目靠左，右侧留白），`auto-fit` 会折叠空列并拉伸已有列填满。做响应式卡片列表通常用 `auto-fill`。

#### 定位子项

```css
.item {
  /* 按网格线定位：从第 1 条线到第 3 条线 */
  grid-column: 1 / 3;      /* 简写 start / end */
  grid-row: 2 / 4;

  /* 跨 2 列 */
  grid-column: span 2;

  /* 按名字定位（需在容器用 grid-template-areas 命名） */
  grid-area: header;
}
```

#### 命名区域布局

```css
.page {
  display: grid;
  height: 100vh;
  grid-template-columns: 220px 1fr;
  grid-template-rows: 60px 1fr 50px;
  grid-template-areas:
    "header  header"
    "sidebar main"
    "footer  footer";
  gap: 12px;
}

.page > header  { grid-area: header; }
.page > nav     { grid-area: sidebar; }
.page > main    { grid-area: main; }
.page > footer  { grid-area: footer; }
```

`grid-template-areas` 的字符串图形直接映射到页面结构，可读性极高。`.` 表示空单元格。

```css
grid-template-areas:
  "header header"
  ".      main";     /* 左侧留空 */
```

#### 响应式 Grid

```css
/* 不写媒体查询就实现响应式 */
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
}
```

容器宽度变化时自动调整列数。这是做卡片列表最省事的方式。

### 3.4 定位 position

```css
.box {
  position: static;      /* 默认，文档流中，top/left 无效 */
  position: relative;    /* 相对自身原位置偏移，仍占原空间 */
  position: absolute;    /* 脱离文档流，相对最近的非 static 祖先定位 */
  position: fixed;       /* 脱离文档流，相对视口定位，滚动不动 */
  position: sticky;      /* 滚动到阈值前是 relative，之后变 fixed */

  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 10;
}
```

#### 逐个说明

**`relative`**：主要用于两件事——微调位置、给 `absolute` 子元素当定位参照。

```css
.card { position: relative; }
.card .badge {
  position: absolute;
  top: 8px;
  right: 8px;
}
```

**`absolute`**：找最近的 `position` 不为 `static` 的祖先。找不到就相对 `<html>` 定位。

```css
/* 绝对居中（尺寸已知） */
.center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

/* 铺满父容器 */
.overlay {
  position: absolute;
  inset: 0;              /* = top:0; right:0; bottom:0; left:0 */
}
```

**`fixed`**：相对视口，常用于顶部导航、悬浮按钮、模态遮罩。

**`sticky`**：`top` 等值必须设置，否则不生效。它在父容器范围内粘住，父容器滚出视口后它也跟着走。

```css
.toc {
  position: sticky;
  top: 24px;
  max-height: calc(100vh - 48px);
  overflow-y: auto;
}

/* 表头吸顶 */
thead th {
  position: sticky;
  top: 0;
  background: white;
  z-index: 1;
}
```

**sticky 失效的常见原因**：

1. 没设置 `top` / `bottom` / `left` / `right` 中的至少一个
2. 任一祖先元素有 `overflow: hidden` / `auto` / `scroll`（会裁剪 sticky 范围）
3. 父容器高度等于自身高度，没有滚动空间

#### z-index

只对 `position` 不为 `static` 的元素（以及 flex/grid 子项）生效。

**层叠上下文**：以下情况会创建新的层叠上下文，其内部 `z-index` 只在上下文内比较：

- `position` + `z-index` 不为 `auto`
- `opacity` 小于 1
- `transform`、`filter`、`perspective`、`backdrop-filter` 不为 `none`
- `will-change` 指定了上述属性
- `isolation: isolate`
- `position: fixed` / `sticky`（部分场景）

**典型陷阱**：

```html
<div class="a" style="position: relative; z-index: 1;">
  <div class="a-child" style="position: absolute; z-index: 9999;"></div>
</div>
<div class="b" style="position: relative; z-index: 2;"></div>
```

`.a-child` 的 `z-index: 9999` **永远赢不了 `.b`**，因为 `.a` 创建了层叠上下文，`.a-child` 被锁在 `.a` 这一层里。

解决：调整 `.a` 的 `z-index`，或者把 `.a-child` 移出 `.a`。

**`isolation: isolate`**：主动创建层叠上下文，把子元素隔离起来，避免影响外部。

### 3.5 响应式

#### 视口单位

```css
.vh  { height: 100vh;  }   /* 视口高度 1% */
.vw  { width: 100vw;   }   /* 视口宽度 1%（含滚动条宽度，会溢出） */
.dvh { height: 100dvh; }   /* 动态视口高度，移动端地址栏收起/展开时自动更新 */
.svh { height: 100svh; }   /* 最小视口高度（地址栏展开时） */
.lvh { height: 100lvh; }   /* 最大视口高度（地址栏收起时） */
```

移动端全屏布局用 `dvh` 而不是 `vh`——`100vh` 在 iOS Safari 上会被地址栏挡住底部。

**`100vw` 的坑**：垂直滚动条占据约 15px 宽度，`100vw` 包含它，所以横向会溢出。用 `width: 100%` 代替。

#### 相对单位

```css
/* em：相对当前元素的 font-size */
.parent { font-size: 16px; }
.child { font-size: 1.5em; }   /* 24px */
.child p { margin: 1em; }      /* 相对 .child 的 24px = 24px（不是父级的 16px） */

/* rem：相对根元素 html 的 font-size，默认 16px */
html { font-size: 16px; }      /* 不建议改成 62.5%，会影响用户浏览器设置 */
.title { font-size: 2rem; }    /* 32px */

/* ch：相对 "0" 字符宽度，适合限制正文行宽 */
.prose { max-width: 68ch; }    /* 约 68 个字符，阅读舒适 */

/* %：相对父元素的对应属性 */
```

**响应式字号：`clamp()`**

```css
h1 { font-size: clamp(1.75rem, 1rem + 3vw, 3rem); }
/*             最小值        理想值        最大值 */
```

浏览器宽度变化时字号在 28px ~ 48px 之间平滑缩放，不再需要为字号写媒体查询。

#### 媒体查询

```css
/* 移动优先：默认写小屏，用 min-width 逐层增强 */
.container { padding: 16px; }

@media (min-width: 640px)  { .container { padding: 24px; } }
@media (min-width: 1024px) { .container { padding: 32px; max-width: 1200px; margin: 0 auto; } }

/* 逻辑运算符 */
@media (min-width: 640px) and (max-width: 1023px) { }      /* 区间 */
@media (min-width: 1024px), (orientation: landscape) { }   /* 或 */
@media not all and (min-width: 640px) { }

/* 常用媒体特性 */
@media (orientation: portrait)  { }    /* 竖屏 */
@media (orientation: landscape) { }    /* 横屏 */
@media (prefers-color-scheme: dark) { }        /* 系统暗色 */
@media (prefers-reduced-motion: reduce) { }    /* 用户要求减少动画 */
@media (prefers-contrast: more) { }
@media (hover: hover) { }              /* 有精确悬停能力（鼠标） */
@media (pointer: coarse) { }           /* 触摸屏 */
@media print { }                       /* 打印 */
@media (min-resolution: 2dppx) { }     /* 高清屏 */

/* 范围语法（新，可读性更好） */
@media (640px <= width < 1024px) { }
```

**必须尊重 `prefers-reduced-motion`**：

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

前庭功能障碍用户看到大幅动画会眩晕。这是无障碍的硬性要求。

#### 容器查询

媒体查询看的是**视口**宽度，容器查询看的是**父容器**宽度。组件放在侧栏和主区域时，媒体查询无法区分，容器查询可以。

```css
/* 1. 声明容器 */
.card-wrapper {
  container-type: inline-size;    /* 只关心宽度 */
  container-name: card;           /* 可选，命名 */
  /* container: card / inline-size;  简写 */
}

/* 2. 根据容器宽度写样式 */
@container card (min-width: 400px) {
  .card { display: flex; gap: 16px; }
  .card img { width: 160px; }
}

@container card (min-width: 700px) {
  .card { display: grid; grid-template-columns: 240px 1fr; }
  .card .meta { display: block; }
}

/* 不命名也行，匹配最近的容器 */
@container (min-width: 400px) { }
```

`container-type` 取值：

- `inline-size`：只允许查询行内方向（通常是宽度）
- `size`：宽高都可查询，但要求容器尺寸不依赖内容
- `normal`：默认，不作为容器

**容器查询单位**：`cqw` `cqh` `cqi` `cqb` `cqmin` `cqmax`，相对容器尺寸。

```css
.card-title { font-size: clamp(1rem, 3cqi, 1.75rem); }
```

容器越宽标题越大，组件在任何位置都自适应。

#### 逻辑属性

`left`、`right`、`width` 是物理方向；逻辑属性会根据书写方向自动映射，更适合多语言页面：

```css
.card {
  inline-size: min(100%, 42rem); /* 横排文字中等价于 width */
  padding-block: 1rem;           /* 块方向：上、下 */
  padding-inline: 1.25rem;       /* 行内方向：左、右 */
  border-inline-start: 4px solid #2563eb;
  margin-inline: auto;
}

.badge {
  position: absolute;
  inset-block-start: 0.75rem;
  inset-inline-end: 0.75rem;
}
```

优先使用 `margin-inline`、`padding-block`、`inset-inline-end` 等写法，可以让从右到左语言和竖排书写模式少写一套覆盖样式。

#### 现代响应式写法示例

```css
/* 自适应网格 */
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
  gap: 24px;
}

/* 自适应字号 */
.title { font-size: clamp(1.5rem, 4vw, 3rem); }

/* 自适应间距 */
.section { padding: clamp(1rem, 5vw, 4rem); }
```

`minmax(min(280px, 100%), 1fr)` 保证容器比 280px 还窄时列宽等于容器宽，不会溢出。

---
