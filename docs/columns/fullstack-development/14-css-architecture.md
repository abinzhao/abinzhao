---
title: "第 14 章：静态博客 CSS 架构"
description: "从设计令牌、重置、布局、组件和动画分层搭建完整样式系统。"
date: "2026-10-15"
category: 项目实战
tags: [CSS 架构, 设计变量, 响应式设计]
series:
  order: 15
---
## 第 14 章 CSS 架构

### 14.1 variables.css —— 设计令牌

```css
/* css/variables.css */
:root {
  /* ---- 颜色：亮色主题 ---- */
  --color-bg: #ffffff;
  --color-bg-subtle: #f8f9fa;
  --color-bg-elevated: #ffffff;
  --color-border: #e5e7eb;
  --color-text: #1f2937;
  --color-text-muted: #6b7280;
  --color-text-faint: #9ca3af;
  --color-primary: #3b82f6;
  --color-primary-hover: #2563eb;
  --color-primary-subtle: #eff6ff;
  --color-danger: #e5484d;
  --color-success: #16a34a;

  /* ---- 字体 ---- */
  --font-sans: system-ui, -apple-system, "Segoe UI", "PingFang SC",
               "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  --font-mono: ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace;

  --text-xs:   0.75rem;
  --text-sm:   0.875rem;
  --text-base: 1rem;
  --text-lg:   1.125rem;
  --text-xl:   1.25rem;
  --text-2xl:  1.5rem;
  --text-3xl:  1.875rem;
  --text-4xl:  2.25rem;

  /* 用 clamp 做流体标题字号 */
  --text-display: clamp(1.75rem, 1rem + 3vw, 2.75rem);

  /* ---- 间距（8px 基准） ---- */
  --space-1:  0.25rem;   /*  4px */
  --space-2:  0.5rem;    /*  8px */
  --space-3:  0.75rem;   /* 12px */
  --space-4:  1rem;      /* 16px */
  --space-5:  1.25rem;   /* 20px */
  --space-6:  1.5rem;    /* 24px */
  --space-8:  2rem;      /* 32px */
  --space-10: 2.5rem;    /* 40px */
  --space-12: 3rem;      /* 48px */
  --space-16: 4rem;      /* 64px */

  /* ---- 圆角 ---- */
  --radius-sm:   4px;
  --radius-md:   8px;
  --radius-lg:   12px;
  --radius-xl:   20px;
  --radius-full: 9999px;

  /* ---- 阴影 ---- */
  --shadow-sm: 0 1px 2px rgba(0,0,0,.05);
  --shadow-md: 0 2px 4px rgba(0,0,0,.04), 0 4px 12px rgba(0,0,0,.06);
  --shadow-lg: 0 4px 8px rgba(0,0,0,.06), 0 12px 32px rgba(0,0,0,.08);

  /* ---- 动效 ---- */
  --ease-out:   cubic-bezier(0.25, 1, 0.5, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --duration-fast:   150ms;
  --duration-base:   250ms;
  --duration-slow:   400ms;

  /* ---- 布局 ---- */
  --content-width: 720px;
  --wide-width:    1200px;
  --header-height: 60px;

  /* ---- 过渡（主题切换用） ---- */
  --theme-transition: background-color var(--duration-base) ease,
                      color var(--duration-base) ease,
                      border-color var(--duration-base) ease;
}

/* ---- 暗色主题 ---- */
[data-theme="dark"] {
  --color-bg: #0f1419;
  --color-bg-subtle: #171c22;
  --color-bg-elevated: #1d242c;
  --color-border: #2a333d;
  --color-text: #e6edf3;
  --color-text-muted: #9198a1;
  --color-text-faint: #6e7681;
  --color-primary: #58a6ff;
  --color-primary-hover: #79b8ff;
  --color-primary-subtle: #12233a;
  --color-danger: #f85149;
  --color-success: #3fb950;

  --shadow-sm: 0 1px 2px rgba(0,0,0,.3);
  --shadow-md: 0 2px 4px rgba(0,0,0,.3), 0 4px 12px rgba(0,0,0,.4);
  --shadow-lg: 0 4px 8px rgba(0,0,0,.4), 0 12px 32px rgba(0,0,0,.5);
}

/* 系统暗色且用户未手动选择时，自动暗色 */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    color-scheme: dark;
  }
}
```

### 14.2 reset.css —— 合理重置

```css
/* css/reset.css */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  -webkit-text-size-adjust: 100%;   /* 防止 iOS 横屏时字号被放大 */
  text-size-adjust: 100%;
}

body {
  min-height: 100dvh;
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: 1.6;
  color: var(--color-text);
  background: var(--color-bg);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  transition: var(--theme-transition);
}

img, picture, video, canvas, svg {
  display: block;
  max-width: 100%;
  height: auto;
}

input, button, textarea, select {
  font: inherit;
  color: inherit;
}

button {
  background: none;
  border: none;
  cursor: pointer;
}

a {
  color: var(--color-primary);
  text-decoration: none;
}
a:hover { text-decoration: underline; }

ul, ol { list-style: none; }

h1, h2, h3, h4, h5, h6 {
  line-height: 1.3;
  font-weight: 700;
  text-wrap: balance;   /* 标题自动平衡换行，避免孤字 */
}

p { text-wrap: pretty; }   /* 正文避免最后一行只有一个词 */

/* 焦点可见性 */
:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
:focus:not(:focus-visible) { outline: none; }

/* 选中文本 */
::selection {
  background: var(--color-primary);
  color: white;
}

/* 减少动画偏好 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### 14.3 layout.css —— 布局

```css
/* css/layout.css */

