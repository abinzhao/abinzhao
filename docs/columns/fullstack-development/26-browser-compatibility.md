---
title: "第 26 章：Baseline、Browserslist 与特性检测"
description: "建立浏览器兼容策略，区分 Baseline、构建目标、特性检测、渐进增强与 polyfill。"
date: "2026-10-15"
category: 浏览器 API
tags: [Baseline, Browserslist, Progressive Enhancement]
series:
  order: 27
---
## 第 26 章 浏览器兼容策略

兼容性不是“支持所有旧浏览器”，而是先定义用户范围，再为关键流程选择基础能力、增强能力和失败兜底。

### 26.1 学习目标

- 理解 Baseline 状态表达的含义和限制。
- 用 Browserslist 统一构建工具的目标浏览器范围。
- 区分语法转译、API polyfill 和运行时特性检测。
- 使用 HTML、CSS、JavaScript 做渐进增强。
- 为博客建立可执行的兼容性验收表。

### 26.2 先定义支持范围

一个可执行的支持声明应包含：

```text
核心流程：
- 阅读文章
- 搜索文章
- 提交评论

目标环境：
- 最近两个主要版本的 Chrome、Edge、Firefox、Safari
- iOS Safari 最近两个主要版本
- Android 主流 Chromium 浏览器

降级原则：
- 系统分享不可用时复制链接
- View Transition 不可用时直接切换
- JavaScript 加载失败时文章正文仍可阅读
```

目标必须来自真实访问数据、业务合同和测试资源。`last 2 versions` 是起点，不是所有项目都应照抄的答案。

### 26.3 Baseline

Baseline 用于描述 Web 平台特性是否已在核心浏览器集合中达到一致支持：

- **Limited availability**：尚未覆盖所有核心浏览器。
- **Newly available**：已跨核心浏览器可用，但时间还不长。
- **Widely available**：跨核心浏览器可用已经达到规定时间。

Baseline 适合回答：“这项 Web 特性是否已被主流浏览器共同实现？”

它不能单独回答：

- 你的用户是否仍在使用更旧版本。
- 某个企业 WebView 是否升级。
- 某个 API 是否受权限、HTTPS、设备能力限制。
- 浏览器实现是否存在与你场景相关的缺陷。

因此应把 Baseline、产品访问数据和真实设备测试一起使用。

### 26.4 Browserslist

Browserslist 是一套共享目标浏览器查询。Autoprefixer、Babel、部分打包工具会读取它：

```json
{
  "browserslist": [
    "> 0.5%",
    "last 2 versions",
    "not dead"
  ]
}
```

也可以放在 `.browserslistrc`：

```text
> 0.5%
last 2 versions
not dead
```

查看查询结果：

```bash
npx browserslist
```

查看为什么包含某个版本：

```bash
npx browserslist --coverage
```

生产和开发环境可分开配置：

```json
{
  "browserslist": {
    "production": [
      "> 0.5%",
      "not dead"
    ],
    "development": [
      "last 1 chrome version",
      "last 1 firefox version",
      "last 1 safari version"
    ]
  }
}
```

不要为了让构建产物更小而随意缩小范围。改变 Browserslist 会影响语法转换、前缀和最终包体，应作为兼容策略变更进行评审。

### 26.5 转译不等于 polyfill

构建工具可以把较新的语法转换成较旧语法：

```js
const title = post?.metadata?.title ?? '未命名文章';
```

但转译不会自动让旧环境拥有新的 Web API：

```js
structuredClone(post);
navigator.share(shareData);
new ResizeObserver(handleResize);
```

三类问题要分开处理：

| 问题 | 解决方式 |
|---|---|
| 新 JavaScript 语法无法解析 | Babel、SWC、esbuild 等转译 |
| 标准内建对象或方法缺失 | 按需 polyfill |
| 浏览器/设备 API 缺失 | 特性检测、替代流程或禁用增强功能 |

Polyfill 会增加下载和执行成本，也未必能模拟权限、硬件或底层平台能力。只为目标环境确实缺失且业务必需的能力添加。

### 26.6 JavaScript 特性检测

