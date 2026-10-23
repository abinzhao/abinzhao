---
title: "第 19 章：上线验收与故障排查"
description: "用 HTML、CSS、JavaScript、性能、无障碍和部署清单完成上线验收。"
date: '2026-10-23'
category: 质量保障
tags: [质量保障, 无障碍, 性能]
series:
  order: 20
---
## 第 19 章 收尾检查清单

部署上线前，逐项过一遍。

### HTML

- [ ] 每页有且仅有一个 `<h1>`
- [ ] 标题层级不跳级（`h1` → `h2` → `h3`）
- [ ] 所有 `<img>` 有 `alt`（装饰性图片用 `alt=""`）
- [ ] 所有表单控件有关联的 `<label for>`
- [ ] `<html lang="zh-CN">` 正确设置
- [ ] 有 `<meta name="description">`
- [ ] 有 `<title>`，且每页不同

### CSS

- [ ] 全局 `box-sizing: border-box`
- [ ] 有 `:focus-visible` 焦点样式
- [ ] 有 `prefers-reduced-motion` 处理
- [ ] 暗色模式配色对比度达标（正文 ≥ 4.5:1）
- [ ] 320px、390px、768px 和桌面宽度下不横向滚动
- [ ] 无 `!important` 滥用
- [ ] 高频位移与淡入淡出优先使用 `transform` / `opacity`

### JavaScript

- [ ] 无 console 报错
- [ ] `fetch` 有 `try/catch` 和错误 UI
- [ ] DOM 查询发生在节点可用之后（`defer`、模块脚本或 `DOMContentLoaded`）
- [ ] 滚动/缩放处理使用 `requestAnimationFrame`、节流或防抖
- [ ] 用户输入渲染到页面前做了转义
- [ ] 解析后的 Markdown 等 HTML 字符串经过可靠净化

### 性能

- [ ] 图片用 WebP/AVIF，设置了 `width` / `height`
- [ ] 首屏外图片 `loading="lazy"`
- [ ] 首屏大图 `fetchpriority="high"`
- [ ] CSS/JS 文件数量合理，启用了压缩
- [ ] 固定设备与网络条件的 Lighthouse 结果已记录；分数目标由项目预算决定

### 无障碍

- [ ] 键盘能走完全站（Tab / Shift+Tab / Enter / 空格）
- [ ] 有「跳到主要内容」链接
- [ ] 所有可点击元素的焦点可见
- [ ] 图标按钮有 `aria-label`
- [ ] 动态内容区域有 `aria-live`
- [ ] 弹窗打开、关闭后的焦点位置正确
- [ ] 使用无障碍树或读屏抽查主流程
- [ ] 自动审计与键盘、读屏人工验证均有记录，自动分数不作为 WCAG 合规证明

### 部署

- [ ] 所有路径是相对的（或统一用根路径）
- [ ] 404 页面存在（`404.html`）
- [ ] favicon 已配置
- [ ] HTTPS 已开启
- [ ] HTML 不使用长期缓存，带内容指纹的静态资源可长期缓存
- [ ] 已配置基础安全响应头并检查第三方脚本来源

### 验收顺序与记录

按固定顺序验收，问题更容易定位：

| 阶段 | 检查内容 | 证据 |
|---|---|---|
| 结构 | HTML 验证、标题层级、表单关联 | 验证器结果与 Elements 截图 |
| 功能 | 首页、文章、主题、表单、异常状态 | 操作步骤和 Console 结果 |
| 响应式 | 手机、平板、桌面、长文本 | 各视口截图 |
| 无障碍 | 键盘、焦点、名称、对比度、减少动画 | 键盘路径和审计结果 |
| 性能 | 缓存关闭与开启两种加载、CPU/网络降速 | Performance 记录与 Lighthouse 报告 |
| 线上 | 路径、404、HTTPS、缓存、分享元数据 | 生产 URL 与 Network 导出 |

至少回归以下状态：首次加载、缓存后加载、慢速网络、数据为空、请求失败、文章不存在、深色模式、减少动画和窄屏。发现问题时记录“复现步骤、预期、实际、首个异常”，不要只记录一张结果截图。

---

## 附录 A：常见坑速查

### A.1 CSS 不生效

| 现象 | 排查方向 |
|---|---|
| 完全没生效 | 文件路径错 / 浏览器缓存（Ctrl+Shift+R 强刷）/ DevTools Network 看请求是否 404 |
| 部分属性被划掉 | 优先级不够，看 Styles 面板谁覆盖了它 |
| 属性写对了但不生效 | 拼写错误（`heigth`）/ 单位缺失（`width: 100`）/ 值非法 |
| 父元素的样式影响了子元素 | 继承属性。用 DevTools Computed 面板看值的来源 |
| Flex 子项设了宽度但没用 | `flex-shrink` 或 `min-width: auto` 导致，加 `min-width: 0` |
| `z-index` 设了很大还是被盖住 | 父元素创建了层叠上下文（`transform` / `opacity < 1` / `filter`） |
| `position: sticky` 不生效 | 没设 `top` / 祖先有 `overflow: hidden` / 父容器高度不够 |
| `margin` 塌陷 | 用 `display: flow-root` 或 Flex/Grid 容器 |

