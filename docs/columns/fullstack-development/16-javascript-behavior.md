---
title: "第 16 章：静态博客 JavaScript 交互"
description: "实现主题切换、文章加载、Markdown 渲染、表单验证和通用交互。"
date: '2026-10-23'
category: 项目实战
tags: [JavaScript, DOM, 网页存储]
series:
  order: 17
---
## 第 16 章 JavaScript

### 16.1 theme.js —— 主题切换

```js
// js/theme.js
(function () {
  const STORAGE_KEY = 'theme';
  const root = document.documentElement;

  function getSystemTheme() {
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function getStoredTheme() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === 'dark' || value === 'light' ? value : null;
    } catch {
      return null;   // 隐私模式等场景
    }
  }

  function storeTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
  }

  function applyTheme(theme, animate = false) {
    if (animate) {
      root.classList.add('theme-transitioning');
      // 过渡结束后移除，避免常驻导致首次加载闪烁
      setTimeout(() => root.classList.remove('theme-transitioning'), 300);
    }
    root.setAttribute('data-theme', theme);
    updateToggleLabel(theme);
  }

  function updateToggleLabel(theme) {
    const btn = document.querySelector('.theme-toggle');
    if (!btn) return;
    const next = theme === 'dark' ? '亮色' : '暗色';
    btn.setAttribute('aria-label', `切换到${next}模式`);
  }

  function toggle() {
    const current = root.getAttribute('data-theme') || getSystemTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    storeTheme(next);
    applyTheme(next, true);
  }

  // 初始化：HTML head 里的内联脚本已设好 data-theme，这里只同步按钮文案
  const initial = root.getAttribute('data-theme') || getSystemTheme();
  applyTheme(initial, false);

  // 绑定按钮
  document.querySelectorAll('.theme-toggle').forEach(btn => {
    btn.addEventListener('click', toggle);
  });

  // 用户没手动选过时，跟随系统变化
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (getStoredTheme()) return;
    applyTheme(e.matches ? 'dark' : 'light', true);
  });

  // 暴露给其他模块
  window.__theme = { toggle, applyTheme };
})();
```

**为什么要用内联脚本在 `<head>` 里先设 `data-theme`？**

如果等 `theme.js` 加载完再设置，页面会先以亮色渲染，然后瞬间变暗——这就是「主题闪烁（FOUC）」。内联脚本是同步执行的，在浏览器第一次绘制之前就设置好了属性，避免了闪烁。

### 16.2 posts.js —— 加载文章列表

```js
// js/posts.js

/** 格式化日期 */
function formatDate(iso) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(d);
}

/** 转义 HTML，防止文章元数据里的特殊字符破坏结构 */
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** 创建一张文章卡片 */
function createCard(post, index) {
  const article = document.createElement('article');
  article.className = 'post-card stagger';
  article.style.setProperty('--i', index);
  // 卡片整体可点击：用相对定位 + 绝对定位的伪元素覆盖
  article.style.position = 'relative';

  article.innerHTML = `
    <h3 class="post-card__title">
      <a href="post.html?slug=${encodeURIComponent(post.slug)}">
        ${escapeHTML(post.title)}
      </a>
    </h3>
    <p class="post-card__excerpt">${escapeHTML(post.excerpt)}</p>
    <div class="post-card__meta">
      <time datetime="${escapeHTML(post.date)}">${formatDate(post.date)}</time>
      <span aria-hidden="true">·</span>
      <span>${escapeHTML(String(post.readingTime))} 分钟阅读</span>
    </div>
    ${post.tags?.length
      ? `<div class="post-card__tags">${
          post.tags.map(t => `<span class="tag">${escapeHTML(t)}</span>`).join('')
        }</div>`
      : ''}
  `;

  return article;
}

async function loadPosts() {
  const grid = document.getElementById('post-grid');
  const status = document.getElementById('posts-status');
  if (!grid) return;

  try {
    const res = await fetch('posts/index.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const posts = await res.json();

    if (!posts.length) {
      status.textContent = '还没有文章。';
      return;
    }

    // 按日期倒序
    posts.sort((a, b) => new Date(b.date) - new Date(a.date));

    // 用 DocumentFragment 组织批量插入，避免中途读取布局
    const frag = document.createDocumentFragment();
    posts.forEach((p, i) => frag.appendChild(createCard(p, i)));

    grid.appendChild(frag);
    status.remove();   // 加载完成后移除状态提示

  } catch (err) {
    console.error('加载文章失败', err);
    status.textContent = '文章加载失败，请刷新页面重试。';
    status.style.color = 'var(--color-danger)';
  }
}

document.addEventListener('DOMContentLoaded', loadPosts);
```

