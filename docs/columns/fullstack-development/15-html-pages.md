---
title: "第 15 章：静态博客 HTML 页面"
description: "完成首页、文章页与关于页的语义结构、元数据和表单。"
date: '2026-10-23'
category: 项目实战
tags: [HTML5, 搜索引擎优化, 无障碍]
series:
  order: 16
---
## 第 15 章 HTML 页面

### 15.1 index.html —— 首页

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="张三的个人博客，记录前端开发、CSS 布局与浏览器原理的学习笔记。">
  <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#0f1419" media="(prefers-color-scheme: dark)">

  <title>张三的博客 · 前端笔记</title>

  <!-- 防主题闪烁：必须在 CSS 之前执行 -->
  <script>
    (function () {
      try {
        var saved = localStorage.getItem('theme');
        var theme = saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', theme);
      } catch (e) {}
    })();
  </script>

  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="css/variables.css">
  <link rel="stylesheet" href="css/reset.css">
  <link rel="stylesheet" href="css/layout.css">
  <link rel="stylesheet" href="css/components.css">
  <link rel="stylesheet" href="css/animations.css">
</head>
<body>
  <a class="skip-link" href="#main">跳到主要内容</a>

  <header class="site-header">
    <div class="container">
      <a class="site-logo" href="./" aria-label="返回首页">
        <strong>张三</strong>
      </a>

      <nav class="site-nav" aria-label="主导航">
        <ul>
          <li><a href="./" aria-current="page">文章</a></li>
          <li><a href="about.html">关于</a></li>
          <li>
            <button class="theme-toggle" type="button"
                    aria-label="切换深色模式" title="切换主题">
              <svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"/>
              </svg>
              <svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="5"/>
                <path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"
                      stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
              </svg>
            </button>
          </li>
        </ul>
      </nav>
    </div>
  </header>

  <main id="main">
    <div class="container">
      <section class="hero">
        <h1 class="hero-title">你好，我是张三</h1>
        <p class="hero-subtitle">
          前端开发者。这里记录我在 CSS 布局、浏览器原理和工程实践上的学习笔记。
        </p>
      </section>

      <section aria-labelledby="posts-heading">
        <h2 id="posts-heading" class="section-heading">最新文章</h2>

        <!-- 加载状态 -->
        <p id="posts-status" role="status" aria-live="polite">加载中…</p>

        <!-- 文章列表由 JS 填充 -->
        <div id="post-grid" class="post-grid"></div>
      </section>
    </div>
  </main>

  <footer class="site-footer">
    <div class="container">
      <p>
        © <span id="year"></span> 张三 ·
        <a href="https://github.com/yourname" rel="noopener">GitHub</a>
      </p>
    </div>
  </footer>

  <script src="js/theme.js" defer></script>
  <script src="js/posts.js" defer></script>
  <script src="js/main.js" defer></script>
</body>
</html>
```

### 15.2 post.html —— 文章页

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" id="meta-desc" content="文章详情">
  <title id="page-title">加载中… · 张三的博客</title>

  <script>
    (function () {
      try {
        var saved = localStorage.getItem('theme');
        var theme = saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', theme);
      } catch (e) {}
    })();
  </script>

  <link rel="stylesheet" href="css/variables.css">
  <link rel="stylesheet" href="css/reset.css">
  <link rel="stylesheet" href="css/layout.css">
  <link rel="stylesheet" href="css/components.css">
  <link rel="stylesheet" href="css/animations.css">
</head>
<body>
  <a class="skip-link" href="#main">跳到主要内容</a>

  <div class="reading-progress" id="progress" aria-hidden="true"></div>

  <header class="site-header">
    <div class="container">
      <a class="site-logo" href="./"><strong>张三</strong></a>
      <nav class="site-nav" aria-label="主导航">
        <ul>
          <li><a href="./">文章</a></li>
          <li><a href="about.html">关于</a></li>
          <li>
            <button class="theme-toggle" type="button" aria-label="切换深色模式">
              <svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"/>
              </svg>
              <svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="5"/>
                <path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"
                      stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
              </svg>
            </button>
          </li>
        </ul>
      </nav>
    </div>
  </header>

  <main id="main">
    <div class="container">
      <div class="post-layout">
        <article class="prose" id="article">
          <p role="status">加载中…</p>
        </article>

        <aside class="post-sidebar" aria-label="文章目录">
          <nav class="toc" id="toc" hidden>
            <h2>目录</h2>
            <ul id="toc-list"></ul>
          </nav>
        </aside>
      </div>

      <nav class="post-nav" aria-label="文章导航" id="post-nav" hidden>
        <a id="prev-link" class="btn btn--ghost">← 上一篇</a>
        <a id="next-link" class="btn btn--ghost">下一篇 →</a>
      </nav>
    </div>
  </main>

  <footer class="site-footer">
    <div class="container">
      <p>© <span id="year"></span> 张三</p>
    </div>
  </footer>

  <script src="js/theme.js" defer></script>
  <script src="https://cdn.jsdelivr.net/npm/marked@18.1.1/lib/marked.umd.js" defer></script>
  <script src="https://cdn.jsdelivr.net/npm/dompurify@3.4.17/dist/purify.min.js" defer></script>
  <script src="js/post.js" defer></script>
  <script src="js/main.js" defer></script>
</body>
</html>
```

