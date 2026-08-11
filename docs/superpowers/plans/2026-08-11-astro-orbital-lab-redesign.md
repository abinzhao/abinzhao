# ZJB.DEV Astro Orbital Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 Next.js 个人站一次性迁移为 Astro 静态站点，交付 `ZJB.DEV` 品牌首页、可扩展项目与博客内容系统、三个真实 Playground 实验、旧路由兼容和 GitHub Pages 发布链路。

**Architecture:** Astro 负责静态路由、内容集合和 SEO，普通页面默认零客户端框架；主题、导航与筛选使用小型原生脚本，Three.js 与 GSAP 仅在首页和 Playground 动态加载。迁移先建立可构建的 Astro 骨架和内容层，再逐页替换，最后删除 Next.js/React 运行层并切换部署产物。

**Tech Stack:** Astro、TypeScript、Astro Content Collections、Markdown/MDX、Tailwind CSS 4、Three.js、GSAP、Shiki、Vitest、Playwright、GitHub Pages

---

## 0. 实施约束与文件地图

### 迁移约束

- 每个任务遵循 RED → GREEN → REFACTOR。
- 每个任务结束时 `npm test` 和 `npm run build` 必须通过。
- 在 Task 3 之前保留旧 Next.js 文件，但 `npm run build` 从 Task 1 起只构建 Astro。
- 不迁移 React 组件；只迁移其行为、视觉令牌和测试契约。
- `.superpowers/` 必须加入 `.gitignore`，可视化草稿不进入版本库。
- 任何内容字段缺乏公开证据时保持可选或显示“未公开”，不得补造。
- 所有新增源码注释使用中文。

### 最终文件地图

| 路径 | 单一职责 |
|---|---|
| `astro.config.mjs` | Astro、MDX、Sitemap、Tailwind/Vite 与站点 URL 配置 |
| `src/content.config.ts` | 三个 Content Collection 的 Zod Schema |
| `src/lib/content.ts` | 排序、分类、相邻文章、阅读时间等纯函数 |
| `src/lib/site.ts` | 品牌、导航、公开社交链接与站点 URL |
| `src/lib/seo.ts` | canonical、Open Graph、JSON-LD 构造 |
| `src/layouts/BaseLayout.astro` | 全局 HTML、主题初始化、导航、Footer、SEO |
| `src/layouts/ContentLayout.astro` | 项目与文章详情的阅读布局 |
| `src/layouts/ExperimentLayout.astro` | Playground 说明、控制区和 Demo 容器 |
| `src/components/global/*` | BrandMark、导航、主题按钮、Footer、返回顶部 |
| `src/components/home/*` | 首页 Hero、精选项目、最新博客、实验预览 |
| `src/components/projects/*` | 项目筛选、卡片与详情元信息 |
| `src/components/blog/*` | 博客筛选、卡片、TOC、翻页、代码复制 |
| `src/components/playground/*` | 实验卡片、运行状态与通用 Canvas 外壳 |
| `src/scripts/theme.ts` | 明暗主题状态机 |
| `src/scripts/navigation.ts` | 滚动导航、移动菜单、返回顶部 |
| `src/scripts/filters.ts` | 项目与博客 URL 可恢复筛选 |
| `src/scripts/transitions.ts` | View Transitions 与 GSAP 降级 |
| `src/scripts/scenes/*` | 首页星体、粒子银河、Shader、物理模拟 |
| `src/pages/*` | 主路由、兼容路由、RSS、Sitemap、Robots、404 |
| `src/styles/*` | 设计令牌、基础排版、组件和页面样式 |
| `tests/unit/*` | 内容、主题、SEO 与实验纯逻辑 |
| `tests/e2e/*` | 路由、响应式、交互、降级和资源边界 |

---

### Task 1: 建立 Astro 构建与测试骨架

**Files:**
- Create: `astro.config.mjs`
- Create: `src/env.d.ts`
- Create: `src/pages/index.astro`
- Create: `src/styles/tokens.css`
- Create: `src/styles/base.css`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.json`
- Modify: `eslint.config.mjs`
- Modify: `vitest.config.ts`
- Modify: `playwright.config.ts`
- Modify: `.gitignore`
- Test: `tests/unit/astro-config.test.ts`

- [ ] **Step 1: 写 Astro 配置失败测试**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Astro 工程配置", () => {
  it("使用静态输出、站点 URL、MDX、Sitemap 和 Tailwind", () => {
    const config = readFileSync("astro.config.mjs", "utf8");
    expect(config).toContain('output: "static"');
    expect(config).toContain('site: "https://abinzhao.github.io"');
    expect(config).toContain("mdx()");
    expect(config).toContain("sitemap()");
    expect(config).toContain("tailwindcss()");
  });

  it("不提交视觉伴侣运行目录", () => {
    expect(readFileSync(".gitignore", "utf8")).toContain(".superpowers/");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/unit/astro-config.test.ts`

Expected: FAIL，提示 `astro.config.mjs` 不存在。

- [ ] **Step 3: 安装 Astro 依赖并切换脚本**

Run:

```bash
npm install astro @astrojs/check @astrojs/mdx @astrojs/rss @astrojs/sitemap @tailwindcss/vite tailwindcss gsap three
npm install -D @eslint/js typescript-eslint
npm uninstall next react react-dom next-mdx-remote gray-matter rehype-slug remark-parse unified unist-util-visit mdast-util-to-string github-slugger
npm uninstall -D eslint-config-next @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @types/react @types/react-dom
```

将 `package.json` scripts 改为：

