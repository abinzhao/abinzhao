---
title: "第 36 章：博客 v2 性能监控与 Biome 检查"
description: "加入 Web Vitals、路由性能记录、按需加载、Biome 质量门禁和静态部署验证。"
date: "2026-10-15"
category: 项目实战
tags: [Web Vitals, Biome, Performance, Deployment]
series:
  order: 37
---
## 第 36 章 性能、质量与交付

功能完成不等于项目完成。本章把性能指标、代码检查、构建和部署回归变成可重复流程，并明确哪些数据只用于本地诊断，哪些可以发送到监控端点。

### 36.1 完成标准

- 采集 LCP、INP、CLS，并能接入可选上报端点。
- 记录客户端路由切换耗时和 Long Task。
- 详情页按路由拆包，Markdown 依赖不进入首页首包。
- Biome 负责格式与静态检查。
- TypeScript、Biome 和生产构建可以一条命令验证。
- Vercel 或 GitHub Pages 的 base、路由和静态数据路径正确。
- 在桌面和移动视口完成真实浏览器回归。

### 36.2 安装工具

```bash
npm install web-vitals
npm install -D @biomejs/biome
npx biome init
```

`web-vitals` 放在生产依赖，因为浏览器运行时需要它；Biome 只在开发和 CI 使用，因此放在开发依赖。

### 36.3 Web Vitals 采集

```ts
// src/monitoring/web-vitals.ts
import type { Metric } from 'web-vitals';

interface MetricPayload {
  name: string;
  value: number;
  rating: Metric['rating'];
  delta: number;
  id: string;
  path: string;
}

function reportMetric(metric: Metric): void {
  const payload: MetricPayload = {
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    id: metric.id,
    path: location.pathname,
  };

  if (import.meta.env.DEV) {
    console.table(payload);
    return;
  }

  const endpoint =
    import.meta.env.VITE_METRICS_ENDPOINT;

  if (!endpoint) {
    return;
  }

  const body = new Blob(
    [JSON.stringify(payload)],
    { type: 'application/json' },
  );

  navigator.sendBeacon(endpoint, body);
}

export async function startWebVitals(): Promise<void> {
  const { onCLS, onINP, onLCP } =
    await import('web-vitals');

  onCLS(reportMetric);
  onINP(reportMetric);
  onLCP(reportMetric);
}
```

环境变量类型：

```ts
// src/vite-env.d.ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_METRICS_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

入口在首屏渲染后启动监控：

```tsx
// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { startWebVitals } from './monitoring/web-vitals';
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

if ('requestIdleCallback' in window) {
  window.requestIdleCallback(() => {
    void startWebVitals();
  });
} else {
  window.setTimeout(() => {
    void startWebVitals();
  }, 0);
}
```

只发送指标、评级和路径，不发送文章内容、邮箱、搜索词等用户数据。监控端点还应配置采样、保留周期和隐私说明。

常用良好阈值：

| 指标 | 良好 | 含义 |
|---|---:|---|
| LCP | ≤ 2.5 秒 | 最大内容出现速度 |
| INP | ≤ 200 毫秒 | 交互响应 |
| CLS | ≤ 0.1 | 视觉稳定性 |

本地 Lighthouse 是实验室数据，真实用户 Web Vitals 是现场数据，两者都要看。

### 36.4 路由切换测量

```tsx
// src/monitoring/RoutePerformance.tsx
import { useEffect, useRef } from 'react';
import { useLocation, useNavigation } from 'react-router-dom';

export function RoutePerformance() {
  const navigation = useNavigation();
  const location = useLocation();
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (navigation.state === 'loading') {
      startedAt.current = performance.now();
      return;
    }

    if (
      navigation.state === 'idle' &&
      startedAt.current !== null
    ) {
      const duration =
        performance.now() - startedAt.current;

      if (import.meta.env.DEV) {
        console.info(
          `路由 ${location.pathname}：${duration.toFixed(1)}ms`,
        );
      }

      startedAt.current = null;
    }
  }, [location.pathname, navigation.state]);

  return null;
}
```

放进 `RootLayout`：

```tsx
<RoutePerformance />
<Outlet />
```

该指标包含 loader 与页面切换过程，适合比较改动前后趋势，不等于浏览器标准指标。

### 36.5 Long Task 观察

```ts
// src/monitoring/long-tasks.ts
export function observeLongTasks(): () => void {
  if (
    !('PerformanceObserver' in window) ||
    !PerformanceObserver.supportedEntryTypes.includes(
      'longtask',
    )
  ) {
    return () => {};
  }

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (import.meta.env.DEV) {
        console.warn(
          `Long Task：${entry.duration.toFixed(1)}ms`,
        );
      }
    }
  });

  observer.observe({
    type: 'longtask',
    buffered: true,
  });

  return () => observer.disconnect();
}
```

Long Task 表示主线程连续占用超过约 50ms。看到记录后，应通过 Performance 面板定位具体调用栈，不要只为了消除日志把阈值调大。

### 36.6 按路由拆包

首页不需要 Markdown 渲染器，把详情页改成路由级懒加载：

```tsx
// src/app/router.tsx
import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from './RootLayout';
import { RouteErrorPage } from './RouteErrorPage';
import {
  HomePage,
  homeLoader,
} from '../pages/HomePage';
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
        lazy: async () => {
          const module = await import(
            '../pages/PostPage'
          );

          return {
            Component: module.PostPage,
            loader: module.postLoader,
          };
        },
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);
```

构建后检查输出：

```bash
npm run build
```

`dist/assets` 中应出现独立的详情页 chunk。打开首页时 Network 不应请求该 chunk，进入文章页时才加载。

不要把所有小组件都动态导入。优先拆分：

- 路由级页面。
- 大型编辑器、图表、Markdown、代码高亮。
- 只有用户触发后才出现的重功能。

### 36.7 避免常见性能问题

**并行启动独立请求**

```ts
const [posts, profile] = await Promise.all([
  getPosts(),
  getProfile(),
]);
```

**不复制派生状态**

```tsx
const visiblePosts = posts.filter(matchesFilters);
```

**Zustand 使用精确 selector**

```tsx
const favoriteCount = useFavoriteStore(
  (state) => state.favoriteSlugs.length,
);
```

**不要机械使用 `memo`、`useMemo` 和 `useCallback`**

先用 React DevTools Profiler 找到耗时组件，再优化稳定 Props 和昂贵计算。简单组件重新渲染通常比维护错误缓存更便宜。

**为图片预留尺寸**

```tsx
<img
  src={post.coverUrl}
  alt=""
  width={960}
  height={540}
  loading="lazy"