**`DocumentFragment` 的意义**：先组织节点，再一次接入 DOM；直接连续 appendChild 也可能被浏览器批处理，不等于每次都立即重排。真正需要避免的是在插入之间读取失效的布局。

**`escapeHTML`**：即使是自己的 Markdown 文件，也不应该信任其中的内容直接拼进 `innerHTML`。这是养成安全习惯的问题。

### 16.3 post.js —— 文章详情

```js
// js/post.js

// ---- 工具 ----
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(iso) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric'
  }).format(new Date(iso));
}

function getSlug() {
  return new URLSearchParams(location.search).get('slug');
}

// ---- 从 Markdown 提取目录 ----
function buildTOC(container) {
  const headings = container.querySelectorAll('h2, h3');
  if (headings.length < 2) return;

  const toc = document.getElementById('toc');
  const list = document.getElementById('toc-list');
  if (!toc || !list) return;

  const frag = document.createDocumentFragment();

  headings.forEach((h) => {
    // 生成锚点 id
    if (!h.id) {
      h.id = h.textContent
        .trim()
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
        .replace(/^-|-$/g, '');
    }

    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#${h.id}`;
    a.textContent = h.textContent;
    if (h.tagName === 'H3') a.className = 'toc-h3';

    li.appendChild(a);
    frag.appendChild(li);
  });

  list.appendChild(frag);
  toc.hidden = false;

  // 滚动时高亮当前章节
  setupTOCHighlight(headings, list);
}

function setupTOCHighlight(headings, list) {
  const links = new Map();
  list.querySelectorAll('a').forEach(a => {
    links.set(a.getAttribute('href').slice(1), a);
  });

  const setActive = (id) => {
    links.forEach((a, key) => {
      if (key === id) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  };

  const observer = new IntersectionObserver((entries) => {
    // entries 只包含本次状态变化的标题，不是全部可见标题
    const visible = entries
      .filter(e => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible.length) setActive(visible[0].target.id);
  }, {
    rootMargin: '-80px 0px -70% 0px',
    threshold: 0
  });

  headings.forEach(h => observer.observe(h));
}

// ---- 阅读进度条 ----
function setupProgress() {
  const bar = document.getElementById('progress');
  if (!bar) return;

  let ticking = false;

  function update() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? scrollTop / docHeight : 0;
    // 用 scaleX 而不是 width，只触发合成
    bar.style.transform = `scaleX(${Math.min(progress, 1)})`;
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }, { passive: true });

  update();
}

// ---- 上一篇 / 下一篇 ----
function renderPostNav(allPosts, currentSlug) {
  const sorted = [...allPosts].sort((a, b) => new Date(b.date) - new Date(a.date));
  const idx = sorted.findIndex(p => p.slug === currentSlug);
  if (idx === -1) return;

  const nav = document.getElementById('post-nav');
  const prev = document.getElementById('prev-link');
  const next = document.getElementById('next-link');
  if (!nav) return;

  // 列表里越靠前越新；「上一篇」= 更新的那篇
  if (idx > 0) {
    prev.href = `post.html?slug=${encodeURIComponent(sorted[idx - 1].slug)}`;
    prev.textContent = `← ${sorted[idx - 1].title}`;
  } else {
    prev.remove();
  }

  if (idx < sorted.length - 1) {
    next.href = `post.html?slug=${encodeURIComponent(sorted[idx + 1].slug)}`;
    next.textContent = `${sorted[idx + 1].title} →`;
  } else {
    next.remove();
  }

  nav.hidden = false;
}