```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "astro check && astro build",
    "preview": "astro preview --host 127.0.0.1 --port 3000",
    "start": "astro preview --host 127.0.0.1 --port 3000",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 4: 写最小 Astro 配置与首页**

`astro.config.mjs`：

```js
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://abinzhao.github.io",
  output: "static",
  trailingSlash: "always",
  integrations: [mdx(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
```

`src/pages/index.astro`：

```astro
---
import "../styles/tokens.css";
import "../styles/base.css";
---

<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
    <title>ZJB.DEV</title>
  </head>
  <body>
    <main><h1>把复杂，做得有意思。</h1></main>
  </body>
</html>
```

`src/styles/tokens.css`：

```css
@theme {
  --color-orbit-bg: #080914;
  --color-orbit-text: #f4f2ff;
  --color-orbit-warm: #ff7653;
  --color-orbit-signal: #f5cf64;
  --color-orbit-violet: #7c6dff;
}
```

`src/styles/base.css`：

```css
@import "tailwindcss";

* { box-sizing: border-box; }
html { color-scheme: dark light; }
body { margin: 0; background: var(--color-bg, #080914); color: var(--color-text, #f4f2ff); }
```

- [ ] **Step 5: 更新 TypeScript、ESLint、Vitest 和 Playwright**

`tsconfig.json`：

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  }
}
```

`vitest.config.ts` 的 alias 指向 `src`，exclude 改为 `["tests/e2e/**", "node_modules/**", "dist/**"]`。

`playwright.config.ts` 的 `webServer.command` 改为 `npm run preview`。

`eslint.config.mjs` 使用 `@eslint/js` 与 `typescript-eslint` 的 recommended 配置，并忽略 `dist/**`、`.astro/**`、`.superpowers/**`。

- [ ] **Step 6: 验证骨架**

Run:

```bash
npm test -- tests/unit/astro-config.test.ts
npm run lint
npm run build
```

Expected: 2 tests PASS；Lint 无错误；`dist/index.html` 存在。

- [ ] **Step 7: 提交**

```bash
git add .gitignore astro.config.mjs package.json package-lock.json tsconfig.json eslint.config.mjs vitest.config.ts playwright.config.ts src tests/unit/astro-config.test.ts
git commit -m "build: migrate site foundation to Astro"
```

---

### Task 2: 建立类型安全内容集合并迁移真实内容

**Files:**
- Create: `src/content.config.ts`
- Create: `src/content/projects/*.mdx`
- Create: `src/content/blog/harmonyos-next-learning-path.mdx`
- Create: `src/content/playground/particle-galaxy.md`
- Create: `src/content/playground/shader-art.md`
- Create: `src/content/playground/physics-sandbox.md`
- Create: `src/lib/content.ts`
- Test: `tests/unit/content.test.ts`

- [ ] **Step 1: 写内容纯函数失败测试**

```ts
import { describe, expect, it } from "vitest";
import {
  getAdjacentEntries,
  getReadingMinutes,
  sortProjects,
} from "@/lib/content";

describe("内容展示逻辑", () => {
  it("项目按精选、权重和年份排序", () => {
    const projects = [
      { slug: "a", data: { featured: false, order: 1, year: 2026 } },
      { slug: "b", data: { featured: true, order: 3, year: 2025 } },
      { slug: "c", data: { featured: true, order: 8, year: undefined } },
    ];
    expect(sortProjects(projects).map(({ slug }) => slug)).toEqual(["c", "b", "a"]);
  });

  it("计算中文阅读时间且至少为一分钟", () => {
    expect(getReadingMinutes("短文")).toBe(1);
    expect(getReadingMinutes("文".repeat(1000))).toBe(3);
  });

  it("返回上一篇和下一篇", () => {
    const entries = [{ slug: "new" }, { slug: "current" }, { slug: "old" }];
    expect(getAdjacentEntries(entries, "current")).toEqual({
      previous: entries[0],
      next: entries[2],
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/unit/content.test.ts`

Expected: FAIL，提示 `@/lib/content` 不存在。

- [ ] **Step 3: 定义 Content Collections**

`src/content.config.ts`：

```ts
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const projects = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string().min(1),
    slug,
    summary: z.string().min(1),
    category: z.enum(["web", "backend", "harmonyos", "miniprogram", "crossplatform", "experiment"]),
    tags: z.array(z.string().min(1)).min(1),
    year: z.number().int().min(2000).max(2100).optional(),
    status: z.enum(["completed", "ongoing", "archived"]),
    role: z.string().min(1),
    repositoryUrl: z.string().url(),
    externalUrl: z.string().url().optional(),
    cover: z.string().optional(),
    featured: z.boolean().default(false),
    order: z.number().int().default(0),
    draft: z.boolean().default(false),
  }),
});

const blog = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string().min(1),
    slug,
    date: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    category: z.enum(["技术", "随笔", "折腾"]),
    subcategory: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).min(1),
    cover: z.string().optional(),
    summary: z.string().min(1),
    draft: z.boolean().default(false),
  }),
});

const playground = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/playground" }),
  schema: z.object({
    title: z.string().min(1),
    slug,
    description: z.string().min(1),
    tech: z.array(z.string().min(1)).min(1),
    preview: z.string().optional(),
    date: z.coerce.date(),
    featured: z.boolean().default(false),
    githubUrl: z.string().url().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { projects, blog, playground };
```

- [ ] **Step 4: 实现纯函数**

`src/lib/content.ts`：

```ts
type ProjectEntry = {
  slug: string;
  data: { featured: boolean; order: number; year?: number };
};

export function sortProjects<T extends ProjectEntry>(entries: T[]): T[] {
  return [...entries].sort((a, b) =>
    Number(b.data.featured) - Number(a.data.featured)
    || b.data.order - a.data.order
    || (b.data.year ?? 0) - (a.data.year ?? 0)
    || a.slug.localeCompare(b.slug, "zh-CN")
  );
}

export function getReadingMinutes(text: string): number {
  const chinese = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  const words = (text.replace(/[\u3400-\u9fff]/g, " ").match(/[A-Za-z0-9]+/g) ?? []).length;
  return Math.max(1, Math.ceil((chinese + words) / 400));
}

export function getAdjacentEntries<T extends { slug: string }>(entries: T[], slug: string) {
  const index = entries.findIndex((entry) => entry.slug === slug);
  return {
    previous: index > 0 ? entries[index - 1] : undefined,
    next: index >= 0 && index < entries.length - 1 ? entries[index + 1] : undefined,
  };
}
```

- [ ] **Step 5: 迁移 5 个项目和 1 篇文章**

将现有正文原样移动到 `src/content/`，只转换 frontmatter：

```yaml
title: HarmonyOS Next 开发知识库
slug: harmony-next-blog
summary: 围绕 HarmonyOS Next、ArkTS 与 ArkUI 整理的学习笔记和实践教程。
category: harmonyos
tags: [HarmonyOS, ArkTS, ArkUI]
status: completed
role: 公开仓库维护者
repositoryUrl: https://github.com/abinzhao/harmony-next-blog
featured: true
order: 80
draft: false
```

文章转换为：

```yaml
title: 从公开仓库整理 HarmonyOS Next 学习路径
slug: harmonyos-next-learning-path
date: 2026-08-10
category: 技术
subcategory: 鸿蒙开发
tags: [HarmonyOS, ArkTS, ArkUI]
summary: 以公开的 HarmonyOS Next 知识库为例，说明如何把 ArkTS、ArkUI 与工程实践整理成可持续维护的学习路径。
draft: false
```

- [ ] **Step 6: 创建三个真实实验说明**

三个 Markdown 文件分别声明：

```yaml
title: 粒子银河
slug: particle-galaxy
description: 用 Three.js 粒子系统和触摸力场构建的可交互银河。
tech: [Three.js, WebGL, TypeScript]
date: 2026-08-11
featured: true
draft: false
```

`shader-art.md` 使用 `slug: shader-art` 和 `[GLSL, WebGL, TypeScript]`；`physics-sandbox.md` 使用 `slug: physics-sandbox` 和 `[Canvas, Verlet, TypeScript]`。正文必须包含“实验目标”“交互方式”“性能与降级”三个二级标题。

- [ ] **Step 7: 验证集合**

Run:

```bash
npm test -- tests/unit/content.test.ts
npm run build
```

Expected: 3 tests PASS；Astro 内容校验通过；构建生成三类集合页面数据。

- [ ] **Step 8: 提交**

```bash
git add src/content.config.ts src/content src/lib/content.ts tests/unit/content.test.ts
git commit -m "feat: add typed Astro content collections"
```

---

### Task 3: 建立全局品牌壳、主题和导航

**Files:**
- Create: `src/lib/site.ts`
- Create: `src/lib/theme.ts`
- Create: `src/lib/seo.ts`
- Create: `src/layouts/BaseLayout.astro`
- Create: `src/components/global/BrandMark.astro`
- Create: `src/components/global/SiteHeader.astro`
- Create: `src/components/global/ThemeToggle.astro`
- Create: `src/components/global/Footer.astro`
- Create: `src/components/global/BackToTop.astro`
- Create: `src/scripts/theme.ts`
- Create: `src/scripts/navigation.ts`
- Create: `src/styles/components.css`
- Test: `tests/unit/theme.test.ts`
- Test: `tests/unit/seo.test.ts`
- Test: `tests/e2e/shell.spec.ts`

- [ ] **Step 1: 写主题与 SEO 失败测试**

```ts
import { describe, expect, it } from "vitest";
import { resolveInitialTheme } from "@/lib/theme";
import { buildCanonical } from "@/lib/seo";

describe("主题与 canonical", () => {
  it("用户选择优先于系统主题", () => {
    expect(resolveInitialTheme("light", true)).toBe("light");
    expect(resolveInitialTheme(null, true)).toBe("dark");
  });

  it("canonical 去除重复斜杠并保留尾斜杠", () => {
    expect(buildCanonical("https://abinzhao.github.io/", "/blog/post")).toBe(
      "https://abinzhao.github.io/blog/post/",
    );
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/unit/theme.test.ts tests/unit/seo.test.ts`

Expected: FAIL，提示两个模块不存在。

- [ ] **Step 3: 实现站点常量、主题和 SEO**

`src/lib/site.ts`：

```ts
export const site = {
  name: "ZJB.DEV",
  owner: "赵建斌",
  title: "ZJB.DEV｜赵建斌的数字实验室",
  description: "赵建斌的项目、技术文章与创意代码实验室。",
  slogan: "把复杂，做得有意思。",
  url: "https://abinzhao.github.io",
  navigation: [
    { href: "/", label: "首页" },
    { href: "/projects/", label: "项目" },
    { href: "/blog/", label: "博客" },
    { href: "/playground/", label: "实验室" },
    { href: "/about/", label: "关于" },
  ],
  social: [
    { label: "GitHub", href: "https://github.com/abinzhao" },
    { label: "掘金", href: "https://juejin.cn/user/2849548342403454" },
  ],
} as const;
```

`src/lib/theme.ts`：

```ts
export type Theme = "light" | "dark";
export const THEME_STORAGE_KEY = "zjb-theme";
export const resolveInitialTheme = (stored: unknown, systemDark: boolean): Theme =>
  stored === "light" || stored === "dark" ? stored : systemDark ? "dark" : "light";
```

`src/lib/seo.ts`：

```ts
export function buildCanonical(origin: string, pathname: string): string {
  const base = origin.replace(/\/+$/, "");
  const path = `/${pathname}`.replace(/\/+/g, "/").replace(/\/?$/, "/");
  return `${base}${path}`;
}
```

- [ ] **Step 4: 实现 BaseLayout**

`BaseLayout.astro` 接收 `title`、`description`、`canonicalPath`、`image`、`jsonLd`，输出：

```astro
---
import SiteHeader from "@/components/global/SiteHeader.astro";
import Footer from "@/components/global/Footer.astro";
import BackToTop from "@/components/global/BackToTop.astro";
import { buildCanonical } from "@/lib/seo";
import { site } from "@/lib/site";
import "@/styles/tokens.css";
import "@/styles/base.css";
import "@/styles/components.css";

interface Props {
  title?: string;
  description?: string;
  canonicalPath?: string;
  image?: string;
  jsonLd?: Record<string, unknown>;
}
const {
  title = site.title,
  description = site.description,
  canonicalPath = Astro.url.pathname,
  image = "/og-default.png",
  jsonLd,
} = Astro.props;
const canonical = buildCanonical(site.url, canonicalPath);
---
<html lang="zh-CN" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="canonical" href={canonical} />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:url" content={canonical} />
    <meta property="og:image" content={new URL(image, site.url)} />
    {jsonLd && <script type="application/ld+json" set:html={JSON.stringify(jsonLd)} />}
    <slot name="head" />
    <script is:inline>
      {`try{const s=localStorage.getItem("zjb-theme");const d=matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.dataset.theme=s==="light"||s==="dark"?s:(d?"dark":"light")}catch{}`}
    </script>
  </head>
  <body>
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <SiteHeader />
    <main id="main-content"><slot /></main>
    <Footer />
    <BackToTop />
    <slot name="scripts" />
  </body>
</html>
```

- [ ] **Step 5: 实现主题、导航与返回顶部脚本**

`src/scripts/theme.ts` 导出 `initThemeToggle(root = document)`，读取按钮、更新 `data-theme`、`aria-label` 和 localStorage。

`src/scripts/navigation.ts` 导出 `initNavigation(root = document)`，处理：

- `scrollY > 24` 时给 Header 设置 `data-scrolled="true"`。
- 移动菜单按钮同步 `aria-expanded`。
- 点击菜单链接和 Escape 关闭菜单。
- 返回顶部按钮在 `scrollY > innerHeight` 后显示。

- [ ] **Step 6: 写壳层 E2E**

```ts
import { expect, test } from "@playwright/test";

test("主题、导航和触控状态可用", async ({ page }) => {
  await page.goto("/");
  const toggle = page.getByRole("button", { name: /切换到.+模式/ });
  await toggle.click();
  const theme = await page.locator("html").getAttribute("data-theme");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme!);

  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.getByRole("button", { name: "打开菜单" });
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
});
```

- [ ] **Step 7: 验证与提交**

Run:

```bash
npm test -- tests/unit/theme.test.ts tests/unit/seo.test.ts
npm run build
npm run test:e2e -- tests/e2e/shell.spec.ts
```

Expected: 全部 PASS，主题刷新后保持，移动菜单可操作。

```bash
git add src/lib src/layouts src/components/global src/scripts src/styles tests
git commit -m "feat: add Astro brand shell and theme"
```

---

### Task 4: 实现项目列表、详情与旧路由兼容

**Files:**
- Create: `src/pages/projects/index.astro`
- Create: `src/pages/projects/[slug].astro`
- Create: `src/components/projects/ProjectCard.astro`
- Create: `src/components/projects/ProjectFilters.astro`
- Create: `src/scripts/filters.ts`
- Create: `src/pages/work/index.astro`
- Create: `src/pages/work/[slug].astro`
- Create: `src/components/global/RedirectPage.astro`
- Create: `src/styles/projects.css`
- Test: `tests/unit/project-filters.test.ts`
- Test: `tests/e2e/projects.spec.ts`

- [ ] **Step 1: 写分类与兼容路由失败测试**

```ts
import { describe, expect, it } from "vitest";
import { getProjectCategories } from "@/lib/content";

describe("项目分类", () => {
  it("按固定中文顺序返回存在的分类", () => {
    expect(getProjectCategories([
      { data: { category: "experiment" } },
      { data: { category: "web" } },
      { data: { category: "harmonyos" } },
    ])).toEqual(["web", "harmonyos", "experiment"]);
  });
});
```

- [ ] **Step 2: 运行确认失败并实现分类映射**

Run: `npm test -- tests/unit/project-filters.test.ts`

Expected: FAIL，提示 `getProjectCategories` 不存在。

在 `src/lib/content.ts` 增加：

```ts
export const projectCategoryLabels = {
  web: "Web",
  backend: "后端",
  harmonyos: "鸿蒙",
  miniprogram: "小程序",
  crossplatform: "跨端",
  experiment: "实验",
} as const;

export function getProjectCategories(
  entries: Array<{ data: { category: keyof typeof projectCategoryLabels } }>,
) {
  const present = new Set(entries.map(({ data }) => data.category));
  return (Object.keys(projectCategoryLabels) as Array<keyof typeof projectCategoryLabels>)
    .filter((category) => present.has(category));
}
```

- [ ] **Step 3: 实现项目页面**

`/projects`：

- 从 `getCollection("projects", ({ data }) => !data.draft)` 读取内容。
- 使用 `sortProjects` 排序。
- 精选项目先显示为大卡片。
- 分类按钮使用 `data-category`，项目使用 `data-project-category`。
- URL 查询参数使用 `category`；无匹配时显示“该分类暂无公开项目”。

`/[slug]`：

- `getStaticPaths` 返回全部公开项目。
- 使用 `render(entry)` 渲染正文。
- 输出 `SoftwareSourceCode` JSON-LD。
- 只显示真实字段，`year` 缺失时显示“时间未公开”。

- [ ] **Step 4: 实现静态兼容页**

`RedirectPage.astro`：

```astro
---
import BaseLayout from "@/layouts/BaseLayout.astro";

interface Props { to: string; label: string; }
const { to, label } = Astro.props;
---
<BaseLayout
  title={`页面已迁移｜ZJB.DEV`}
  description={`该页面已迁移至${label}。`}
  canonicalPath={to}
>
  <meta slot="head" http-equiv="refresh" content={`0;url=${to}`} />
  <section class="redirect-page">
    <h1>页面已迁移</h1>
    <p>正在前往{label}。</p>
    <a href={to}>立即跳转</a>
  </section>
</BaseLayout>
```

`/work/index.astro` 指向 `/projects/`；`/work/[slug].astro` 从项目集合生成路径并指向 `/projects/{slug}/`。

- [ ] **Step 5: 写 E2E 并验证**

```ts
test("项目可筛选且旧链接兼容", async ({ page }) => {
  await page.goto("/projects/");
  await page.getByRole("button", { name: "鸿蒙" }).click();
  await expect(page).toHaveURL(/\?category=harmonyos$/);
  await expect(page.getByText("HarmonyOS Next 开发知识库")).toBeVisible();
  await page.goto("/work/harmony-next-blog/");
  await expect(page.getByRole("link", { name: "立即跳转" })).toHaveAttribute(
    "href", "/projects/harmony-next-blog/",
  );
});
```

Run:

```bash
npm test -- tests/unit/project-filters.test.ts
npm run build
npm run test:e2e -- tests/e2e/projects.spec.ts
```

Expected: PASS；`dist/projects/` 和 `dist/work/` 均存在。

- [ ] **Step 6: 提交**

```bash
git add src/pages/projects src/pages/work src/components/projects src/components/global/RedirectPage.astro src/scripts/filters.ts src/styles/projects.css src/lib/content.ts tests
git commit -m "feat: add project collection routes"
```

---

### Task 5: 实现博客、TOC、归档、标签与 RSS

**Files:**
- Create: `src/pages/blog/index.astro`
- Create: `src/pages/blog/[slug].astro`
- Create: `src/pages/blog/archive.astro`
- Create: `src/pages/tags/index.astro`
- Create: `src/pages/tags/[tag].astro`
- Create: `src/pages/rss.xml.ts`
- Create: `src/components/blog/BlogCard.astro`
- Create: `src/components/blog/BlogFilters.astro`
- Create: `src/components/blog/ArticleToc.astro`
- Create: `src/components/blog/ArticlePager.astro`
- Create: `src/scripts/article.ts`
- Create: `src/pages/writing/index.astro`
- Create: `src/pages/writing/[slug].astro`
- Create: `src/styles/blog.css`
- Test: `tests/unit/blog.test.ts`
- Test: `tests/e2e/blog.spec.ts`

- [ ] **Step 1: 写博客展示逻辑失败测试**

```ts
import { describe, expect, it } from "vitest";
import { groupBlogByMonth, getBlogFacets } from "@/lib/content";

describe("博客展示数据", () => {
  const entries = [
    { slug: "a", data: { date: new Date("2026-08-11"), category: "技术", subcategory: "前端", tags: ["Astro"] } },
    { slug: "b", data: { date: new Date("2026-07-01"), category: "随笔", tags: ["生活"] } },
  ];

  it("生成分类和标签", () => {
    expect(getBlogFacets(entries)).toEqual({
      categories: ["技术", "随笔"],
      subcategories: ["前端"],
      tags: ["Astro", "生活"],
    });
  });

  it("按年月归档", () => {
    expect(Object.keys(groupBlogByMonth(entries))).toEqual(["2026-08", "2026-07"]);
  });
});
```

- [ ] **Step 2: 运行确认失败并实现纯函数**

Run: `npm test -- tests/unit/blog.test.ts`

Expected: FAIL，提示函数不存在。

实现 `getBlogFacets`、`groupBlogByMonth`，使用 `Set` 去重，分类按 `技术、随笔、折腾` 固定顺序，标签按中文排序。

- [ ] **Step 3: 实现博客列表、归档和标签页**

- `/blog` 通过 `category`、`subcategory`、`tag` 查询参数筛选。
- `/blog/archive` 使用 `<time datetime="2026-08">2026 年 8 月</time>` 分组。
- `/tags` 展示标签及文章数量。
- `/tags/[tag]` 的 `getStaticPaths` 来自真实标签。
- 只有一个分类或标签时隐藏对应控件。

- [ ] **Step 4: 实现文章详情**

文章详情：

- 使用 Astro `render()` 的 `headings` 生成 H2/H3 目录。
- 标题不足 2 个时不渲染 TOC。
- Shiki 使用 Astro 内置高亮。
- 构建时调用 `getReadingMinutes(entry.body)`。
- 使用 `getAdjacentEntries` 生成上一篇/下一篇。
- `article.ts` 增强代码块，为每个 `<pre>` 添加“复制代码”按钮，状态为“已复制”或“复制失败”。
- 输出 `BlogPosting` JSON-LD。

- [ ] **Step 5: 实现 RSS 和旧路由**

`src/pages/rss.xml.ts`：

```ts
import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { site } from "@/lib/site";

export async function GET(context: { site: URL }) {
  const posts = (await getCollection("blog", ({ data }) => !data.draft))
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
  return rss({
    title: "ZJB.DEV 博客",
    description: site.description,
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.summary,
      pubDate: post.data.date,
      link: `/blog/${post.data.slug}/`,
    })),
  });
}
```

`/writing` 和 `/writing/[slug]` 使用 `RedirectPage` 指向新博客路径。

- [ ] **Step 6: 写 E2E 并验证**

```ts
test("博客详情具备目录、阅读时间、标签和兼容路径", async ({ page }) => {
  await page.goto("/blog/harmonyos-next-learning-path/");
  await expect(page.getByText(/预计阅读 1 分钟/)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "文章目录" })).toBeVisible();
  await expect(page.getByRole("link", { name: "HarmonyOS" })).toHaveAttribute(
    "href", "/tags/HarmonyOS/",
  );
  await page.goto("/writing/harmonyos-next-learning-path/");
  await expect(page.getByRole("link", { name: "立即跳转" })).toHaveAttribute(
    "href", "/blog/harmonyos-next-learning-path/",
  );
});
```

Run:

```bash
npm test -- tests/unit/blog.test.ts
npm run build
npm run test:e2e -- tests/e2e/blog.spec.ts
```

Expected: PASS；`dist/rss.xml`、归档、标签和兼容页存在。

- [ ] **Step 7: 提交**

```bash
git add src/pages/blog src/pages/tags src/pages/writing src/pages/rss.xml.ts src/components/blog src/scripts/article.ts src/styles/blog.css src/lib/content.ts tests
git commit -m "feat: add blog publishing experience"
```

---

### Task 6: 实现首页品牌 Hero 与滚动叙事

**Files:**
- Create: `src/pages/index.astro`
- Create: `src/components/home/Hero.astro`
- Create: `src/components/home/FeaturedProjects.astro`
- Create: `src/components/home/LatestBlog.astro`
- Create: `src/components/home/PlaygroundPreview.astro`
- Create: `src/scripts/scenes/hero.ts`
- Create: `src/scripts/scenes/scene-lifecycle.ts`
- Create: `src/scripts/transitions.ts`
- Create: `src/styles/home.css`
- Test: `tests/unit/scene-lifecycle.test.ts`
- Test: `tests/e2e/home.spec.ts`

- [ ] **Step 1: 写场景门控失败测试**

```ts
import { describe, expect, it } from "vitest";
import { getSceneProfile } from "@/scripts/scenes/scene-lifecycle";

describe("首页场景性能配置", () => {
  it("桌面、移动端和 reduced-motion 使用不同配置", () => {
    expect(getSceneProfile({ width: 1440, dpr: 2, reducedMotion: false })).toEqual({
      animated: true, particles: 2200, maxDpr: 1.75, fps: 60,
    });
    expect(getSceneProfile({ width: 390, dpr: 3, reducedMotion: false })).toEqual({
      animated: true, particles: 800, maxDpr: 1.5, fps: 30,
    });
    expect(getSceneProfile({ width: 1440, dpr: 1, reducedMotion: true }).animated).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败并实现门控**

Run: `npm test -- tests/unit/scene-lifecycle.test.ts`

Expected: FAIL，提示模块不存在。

`getSceneProfile` 按 `<768`、`768–1023`、`>=1024` 返回固定粒子、DPR 和 FPS；reduced-motion 返回 `animated: false`。

- [ ] **Step 3: 实现 Hero 静态结构**

Hero 必须在无 JS 时完整显示：

```astro
<section class="hero" aria-labelledby="hero-title">
  <div class="hero__copy">
    <p class="eyebrow">赵建斌 / 开发者与实验者</p>
    <h1 id="hero-title">把复杂，做得<strong>有意思。</strong></h1>
    <p>构建前端、鸿蒙与跨端体验，也把技术实验、生活观察和没做完的好奇心留在这里。</p>
    <div class="hero__actions">
      <a href="/projects/">查看项目</a>
      <a href="/playground/">进入实验室</a>
    </div>
  </div>
  <div class="hero__visual" aria-hidden="true">
    <canvas data-hero-scene></canvas>
    <div class="hero__fallback"><span class="planet"></span><span class="orbit"></span></div>
  </div>
  <span class="hero__sticker">BUILD · BREAK · LEARN</span>
</section>
```

- [ ] **Step 4: 实现 Three.js 星体和粒子汇聚**

`hero.ts`：

- 动态导入 `three`。
- 使用固定种子生成暖色 CanvasTexture。
- 使用真实 SphereGeometry、MeshStandardMaterial、AmbientLight、DirectionalLight。
- 粒子初始随机分布，1.2 秒内汇聚为 `ZJB` 采样点，再在 0.6 秒内过渡到轨道粒子场。
- 鼠标/触摸只影响粒子和相机目标，最大偏移 0.35。
- IntersectionObserver、Visibility API 控制暂停。
- dispose 时释放 geometry、material、texture、renderer 和监听器。
- 初始化失败时移除 canvas 并保留 `.hero__fallback`。

- [ ] **Step 5: 实现滚动叙事和内容区**

- Hero 下方依次渲染精选项目、最新博客、三个实验预览、About CTA。
- `transitions.ts` 动态导入 `gsap` 和 `ScrollTrigger`。
- Hero 仅在桌面进行相机推进；移动端使用 CSS opacity 过渡。
- reduced-motion 不导入 GSAP。
- 精选文章数量不足时不重复同一文章。

- [ ] **Step 6: 写首页 E2E**

```ts
test("首页内容优先且 3D 按条件加载", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "把复杂，做得有意思。" })).toBeVisible();
  await expect(page.locator("[data-hero-scene]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "精选项目" })).toBeVisible();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.locator(".hero__fallback")).toBeVisible();
});
```

- [ ] **Step 7: 验证与提交**

Run:

```bash
npm test -- tests/unit/scene-lifecycle.test.ts
npm run build
npm run test:e2e -- tests/e2e/home.spec.ts
```

Expected: PASS；无 JS 时 Hero 文案仍在静态 HTML。

```bash
git add src/pages/index.astro src/components/home src/scripts/scenes src/scripts/transitions.ts src/styles/home.css tests
git commit -m "feat: add orbital lab homepage"
```

---

### Task 7: 建立 Playground 页面与实验运行时边界

**Files:**
- Create: `src/pages/playground/index.astro`
- Create: `src/pages/playground/[slug].astro`
- Create: `src/layouts/ExperimentLayout.astro`
- Create: `src/components/playground/ExperimentCard.astro`
- Create: `src/components/playground/ExperimentShell.astro`
- Create: `src/scripts/scenes/registry.ts`
- Create: `src/scripts/scenes/runtime.ts`
- Create: `src/styles/playground.css`
- Test: `tests/unit/experiment-registry.test.ts`
- Test: `tests/e2e/playground.spec.ts`

- [ ] **Step 1: 写受控注册表失败测试**

```ts
import { describe, expect, it } from "vitest";
import { experimentLoaders } from "@/scripts/scenes/registry";

describe("实验注册表", () => {
  it("只暴露三个已批准实验", () => {
    expect(Object.keys(experimentLoaders)).toEqual([
      "particle-galaxy",
      "shader-art",
      "physics-sandbox",
    ]);
  });
});
```

- [ ] **Step 2: 运行确认失败并实现注册表**

```ts
export const experimentLoaders = {
  "particle-galaxy": () => import("./particle-galaxy"),
  "shader-art": () => import("./shader-art"),
  "physics-sandbox": () => import("./physics-sandbox"),
} as const;
```

Run: `npm test -- tests/unit/experiment-registry.test.ts`

Expected: PASS。

- [ ] **Step 3: 实现运行时协议**

`runtime.ts`：

```ts
export interface ExperimentController {
  pause(): void;
  resume(): void;
  resize(): void;
  reset(): void;
  dispose(): void;
}

export interface ExperimentModule {
  mount(canvas: HTMLCanvasElement, controls: HTMLElement): Promise<ExperimentController> | ExperimentController;
}
```

`ExperimentShell.astro` 提供 canvas、状态区、重试按钮和控制容器。脚本根据 `data-experiment` 从注册表加载模块；失败时显示“实验未能启动”，保留说明和返回入口。

- [ ] **Step 4: 实现实验列表与详情路由**

- 列表卡片显示真实标题、描述、技术标签和静态 CSS 预览。
- `getStaticPaths` 来自 playground 集合。
- 详情使用 `ExperimentLayout`，桌面说明与 Demo 分栏，移动端单栏。
- 每个 Demo canvas 标记 `aria-hidden="true"`；控制按钮有文字标签。

- [ ] **Step 5: 写 E2E 并提交**

```ts
test("实验列表和三个详情页可访问", async ({ page }) => {
  await page.goto("/playground/");
  for (const title of ["粒子银河", "Shader 艺术", "物理模拟"]) {
    await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  }
  await page.goto("/playground/particle-galaxy/");
  await expect(page.getByText("实验状态")).toBeVisible();
});
```

Run: `npm run build && npm run test:e2e -- tests/e2e/playground.spec.ts`

```bash
git add src/pages/playground src/layouts/ExperimentLayout.astro src/components/playground src/scripts/scenes/registry.ts src/scripts/scenes/runtime.ts src/styles/playground.css tests
git commit -m "feat: add playground runtime and routes"
```

---

### Task 8: 实现粒子银河实验

**Files:**
- Create: `src/scripts/scenes/particle-galaxy.ts`
- Create: `src/scripts/scenes/seeded-random.ts`
- Test: `tests/unit/particle-galaxy.test.ts`
- Test: `tests/e2e/particle-galaxy.spec.ts`

- [ ] **Step 1: 写确定性粒子数据失败测试**

```ts
import { describe, expect, it } from "vitest";
import { createGalaxyPoints } from "@/scripts/scenes/particle-galaxy";

describe("粒子银河", () => {
  it("固定种子生成稳定点位并限制粒子数", () => {
    const first = createGalaxyPoints(4, 42);
    const second = createGalaxyPoints(4, 42);
    expect(Array.from(first.positions)).toEqual(Array.from(second.positions));
    expect(first.positions).toHaveLength(12);
    expect(first.colors).toHaveLength(12);
  });
});
```

- [ ] **Step 2: 运行确认失败并实现点位生成**

使用线性同余固定随机数；每个点按分支角、半径、旋转和轻微随机偏移计算位置，颜色在暖橙和轨道蓝紫之间插值。

Run: `npm test -- tests/unit/particle-galaxy.test.ts`

Expected: PASS。

- [ ] **Step 3: 实现 Three.js 实验**

`mount()`：

- 根据 `getSceneProfile` 生成 800/1400/2200 粒子。
- 使用 `BufferGeometry` 和自定义 ShaderMaterial。
- pointer/touch 位置通过 uniform 形成局部力场。
- 提供“重置视角”和“暂停/继续”按钮。
- FPS 限制：移动端 30、桌面 60。
- 不可见时暂停，dispose 完整释放资源。

- [ ] **Step 4: 写 E2E 和提交**

```ts
test("粒子银河支持暂停和重置", async ({ page }) => {
  await page.goto("/playground/particle-galaxy/");
  await expect(page.getByText("运行中")).toBeVisible();
  await page.getByRole("button", { name: "暂停" }).click();
  await expect(page.getByText("已暂停")).toBeVisible();
  await page.getByRole("button", { name: "重置视角" }).click();
});
```

Run: `npm test -- tests/unit/particle-galaxy.test.ts && npm run build && npm run test:e2e -- tests/e2e/particle-galaxy.spec.ts`

```bash
git add src/scripts/scenes/particle-galaxy.ts src/scripts/scenes/seeded-random.ts tests
git commit -m "feat: add particle galaxy experiment"
```

---

### Task 9: 实现 Shader 艺术实验

**Files:**
- Create: `src/scripts/scenes/shader-art.ts`
- Create: `src/scripts/scenes/shaders/orbital.frag.glsl`
- Create: `src/scripts/scenes/shaders/fullscreen.vert.glsl`
- Test: `tests/unit/shader-art.test.ts`
- Test: `tests/e2e/shader-art.spec.ts`

- [ ] **Step 1: 写参数规范化失败测试**

```ts
import { describe, expect, it } from "vitest";
import { normalizeShaderSettings } from "@/scripts/scenes/shader-art";

describe("Shader 参数", () => {
  it("限制速度、尺度和色相范围", () => {
    expect(normalizeShaderSettings({ speed: 9, scale: 0, hue: 720 })).toEqual({
      speed: 2,
      scale: 0.5,
      hue: 360,
    });
  });
});
```

- [ ] **Step 2: 运行确认失败并实现参数函数**

Run: `npm test -- tests/unit/shader-art.test.ts`

Expected: FAIL 后实现 clamp，测试 PASS。

- [ ] **Step 3: 实现全屏 Shader**

- 顶点 Shader 输出全屏三角形。
- 片元 Shader 使用分形噪声和轨道坐标生成暖橙、柠檬黄、蓝紫流体图案。
- 控件为速度、噪声尺度、色相三个原生 range。
- 控件更新 `aria-valuetext`。
- reduced-motion 下 `uTime` 固定为 0，仍允许手动调参。
- WebGL 失败时展示 CSS 渐变静态图。

- [ ] **Step 4: 写 E2E 和提交**

```ts
test("Shader 参数可调且 reduced-motion 静止", async ({ page }) => {
  await page.goto("/playground/shader-art/");
  await page.getByRole("slider", { name: "噪声尺度" }).fill("1.5");
  await expect(page.getByRole("slider", { name: "噪声尺度" })).toHaveValue("1.5");
});
```

Run: `npm test -- tests/unit/shader-art.test.ts && npm run build && npm run test:e2e -- tests/e2e/shader-art.spec.ts`

```bash
git add src/scripts/scenes/shader-art.ts src/scripts/scenes/shaders tests
git commit -m "feat: add interactive shader experiment"
```

---

### Task 10: 实现物理模拟实验

**Files:**
- Create: `src/scripts/scenes/physics-sandbox.ts`
- Create: `src/scripts/scenes/verlet.ts`
- Test: `tests/unit/verlet.test.ts`
- Test: `tests/e2e/physics-sandbox.spec.ts`

- [ ] **Step 1: 写 Verlet 纯逻辑失败测试**

```ts
import { describe, expect, it } from "vitest";
import { integratePoint, constrainPoint } from "@/scripts/scenes/verlet";

describe("Verlet 模拟", () => {
  it("按当前位置、上一位置和重力积分", () => {
    expect(integratePoint(
      { x: 10, y: 10, previousX: 8, previousY: 9 },
      { x: 0, y: 1 },
    )).toMatchObject({ x: 12, y: 12, previousX: 10, previousY: 10 });
  });

  it("将点限制在边界内", () => {
    expect(constrainPoint({ x: -2, y: 120 }, 100, 100, 5)).toMatchObject({
      x: 5, y: 95,
    });
  });
});
```

- [ ] **Step 2: 运行确认失败并实现物理核心**

Run: `npm test -- tests/unit/verlet.test.ts`

Expected: FAIL 后实现积分、边界和距离约束，测试 PASS。

- [ ] **Step 3: 实现 Canvas 2D 实验**

- 使用 Canvas 2D 和固定步长 Verlet，不引入物理引擎。
- 生成 18 个带半径和暖色/蓝紫色的物体。
- 支持拖拽、重置、重力开关。
- 移动端最多 12 个物体并锁定 30fps。
- reduced-motion 默认暂停，用户可按“运行一次”推进单步。
- 容器尺寸变化时重新约束对象，不重建页面。

- [ ] **Step 4: 写 E2E 和提交**

```ts
test("物理模拟支持重力开关和重置", async ({ page }) => {
  await page.goto("/playground/physics-sandbox/");
  const gravity = page.getByRole("button", { name: "关闭重力" });
  await gravity.click();
  await expect(gravity).toHaveAccessibleName("开启重力");
  await page.getByRole("button", { name: "重置模拟" }).click();
});
```

Run: `npm test -- tests/unit/verlet.test.ts && npm run build && npm run test:e2e -- tests/e2e/physics-sandbox.spec.ts`

```bash
git add src/scripts/scenes/physics-sandbox.ts src/scripts/scenes/verlet.ts tests
git commit -m "feat: add physics sandbox experiment"
```

---

### Task 11: 完成 About、联系区、404、SEO 和公开 README

**Files:**
- Create: `src/pages/about.astro`
- Create: `src/pages/contact/index.astro`
- Create: `src/pages/404.astro`
- Create: `src/pages/robots.txt.ts`
- Create: `src/pages/sitemap-index.xml.ts` only if Astro Sitemap output does not cover required routes
- Create: `public/og-default.svg`
- Modify: `src/lib/seo.ts`
- Modify: `README.md`
- Modify: `.github/workflows/deploy-pages.yml`
- Test: `tests/unit/seo.test.ts`
- Test: `tests/e2e/about-seo.spec.ts`

- [ ] **Step 1: 扩展 SEO 失败测试**

```ts
import { buildPersonJsonLd, buildRedirectCanonical } from "@/lib/seo";

it("Person JSON-LD 只包含公开入口", () => {
  const data = buildPersonJsonLd();
  expect(data.name).toBe("赵建斌");
  expect(data.sameAs).toEqual([
    "https://github.com/abinzhao",
    "https://juejin.cn/user/2849548342403454",
  ]);
  expect(JSON.stringify(data)).not.toMatch(/email|worksFor|telephone/);
});

it("旧路径 canonical 指向新路径", () => {
  expect(buildRedirectCanonical("/contact")).toBe(
    "https://abinzhao.github.io/about/#contact",
  );
});
```

- [ ] **Step 2: 运行确认失败并实现 JSON-LD**

Run: `npm test -- tests/unit/seo.test.ts`

Expected: FAIL 后实现 `buildPersonJsonLd`、`buildBlogPostingJsonLd`、`buildProjectJsonLd` 和旧路径 canonical。

- [ ] **Step 3: 实现 About 和联系兼容页**

About：

- 介绍、技术分组、工作原则和 `id="contact"` 联系区。
- 只显示 GitHub、掘金。
- 技能分组来自公开技术列表，不显示年份时间线。

`/contact` 使用 RedirectPage 指向 `/about/#contact`。

- [ ] **Step 4: 实现 404**

- 静态粒子黑洞 CSS 图形。
- 页面标题“信号丢失”。
- 提供首页、项目、博客、实验室四个链接。
- 非 reduced-motion 时允许轻微粒子吸入，reduced-motion 时完全静止。

- [ ] **Step 5: 更新 Robots、部署和 README**

`robots.txt.ts` 返回：

```txt
User-agent: *
Allow: /
Sitemap: https://abinzhao.github.io/sitemap-index.xml
```

GitHub Actions：

- 环境变量从 `NEXT_PUBLIC_SITE_URL` 改为 `SITE_URL` 或直接使用 Astro `site`。
- 上传目录从 `out` 改为 `dist`。
- checks 为 `npm run lint && npm test && npm run build`。

README：

```md
# ZJB.DEV

> 把复杂，做得有意思。

赵建斌的项目、技术文章与创意代码实验室。

- 项目：真实公开项目与工程取舍
- 博客：技术、随笔与折腾记录
- 实验室：Three.js、Shader 与交互模拟

站点使用 Astro、TypeScript、Three.js 和 Markdown 构建，并部署于 GitHub Pages。

公开内容只来自可验证资料，不展示未确认的履历、联系方式或量化指标。
```

- [ ] **Step 6: 写 E2E 与验证**

```ts
test("About 联系区与 SEO 不暴露未确认信息", async ({ page }) => {
  await page.goto("/about/");
  await expect(page.locator("#contact")).toBeVisible();
  await expect(page.getByRole("link", { name: "GitHub" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/邮箱|微信|公司|工作年限/);
  await page.goto("/404");
  await expect(page.getByRole("heading", { name: "信号丢失" })).toBeVisible();
});
```

Run:

```bash
npm test -- tests/unit/seo.test.ts
npm run build
npm run test:e2e -- tests/e2e/about-seo.spec.ts
test -f dist/robots.txt
test -f dist/sitemap-index.xml
test -f dist/rss.xml
```

Expected: 全部 PASS。

- [ ] **Step 7: 提交**

```bash
git add src/pages/about.astro src/pages/contact src/pages/404.astro src/pages/robots.txt.ts src/lib/seo.ts public/og-default.svg README.md .github/workflows/deploy-pages.yml tests
git commit -m "feat: complete public profile and SEO"
```

---

### Task 12: 删除 Next.js 双栈、完成全量回归和 Chrome DevTools 验收

**Files:**
- Delete: `app/`
- Delete: `components/`
- Delete: `content/`
- Delete: `lib/`
- Delete: `next.config.ts`
- Delete: `next-env.d.ts`
- Delete: obsolete `tests/*.test.ts` and `tests/*.test.tsx`
- Modify: `tests/e2e/smoke.spec.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: 写最终资源边界 E2E**

```ts
import { expect, test } from "@playwright/test";

test("博客详情不加载 Three.js", async ({ page }) => {
  const scripts: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script") scripts.push(request.url());
  });
  await page.goto("/blog/harmonyos-next-learning-path/");
  expect(scripts.join("\n")).not.toMatch(/three|hero|particle-galaxy/);
});