### 15.3 about.html —— 关于页（含表单）

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="关于张三：前端开发者，专注 CSS 与浏览器原理。">
  <title>关于 · 张三的博客</title>

  <script>
    (function () {
      try {
        var saved = localStorage.getItem('theme');
        var theme = saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', theme);
      } catch (e) {}
    })();
  </script>

  <link rel="stylesheet" href="css/variables.css">
  <link rel="stylesheet" href="css/reset.css">
  <link rel="stylesheet" href="css/layout.css">
  <link rel="stylesheet" href="css/components.css">
  <link rel="stylesheet" href="css/animations.css">
</head>
<body>
  <a class="skip-link" href="#main">跳到主要内容</a>

  <header class="site-header">
    <div class="container">
      <a class="site-logo" href="./"><strong>张三</strong></a>
      <nav class="site-nav" aria-label="主导航">
        <ul>
          <li><a href="./">文章</a></li>
          <li><a href="about.html" aria-current="page">关于</a></li>
          <li>
            <button class="theme-toggle" type="button" aria-label="切换深色模式">
              <svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"/>
              </svg>
              <svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="5"/>
                <path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"
                      stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
              </svg>
            </button>
          </li>
        </ul>
      </nav>
    </div>
  </header>

  <main id="main">
    <div class="prose-width">
      <article class="prose">
        <h1>关于我</h1>
        <p>前端开发者，关注 CSS 布局、浏览器渲染原理与可访问性。</p>

        <figure>
          <img src="assets/avatar.jpg" alt="张三的头像" width="160" height="160"
               style="border-radius:50%">
          <figcaption>张三</figcaption>
        </figure>

        <h2>联系方式</h2>
        <p>通过下面的表单给我留言，或者发邮件到
          <a href="mailto:hi@example.com">hi@example.com</a>。
        </p>
      </article>

      <section aria-labelledby="contact-heading" style="margin-top:3rem">
        <h2 id="contact-heading" class="section-heading">给我留言</h2>

        <form id="contact-form" novalidate>
          <div class="form-field">
            <label for="name">姓名 <span class="required" aria-hidden="true">*</span></label>
            <input type="text" id="name" name="name" required
                   minlength="2" maxlength="30" autocomplete="name"
                   aria-describedby="name-error">
            <p class="form-error" id="name-error" aria-live="polite"></p>
          </div>

          <div class="form-field">
            <label for="email">邮箱 <span class="required" aria-hidden="true">*</span></label>
            <input type="email" id="email" name="email" required
                   autocomplete="email" placeholder="you@example.com"
                   aria-describedby="email-error">
            <p class="form-error" id="email-error" aria-live="polite"></p>
          </div>

          <div class="form-field">
            <label for="subject">主题</label>
            <select id="subject" name="subject">
              <option value="general">一般咨询</option>
              <option value="feedback">内容反馈</option>
              <option value="collab">合作意向</option>
            </select>
          </div>

          <div class="form-field">
            <label for="message">留言内容 <span class="required" aria-hidden="true">*</span></label>
            <textarea id="message" name="message" rows="6" required
                      minlength="10" maxlength="1000"
                      aria-describedby="message-error message-hint"></textarea>
            <p id="message-hint" style="font-size:.75rem;color:var(--color-text-faint)">
              10 到 1000 字。
            </p>
            <p class="form-error" id="message-error" aria-live="polite"></p>
          </div>

          <button type="submit" class="btn btn--primary" id="submit-btn">
            发送留言
          </button>

          <p id="form-status" role="status" aria-live="polite"
             style="margin-top:1rem;font-size:.875rem"></p>
        </form>
      </section>
    </div>
  </main>

  <footer class="site-footer">
    <div class="container">
      <p>© <span id="year"></span> 张三</p>
    </div>
  </footer>

  <script src="js/theme.js" defer></script>
  <script src="js/form.js" defer></script>
  <script src="js/main.js" defer></script>
