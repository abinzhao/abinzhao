---
title: "第 15 章：静态博客 HTML 页面"
description: "完成首页、文章页与关于页的语义结构、元数据和表单。"
date: "2026-10-15"
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
  <script src="https://cdn.jsdelivr.net/npm/marked@15.0.12/marked.min.js" defer></script>
  <script src="https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.min.js" defer></script>
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

---
