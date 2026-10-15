---
title: "第 2 章：CSS 选择器、层叠与优先级"
description: "理解样式如何匹配、竞争并形成最终计算值，建立可预测的层叠规则。"
date: "2026-10-15"
category: CSS3
tags: [CSS3, Cascade, Selectors]
series:
  order: 3
---
## 第 2 章 选择器、层叠与优先级

### 2.1 选择器全表

```css
/* ---------- 基础 ---------- */
* { }                    /* 通配，常用于全局 box-sizing 等少量基础规则 */
p { }                    /* 标签 */
.card { }                /* 类 */
#header { }              /* ID，优先级高，尽量少用 */
[disabled] { }           /* 属性存在 */
[type="text"] { }        /* 属性等值 */
[class~="tag"] { }       /* 属性值含单词（空格分隔） */
[lang|="zh"] { }         /* 属性值等于 zh 或以 zh- 开头 */
[href^="https"] { }      /* 前缀 */
[href$=".pdf"] { }       /* 后缀 */
[href*="example"] { }    /* 包含 */
[href^="https" i] { }    /* i 标志：忽略大小写 */

/* ---------- 组合 ---------- */
div p { }                /* 后代：div 内任意层级的 p */
div > p { }              /* 子代：直接子元素 */
h1 + p { }               /* 相邻兄弟：紧跟在 h1 后的第一个 p */
h1 ~ p { }               /* 通用兄弟：h1 之后所有同级 p */

/* ---------- 伪类：结构 ---------- */
:first-child             /* 是父元素第一个子元素 */
:last-child
:only-child
:nth-child(2n+1)         /* 第 1,3,5... 个（公式 An+B） */
:nth-child(odd)          /* 等价于 2n+1 */
:nth-child(-n+3)         /* 前 3 个 */
:nth-of-type(2)          /* 同类型元素中的第 2 个 */
:first-of-type
:last-of-type
:only-of-type
:empty                   /* 无子元素且无文本（含空白符就不算 empty） */
:root                    /* 文档根元素，即 html */

/* ---------- 伪类：状态 ---------- */
:hover
:active                  /* 激活中（鼠标按下） */
:focus
:focus-visible           /* 仅键盘聚焦时（推荐用这个做焦点样式） */
:focus-within             /* 自身或后代获得焦点 */
:visited                 /* 只能改颜色相关属性，隐私限制 */
:link
:checked
:disabled
:enabled
:required
:optional
:valid
:invalid
:user-invalid            /* 用户交互后才判定无效，体验更好 */
:placeholder-shown       /* 占位符显示中（即输入框为空） */
:read-only
:read-write
:target                  /* URL hash 指向的元素 */
:is()
:where()
:not()
:has()

/* ---------- 伪元素 ---------- */
::before
::after
::first-line             /* 只能改字体、颜色、背景相关 */
::first-letter
::selection              /* 选中文本的样式 */
::placeholder
::marker                 /* 列表项标记 */
::file-selector-button
::backdrop               /* dialog / 全屏元素的背景遮罩 */
```

#### 现代选择器的威力

```css
/* :is() —— 匹配任意一个，取参数中优先级最高的那个 */
:is(h1, h2, h3) + p { margin-top: 0; }

/* :where() —— 同 :is()，但优先级恒为 0 */
:where(header, footer) a { color: inherit; }

/* :not() —— 支持逗号列表 */
input:not([type="checkbox"], [type="radio"]) { width: 100%; }

/* :has() —— 父选择器，终于等到了 */
.card:has(img) { padding: 0; }                /* 含图片的卡片 */
.form:has(input:invalid) .submit { opacity: .5; }  /* 有无效输入时禁用提交按钮外观 */
h2:has(+ p) { margin-bottom: .5em; }          /* 后面紧跟段落的 h2 */
```

`input:not(...)` 的写法比 `input:not([type="checkbox"]):not([type="radio"])` 简洁得多。

### 2.2 层叠（Cascade）

当多个规则作用于同一元素时，按以下顺序决定胜负（前者优先）：

1. **来源与重要性**
   - 正在生效的过渡（transition）
   - 用户代理 `!important`（浏览器默认，几乎用不到）
   - 用户 `!important`
   - 作者 `!important`
   - 动画（`@keyframes` 中的声明）
   - 作者普通声明 ← 你写的代码
   - 用户普通声明
   - 用户代理普通声明
