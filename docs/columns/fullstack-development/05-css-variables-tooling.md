---
title: "第 5 章：CSS 变量与工程化"
description: "用自定义属性、原生嵌套和预处理工具组织可维护的样式代码。"
date: '2026-10-23'
category: CSS
tags: [CSS3, 自定义属性, PostCSS]
series:
  order: 6
---
## 第 5 章 CSS 变量与工程化

### 5.1 CSS 自定义属性（CSS 变量）

```css
:root {
  --color-primary: #3b82f6;
  --color-text: #1f2937;
  --spacing-md: 16px;
  --radius: 8px;
  --shadow-card: 0 1px 3px rgba(0,0,0,.1), 0 4px 12px rgba(0,0,0,.06);
  --font-mono: ui-monospace, "SF Mono", Consolas, monospace;
}

.button {
  background: var(--color-primary);
  padding: var(--spacing-md);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
}
```

#### 与 Sass 变量的本质区别

| | CSS 变量 | Sass 变量 |
|---|---|---|
| 运行时 | 是，可被 JS 读写、可动态改变 | 否，编译时已被替换成字面值 |
| 继承 | 是，沿 DOM 树继承 | 否，只有作用域概念 |
| 媒体查询内重定义 | 可以，仍受选择器作用域与层叠约束 | 编译时变量，不随浏览器媒体条件动态改变 |
| 参与计算 | 可以（`calc` 等） | 编译时计算 |

```css
/* CSS 变量可以做到的：一个媒体查询切换整站主题 */
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #0f172a;
    --color-text: #e2e8f0;
  }
}
```

```js
// JS 动态改
document.documentElement.style.setProperty('--color-primary', '#e74c3c');

// 读
getComputedStyle(document.documentElement).getPropertyValue('--color-primary');
```

#### 回退值

```css
.box {
  color: var(--color-text, #333);        /* 变量不存在时用 #333 */
  padding: var(--spacing, 1rem 2rem);    /* 回退值可以是多值 */
}
```

#### 变量的坑

**变量在无效值时不报错，只是不生效**：

```css
:root { --size: 20px; }
.box {
  font-size: var(--size);      /* 有效 */
  /* --size 被改成 20（无单位）时，font-size 声明被丢弃，元素回到继承值 */
}
```

所以 `calc()` 里用变量要保证单位正确：

```css
:root { --gap-num: 16; }
.box { gap: calc(var(--gap-num) * 1px); }
```

**注册 `@property` 可约束自定义属性并按类型插值**；未注册属性仍能做离散动画，但不能按 angle 等语义连续插值：

```css
@property --angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

.spinner {
  background: conic-gradient(from var(--angle), #f60, #3498db);
  animation: spin 2s linear infinite;
}
@keyframes spin { to { --angle: 360deg; } }
```

不注册时 `--angle` 是未解释的 token 序列，不会自动获得角度插值。注册失败或不支持时应保留静态背景。

### 5.2 原生嵌套

```css
/* 基础 */
.card {
  padding: 20px;

  .title { font-size: 1.25rem; }
  .body  { color: #666; }

  /* & 代表父选择器 */
  &:hover { box-shadow: 0 4px 12px rgba(0,0,0,.1); }
  &.is-active { border-color: #3b82f6; }

  /* 后代类：编译成 .card .card__title */
  .card__title { font-weight: 600; }

  /* 伪元素 */
  &::before { content: ''; }

  /* 媒体查询也能嵌套 */
  @media (min-width: 768px) {
    padding: 32px;
    .title { font-size: 1.5rem; }
  }

  /* 嵌套 @layer、@container */
  @container (min-width: 400px) { display: flex; }
}
```

**关键规则**：`&` 表示外层选择器本身，适合伪类、状态类和兄弟关系。省略 `&` 时，嵌套选择器默认匹配后代。

```css
/* 匹配 .card 的后代 p */
.card {
  p { color: red; }
}

/* 原生嵌套不能像 Sass 一样拼接选择器字符串 */
.card {
  &__title { color: red; } /* 无效，不会得到 .card__title */
}

/* BEM 类名应直接写完整；状态和关系用 & */
.card__title { font-weight: 600; }

.card {
  & + & { margin-top: 16px; }   /* .card + .card */
  &:not(:last-child) { }
}
```

