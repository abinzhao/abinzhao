# Compact Inner Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace oversized explanatory heroes on the bilingual projects, writing, toolbox, and about index pages with compact, content-first layouts.

**Architecture:** Page files own semantic structure and localized copy. `cinematic-content.css` owns shared compact page headers, projects, writing, and about density; `cinematic-toolbox.css` owns toolbox density. Existing data collections and filter scripts remain unchanged except for hiding empty toolbox groups during search.

**Tech Stack:** Astro 7, TypeScript, CSS custom properties, Playwright, Vitest

---

### Task 1: Lock the compact layout contract

**Files:**
- Modify: `tests/e2e/smoke.spec.ts`
- Modify: `tests/e2e/blog.spec.ts`
- Modify: `tests/e2e/toolbox.spec.ts`
- Modify: `tests/e2e/about-seo.spec.ts`

- [x] **Step 1: Write failing Playwright assertions**

Add assertions that:

```ts
await expect(page.locator(".projects-hero, .blog-hero, .toolbox-hero, .about-hero")).toHaveCount(0);
await expect(page.locator(".compact-page-header")).toBeVisible();
await expect(page.locator(".projects-layout, .blog-list-layout, .toolbox-catalog, .about-overview")).toBeInViewport();
```

For the four English routes, assert the same legacy hero selectors are absent and `.compact-page-header` is present.

- [x] **Step 2: Verify the tests fail**

Run:

```bash
npx playwright test tests/e2e/smoke.spec.ts tests/e2e/blog.spec.ts tests/e2e/toolbox.spec.ts tests/e2e/about-seo.spec.ts
```

Expected: FAIL because the current pages still render the legacy hero selectors and do not render `.compact-page-header`.

### Task 2: Compact projects and writing pages

**Files:**
- Modify: `src/pages/projects/index.astro`
- Modify: `src/pages/blog/index.astro`
- Modify: `src/pages/en/projects/index.astro`
- Modify: `src/pages/en/blog/index.astro`
- Modify: `src/styles/cinematic-content.css`

- [x] **Step 1: Replace project and writing heroes**

Use this shared structure:

```astro
<header class="compact-page-header">
  <div>
    <p class="compact-page-header__eyebrow">PROJECT ARCHIVE</p>
    <h1>项目</h1>
  </div>
  <p class="compact-page-header__summary">公开项目与工程实践，共 {projects.length} 项。</p>
</header>
```

For writing, place archive, tags, and RSS links in `.compact-page-header__actions`.

- [x] **Step 2: Tighten sections and cards**

In `cinematic-content.css`:

```css
.compact-page-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 2rem;
  padding: 6rem 0 1.25rem;
  border-bottom: 1px solid var(--color-border);
}

.projects-section {
  margin-top: 2rem;
}
```

Use two project columns and a compact writing list while preserving existing filtering data attributes.

- [x] **Step 3: Run focused tests**

Run:

```bash
npx playwright test tests/e2e/projects.spec.ts tests/e2e/blog.spec.ts
```

Expected: PASS.

### Task 3: Compact the toolbox catalog

**Files:**
- Modify: `src/pages/toolbox/index.astro`
- Modify: `src/pages/en/toolbox/index.astro`
- Modify: `src/styles/cinematic-toolbox.css`
- Modify: `tests/e2e/toolbox.spec.ts`

- [x] **Step 1: Add compact header and category controls**

Render `.compact-page-header`, a sticky `.toolbox-catalog__controls`, and category buttons using `toolboxGroups`.

- [x] **Step 2: Extend local filtering**

The existing input handler must filter by query and selected category, then set the parent `.toolbox-group` to `hidden` when it has no visible `.tool-card`.

- [x] **Step 3: Increase desktop density**

Use:

```css
.toolbox-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.tool-card {
  min-height: 8.5rem;
}
```

Collapse to two columns below 64rem and one column on mobile.

- [x] **Step 4: Run focused tests**

Run:

```bash
npx playwright test tests/e2e/toolbox.spec.ts
```

Expected: PASS, including search and category filtering.

### Task 4: Compact the about pages

**Files:**
- Modify: `src/pages/about.astro`
- Modify: `src/pages/en/about.astro`
- Modify: `src/styles/cinematic-content.css`
- Modify: `tests/e2e/about-seo.spec.ts`

- [x] **Step 1: Build the overview**

Replace the oversized hero with:

```astro
<header class="compact-page-header">...</header>
<section class="about-overview">
  <div class="about-profile">...</div>
  <dl class="about-now">...</dl>
</section>
```

- [x] **Step 2: Tighten remaining sections**

Use three technology columns on desktop, compact principle rows, and a two-column contact link grid. Preserve `#contact`, JSON-LD, and all existing contact URLs.

- [x] **Step 3: Run focused tests**

Run:

```bash
npx playwright test tests/e2e/about-seo.spec.ts
```

Expected: PASS.

### Task 5: Responsive and full regression verification

**Files:**
- Modify: `tests/e2e/smoke.spec.ts`

- [x] **Step 1: Add first-viewport assertions**

At 1440×900, assert the first project card, first blog entry, first tool card, and `.about-overview` have a bounding-box top less than `900`.

- [x] **Step 2: Verify mobile containment**

At 390×844, assert no horizontal overflow and all compact headers use a single-column layout without overlapping controls.

- [x] **Step 3: Run complete verification**

Run:

```bash
npm test
npm run lint
npx astro check
GITHUB_SNAPSHOT_OFFLINE=1 npm run build
npm run test:e2e
git diff --check
```

Expected: all commands pass.

- [x] **Step 4: Browser visual QA**

Inspect `/projects/`, `/blog/`, `/toolbox/`, and `/about/` at 1440×900 and 390×844. Verify content begins directly below the compact header, there is no horizontal overflow, and deep links, filters, theme, language switching, and the command palette remain usable.
