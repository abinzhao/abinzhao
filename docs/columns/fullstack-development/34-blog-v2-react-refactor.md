---
title: "第 34 章：博客 v2 的 React + TypeScript 重构"
description: "把静态博客重构为 Vite、React 19、TypeScript、路由和组件驱动的应用。"
date: "2026-10-15"
category: 项目实战
tags: [React, TypeScript, Vite, Blog]
series:
  order: 35
---
## 第 34 章 博客 v2 架构与基础页面

博客 v2 不改变 v1 的内容目标，而是改变代码组织方式：静态 HTML 页面变成路由页面，重复结构变成组件，JSON 数据经过 Zod 校验，交互状态交给 React 管理。

### 34.1 完成标准

本章结束后应得到：

- `/` 展示文章列表。
- `/posts/:slug` 展示 Markdown 正文。
- 未知地址展示 404。
- 数据加载失败进入路由错误页。
- 所有 JSON 在进入组件前经过 Zod 校验。
- 组件、页面、数据访问和 schema 各自有明确目录。
- `npm run build` 可以生成纯静态产物。

### 34.2 创建项目

```bash
npm create vite@latest blog-v2 -- --template react-ts
cd blog-v2
npm install
npm install react-router-dom zustand zod react-markdown rehype-sanitize
```

删除模板中不再需要的演示资源和计数器代码，再建立目录：

```text
blog-v2/
├── public/
│   └── data/
│       └── posts.json
├── src/
│   ├── app/
│   │   ├── RootLayout.tsx
│   │   ├── RouteErrorPage.tsx
│   │   └── router.tsx
│   ├── components/
│   │   └── SiteHeader.tsx
│   ├── features/
│   │   └── posts/
│   │       ├── PostCard.tsx
│   │       ├── PostList.tsx
│   │       ├── post-repository.ts
│   │       └── post-schema.ts
│   ├── pages/
│   │   ├── HomePage.tsx
│   │   ├── NotFoundPage.tsx
│   │   └── PostPage.tsx
│   ├── styles/
│   │   └── index.css
│   └── main.tsx
├── index.html
├── tsconfig.json
└── vite.config.ts
```

目录按职责划分：

- `app`：应用入口、路由和全局边界。
- `components`：跨功能共享的界面组件。
- `features/posts`：文章领域的数据、类型和组件。
- `pages`：路由级页面，负责组合功能。
- `public/data`：构建时原样复制的静态内容。

### 34.3 迁移文章数据

```json
[
  {
    "id": "post-react-components",
    "slug": "react-components",
    "title": "从静态页面到 React 组件",
    "summary": "把重复页面结构拆成可组合、可测试的组件。",
    "content": "## 为什么要拆组件\n\n组件应围绕稳定职责拆分，而不是按标签数量拆分。\n\n## 判断标准\n\n- 是否有独立输入\n- 是否重复出现\n- 是否能单独命名",
    "tags": ["React", "TypeScript"],
    "featured": true,
    "publishedAt": "2026-10-15T08:00:00.000Z"
  },
  {
    "id": "post-state-modeling",
    "slug": "state-modeling",
    "title": "先建模，再写状态",
    "summary": "用最小状态和派生数据降低同步成本。",
    "content": "## 最小状态\n\n只保存无法从其他数据推导的值。\n\n## 派生数据\n\n筛选结果应在渲染时计算。",
    "tags": ["React", "State"],
    "featured": false,
    "publishedAt": "2026-10-12T08:00:00.000Z"
  }
]
```

真实项目可以在构建时把 Markdown 文件转换成 JSON。阶段 2 先保留静态 JSON，专注组件、类型和状态。

### 34.4 Schema 与类型

```ts
// src/features/posts/post-schema.ts
import { z } from 'zod';

export const postSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(240),
  content: z.string().min(1),
  tags: z.array(z.string().min(1)),
  featured: z.boolean(),
  publishedAt: z.string().datetime(),
});

export const postsSchema = z.array(postSchema);

export type Post = z.infer<typeof postSchema>;
```

数据访问层只负责请求和校验：