**嵌套深度控制在 3 层以内**。原生嵌套不会像 Sass 那样输出展开后的选择器，但过深仍会导致优先级失控、覆盖困难。

### 5.3 PostCSS 与 Sass 的选择

| | PostCSS | Sass |
|---|---|---|
| 本质 | CSS 转换器平台，本身不定义语法 | CSS 预处理器，定义了完整语言 |
| 语法 | 标准 CSS + 插件扩展 | `.scss`，标准 CSS 的超集 |
| 变量 | 用原生 CSS 变量 | `$var`（编译时替换） |
| 嵌套 | 原生已支持 | `&` 嵌套 |
| 混入 | 无原生，需插件 | `@mixin` / `@include` |
| 函数 | 无原生 | `@function` |
| 循环 | 无 | `@for` / `@each` / `@while` |
| 生态 | 插件化，Autoprefixer、postcss-preset-env 等 | Dart Sass，功能一体 |
| 现代趋势 | 配合原生 CSS 新特性，只做兜底转换 | 处理复杂逻辑、主题系统 |

**推荐组合**：**原生 CSS + 原生嵌套 + CSS 变量 + PostCSS（只做 Autoprefixer 和压缩）**。Sass 只在需要复杂函数/循环（如生成整套间距工具类）时才值得引入。

**PostCSS 最小配置**：

```js
// postcss.config.js
const production = process.env.NODE_ENV === 'production';

export default {
  plugins: {
    'postcss-preset-env': {
      stage: 3,
      features: { 'nesting-rules': true }
    },
    autoprefixer: {},
    ...(production ? { cssnano: { preset: 'default' } } : {})
  }
};
```

```json
// package.json 关键字段
{
  "browserslist": [
    "> 0.5%",
    "last 2 versions",
    "not dead"
  ]
}
```

`browserslist` 决定 Autoprefixer 加哪些前缀、`postcss-preset-env` 转换哪些新语法。

**Sass 实用片段**：

```scss
// 变量与嵌套
@use 'sass:map';

$breakpoints: (sm: 640px, md: 768px, lg: 1024px);

@mixin respond($name) {
  @media (min-width: map.get($breakpoints, $name)) {
    @content;
  }
}

.card {
  padding: 16px;

  @include respond(md) {
    padding: 32px;
  }
}

// 循环生成工具类
$spacers: (0, 4, 8, 12, 16, 24, 32);

@each $s in $spacers {
  .mt-#{$s} { margin-top: #{$s}px; }
  .mb-#{$s} { margin-bottom: #{$s}px; }
}
```

### 5.4 渐进增强与样式作用域

使用较新的 CSS 能力时，先写可用的基础样式，再用 `@supports` 增强。这样旧环境只是少一些效果，不会失去主要内容和操作能力：

```css
.gallery {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

@supports (grid-template-columns: subgrid) {
  .gallery {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .gallery-card {
    display: grid;
    grid-template-rows: subgrid;
  }
}
```

`@scope` 可以限制一组规则的作用范围，减少组件样式误伤页面其他区域：

```css
@scope (.profile-card) to (.profile-card__external-widget) {
  :scope {
    border: 1px solid #d1d5db;
  }

  h2 {
    font-size: 1.25rem;
  }
}
```

这里的 `h2` 只匹配 `.profile-card` 内部，并在到达 `.profile-card__external-widget` 时停止。实际项目应先根据目标浏览器范围确认支持情况；核心布局仍需准备不依赖新特性的基础版本。

### 工具选择与官方参考

上面的 PostCSS 配置需要项目已有相应插件，不能只复制配置就获得转换器。Vite 的 CSS 管线可能已提供压缩，不应叠加重复工作。Sass 的旧 `@import` 和全局内建函数已弃用，新增代码使用 `@use`、`@forward` 和 `sass:map` 等模块 API；这不影响原生 CSS 的 `@import`。

- [CSS 自定义属性规范](https://drafts.csswg.org/css-variables/)
- [CSS Properties and Values API](https://drafts.css-houdini.org/css-properties-values-api/)
- [Sass 弃用说明](https://sass-lang.com/documentation/breaking-changes/import/)
- [Vite CSS 功能](https://vite.dev/guide/features.html#css)

---