</body>
</html>
```

**关键的 `aria-describedby`**：把输入框和它的错误提示、帮助文本关联起来。屏幕阅读器聚焦输入框时会一起读出这些内容，用户不用自己去猜哪里出了问题。

页面中的站内链接和资源统一使用相对路径，是为了让同一份代码既能部署在域名根目录，也能部署在 GitHub Pages 的仓库子路径。第三方脚本应固定版本；对稳定性要求更高时，下载到项目中自行托管，并纳入依赖更新与安全检查。

### 依赖与页面边界

2026-10-23 registry 核验：marked 18.1.1、DOMPurify 3.4.17。marked 的浏览器 UMD 文件位于 `lib/marked.umd.js`，不能延用旧版根目录 `marked.min.js` 路径。上面的固定 CDN 路径只是教学加载方式；生产优先自托管或加入经过核验的 SRI，不能编造 integrity 值。

三页的主题脚本应只接受 `dark` / `light`，读取存储失败时仍跟随系统，而不是整个初始化跳过：

```js
var saved = null;
try { saved = localStorage.getItem('theme'); } catch {}
var theme = saved === 'dark' || saved === 'light'
  ? saved
  : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
document.documentElement.setAttribute('data-theme', theme);
```

该片段替换 head 内对应初始化逻辑，并按 CSP 选择 hash、nonce 或外部阻塞脚本。联系表单说明应注明“演示，不会发送真实留言”；浏览器客户端更新 meta 的方案不保证社交抓取器会执行脚本，正式分享页需要静态生成或服务端输出元数据。

### 15.4 把三个页面连接成可理解的导航

首页回答有哪些内容，文章页回答当前内容是什么，关于页说明作者与联系边界。主导航顺序保持一致，当前页面用 `aria-current="page"` 表达；正文只有一个主标题，文章内部按层级组织，不为了字号效果跳过标题层级。`main`、`nav` 和 `footer` 帮助辅助技术定位区域，但同类多个导航还需要不同的名称。

链接和按钮分别表达导航与动作。查看文章用带真实 href 的链接，使新标签页、复制地址和无 JavaScript 导航仍可工作；切换主题和提交表单用按钮。不要把整张卡片变成只响应鼠标的 div，也不要在一个链接中嵌套另一个按钮。需要大点击区时保留标题链接的语义，再确保附加操作不被覆盖。

表单 label 的 `for` 应与控件 id 一一对应，错误说明在触发验证后更新，不能只有红色边框。HTML 的 required、长度与类型验证改善输入体验，却无法承担服务端安全校验。静态演示既没有真实收件箱也没有可信后端，成功文案必须明确只完成本地演示；未来接入 API 时再处理网络失败、重复提交和请求状态。

### 15.5 按缺失条件逐页验收

先从任意文章 URL 直接打开，再刷新，验证相对资源路径和返回首页入口。不要只从首页点击，因为客户端路由缓存可能掩盖深链接问题。部署到仓库子路径后逐一检查 CSS、脚本、Markdown 和图标地址；根路径 `/assets/` 与项目路径 `/my-blog/assets/` 不是同一资源。

关闭 JavaScript、拒绝存储、模拟脚本 CDN 失败和放大字号，记录仍可用的内容。主题存储失败应只是偏好无法保存，不应让整个页面空白；文章加载失败则需要明确错误和可恢复入口，不把骨架屏永久显示。内容型页面的基础可读性应尽量来自 HTML，而非依赖脚本重新生成每一段说明。

练习用 Tab 从跳转正文链接走到主导航、文章标题与表单，确认每个焦点可见且不重复进入不可见控件；在手机宽度填写最长留言并显示错误。完成标准是三页导航、直接访问、表单反馈和存储失败都具有可解释的结果。HTML 校验可以发现结构错误，但不能证明留言真的发出，也不能替代读屏、网络和响应式验证。

官方参考：[marked 文档](https://marked.js.org/)、[DOMPurify](https://github.com/cure53/DOMPurify)、[marked registry](https://registry.npmjs.org/marked)、[DOMPurify registry](https://registry.npmjs.org/dompurify)。

---