```ts
// src/features/posts/post-repository.ts
import {
  postsSchema,
  type Post,
} from './post-schema';

export async function getPosts(
  signal?: AbortSignal,
): Promise<Post[]> {
  const response = await fetch('/data/posts.json', { signal });

  if (!response.ok) {
    throw new Error(`加载文章失败：HTTP ${response.status}`);
  }

  return postsSchema.parse(await response.json());
}

export async function getPostBySlug(
  slug: string,
  signal?: AbortSignal,
): Promise<Post> {
  const posts = await getPosts(signal);
  const post = posts.find((item) => item.slug === slug);

  if (!post) {
    throw new Response('文章不存在', { status: 404 });
  }

  return post;
}
```

组件不直接 `fetch`，页面也不关心 JSON 校验细节。

### 34.5 文章卡片组件

```tsx
// src/features/posts/PostCard.tsx
import { Link } from 'react-router-dom';
import type { Post } from './post-schema';

export interface PostCardProps {
  post: Post;
}

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

export function PostCard({ post }: PostCardProps) {
  return (
    <article className="post-card">
      {post.featured ? (
        <span className="post-card__badge">精选</span>
      ) : null}

      <h2 className="post-card__title">
        <Link to={`/posts/${post.slug}`}>
          {post.title}
        </Link>
      </h2>

      <p className="post-card__summary">{post.summary}</p>

      <div className="post-card__meta">
        <time dateTime={post.publishedAt}>
          {dateFormatter.format(new Date(post.publishedAt))}
        </time>
        <ul className="tag-list" aria-label="文章标签">
          {post.tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}
```

卡片只接收完整的 `Post`，因为它展示的字段都属于文章摘要。如果未来摘要模型与正文模型明显分开，再从 schema 派生 `PostSummary`。

列表组件处理空状态：

```tsx
// src/features/posts/PostList.tsx
import { PostCard } from './PostCard';
import type { Post } from './post-schema';

export function PostList({
  posts,
}: {
  posts: readonly Post[];
}) {
  if (posts.length === 0) {
    return <p className="empty-state">没有匹配的文章。</p>;
  }

  return (
    <div className="post-grid">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}
```

### 34.6 首页

Loader 负责请求，页面负责组合：

```tsx
// src/pages/HomePage.tsx
import {
  useLoaderData,
  type LoaderFunctionArgs,
} from 'react-router-dom';
import { PostList } from '../features/posts/PostList';
import { getPosts } from '../features/posts/post-repository';
import { postsSchema } from '../features/posts/post-schema';

export function homeLoader({ request }: LoaderFunctionArgs) {
  return getPosts(request.signal);
}

export function HomePage() {
  const posts = postsSchema.parse(useLoaderData());

  return (
    <section className="page-section">
      <header className="page-heading">
        <p className="eyebrow">BLOG V2</p>
        <h1>文章</h1>
        <p>记录 Web 开发、工程实践与问题复盘。</p>
      </header>

      <PostList posts={posts} />
    </section>
  );
}
```

### 34.7 文章页

```tsx
// src/pages/PostPage.tsx
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import {
  useLoaderData,
  type LoaderFunctionArgs,
} from 'react-router-dom';
import { getPostBySlug } from '../features/posts/post-repository';
import { postSchema } from '../features/posts/post-schema';

export function postLoader({
  params,
  request,
}: LoaderFunctionArgs) {
  const slug = params.slug;

  if (!slug) {
    throw new Response('缺少文章地址', { status: 400 });
  }

  return getPostBySlug(slug, request.signal);
}

export function PostPage() {
  const post = postSchema.parse(useLoaderData());

  return (
    <article className="article-page">
      <header className="article-header">
        <p>{post.tags.join(' · ')}</p>
        <h1>{post.title}</h1>
        <p>{post.summary}</p>
        <time dateTime={post.publishedAt}>
          {new Intl.DateTimeFormat('zh-CN', {
            dateStyle: 'long',
          }).format(new Date(post.publishedAt))}
        </time>
      </header>

      <div className="article-content">
        <Markdown rehypePlugins={[rehypeSanitize]}>
          {post.content}
        </Markdown>
      </div>
    </article>
  );
}
```

