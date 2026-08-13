# ZJB.DEV Playful Glass Site Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将生产站完整切换为已确认的高对比冰蓝透彩视觉，同时保留内容能力、URL 和实验运行时。

**Architecture:** 使用一套新的全局设计令牌与材质工具类统一壳层，再按首页、内容列表、文章详情、项目及实验外围 UI 分层实现。旧宇宙与旧编辑式 CSS 不再由生产页面导入；Three.js 仅由实验详情加载。

**Tech Stack:** Astro 7、TypeScript、CSS、Content Collections、Pagefind、Playwright、Vitest

---

### Task 1: 建立视觉回归门禁

**Files:**
- Modify: `tests/e2e/editorial-brand.spec.ts`
- Modify: `tests/e2e/smoke.spec.ts`

- [ ] 增加环境光、玻璃壳层、圆角和高对比主题断言。
- [ ] 运行 `npx playwright test tests/e2e/editorial-brand.spec.ts tests/e2e/smoke.spec.ts`，确认新增断言先失败。

### Task 2: 重建全局设计系统

**Files:**
- Modify: `src/styles/tokens.css`
- Create: `src/styles/glass-system.css`
- Create: `src/components/global/AmbientLight.astro`
- Modify: `src/layouts/BaseLayout.astro`

- [ ] 定义冰蓝、深海军蓝、蓝紫、薄荷与暗色模式令牌。
- [ ] 实现三层慢速渐变环境光、圆角玻璃材质和 reduced-motion 降级。
- [ ] 移除主站旧全局 CSS 导入与宇宙类型依赖。
- [ ] 运行 `npm run build`，预期 Astro 检查 0 错误。

### Task 3: 重构首页

**Files:**
- Create: `src/styles/glass-home.css`
- Modify: `src/pages/index.astro`
- Modify: `src/components/home/Hero.astro`
- Modify: `src/components/home/LatestBlog.astro`
- Modify: `src/components/home/VibeStream.astro`
- Modify: `src/components/home/FeaturedProjects.astro`
- Modify: `src/components/home/PlaygroundPreview.astro`
- Modify: `src/components/home/SubscribeNote.astro`

- [ ] 复刻确认版 Hero、标题渐变、宣言模块和浮动色块。
- [ ] 将文章、Vibe、项目和实验区改为层级化圆角透彩容器。
- [ ] 保持现有真实内容和链接。
- [ ] 运行首页 E2E，预期全部通过。

### Task 4: 统一内容页面

**Files:**
- Create: `src/styles/glass-content.css`
- Modify: `src/pages/blog/index.astro`
- Modify: `src/pages/blog/[slug].astro`
- Modify: `src/pages/blog/archive.astro`
- Modify: `src/pages/tags/index.astro`
- Modify: `src/pages/tags/[tag].astro`
- Modify: `src/pages/projects/index.astro`
- Modify: `src/pages/projects/[slug].astro`
- Modify: `src/pages/about.astro`
- Modify: `src/pages/search.astro`
- Modify: `src/pages/404.astro`

- [ ] 将列表、筛选器、文章正文、目录和项目详情统一到玻璃设计系统。
- [ ] 保留阅读进度、反馈、Pagefind 和兼容路由。
- [ ] 运行博客、项目、SEO E2E，预期全部通过。

### Task 5: 隔离实验运行时

**Files:**
- Create: `src/styles/glass-playground.css`
- Modify: `src/layouts/ExperimentLayout.astro`
- Modify: `src/pages/playground/index.astro`

- [ ] 保留实验 Canvas 和控制器逻辑，仅替换外围 UI。
- [ ] 验证主站无 Canvas，实验详情恰好一个 Canvas。
- [ ] 运行三个实验 E2E，预期全部通过。

### Task 6: 完整验收

**Files:**
- Modify: `tests/e2e/home.spec.ts`
- Modify: `tests/e2e/shell.spec.ts`
- Modify: `tests/e2e/smoke.spec.ts`

- [ ] 运行 `npm run lint`，预期退出码 0。
- [ ] 运行 `npm test`，预期 62 项单测通过。
- [ ] 运行 `npm run build`，预期 0 错误、0 警告并生成 Pagefind 索引。
- [ ] 运行 `npm run test:e2e`，预期全部通过。
- [ ] 用 Chrome DevTools 检查桌面和移动视觉、控制台、网络与 Lighthouse。