/* 内容容器 */
.container {
  width: min(100% - var(--space-8), var(--wide-width));
  margin-inline: auto;
}

.prose-width {
  width: min(100% - var(--space-8), var(--content-width));
  margin-inline: auto;
}

/* 跳过导航链接（无障碍） */
.skip-link {
  position: absolute;
  top: -100px;
  left: var(--space-4);
  z-index: 100;
  padding: var(--space-2) var(--space-4);
  background: var(--color-primary);
  color: white;
  border-radius: var(--radius-md);
  transition: top var(--duration-fast);
}
.skip-link:focus { top: var(--space-4); }

/* 顶部导航 */
.site-header {
  position: sticky;
  top: 0;
  z-index: 50;
  height: var(--header-height);
  background: color-mix(in srgb, var(--color-bg) 85%, transparent);
  backdrop-filter: blur(12px) saturate(1.5);
  -webkit-backdrop-filter: blur(12px) saturate(1.5);
  border-bottom: 1px solid var(--color-border);
}

.site-header .container {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
}

.site-nav ul {
  display: flex;
  gap: var(--space-6);
}

.site-nav a {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: 500;
  transition: color var(--duration-fast);
}
.site-nav a:hover,
.site-nav a[aria-current="page"] {
  color: var(--color-text);
  text-decoration: none;
}

/* 主页主体 */
main {
  padding-block: var(--space-12) var(--space-16);
}

/* 文章网格 */
.post-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr));
  gap: var(--space-6);
}

/* 文章页布局：正文 + 侧边目录 */
.post-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-8);
}

@media (min-width: 1100px) {
  .post-layout {
    grid-template-columns: minmax(0, 1fr) 220px;
    align-items: start;
  }
}

/* 页脚 */
.site-footer {
  padding-block: var(--space-8);
  border-top: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  text-align: center;
}
```

### 14.4 components.css —— 组件

```css
/* css/components.css */

/* ---- 主题切换按钮 ---- */
.theme-toggle {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  transition: background-color var(--duration-fast),
              color var(--duration-fast);
}
.theme-toggle:hover {
  background: var(--color-bg-subtle);
  color: var(--color-text);
}
.theme-toggle svg {
  width: 20px;
  height: 20px;
  fill: currentColor;
}
/* 亮色时显示月亮，暗色时显示太阳 */
.theme-toggle .icon-sun  { display: none; }
[data-theme="dark"] .theme-toggle .icon-sun  { display: block; }
[data-theme="dark"] .theme-toggle .icon-moon { display: none; }

/* ---- 文章卡片 ---- */
.post-card {
  display: flex;
  flex-direction: column;
  padding: var(--space-6);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: transform var(--duration-base) var(--ease-out),
              box-shadow var(--duration-base) var(--ease-out),
              border-color var(--duration-base);
}
.post-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
  border-color: color-mix(in srgb, var(--color-primary) 40%, var(--color-border));
}

.post-card__title {
  font-size: var(--text-xl);
  margin-bottom: var(--space-2);
}
.post-card__title a {
  color: var(--color-text);
  text-decoration: none;
}
.post-card__title a::after {
  content: '';
  position: absolute;
  inset: 0;          /* 让整个卡片可点击 */
}

.post-card__excerpt {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  margin-bottom: var(--space-4);
  flex: 1;           /* 撑开，让 meta 沉底 */
}

.post-card__meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--text-xs);
  color: var(--color-text-faint);
}

/* 标签 */
.tag {
  display: inline-block;
  padding: 2px 8px;
  font-size: var(--text-xs);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
  border-radius: var(--radius-full);
}

/* ---- 按钮 ---- */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-6);
  font-size: var(--text-sm);
  font-weight: 500;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background-color var(--duration-fast),
              transform var(--duration-fast),
              box-shadow var(--duration-fast);
}
.btn:active { transform: scale(0.97); }

.btn--primary {
  background: var(--color-primary);
  color: white;
}
.btn--primary:hover {
  background: var(--color-primary-hover);
  text-decoration: none;
}

.btn--ghost {
  border: 1px solid var(--color-border);
  color: var(--color-text);
}
.btn--ghost:hover {
  background: var(--color-bg-subtle);
  text-decoration: none;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* ---- 表单 ---- */
.form-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-5);
}

.form-field label {
  font-size: var(--text-sm);
  font-weight: 500;
}

.form-field .required {
  color: var(--color-danger);
  margin-left: 2px;
}