test("三档视口无横向溢出且移动端触控目标合格", async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 900, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const path of ["/", "/projects/", "/blog/", "/playground/", "/about/"]) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});
```

- [ ] **Step 2: 运行全量测试确认删除前基线**

Run:

```bash
npm run lint
npm test
npm run build
npm run test:e2e
```

Expected: 全部 PASS。

- [ ] **Step 3: 删除旧栈与旧测试**

删除 Next.js 的 `app/`、`components/`、`content/`、`lib/`、`next.config.ts`、`next-env.d.ts` 及只验证旧 React 组件的测试。确认：

Run:

```bash
rg -n '"next"|"react"|"react-dom"|next-mdx-remote|@testing-library/react' package.json package-lock.json
rg -n 'from "next|from "react|@/components' src tests
```

Expected: 两条命令均无匹配。

- [ ] **Step 4: 再次运行完整门禁**

Run:

```bash
npm ci
npm run lint
npm test
npm run build
npm run test:e2e
git diff --check
```

Expected:

- 单元测试全部 PASS。
- Astro check 和 build PASS。
- Playwright 全部 PASS。
- `dist/` 包含首页、About、Projects、Blog、Playground、Tags、RSS、Sitemap、Robots、404 和旧兼容页。

- [ ] **Step 5: 使用 Chrome DevTools 做真实浏览器验收**

启动：

```bash
npm run preview
```

使用 Chrome DevTools MCP：

1. 打开 `http://127.0.0.1:3000/`，`take_snapshot` 确认品牌标题和四个主入口。
2. `take_screenshot` 保存 1440px 首页深色、浅色各一张。
3. `resize_page` 到 900×900 和 390×844，检查菜单、卡片列数和无横向溢出。
4. `list_console_messages` 只允许无害浏览器信息，不允许应用 error/warn。
5. `list_network_requests` 不允许意外 4xx/5xx。
6. 在博客详情确认请求列表不含 Three.js。
7. 在三个实验页确认 Canvas 有尺寸、控制可操作、页面隐藏后动画暂停。
8. 模拟 reduced-motion，确认 Hero 和实验进入静态状态。
9. 运行 Lighthouse，性能、可访问性、最佳实践、SEO 不得有阻断级问题。