// ---- 主流程 ----
async function loadPost() {
  const article = document.getElementById('article');
  const slug = getSlug();

  if (!slug) {
    article.innerHTML = '<h1>文章不存在</h1><p>缺少 slug 参数。</p>';
    return;
  }

  try {
    const [mdRes, indexRes] = await Promise.all([
      fetch(`posts/${encodeURIComponent(slug)}.md`),
      fetch('posts/index.json', { cache: 'no-cache' })
    ]);

    if (!mdRes.ok) throw new Error(`文章不存在（HTTP ${mdRes.status}）`);

    const markdown = await mdRes.text();
    const posts = indexRes.ok ? await indexRes.json() : [];
    const meta = posts.find(p => p.slug === slug);

    // 配置 Markdown 解析行为。marked 只负责解析，不负责安全净化。
    marked.setOptions({
      gfm: true,
      breaks: false
    });

    const unsafeHTML = marked.parse(markdown);
    article.innerHTML = DOMPurify.sanitize(unsafeHTML, {
      USE_PROFILES: { html: true }
    });

    // 更新页面标题和 meta
    if (meta) {
      document.title = `${meta.title} · 张三的博客`;
      const desc = document.getElementById('meta-desc');
      if (desc) desc.setAttribute('content', meta.excerpt || '');

      // 在正文前插入元信息
      const header = document.createElement('header');
      header.innerHTML = `
        <h1>${escapeHTML(meta.title)}</h1>
        <p style="color:var(--color-text-muted);font-size:.875rem">
          <time datetime="${escapeHTML(meta.date)}">${formatDate(meta.date)}</time>
          · ${escapeHTML(String(meta.readingTime))} 分钟阅读
          ${meta.tags?.length
            ? ' · ' + meta.tags.map(t => `<span class="tag">${escapeHTML(t)}</span>`).join(' ')
            : ''}
        </p>
      `;
      article.insertBefore(header, article.firstChild);

      renderPostNav(posts, slug);
    }

    buildTOC(article);
    setupProgress();

    // 支持带 hash 直接访问
    if (location.hash) {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      target?.scrollIntoView();
    }

  } catch (err) {
    console.error(err);
    article.innerHTML = `
      <h1>加载失败</h1>
      <p style="color:var(--color-danger)">${escapeHTML(err.message)}</p>
      <p><a href="./">← 返回首页</a></p>
    `;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
    document.getElementById('article').innerHTML =
      '<h1>加载失败</h1><p>文章解析依赖未能加载。</p>';
    return;
  }
  loadPost();
});
```

**`requestAnimationFrame` 合并滚动更新**：ticking 使同帧多次事件只安排一次写入，但 scroll 与渲染可能本来就按近似频率调度；需要降低计算频率时还应使用明确时间节流或 IntersectionObserver。

**`{ passive: true }`**：告诉浏览器这个监听器不会调用 `preventDefault()`。浏览器可以立即滚动而不用等 JS 执行完，滚动更流畅。

**关于 `innerHTML` 和 XSS**：`marked.parse()` 输出的是 HTML 字符串，不会负责安全净化。即使 Markdown 当前由自己维护，也应把内容文件、同步来源和依赖被篡改的风险考虑进去，因此示例在写入 DOM 前统一通过 DOMPurify：

```js
const unsafeHTML = marked.parse(markdown);
article.innerHTML = DOMPurify.sanitize(unsafeHTML, {
  USE_PROFILES: { html: true }
});
```

净化不能替代响应头和依赖治理。部署时仍应固定第三方库版本，配置合理的 Content Security Policy，并避免把不可信字符串拼进脚本、事件属性或 URL。

### 16.4 form.js —— 表单验证

```js
// js/form.js

const VALIDATORS = {
  name(v) {
    if (!v.trim()) return '请填写姓名';
    if (v.trim().length < 2) return '姓名至少 2 个字符';
    if (v.length > 30) return '姓名不能超过 30 个字符';
    return '';
  },
  email(v) {
    if (!v.trim()) return '请填写邮箱';
    // 不要试图用正则完整验证邮箱，HTML5 的规则已经足够
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return '邮箱格式不正确';
    return '';
  },
  message(v) {
    if (!v.trim()) return '请填写留言内容';
    if (v.trim().length < 10) return '留言至少 10 个字符';
    if (v.length > 1000) return '留言不能超过 1000 个字符';
    return '';
  }
};

