---
title: "第 4 章：文字、颜色与视觉样式"
description: "使用排版、颜色、背景、边框、阴影与滤镜构建清晰的视觉层级。"
date: '2026-10-23'
category: CSS
tags: [CSS3, 排版, 视觉设计]
series:
  order: 5
---
## 第 4 章 视觉样式

### 4.1 文字

```css
.text {
  /* 字体栈：从左到右找，最后一定是通用族 */
  font-family: system-ui, -apple-system, "Segoe UI", "PingFang SC",
               "Hiragino Sans GB", "Microsoft YaHei", sans-serif;

  font-size: 16px;
  font-weight: 400;              /* 100~900，或 normal(400) / bold(700) */
  font-style: italic;
  font-variant-numeric: tabular-nums;   /* 等宽数字，表格对齐必备 */

  /* 简写：style weight size/line-height family（size 和 family 必填） */
  font: italic 700 16px/1.6 system-ui, sans-serif;

  line-height: 1.6;              /* 无单位：相对自身 font-size */
  letter-spacing: 0.02em;
  word-spacing: 0.1em;

  text-align: left;              /* left | right | center | justify | start | end */
  text-indent: 2em;              /* 首行缩进 */
  text-transform: uppercase;     /* 视觉转换，HTML 内容不变 */
  text-decoration: underline wavy #e74c3c 2px;
  text-underline-offset: 4px;    /* 下划线与文字的距离 */

  text-shadow: 0 1px 2px rgba(0,0,0,.3);
  /* 多层阴影逗号分隔 */
  text-shadow: 0 1px 0 #fff, 0 -1px 0 #ccc;

  /* 单行省略 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  /* 多行省略 */
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;

  /* 长单词/URL 换行 */
  overflow-wrap: break-word;
  word-break: normal;            /* 不依赖已弃用的 break-word 值 */
  hyphens: auto;                 /* 连字符断词，需 lang 属性配合 */
}
```

**正文通常优先无单位 line-height**。`1.5` 随子元素字号计算；固定长度也合法，适合尺寸受控的单行控件，但必须检查字号放大后的裁切与重叠。

**`font-smoothing`（macOS 抗锯齿）**：

```css
body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

**加载自定义字体**：

```css
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter.woff2') format('woff2');
  font-weight: 100 900;          /* 可变字体范围 */
  font-display: swap;            /* 关键：先用系统字体渲染，字体加载完再替换 */
  unicode-range: U+0000-00FF;    /* 只在这些字符范围使用此字体 */
}

