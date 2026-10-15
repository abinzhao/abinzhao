---
title: "第 18 章：静态站点部署"
description: "将静态博客部署到 GitHub Pages 或 Vercel，并正确处理路径和缓存。"
date: "2026-10-15"
category: 部署发布
tags: [GitHub Pages, Vercel, Deployment]
series:
  order: 19
---
## 第 18 章 部署

### 18.1 GitHub Pages

#### 步骤

**1. 建仓库**

在 GitHub 上新建一个仓库，命名随意，比如 `blog`。不要勾选 "Add a README"，避免冲突。

**2. 本地初始化并推送**

```bash
cd blog
git init
git add .
git commit -m "init: blog v1"
git branch -M main
git remote add origin https://github.com/你的用户名/blog.git
git push -u origin main
```

**3. 开启 Pages**

进入仓库 → Settings → Pages：

- **Source**：选 `Deploy from a branch`
- **Branch**：选 `main`，目录选 `/ (root)`
- 点 Save

等一两分钟，访问 `https://你的用户名.github.io/blog/`。

#### 关键：路径问题

GitHub Pages 的项目站点会挂在 `/blog/` 这样的子路径下，而你本地是 `/`。所有**绝对路径**都会 404：

```html
<!-- 本地能跑，部署后 404 -->
<link rel="stylesheet" href="/css/style.css">
<a href="/about.html">关于</a>
```

三种解决方案：

**方案 A：全部改相对路径**（最简单）

```html
<link rel="stylesheet" href="css/style.css">
<a href="about.html">关于</a>
```

但 `post.html` 里的 `fetch('posts/index.json')` 相对的是当前页面 URL，如果 URL 是 `/blog/post.html`，相对路径 `posts/...` 会解析成 `/blog/posts/...`，恰好正确。

**方案 B：在 `<head>` 里加 `<base>`**

```html
<base href="/blog/">
```

这样所有相对路径都从 `/blog/` 开始解析。但 `<base>` 会影响页内锚点跳转，要小心。

**方案 C：用带仓库名的绝对路径**

```html
<link rel="stylesheet" href="/blog/css/style.css">
```

本地预览时路径就错了。

**推荐方案 A**：全部用相对路径，本地和线上行为一致，也方便以后换域名。

#### 用自定义域名

1. 在仓库根目录新建 `CNAME` 文件，内容就一行：

```
blog.example.com
```

2. 到你的域名服务商处添加 DNS 记录：

```
类型：CNAME
主机记录：blog
记录值：你的用户名.github.io
```

3. 回 GitHub Pages 设置里填 Custom domain，勾选 Enforce HTTPS。

### 18.2 Vercel

#### 方式一：Git 集成（推荐）

1. 把代码推到 GitHub
2. 打开 [vercel.com](https://vercel.com)，用 GitHub 账号登录
3. 点 **Add New → Project**，选中你的仓库
4. Framework Preset 选 **Other**（纯静态项目没有框架）
5. Build Command 和 Output Directory 都留空
6. 点 Deploy

之后每次 `git push`，Vercel 自动重新部署。每个 PR 还会生成独立的预览地址。

#### 方式二：命令行

```bash
npm i -g vercel
vercel login
vercel          # 预览部署
vercel --prod   # 生产部署
```

#### vercel.json（可选配置）

```json
{
  "cleanUrls": true,
  "trailingSlash": false,
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    },
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    }
  ]
}
```

- `cleanUrls: true`：访问 `/about` 而不是 `/about.html`
- `immutable` 缓存：静态资源（图片、字体）内容不变，可以让浏览器缓存一年

**注意**：Vercel 部署在根路径 `/`，绝对路径能正常工作。但为了本地和 GitHub Pages 都能用，还是建议统一用相对路径。

### 18.3 两个平台的对比

| | GitHub Pages | Vercel |
|---|---|---|
| 费用 | 免费 | 免费额度足够个人博客 |
| 部署速度 | 1~3 分钟 | 10~30 秒 |
| 预览部署（PR） | 无 | 有 |
| 自定义域名 | 支持 | 支持 |
| HTTPS | 支持 | 支持 |
| 国内访问 | 不稳定 | 不稳定 |
| 服务端能力 | 纯静态 | Serverless Functions、边缘函数 |
| 适合 | 纯静态站点 | 需要 API、重定向、Headers 配置 |

**国内访问**：两个平台在国内都不稳定。如果主要面向国内读者，考虑：

- **Cloudflare Pages**：比 GitHub Pages 稍好，仍需自测
- **国内对象存储 + CDN**：阿里云 OSS、腾讯云 COS，需要备案
- **Netlify**：和 Vercel 类似，国内访问情况也类似

---