function initContactForm() {
  const form = document.getElementById('contact-form');
  if (!form) return;

  const status = document.getElementById('form-status');
  const submitBtn = document.getElementById('submit-btn');

  /** 校验单个字段，显示/清除错误 */
  function validateField(field) {
    const validator = VALIDATORS[field.name];
    if (!validator) return true;

    const msg = validator(field.value);
    const errorEl = document.getElementById(`${field.name}-error`);

    if (errorEl) errorEl.textContent = msg;

    field.setAttribute('aria-invalid', msg ? 'true' : 'false');

    return !msg;
  }

  // 失焦时校验（不要在每次输入时就报错，用户还没写完）
  form.querySelectorAll('input, textarea').forEach((field) => {
    if (!VALIDATORS[field.name]) return;

    field.addEventListener('blur', () => {
      if (field.value.trim()) validateField(field);
    });

    // 已经报过错的字段，输入时实时清除错误
    field.addEventListener('input', () => {
      if (field.getAttribute('aria-invalid') === 'true') {
        validateField(field);
      }
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fields = [...form.elements].filter(el => VALIDATORS[el.name]);

    // 一次性校验全部，不要短路（用户想知道所有问题）
    const results = fields.map(f => validateField(f));
    const firstInvalid = fields[results.indexOf(false)];

    if (firstInvalid) {
      firstInvalid.focus();
      firstInvalid.scrollIntoView({ block: 'center', behavior: 'smooth' });
      status.textContent = '请检查表单中标红的字段。';
      status.style.color = 'var(--color-danger)';
      return;
    }

    // 提交
    submitBtn.disabled = true;
    submitBtn.textContent = '发送中…';
    status.textContent = '';

    try {
      const data = Object.fromEntries(new FormData(form));

      // 真实项目替换为你的后端地址
      // const res = await fetch('/api/contact', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(data)
      // });
      // if (!res.ok) throw new Error(`HTTP ${res.status}`);

      await new Promise(r => setTimeout(r, 800));   // 模拟请求

      status.textContent = '演示提交完成，未发送或保存真实留言。';
      status.style.color = 'var(--color-success)';
      form.reset();

    } catch (err) {
      console.error(err);
      status.textContent = '发送失败，请稍后重试或直接发邮件。';
      status.style.color = 'var(--color-danger)';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '发送留言';
    }
  });
}

document.addEventListener('DOMContentLoaded', initContactForm);
```

**校验时机的经验**：

- **首次输入时不校验**（用户还没输完）
- **失焦时校验**（用户明确表示输入完了）
- **出错后每次输入实时校验**（让用户立即看到修正结果）
- **提交时全量校验**（兜底，并聚焦到第一个错误）

### 16.5 main.js —— 通用逻辑

```js
// js/main.js

// 页脚年份
document.addEventListener('DOMContentLoaded', () => {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
});

// 平滑锚点滚动（考虑固定头部）
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href^="#"]');
  if (!link) return;

  const id = decodeURIComponent(link.getAttribute('href').slice(1));
  if (!id) return;

  const target = document.getElementById(id);
  if (!target) return;

  e.preventDefault();

  const headerH = document.querySelector('.site-header')?.offsetHeight ?? 0;
  const top = target.getBoundingClientRect().top + window.scrollY - headerH - 16;

  window.scrollTo({
    top,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  });

  // 更新 URL 但不跳动
  history.replaceState(null, '', `#${id}`);
});
```

### 数据校验与后端衔接

HTML 文本转义不能通用于属性、URL 和脚本上下文。示例补齐 date 的属性转义，仍要校验列表为数组、slug 为受限格式、日期有效、readingTime 为正整数；更稳妥的是使用 DOM 属性赋值。`encodeURIComponent('..')` 不会消除路径段含义，文章地址应先验证 slug，例如 `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`，再读取作者维护的白名单。

目录的观察器回调只有发生交叉变化的 entries；复杂目录高亮需要维护每个标题的状态或用滚动位置统一求值，不能把 entries 当成完整可见集合。重复标题还需要唯一 id。hash 解码可能抛 URIError，应明确处理无效链接。

模拟表单不会产生网络失败，不能据此宣称异常路径已验证。真实提交在 [HTTP 契约](./38-http-openapi-contracts) 与 [毕业项目](./54-blog-v3-fullstack-capstone) 接入。原生邮箱校验用于格式辅助，不能证明邮箱存在或属于当前用户。

官方参考：[WHATWG DOM](https://dom.spec.whatwg.org/)、[Intersection Observer](https://www.w3.org/TR/intersection-observer/)、[DOMPurify 安全说明](https://github.com/cure53/DOMPurify)。

---
