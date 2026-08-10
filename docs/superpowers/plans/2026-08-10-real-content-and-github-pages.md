# 真实内容与 GitHub Pages 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使用公开证据补充个人网站，并通过 GitHub Actions 发布到 `https://abinzhao.github.io`。

**Architecture:** 内容继续使用本地 MDX 和现有 Zod 校验。Next.js 开启静态导出，GitHub Actions 构建 `out/` 并部署 Pages；本地和生产使用同一站点 URL 配置。

**Tech Stack:** Next.js 16、React 19、TypeScript、MDX、Vitest、Playwright、GitHub Actions。

---

### Task 1: 真实项目内容

**Files:**
- Create: `content/projects/harmony-next-blog.mdx`
- Create: `content/projects/cps.mdx`
- Create: `content/projects/scio-design.mdx`
- Create: `content/projects/scio-pro.mdx`
- Create: `content/projects/code-analysis.mdx`
- Modify: `tests/content.test.ts`

- [ ] 添加失败测试，要求公开项目数量为 5、slug 稳定且链接均指向 `github.com/abinzhao`。
- [ ] 运行 `npm test -- tests/content.test.ts`，预期因项目文件尚不存在而失败。
- [ ] 使用 GitHub 仓库描述和 README 编写 5 个 MDX 文件。
- [ ] 运行 `npm test -- tests/content.test.ts`，预期通过。

### Task 2: 真实资料与联系入口

**Files:**
- Modify: `lib/profile.ts`
- Modify: `app/about/page.tsx`
- Modify: `app/contact/page.tsx`
- Modify: `tests/routes.test.tsx`

- [ ] 添加失败测试，要求关于页展示 ArkTS、ArkUI、TypeScript、React、Node.js 和 AI Agent，联系页展示 GitHub 与掘金。
- [ ] 运行 `npm test -- tests/routes.test.tsx`，预期缺少真实内容而失败。
- [ ] 扩展资料模型并渲染已验证能力和公开链接。
- [ ] 运行 `npm test -- tests/routes.test.tsx`，预期通过。

### Task 3: GitHub Pages 静态导出

**Files:**
- Modify: `next.config.ts`
- Create: `.env.example`
- Create: `.env.local`
- Create: `.github/workflows/deploy-pages.yml`
- Modify: `playwright.config.ts`

- [ ] 添加静态导出配置 `output: "export"` 和 `trailingSlash: true`。
- [ ] 设置 `NEXT_PUBLIC_SITE_URL=https://abinzhao.github.io`。
- [ ] 配置 GitHub Actions 使用 Node.js 20、`npm ci`、`npm run build`、`actions/upload-pages-artifact` 和 `actions/deploy-pages`。
- [ ] 运行 `npm run build`，预期 `out/index.html`、`out/rss.xml`、`out/sitemap.xml` 和项目详情页面存在。

### Task 4: 本地浏览器验证

**Files:**
- Modify: `tests/e2e/smoke.spec.ts`

- [ ] 扩展 E2E，点击真实项目并验证 GitHub 外链。
- [ ] 使用 `npx serve out -l 3000` 启动静态产物。
- [ ] 运行 `npm run test:e2e`，验证桌面与移动端、控制台错误、失败请求和横向溢出。
- [ ] 运行 `npm run lint && npm test && npm run build && npm run test:e2e`，预期全部通过。

### Task 5: 迁移并发布到 GitHub

**Files:**
- Replace repository working tree on branch `codex/personal-website`.

- [ ] 克隆 `abinzhao/abinzhao.github.io` 到独立目录并创建 `codex/personal-website`。
- [ ] 删除旧 VitePress 工作树内容，保留 `.git`，复制已验证的新站点且排除 `.env.local`、`.next`、`out`、`node_modules` 和测试产物。
- [ ] 检查 `git status`、完整 diff 和敏感文件。
- [ ] 提交 `feat: replace legacy blog with personal website`。
- [ ] 推送分支并创建 Draft PR 到 `master`。
- [ ] 将 Pages build type 切换为 workflow，使合并后的 Actions 工作流接管部署。