检测能力，不检测浏览器名称：

```js
if ('share' in navigator) {
  showShareButton();
} else {
  showCopyLinkButton();
}
```

检测构造器：

```js
if ('IntersectionObserver' in window) {
  setupHeadingObserver();
} else {
  showStaticTableOfContents();
}
```

检测方法并捕获运行时失败：

```js
async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 可能没有权限，继续使用兜底。
    }
  }

  return false;
}
```

“属性存在”不表示用户一定授权，也不表示所有参数都受支持。检测后仍要处理异常。

不要这样判断：

```js
if (navigator.userAgent.includes('Chrome')) {
  // 用户代理字符串可能伪装，也无法准确表达具体能力。
}
```

### 26.7 CSS 特性检测

CSS 中使用 `@supports`：

```css
.post-grid {
  display: flex;
  flex-wrap: wrap;
}

@supports (display: grid) {
  .post-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  }
}
```

JavaScript 中使用 `CSS.supports()`：

```js
const supportsViewTransition =
  'startViewTransition' in document &&
  CSS.supports('view-transition-name: post-title');
```

支持查询只能判断语法是否被识别，不能替代视觉回归测试。

### 26.8 渐进增强

先提供不依赖增强能力的基础体验：

```html
<a
  href="https://example.com/posts/closures"
  data-share-link
>
  复制或分享文章
</a>
```

JavaScript 可用时增强为系统分享：

```js
const shareLink = document.querySelector('[data-share-link]');

if (shareLink && navigator.share) {
  shareLink.addEventListener('click', async (event) => {
    event.preventDefault();

    try {
      await navigator.share({
        title: document.title,
        url: shareLink.href,
      });
    } catch (error) {
      if (error.name !== 'AbortError') {
        location.href = shareLink.href;
      }
    }
  });
}
```

基础链接始终存在。增强失败时，用户仍能访问目标地址。

动态加载 polyfill：

```js
async function ensureResizeObserver() {
  if ('ResizeObserver' in window) {
    return;
  }

  await import('./polyfills/resize-observer.js');
}
```

只有业务确实离不开该能力时才加载；如果 CSS 容器查询或静态布局已经够用，就不需要 polyfill。

### 26.9 博客兼容性矩阵

| 功能 | 基础体验 | 增强能力 | 失败兜底 |
|---|---|---|---|
| 阅读文章 | 服务端/静态 HTML | 阅读进度、目录高亮 | 正文始终可读 |
| 分享 | 普通链接 | Web Share | 复制 URL |
| 图片加载 | 普通 `<img>` | 懒加载、响应式图片 | 原图显示 |
| 页面切换 | 普通导航 | View Transition | 直接切换 |
| 目录高亮 | 静态目录 | IntersectionObserver | 不高亮 |
| 草稿 | 表单输入 | localStorage 自动保存 | 当前会话继续填写 |
| 实时评论 | 手动刷新 | WebSocket | 轮询或刷新按钮 |

### 26.10 验证流程

1. 执行 `npx browserslist`，把实际输出保存在测试记录中。
2. 检查 MDN 或 web.dev 的 Baseline 标记，确认关键 API 状态。
3. 在目标浏览器真实运行核心流程，不只看兼容表。
4. 临时禁用 JavaScript，确认文章与导航仍可使用。
5. 在 DevTools 中删除 `navigator.share` 等能力，验证兜底路径。
6. 检查构建产物，确认没有为目标浏览器之外的环境引入大量无用 polyfill。
7. 每次缩小支持范围时记录数据依据、影响用户和回滚方式。

### 26.11 常见问题

**Baseline Widely available 是否表示不用测试？**

不是。它只表示核心浏览器的版本支持达到标准，不覆盖权限、设备、WebView、实现缺陷和你的具体交互。

**Browserslist 能检测 Web API 吗？**

它主要为构建工具提供浏览器版本集合。具体 Web API 仍需查兼容数据并做运行时特性检测。

**是否应该加载一个包含全部 polyfill 的包？**

通常不应该。按目标环境和关键流程按需引入，避免让所有用户承担额外体积与执行成本。

---
