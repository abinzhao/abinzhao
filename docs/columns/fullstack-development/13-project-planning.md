---
title: "第 13 章：静态博客项目规划"
description: "明确个人博客的交付目标、文件边界、开发顺序和验收标准。"
date: '2026-10-23'
category: 项目实战
tags: [静态站点, 项目规划, 前端]
series:
  order: 14
---
## 第 13 章 项目规划

### 13.1 目标

做一个纯静态的个人博客，零构建工具，Markdown 写文章，部署到 Vercel 或 GitHub Pages。

**功能清单**：

- 首页：文章列表（卡片网格）
- 文章页：Markdown 渲染、目录、阅读进度条
- 关于页
- 暗色/亮色主题切换（记住用户选择）
- 响应式（手机 / 平板 / 桌面）
- 表单：联系表单（前端验证 + 提交反馈）
- 动画：入场淡入、悬停效果、主题切换过渡

### 13.2 目录结构

```
blog/
├── index.html
├── post.html
├── about.html
├── css/
│   ├── reset.css
│   ├── variables.css
│   ├── base.css
│   ├── layout.css
│   ├── components.css
│   └── animations.css
├── js/
│   ├── theme.js
│   ├── posts.js
│   ├── post.js
│   ├── form.js
│   └── main.js
├── posts/
│   ├── index.json
│   ├── hello-world.md
│   └── css-layout.md
├── assets/
│   └── avatar.jpg
└── README.md
```

**为什么拆这么多 CSS 文件？** 每个文件职责单一：变量、重置、基础排版、布局、组件、动画。纯静态项目直接用多个 link 并行发现资源；CSS @import 可能产生串行发现链，HTTP/2 也不消除请求与解析成本。引入构建工具后再根据测量结果合并压缩。

### 13.3 开发顺序

按可验证的垂直路径推进，避免所有文件都写完后才第一次运行：

1. 建立目录和最小 `index.html`，确认本地服务器可访问。
2. 完成设计令牌、重置与页面主布局。
3. 写首页静态结构，再接入文章列表 JSON。
4. 写文章页并完成 Markdown 加载、净化、目录和上下篇。
5. 写关于页、表单校验和提交状态。
6. 加入主题切换、响应式布局和减少动画模式。
7. 用 DevTools 完成网络、键盘、性能和移动端检查。
8. 部署到目标平台，从线上地址再回归一次资源路径。

每完成一步都刷新页面并检查 Console 与 Network。不要等到部署时才发现路径、脚本顺序或跨源问题。

### 13.4 完成标准

项目完成应表现为可观察结果：

- 从首页可以打开任意文章，并能返回首页或切换上下篇。
- 文章加载中、无文章、文章不存在和网络失败都有明确界面。
- 主题选择在刷新后保留，未选择时跟随系统主题。
- 仅使用键盘可以访问导航、主题按钮、正文链接和表单。
- `320px` 到桌面宽度无横向溢出，文字和按钮不互相遮挡。
- 减少动画模式下没有大幅位移或持续动画。
- 线上环境的 HTML、CSS、JavaScript、JSON、Markdown 和图片请求均无 404。
- Console 无未处理异常；Lighthouse 与人工检查结果已记录。

分数不是唯一标准。核心流程可完成、错误可恢复、内容可读、键盘可操作，优先级高于单项跑分。

### 13.5 静态项目的能力边界

本阶段联系表单只演示前端验证和状态，不会保存或发送留言。页面应明确显示“演示提交”，不能让访问者误以为消息已送达。真实留言需要 API、输入限制、滥用防护、持久化和隐私政策；在 [全栈毕业项目](./54-blog-v3-fullstack-capstone) 中完成可信写入。

建立一张交付记录表，包含入口 URL、测试输入、预期、实际和截图/日志位置。静态 JSON 来自作者控制不表示以后 API 数据也可信，接入后端时要重新验证所有外部边界。

官方参考：[GitHub Pages 能力边界](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)、[WHATWG HTML](https://html.spec.whatwg.org/multipage/)。

---