### A.2 JS 报错

| 报错 | 原因 |
|---|---|
| `Cannot read properties of null (reading 'xxx')` | `querySelector` 没找到元素。检查选择器、检查脚本是否在 DOM 之前执行 |
| `xxx is not a function` | 拼写错误 / 方法名不对 / 变量不是预期类型 |
| `Unexpected token` | 语法错误。看 DevTools 报的行号和列号 |
| `CORS policy: No 'Access-Control-Allow-Origin'` | 服务端没配 CORS，前端无法绕过 |
| `Failed to fetch` | 网络问题 / 地址错 / 服务端挂了 / 被 CORS 拦截 |
| `Maximum call stack size exceeded` | 递归没有终止条件 |
| `Uncaught (in promise)` | Promise 里抛错但没有 `.catch` |

### A.3 移动端问题

| 现象 | 解决 |
|---|---|
| 页面被缩小显示 | 加了 `<meta name="viewport">` 吗 |
| 点击有 300ms 延迟 | 现代浏览器已解决；确保 viewport 有 `width=device-width` |
| 输入框聚焦时页面被放大 | `font-size` 小于 16px 会触发 iOS 缩放，改成 `16px` |
| `100vh` 底部被地址栏挡住 | 用 `100dvh` |
| 横向溢出、出现横向滚动条 | 检查有没有元素宽度超过视口，或 `100vw` 的使用 |
| 点按高亮闪一下灰 | `-webkit-tap-highlight-color: transparent`（谨慎使用，会去掉点击反馈） |
| 长按弹出系统菜单 | `-webkit-touch-callout: none`（谨慎使用） |

### A.4 部署后白屏

按顺序排查：

1. **打开 DevTools Console**，看有没有报错。最常见的是资源 404。
2. **Network 面板**，看 JS/CSS 是否 404。是的话检查路径（见 18.1 的路径问题）。
3. **看 Sources 面板**，JS 是否加载了。加载了但没执行，看是不是 `type="module"` 在旧浏览器不兼容。
4. **看是否大小写问题**。GitHub Pages 的服务器区分大小写，本地 macOS / Windows 不区分。`Style.css` 和 `style.css` 在本地都能用，线上只有一个能跑。

---

## 附录 B：进一步学习的方向

完成 v1 之后，按需选择：

**构建工具**
- Vite：开发服务器、热更新、构建打包
- 用 `vite-plugin-md` 或 `@mdx-js/rollup` 在构建时把 Markdown 转成 HTML，省掉运行时的 `marked`

**框架**
- React / Vue / Svelte。有了 v1 的原生基础，学框架会快很多，因为你已经知道 DOM、事件、状态是怎么回事

**工程化**
- TypeScript：给 JS 加类型
- ESLint + Prettier：统一代码风格
- 单元测试：Vitest

**深入方向**
- HTTP 缓存策略（`Cache-Control` / `ETag` / `stale-while-revalidate`）
- Service Worker 与离线优先
- Web Components
- 可访问性的 WCAG 标准

**v2 可以做的事**
- 构建时静态生成（SSG），避免运行时 `fetch` Markdown
- 全文搜索（`lunr` 或 `pagefind`）
- RSS 订阅
- 图片自动压缩与响应式 `srcset`
- 文章标签页、归档页
- 评论系统（Giscus / Waline）

---

## 结语

这份文档覆盖了从 HTML 语义、CSS 布局与动画、浏览器调试、到实际项目落地的完整链路。所有内容都是能直接写进代码里的东西，没有概念铺陈。

学前端最快的路径是：**打开 DevTools，看别人怎么做，然后自己写一遍。** 遇到问题就按附录 A 的顺序排查——错误信息永远会告诉你答案，只是你需要知道去哪里看。

v1 做完后先记录 Lighthouse 的条件与结果，再完成人工键盘、错误恢复和移动端检查。高分不能证明主流程正确，也不能代替真实用户性能。继续按 [JavaScript 核心](./20-javascript-scope-closures) 进入 v2，再按 [后端起步](./37-node-typescript-runtime) 完成 v3。

### 后续全栈验收差异

静态阶段的“Console 无错误”只是浏览器侧证据。接入后端后，还要证明身份失效会拒绝请求、越权用户无法读取资源、事务失败不留下半成品、重复请求不重复产生业务效果，以及备份能恢复。页面、API 和数据库结果应互相印证。

官方参考：[WCAG 2.2](https://www.w3.org/TR/WCAG22/)、[Lighthouse](https://developer.chrome.com/docs/lighthouse/overview/)、[Web Vitals](https://web.dev/articles/vitals)。
