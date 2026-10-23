---
title: "第 0 章：网页运行原理与开发起步"
description: "从浏览器渲染链路、最小目录和页面骨架开始建立 Web 开发心智模型。"
date: '2026-10-23'
category: 网页基础
tags: [HTML5, 浏览器, 开发环境]
series:
  order: 1
---
## 第 0 章 前置认知

### 0.1 一个网页是怎么跑起来的

浏览器请求 HTML 文件 → 逐行解析成 DOM 树 → 遇到 `<link>` 请求 CSS 并构建 CSSOM → DOM + CSSOM 合成 Render Tree → 计算每个元素的位置尺寸（Layout）→ 逐像素绘制（Paint）→ 分层合成上屏（Composite）。

**记住这条链路**。后面所有关于「为什么动画卡」「为什么样式不生效」「为什么页面闪一下」的问题，答案都在这条链路上。

### 0.2 最小文件结构

```
project/
├── index.html
├── css/
│   └── style.css
├── js/
│   └── main.js
└── assets/
    └── img/
```

HTML 中引入：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>页面标题</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <script src="js/main.js" defer></script>
</body>
</html>
```

三个必须知道的东西：

- `<!DOCTYPE html>`：使现代 HTML 文档进入标准模式；缺少或使用某些旧声明可能进入怪异模式。怪异模式会影响部分布局规则，不表示所有盒模型计算都完全不同。
- `<meta name="viewport" content="width=device-width, initial-scale=1">`：移动端不加这行，页面会被当成 980px 宽的桌面页缩小显示。
- `<script defer>`：外部经典脚本与解析并行下载，DOM 解析完成后按文档顺序执行，在 `DOMContentLoaded` 前完成；与放在 `</body>` 前的同步脚本并不等价。`async` 就绪后尽快执行，不保证文档顺序，适合独立脚本。模块脚本默认延后执行，不能通过添加 `defer` 获得额外效果。

### 0.3 `head` 中的基础元数据

`<head>` 不显示页面正文，但会决定编码、搜索摘要、分享预览和资源加载方式。一个可发布页面至少应包含：

```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>文章标题 | 站点名</title>
  <meta name="description" content="用一句完整的话概括当前页面。">

  <link rel="canonical" href="https://example.com/articles/html-basics">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="./css/style.css">
</head>
```

- `<title>` 应描述当前页面，不要让所有页面都叫“首页”。
- `description` 是搜索摘要候选内容，不保证一定按原文展示。
- `canonical` 指向内容的首选地址，避免多个 URL 表示同一页面。
- `charset` 应尽量放在文档前部，避免浏览器用错误编码预解析文本。

社交平台分享卡片通常还需要 Open Graph 元数据：

```html
<meta property="og:type" content="article">
<meta property="og:title" content="文章标题">
<meta property="og:description" content="文章摘要">
<meta property="og:url" content="https://example.com/articles/html-basics">
<meta property="og:image" content="https://example.com/assets/cover.jpg">
```

### 0.4 URL 与相对路径

路径错误是静态项目部署后资源 404 的主要原因。假设当前页面是 `/articles/index.html`：

| 写法 | 实际目标 |
|---|---|
| `./cover.jpg` | `/articles/cover.jpg` |
| `../assets/cover.jpg` | `/assets/cover.jpg` |
| `/assets/cover.jpg` | 当前域名根目录下的 `/assets/cover.jpg` |
| `https://cdn.example.com/cover.jpg` | 完整的外部地址 |

以 `/` 开头的是**根路径**，部署到 `https://example.com/my-blog/` 这类子路径时可能失效。纯静态教程项目优先使用相对路径；使用构建工具时，再由站点的 `base` 配置统一处理公共路径。

### 0.5 从网页到全栈的边界

浏览器负责交互，但不能保管数据库密码、替用户决定权限或作为持久化真相源。开发者工具中可以改请求和 localStorage，因此“前端隐藏按钮”并不构成授权。后端接收不可信输入、校验身份与资源权限、执行事务，再返回有限的公开字段。后续从 [Node.js 服务运行时](./37-node-typescript-runtime) 开始建立这一边界。

练习：分别打开带 `defer`、`async` 和 `type="module"` 的页面，记录 Network 下载顺序与 Console 执行顺序。禁用一个脚本或让 CSS 返回 404，判断失败发生在请求、解析还是渲染层。完成标准是能解释顺序差异，而不只是看到页面出现。

### 官方参考

- [WHATWG HTML Standard](https://html.spec.whatwg.org/multipage/)
- [WHATWG script 处理模型](https://html.spec.whatwg.org/multipage/scripting.html#the-script-element)
- [URL Standard](https://url.spec.whatwg.org/)

---