2. **@layer 层级**（见 2.4）
3. **优先级（Specificity）**
4. **出现顺序**（后出现的赢）

### 2.3 优先级计算

优先级是三元组 `(A, B, C)`：

- **A**：ID 选择器数量
- **B**：类、属性选择器、伪类数量
- **C**：元素、伪元素数量

比较时从 A 开始逐位比较，A 大的赢，A 相同比 B，B 相同比 C。**不进位**：100 个类（`(0,100,0)`）也赢不了 1 个 ID（`(1,0,0)`）。

```css
p                      /* (0,0,1) */
.card                  /* (0,1,0) */
.card p                /* (0,1,1) */
#main                  /* (1,0,0) */
#main .card p          /* (1,1,1) */
:is(#a, .b) .c         /* (1,1,0) —— 取最高，所以是 #a 的 1,0,0 加 .c */
:where(#a, .b) .c      /* (0,1,0) —— :where 恒为 0 */
a:hover                /* (0,1,1) */
input[type="text"]     /* (0,1,1) */
::before               /* (0,0,1) */
```

**两个例外，不参与优先级比较**：

- `!important`：直接把声明提到最高作者级别
- 内联 `style=""`：优先级高于所有选择器（`!important` 除外）

**怎么算都赢不了的场景就重构，不要堆 `!important`**：

```css
/* 糟糕 */
#sidebar .nav ul li a { color: red !important; }

/* 更好：降级为单类，用 :where 清零基础样式优先级 */
.nav-link { color: red; }
```

`:where()` 是解决「重置样式优先级太高」的标准工具：

```css
/* 基础样式优先级为 0，任何类都能覆盖 */
:where(ul, ol) { margin: 0; padding: 0; list-style: none; }
```

### 2.4 @layer 显式分层

`@layer` 让你直接控制整个层的胜负，不用和优先级数字搏斗。

```css
/* 先声明顺序：越靠后优先级越高 */
@layer reset, base, components, utilities;

@layer reset {
  * { margin: 0; box-sizing: border-box; }
}

@layer base {
  a { color: #2563eb; }
}

@layer components {
  .btn { color: white; background: #2563eb; }
}

@layer utilities {
  .text-red { color: red; }
}
```

规则：

- **层内规则之间仍按正常优先级比较。**
- **层与层之间，后者压前者。** 上面 `.text-red`（utilities 层）能覆盖 `.btn`（components 层）的 `color`，即使 `.text-red` 和 `.btn` 优先级相同。
- **未分层的样式优先级高于所有已分层的样式**（普通声明）。所以第三方库放前面层，自己的样式放后面层或不分层。

```css
/* 引第三方 CSS 到指定层 */
@import url('bootstrap.css') layer(vendor);

@layer vendor, app;   /* vendor 层优先级低于 app */
```

**`!important` 在层里会反转**：带 `!important` 的声明，**层级越靠前优先级越高**。这是为了让低层（如 reset）能强制覆盖高层。

### 2.5 继承、初始值与最终值

层叠只解决“多个声明谁获胜”，浏览器还要继续计算属性值。可以把过程简化为：

1. 收集与元素匹配的声明。
2. 按来源、重要性、层、优先级和顺序选出层叠值。
3. 处理继承、相对单位和自定义属性，得到计算值。
4. 结合布局环境得到实际使用值。

文字相关属性通常会继承，例如 `color`、`font-family`、`line-height`；布局属性通常不继承，例如 `margin`、`padding`、`border`。是否继承由每个属性的定义决定，不要靠猜，直接在 DevTools 的 **Computed** 面板确认。

```css
.article {
  color: #1f2937;
  font-family: system-ui, sans-serif;
}

/* p 会继承 color 和 font-family，不会继承 article 的 margin。 */
.article p {
  margin-block: 1em;
}
```

五个全局关键字用于显式控制值的来源：

```css
.demo {
  color: inherit;          /* 强制使用父元素的计算值 */
  display: initial;        /* 使用该属性规范定义的初始值 */
  margin: unset;           /* 可继承属性按 inherit，否则按 initial */
  font: revert;            /* 回退到更低来源中的结果，如浏览器默认样式 */
  background: revert-layer; /* 回退当前层，让更早层的值重新生效 */
}
```

`all: unset` 会同时清除绝大多数属性，包括本来有用的控件样式。它适合边界明确的组件重置，不适合不加判断地用于所有元素。

---