`react-markdown` 默认不会把 Markdown 中的原始 HTML 直接当作 HTML 执行；`rehype-sanitize` 为后续扩展插件保留明确净化边界。不要为了支持任意 HTML 轻易加入 `rehype-raw`。

### 34.8 全局布局

```tsx
// src/components/SiteHeader.tsx
import { NavLink } from 'react-router-dom';

export function SiteHeader() {
  return (
    <header className="site-header">
      <NavLink to="/" className="site-logo">
        ABIN LAB
      </NavLink>
      <nav aria-label="主导航">
        <NavLink to="/">文章</NavLink>
      </nav>
    </header>
  );
}
```

```tsx
// src/app/RootLayout.tsx
import {
  Outlet,
  ScrollRestoration,
} from 'react-router-dom';
import { SiteHeader } from '../components/SiteHeader';

export function RootLayout() {
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        跳到正文
      </a>
      <SiteHeader />
      <main id="main-content" className="site-container">
        <Outlet />
      </main>
      <ScrollRestoration />
    </div>
  );
}
```

### 34.9 错误页与 404

```tsx
// src/app/RouteErrorPage.tsx
import {
  isRouteErrorResponse,
  Link,
  useRouteError,
} from 'react-router-dom';

export function RouteErrorPage() {
  const error = useRouteError();

  const title = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : '页面加载失败';

  const message = isRouteErrorResponse(error)
    ? String(error.data)
    : '请稍后刷新重试。';

  return (
    <main className="status-page">
      <h1>{title}</h1>
      <p>{message}</p>
      <Link to="/">返回文章列表</Link>
    </main>
  );
}
```

```tsx
// src/pages/NotFoundPage.tsx
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="status-page">
      <h1>页面不存在</h1>
      <p>地址可能已更改，或内容已经下线。</p>
      <Link to="/">返回文章列表</Link>
    </section>
  );
}
```

### 34.10 路由与入口

```tsx
// src/app/router.tsx
import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from './RootLayout';
import { RouteErrorPage } from './RouteErrorPage';
import {
  HomePage,
  homeLoader,
} from '../pages/HomePage';
import {
  PostPage,
  postLoader,
} from '../pages/PostPage';
import { NotFoundPage } from '../pages/NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        index: true,
        loader: homeLoader,
        element: <HomePage />,
      },
      {
        path: 'posts/:slug',
        loader: postLoader,
        element: <PostPage />,
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);
```

```tsx
// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import './styles/index.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('缺少 #root 挂载节点');
}

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
```

### 34.11 样式迁移

v1 的设计令牌、排版、卡片和响应式规则可以直接迁移。不要把 CSS 全改成行内样式。先保证类名职责清楚：

```css
/* src/styles/index.css */
:root {
  color: #171717;
  background: #f7f7f5;
  font-family: Inter, system-ui, sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

a {
  color: inherit;
}

.site-container {
  width: min(100% - 2rem, 72rem);
  margin-inline: auto;
  padding-block: 5rem;
}

.site-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 4rem;
  padding-inline: max(1rem, calc((100% - 72rem) / 2));
  background: rgb(247 247 245 / 92%);
  border-bottom: 1px solid #d4d4d4;
  backdrop-filter: blur(12px);
}

.post-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
  gap: 1rem;
}

.post-card {
  padding: 1.25rem;
  background: #fff;
  border: 1px solid #d4d4d4;
  border-radius: 8px;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0;
  list-style: none;
}

.article-page {
  width: min(100%, 46rem);
  margin-inline: auto;
}

.article-content {
  line-height: 1.75;
}

.skip-link {
  position: fixed;
  top: 0.5rem;
  left: 0.5rem;
  z-index: 100;
  transform: translateY(-200%);
}

.skip-link:focus {
  transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
```

### 34.12 效果验证

```bash
npm run dev
npm run build
```

逐项检查：

1. 首页能加载两篇文章。
2. 点击标题进入正确详情页，刷新后仍能访问。
3. Markdown 标题、段落和列表正确渲染。
4. 手动破坏一条 JSON 字段，页面进入错误边界。
5. 访问未知路由，显示 404。
6. Network 中 `/data/posts.json` 返回 200。
7. 键盘可以聚焦跳转链接、导航和文章链接。
8. 390px 宽度无横向滚动。

---
