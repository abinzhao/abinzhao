---
title: "第 33 章：React Router、Zustand 与 Zod"
description: "使用路由组织页面、Zustand 管理跨页面客户端状态，并用 Zod 验证外部数据。"
date: "2026-10-15"
category: React
tags: [React Router, Zustand, Zod]
series:
  order: 34
---
## 第 33 章 路由、状态与数据校验

路由负责“URL 对应哪个页面”，Zustand 负责“多个组件共享哪些客户端状态”，Zod 负责“外部数据是否真的符合类型”。三者职责不同，不应互相替代。

### 33.1 学习目标

- 使用 React Router 建立布局路由、列表页、详情页和 404。
- 理解 Browser Router 对静态托管回退规则的要求。
- 用 Zustand 管理收藏和筛选等客户端状态。
- 用 selector 限制组件订阅范围。
- 使用 Zod 在运行时验证 API、存储和 URL 数据。
- 从 schema 推导 TypeScript 类型，减少重复模型。

### 33.2 安装依赖

```bash
npm install react-router-dom zustand zod
```

检查实际安装版本：

```bash
npm list react-router-dom zustand zod
```

教程使用这些库的稳定公共 API。升级主版本时先查看迁移说明，再运行类型检查和路由回归。

### 33.3 定义 Zod schema

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
  featured: z.boolean().default(false),
  publishedAt: z.string().datetime(),
});

export const postsSchema = z.array(postSchema);

export type Post = z.infer<typeof postSchema>;
```

schema 是运行时真相源，`Post` 从它推导，不再手写一份可能漂移的接口。

验证 API：

```ts
// src/features/posts/post-api.ts
import { postSchema, postsSchema, type Post } from './post-schema';

export async function getPosts(
  signal?: AbortSignal,
): Promise<Post[]> {
  const response = await fetch('/data/posts.json', { signal });

  if (!response.ok) {
    throw new Error(`加载文章失败：HTTP ${response.status}`);
  }

  return postsSchema.parse(await response.json());
}

export async function getPost(
  slug: string,
  signal?: AbortSignal,
): Promise<Post> {
  const response = await fetch(
    `/data/posts/${encodeURIComponent(slug)}.json`,
    { signal },
  );

  if (!response.ok) {
    throw new Response('文章不存在', {
      status: response.status,
    });
  }

  return postSchema.parse(await response.json());
}
```

`parse()` 验证失败会抛 `ZodError`。需要在表单中展示字段错误时使用 `safeParse()`：

```ts
const result = postSchema.safeParse(payload);

if (!result.success) {
  console.error(result.error.flatten());
} else {
  console.log(result.data.title);
}
```

### 33.4 创建路由

```tsx
// src/app/router.tsx
import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from './RootLayout';
import { RouteErrorPage } from './RouteErrorPage';
import { HomePage } from '../pages/HomePage';
import { PostPage, postLoader } from '../pages/PostPage';
import { NotFoundPage } from '../pages/NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        index: true,
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

入口：

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

布局用 `<Outlet />` 渲染匹配的子路由：

```tsx
// src/app/RootLayout.tsx
import { NavLink, Outlet } from 'react-router-dom';

export function RootLayout() {
  return (
    <>
      <header>
        <a href="#main-content" className="skip-link">
          跳到正文
        </a>
        <nav aria-label="主导航">
          <NavLink to="/">文章</NavLink>
          <NavLink to="/about">关于</NavLink>
        </nav>
      </header>
      <main id="main-content">
        <Outlet />
      </main>
    </>
  );
}
```

站内导航使用 `Link` 或 `NavLink`，避免普通 `<a>` 触发整页刷新。跳到站外、下载文件或渐进增强要求真实链接时仍使用 `<a>`。

### 33.5 路由 Loader

```tsx
// src/pages/PostPage.tsx
import {
  useLoaderData,
  type LoaderFunctionArgs,
} from 'react-router-dom';
import { getPost } from '../features/posts/post-api';
import { postSchema } from '../features/posts/post-schema';

export async function postLoader({
  params,
  request,
}: LoaderFunctionArgs) {
  const slug = params.slug;

  if (!slug) {
    throw new Response('缺少文章 slug', { status: 400 });
  }

  return getPost(slug, request.signal);
}

export function PostPage() {
  const post = postSchema.parse(useLoaderData());

  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.summary}</p>
      <div>{post.content}</div>
    </article>
  );
}
```