.form-field input,
.form-field textarea {
  padding: var(--space-3) var(--space-4);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition: border-color var(--duration-fast),
              box-shadow var(--duration-fast);
}

.form-field input:focus,
.form-field textarea:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent);
}

.form-field input:user-invalid,
.form-field textarea:user-invalid {
  border-color: var(--color-danger);
}

.form-field input:user-invalid:focus,
.form-field textarea:user-invalid:focus {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-danger) 20%, transparent);
}

.form-error {
  font-size: var(--text-xs);
  color: var(--color-danger);
  min-height: 1.2em;   /* 占位，防止出错时布局跳动 */
}

/* ---- 阅读进度条 ---- */
.reading-progress {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background: var(--color-primary);
  transform-origin: 0 50%;
  transform: scaleX(0);
  z-index: 100;
  pointer-events: none;
}

/* ---- 目录 ---- */
.toc {
  position: sticky;
  top: calc(var(--header-height) + var(--space-6));
  max-height: calc(100dvh - var(--header-height) - var(--space-12));
  overflow-y: auto;
  font-size: var(--text-sm);
}

.toc h2 {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-faint);
  margin-bottom: var(--space-3);
}

.toc ul { display: flex; flex-direction: column; gap: var(--space-1); }

.toc a {
  display: block;
  padding: var(--space-1) var(--space-3);
  color: var(--color-text-muted);
  border-left: 2px solid transparent;
  transition: color var(--duration-fast),
              border-color var(--duration-fast);
}
.toc a:hover { color: var(--color-text); text-decoration: none; }
.toc a[aria-current="true"] {
  color: var(--color-primary);
  border-left-color: var(--color-primary);
  font-weight: 500;
}
.toc a.toc-h3 { padding-left: var(--space-6); font-size: var(--text-xs); }

/* ---- 文章正文排版 ---- */
.prose {
  font-size: var(--text-base);
  line-height: 1.75;
  color: var(--color-text);
}

.prose > * + * { margin-top: var(--space-5); }

.prose h2 {
  font-size: var(--text-2xl);
  margin-top: var(--space-12);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--color-border);
  scroll-margin-top: calc(var(--header-height) + var(--space-6));
}

.prose h3 {
  font-size: var(--text-xl);
  margin-top: var(--space-8);
  scroll-margin-top: calc(var(--header-height) + var(--space-6));
}

.prose a {
  color: var(--color-primary);
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-thickness: 1px;
}
.prose a:hover { text-decoration-thickness: 2px; }

.prose ul, .prose ol {
  padding-left: var(--space-6);
}
.prose ul { list-style: disc; }
.prose ol { list-style: decimal; }
.prose li + li { margin-top: var(--space-2); }
.prose li::marker { color: var(--color-text-faint); }

.prose blockquote {
  padding: var(--space-4) var(--space-6);
  border-left: 3px solid var(--color-primary);
  background: var(--color-bg-subtle);
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
  color: var(--color-text-muted);
}
.prose blockquote > * + * { margin-top: var(--space-3); }

.prose code {
  padding: 0.15em 0.4em;
  font-family: var(--font-mono);
  font-size: 0.875em;
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.prose pre {
  padding: var(--space-4) var(--space-5);
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow-x: auto;
  line-height: 1.6;
}
.prose pre code {
  padding: 0;
  background: none;
  border: none;
  font-size: var(--text-sm);
}

.prose img {
  border-radius: var(--radius-md);
  margin-inline: auto;
}

.prose table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}
.prose th, .prose td {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  text-align: left;
}
.prose th {
  background: var(--color-bg-subtle);
  font-weight: 600;
}

.prose hr {
  border: none;
  border-top: 1px solid var(--color-border);
  margin-block: var(--space-10);
}
```

### 14.5 animations.css —— 动画

```css
/* css/animations.css */

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* 入场动画工具类 */
.animate-in {
  animation: fadeInUp var(--duration-slow) var(--ease-out) both;
}

/* 依次入场：用 --i 控制延迟 */
.stagger {
  animation: fadeInUp var(--duration-slow) var(--ease-out) both;
  animation-delay: calc(var(--i, 0) * 70ms);
}

/* 首屏元素直接播动画 */
.hero-title {
  animation: fadeInUp 600ms var(--ease-out) both;
}
.hero-subtitle {
  animation: fadeInUp 600ms var(--ease-out) 120ms both;
}

/* 滚动驱动的入场（支持的浏览器） */
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .reveal {
      animation: fadeInUp linear both;
      animation-timeline: view();
      animation-range: entry 0% cover 25%;
    }
  }
}

/* 主题切换时的过渡 */
html.theme-transitioning *,
html.theme-transitioning *::before,
html.theme-transitioning *::after {
  transition: background-color 250ms ease,
              border-color 250ms ease,
              color 250ms ease,
              fill 250ms ease !important;
}
```

**注意**：主题切换过渡不能常驻，否则页面首次加载时所有元素都会「闪一下」。用 JS 在切换瞬间加 `.theme-transitioning` 类，过渡结束后移除。

---