/>
```

首屏主图不要懒加载，应根据实际页面设置优先级；列表后续图片才使用 `loading="lazy"`。

**长列表减少浏览器工作**

```css
.post-card {
  content-visibility: auto;
  contain-intrinsic-size: 20rem;
}
```

使用前在目标浏览器验证滚动、查找和无障碍行为。

### 36.8 Biome 配置

运行 `npx biome init` 后，将规则收敛为项目需要的最小配置：

```json
{
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 80
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  }
}
```

以当前安装版本生成的配置为准。如果 `biome init` 生成了 `$schema`，保留它，不要手写旧版本 schema 地址。

更新脚本：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -b --pretty false",
    "check": "biome check src",
    "check:write": "biome check --write src",
    "verify": "npm run typecheck && npm run check && npm run build"
  }
}
```

先检查，再明确执行自动修复：

```bash
npm run check
npm run check:write
```

自动修复后必须审查 Diff，不能把“工具能改”当成“行为一定正确”。

### 36.9 部署路径

数据请求应尊重 Vite 的 base：

```ts
const postsUrl = new URL(
  'data/posts.json',
  `${location.origin}${import.meta.env.BASE_URL}`,
);

const response = await fetch(postsUrl, { signal });
```

部署在域名根路径：

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
});
```

部署到 GitHub Pages 项目路径：

```ts
export default defineConfig({
  plugins: [react()],
  base: '/blog-v2/',
});
```

Browser Router 还要设置相同 basename：

```tsx
createBrowserRouter(routes, {
  basename: import.meta.env.BASE_URL,
});
```

平台选择：

- Vercel：使用 Browser Router，并配置所有应用路由回退到 `index.html`。
- GitHub Pages：最简单可靠的是 `createHashRouter`；如果坚持真实路径，需要额外 404 重定向方案并完整测试。

Vercel 的 `vercel.json`：

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

### 36.10 生产验证

先执行自动门禁：

```bash
npm run verify
npm run preview
```

再在真实浏览器检查：

| 范围 | 验证 |
|---|---|
| 首页 | 数据加载、搜索、标签、空结果 |
| 详情 | 直达 URL、Markdown、收藏、反馈 |
| 异常 | JSON 错误、404、断网、存储不可用 |
| 状态 | 刷新后收藏、表单错误、提交 pending |
| 响应式 | 390px、768px、1440px，无横向溢出 |
| 键盘 | 跳转链接、导航、筛选、收藏、表单 |
| 性能 | LCP、INP、CLS、Long Task、路由耗时 |
| 构建 | 首页首包不含详情页 Markdown chunk |
| 线上 | 刷新详情路由、静态 JSON、base、HTTPS |

建议预算：

- 初始 JavaScript gzip 后控制在 150KB 左右，再根据功能调整。
- LCP 良好样本目标不超过 2.5 秒。
- INP 良好样本目标不超过 200ms。
- CLS 不超过 0.1。
- Lighthouse Performance 与 Accessibility 均达到 90 以上。

预算是报警线，不是为了跑分牺牲可用性。出现回归时保留构建体积、Profiler、Performance 录制和真实指标作为证据。

### 36.11 阶段 2 验收

- [ ] 能解释作用域、闭包、原型和事件循环。
- [ ] 能处理 Promise 错误、取消请求和并发。
- [ ] 能正确使用事件委托和三类 Observer。
- [ ] 浏览器能力有权限、兼容和失败兜底。
- [ ] TypeScript 开启严格模式，外部数据从 `unknown` 开始。
- [ ] React 状态最小化，Effect 只同步外部系统。
- [ ] React 19 表单有 pending、字段错误和成功状态。
- [ ] 路由、Zustand、Zod 职责清楚。
- [ ] 博客 v2 可以构建、预览和静态部署。
- [ ] Biome、类型检查和构建全部通过。
- [ ] 性能指标可观察，关键流程已在移动端和桌面端回归。

完成这些项目后，阶段 2 的重点不是“会写 React 语法”，而是已经能把浏览器能力、类型边界、组件状态、数据校验和交付质量组织成一个可维护的前端应用。

---