- [ ] **Step 6: 检查公开信息**

Run:

```bash
rg -n "/Users/|bytedance|NEXT_PUBLIC|email|telephone|worksFor|手机号|微信|公司|工作年限" README.md src public .github
```

Expected: 不包含本地绝对路径、内部信息或未确认个人信息；合法的代码变量命中必须人工确认其不出现在公开内容。

- [ ] **Step 7: 提交最终迁移**

```bash
git add -A
git commit -m "refactor: remove legacy Next.js site"
```

- [ ] **Step 8: 最终状态**

Run:

```bash
git status --short --branch
git log --oneline -12
```

Expected: 工作树干净，最近提交按 Task 1–12 保持可审查的迁移历史。

---

## 计划自检结果

- **规格覆盖:** 品牌、Astro、内容集合、新旧路由、博客分类、归档、标签、RSS、三个实验、About 联系区、404、SEO、README、部署、响应式、reduced-motion、性能和 Chrome DevTools 均有对应任务。
- **边界一致:** 主路由统一使用 `/projects`、`/blog`、`/playground`、`/about`；旧路由仅生成静态兼容页。
- **类型一致:** 三个集合字段与页面消费字段一致；实验统一实现 `ExperimentController`；主题只有 `light | dark`。
- **无双栈终态:** Task 12 明确删除 Next.js、React 和旧测试。
- **真实性:** 所有可选字段允许缺失，README 与 SEO 明确排除未确认信息。
- **无占位步骤:** 每个实现任务都有精确路径、测试、命令、期望结果和提交点。