/* 中文子集化：按 unicode-range 切分，浏览器只下载用到的分片 */
@font-face {
  font-family: 'MyChinese';
  src: url('/fonts/cn-1.woff2') format('woff2');
  unicode-range: U+4E00-9FFF;
}
```

`font-display` 取值：

- `auto`：浏览器决定（通常相当于 block，有 3 秒白屏风险）
- `block`：短暂不可见期，然后无限等待
- `swap`：立即用后备字体，加载完替换（**推荐**，无白屏，但有闪烁）
- `fallback`：极短不可见期，然后后备字体，字体加载晚就放弃
- `optional`：浏览器自行决定，可能完全不使用自定义字体

### 4.2 颜色

```css
.color {
  /* 关键字 */
  color: red;
  color: transparent;
  color: currentColor;         /* 继承当前 color 值，做边框、图标常用 */

  /* HEX */
  color: #f60;
  color: #ff6600;
  color: #ff6600cc;            /* 后两位是 alpha：00~ff */

  /* rgb / rgba */
  color: rgb(255 102 0);
  color: rgb(255 102 0 / 0.8); /* 现代语法用空格和斜杠 */

  /* hsl：色相 0~360，饱和度 %，亮度 % */
  color: hsl(24 100% 50%);
  color: hsl(24 100% 50% / 0.8);

  /* 现代色彩空间 */
  color: oklch(0.7 0.15 50);   /* 感知较均匀，仍需检查色域映射与对比度 */
  color: color(display-p3 1 0.4 0);
}
```

**`hsl` / `oklch` 的实用价值**：可固定色相再调整明度，构造同色系层级。HSL 的通道是 `h`、`s`、`l`，OKLCH 是 `l`、`c`、`h`；明度相同不代表颜色的 WCAG 对比度相同。

**用 `color-mix()` 动态调色**：

```css
:root {
  --brand: #3b82f6;
  --brand-dark: color-mix(in oklch, var(--brand) 80%, black);
  --brand-light: color-mix(in oklch, var(--brand) 20%, white);
}
```

### 4.3 背景

```css
.bg {
  background-color: #f5f5f5;
  background-image: url('bg.png');

  /* 多个背景，第一个在最上层 */
  background-image: url('icon.svg'), linear-gradient(to bottom, #fff, #eee);

  background-repeat: no-repeat;         /* repeat-x | repeat-y | space | round */
  background-position: center center;   /* 关键字 或 百分比 或 长度 */
  background-size: cover;               /* cover 铺满裁切 | contain 完整放下 | 100% auto */
  background-attachment: fixed;         /* fixed 视差效果，移动端性能差 */
  background-clip: padding-box;         /* 背景绘制范围 */
  background-origin: border-box;        /* 背景定位起点 */
  background-blend-mode: multiply;      /* 背景层混合模式 */

  /* 简写（顺序随意，size 必须跟在 position 后并用 / 分隔） */
  background: #fff url('bg.png') no-repeat center/cover;
}
```

**常用渐变**：

```css
/* 线性 */
background: linear-gradient(to right, #f60, #f39c12);
background: linear-gradient(45deg, #f60, #f39c12, #e74c3c);   /* 多色 */
background: linear-gradient(to bottom, #fff 0%, #fff 50%, #eee 50%, #eee 100%); /* 硬边条纹 */

/* 径向 */
background: radial-gradient(circle at center, #fff, #000);
background: radial-gradient(ellipse at top left, rgba(255,255,255,.8), transparent 70%);

/* 锥形 */
background: conic-gradient(#f60 0deg 90deg, #3498db 90deg 180deg,
                           #2ecc71 180deg 270deg, #e74c3c 270deg 360deg);

/* 重复 */
background: repeating-linear-gradient(45deg, #eee 0 10px, #fff 10px 20px);
```

**棋盘格背景（无图片）**：

```css
.checkerboard {
  background-image:
    linear-gradient(45deg, #ccc 25%, transparent 25%),
    linear-gradient(-45deg, #ccc 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ccc 75%),
    linear-gradient(-45deg, transparent 75%, #ccc 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0;
}
```

### 4.4 边框

```css
.border {
  border: 2px solid #333;              /* width style color */
  border-width: 1px 2px 3px 4px;       /* 上 右 下 左 */
  border-radius: 8px;
  border-radius: 50%;                  /* 圆形 */
  border-radius: 8px / 16px;           /* 水平半径 / 垂直半径，做椭圆角 */
  border-radius: 20px 0 20px 0;        /* 对角圆角 */

  /* 单边 */
  border-top: 1px solid red;
  border-inline-start: 2px solid blue; /* 逻辑属性，自动适配 RTL */

  /* 样式值 */
  /* none | hidden | solid | dashed | dotted | double | groove | ridge | inset | outset */

  outline: 2px solid #3b82f6;
  outline-offset: 2px;                 /* 轮廓与边框的距离，不占空间 */
}
```

**焦点样式：永远不要 `outline: none` 而不给替代品**

```css
/* 正确做法 */
:focus-visible {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}
/* 先保证所有焦点可见，再在支持 focus-visible 时渐进收紧 */
button:focus { outline: 2px solid #3b82f6; }
@supports selector(:focus-visible) {
  button:focus:not(:focus-visible) { outline: none; }
}
```

**用 `box-shadow` 替代 `border` 不占空间**：

```css
.no-layout-shift {
  box-shadow: 0 0 0 2px #3b82f6;   /* 视觉上是边框，但不影响布局 */
}
```

### 4.5 阴影

```css
.shadow {
  /* box-shadow: offset-x offset-y blur spread color inset */
  box-shadow: 0 1px 3px rgba(0,0,0,.12);

  /* 多层阴影堆叠出真实感（现代 UI 的标准做法） */
  box-shadow:
    0 1px 2px rgba(0,0,0,.06),
    0 4px 8px rgba(0,0,0,.06),
    0 12px 24px rgba(0,0,0,.08);

  /* 内阴影 */
  box-shadow: inset 0 2px 4px rgba(0,0,0,.1);

  /* 单边阴影 */
  box-shadow: 0 4px 6px -2px rgba(0,0,0,.1);

  /* 文字阴影 */
  text-shadow: 0 1px 2px rgba(0,0,0,.3);
}
```

`blur` 越大阴影越柔；`spread` 正值扩大阴影，负值缩小。负 `spread` 配合大 `blur` 是做「只朝下」阴影的技巧。

**drop-shadow 滤镜**：对元素的实际轮廓（包括透明 PNG、SVG 的不规则形状）投影，而 `box-shadow` 只认矩形盒子。

```css
.logo { filter: drop-shadow(0 4px 6px rgba(0,0,0,.2)); }
```

### 4.6 滤镜

```css
.filter {
  filter: blur(4px);
  filter: brightness(1.2);          /* 1 为原始 */
  filter: contrast(1.5);
  filter: saturate(2);
  filter: grayscale(1);             /* 1 = 完全灰度 */
  filter: sepia(0.8);
  filter: hue-rotate(90deg);
  filter: invert(1);
  filter: opacity(0.5);

  /* 多滤镜叠加，从左到右依次应用 */
  filter: grayscale(1) contrast(1.2) brightness(0.9);

  /* 背景模糊（毛玻璃） */
  backdrop-filter: blur(12px) saturate(1.5);
}
```

**毛玻璃效果完整写法**：

```css
.glass {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(12px) saturate(1.8);
  -webkit-backdrop-filter: blur(12px) saturate(1.8);   /* Safari 前缀 */
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 16px;
}
```

注意：`filter` 和 `backdrop-filter` 都会创建层叠上下文，内部 `z-index` 会被隔离。

**图片处理常用组合**：

```css
/* 暗色模式下降低图片亮度 */
@media (prefers-color-scheme: dark) {
  img { filter: brightness(.85) contrast(1.1); }
}

/* 头像灰度，悬停恢复 */
.avatar { filter: grayscale(1); transition: filter .3s; }
.avatar:hover { filter: grayscale(0); }
```

### 视觉效果的边界与官方参考

OKLCH 的感知均匀性不等于“绝不偏色”或“自动满足对比度”，超出设备色域的颜色会映射。应在实际背景上计算对比度，并检查 forced-colors 与 200% 缩放。字体 smoothing 属性是平台相关非标准能力，不应作为正文可读性必需条件；`font-display: swap` 仍可能产生字体替换布局偏移。

### 4.7 从属性表建立视觉层级

先为正文、标题、辅助文字、链接和危险动作定义语义角色，再分配字号、字重和颜色。一个页面不需要每段都使用阴影或渐变；同一角色保持一致，读者才能从视觉判断哪里能操作、哪里只是说明。品牌色不适合包办成功、错误和选中状态。状态同时提供文字或图标，避免只能依靠红绿区分。

字体栈中的字体通常有不同的字宽和行高。字体替换后标题可能换行，按钮可能变高，原本对齐的数字也可能变化；使用 `tabular-nums` 还要求字体具备对应特性。先让系统字体下的页面完整可用，再测试自定义字体慢加载、失败和缺字回退。`unicode-range` 是选择字体资源的条件，真正的中文子集仍需在字体构建阶段生成，不能靠声明减少已有文件体积。

`cover` 与 `contain` 回答不同问题：前者填满区域并可能裁切，后者保留完整图像但可能留白。头像可以裁切，技术图解若裁掉标签就会丢失信息。内容图用 img 的替代文本和明确尺寸，纯装饰图可使用背景；不要把必须理解的文字只放进背景图。滤镜改变像素表现，不能证明图片仍符合原始颜色语义。

### 4.8 验证主题、缩放和高对比模式

按 WCAG 2.2 检查普通正文至少 4.5:1、大文字至少 3:1 的对比度，并另查必要控件边界与焦点。必须在实际混合后的背景上测量，不能只比较半透明前景的原始色值。阴影不是唯一边界，高对比模式可能不显示背景和阴影，应保留系统可识别的轮廓或边框。

练习制作一张包含长标题、链接、错误说明和两种按钮的文章卡片。分别测试深浅主题、200% 字体或页面缩放、字体加载失败及 forced-colors。允许卡片自然增高，不用固定高度裁掉错误信息。验收应记录可读性、焦点可见性、换行和图片信息是否保留；检查工具通过一项对比度不能证明整页可访问。

- [CSS Color Level 4](https://drafts.csswg.org/css-color-4/)
- [CSS Fonts](https://drafts.csswg.org/css-fonts-4/)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

---