Loader 在进入页面前开始数据请求，并接收可取消的 `request.signal`。同一个页面不要再用 Effect 重复请求。

路由错误页：

```tsx
import {
  isRouteErrorResponse,
  useRouteError,
} from 'react-router-dom';

export function RouteErrorPage() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <main>
        <h1>{error.status}</h1>
        <p>{String(error.data)}</p>
      </main>
    );
  }

  return (
    <main>
      <h1>页面加载失败</h1>
      <p>请刷新页面重试。</p>
    </main>
  );
}
```

### 33.6 静态托管与路由回退

`createBrowserRouter` 使用真实路径。直接访问 `/posts/react-hooks` 时，静态服务器必须把未知路径回退到 `index.html`。

Vercel 配置：

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

不支持回退规则的静态环境可以使用 `createHashRouter`：

```tsx
import { createHashRouter } from 'react-router-dom';

export const router = createHashRouter(routes);
```

地址会变成 `/#/posts/react-hooks`，但刷新不需要服务器改写。第 36 章会在部署前根据平台二选一。

### 33.7 Zustand Store

收藏状态需要被列表、详情和导航计数共同读取：

```ts
// src/features/favorites/favorite-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FavoriteState {
  favoriteSlugs: string[];
  toggleFavorite: (slug: string) => void;
  clearFavorites: () => void;
}

export const useFavoriteStore = create<FavoriteState>()(
  persist(
    (set) => ({
      favoriteSlugs: [],

      toggleFavorite(slug) {
        set((state) => {
          const exists = state.favoriteSlugs.includes(slug);

          return {
            favoriteSlugs: exists
              ? state.favoriteSlugs.filter((item) => item !== slug)
              : [...state.favoriteSlugs, slug],
          };
        });
      },

      clearFavorites() {
        set({ favoriteSlugs: [] });
      },
    }),
    {
      name: 'blog:favorites:v1',
      version: 1,
    },
  ),
);
```

组件只订阅需要的数据：

```tsx
export function FavoriteButton({ slug }: { slug: string }) {
  const active = useFavoriteStore((state) =>
    state.favoriteSlugs.includes(slug),
  );
  const toggleFavorite = useFavoriteStore(
    (state) => state.toggleFavorite,
  );

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => toggleFavorite(slug)}
    >
      {active ? '取消收藏' : '收藏'}
    </button>
  );
}
```

不要无选择器订阅整个 store：

```tsx
// 任意字段变化都可能让组件重渲染。
const store = useFavoriteStore();
```

Zustand 适合客户端共享状态。服务端响应缓存、重试和失效属于服务端状态问题，通常交给路由 loader 或 TanStack Query 等数据层。

### 33.8 验证持久化数据

本地存储也可能来自旧版本或被用户修改。复杂持久化状态需要迁移或校验：

```ts
import { z } from 'zod';

const favoriteStateSchema = z.object({
  state: z.object({
    favoriteSlugs: z.array(z.string()),
  }),
  version: z.number(),
});

export function readFavoriteBackup(raw: string) {
  return favoriteStateSchema.safeParse(JSON.parse(raw));
}
```

Zustand `persist` 支持 `version` 与 `migrate`。状态结构改变时升级版本，不要假设旧数据自动兼容。

### 33.9 职责边界

| 问题 | 负责工具 |
|---|---|
| URL 与页面匹配 | React Router |
| 页面进入前加载数据 | Router loader |
| 收藏、主题等客户端共享状态 | Zustand |
| API、存储、表单输入校验 | Zod |
| 组件内部短期状态 | `useState` / `useReducer` |
| 服务端缓存、重试、失效 | 路由数据层或请求库 |

### 33.10 效果验证

1. 从首页进入详情页，确认不整页刷新。
2. 直接访问详情 URL，验证托管环境回退到 `index.html`。
3. 请求不存在文章，确认进入路由错误页。
4. 修改 JSON 中的 `publishedAt` 为非法值，确认 Zod 拒绝数据。
5. 收藏文章后刷新，确认 Zustand 持久化恢复。
6. 清除或篡改 localStorage，确认应用能恢复到安全默认值。
7. 用 React DevTools Profiler 检查只读收藏数量的组件是否因无关 store 字段变化而重渲染。

---
