# Playground Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the bilingual playground index and three experiment detail layouts as a canvas-first workbench without changing experiment data or runtime behavior.

**Architecture:** The index pages share `ExperimentCard` and a featured-plus-secondary grid. `ExperimentLayout` owns the detail page composition, while `ExperimentShell` retains runtime state and controls. `playground.css` owns all playground-specific layout and responsive styling.

**Tech Stack:** Astro 7, TypeScript, CSS custom properties, Canvas/WebGL, Playwright, Vitest

---

### Task 1: Lock the index and detail layout contract

**Files:**
- Modify: `tests/e2e/playground.spec.ts`

- [x] **Step 1: Add failing index assertions**

Assert that Chinese and English routes render `.playground-workbench-header`, a shared `.experiment-grid`, three `[data-experiment-card]` elements, and no `.playground-hero`.

- [x] **Step 2: Add failing detail assertions**

At 1440×900, assert `[data-experiment-shell]` appears before `[data-experiment-notes]` in DOM order, the shell is wider than the notes column, and the canvas begins within the first viewport.

- [x] **Step 3: Add mobile assertions**

At 390×844, assert the index and detail pages have no horizontal overflow, the detail grid resolves to one column, and all runtime buttons remain at least 44px high.

- [x] **Step 4: Verify the new assertions fail**

Run:

```bash
npx playwright test tests/e2e/playground.spec.ts
```

Expected: FAIL because the current index still uses `.playground-hero`, English cards do not share `ExperimentCard`, and detail DOM order places notes before the shell.

### Task 2: Unify the bilingual experiment index

**Files:**
- Modify: `src/pages/playground/index.astro`
- Modify: `src/pages/en/playground/index.astro`
- Modify: `src/components/playground/ExperimentCard.astro`
- Modify: `src/styles/playground.css`

- [x] **Step 1: Replace both large heroes**

Render `.playground-workbench-header` with localized title, count, description, and the existing sorted experiment collection.

- [x] **Step 2: Share the card component**

Extend `ExperimentCard` with localized labels supplied through props while preserving experiment URLs, titles, descriptions, and technology tags.

- [x] **Step 3: Implement the featured-plus-secondary grid**

Use a two-column desktop grid where the first card spans the left column and two later cards stack on the right. Collapse to source-order single-column cards below 48rem.

- [x] **Step 4: Run the index-focused test**

Run:

```bash
npx playwright test tests/e2e/playground.spec.ts -g "实验列表|中英文"
```

Expected: PASS.

### Task 3: Recompose the detail page as a canvas-first workbench

**Files:**
- Modify: `src/layouts/ExperimentLayout.astro`
- Modify: `src/components/playground/ExperimentShell.astro`
- Modify: `src/styles/playground.css`

- [x] **Step 1: Compact the experiment identity header**

Keep the return link, slug, title, description, technology tags, and optional source URL while reducing vertical space before the workbench.

- [x] **Step 2: Put the runtime first**

Render `ExperimentShell` before `.experiment-detail__notes` in `.experiment-detail__layout`, and mark the notes with `data-experiment-notes`.

- [x] **Step 3: Consolidate runtime chrome**

Keep status, pause, resume, reset, retry, and dynamic controls in a compact toolbar around the unchanged canvas stage. Preserve all existing data attributes used by the runtime.

- [x] **Step 4: Implement desktop and mobile geometry**

Use approximately 72%/28% columns on desktop with a sticky shell. Below 900px, switch to one column, disable sticky positioning, cap the stage at 70vh, and preserve 44px controls.

- [x] **Step 5: Run detail and no-JavaScript tests**

Run:

```bash
npx playwright test tests/e2e/playground.spec.ts tests/e2e/editorial-brand.spec.ts tests/e2e/cosmic-scene.spec.ts
```

Expected: PASS.

### Task 4: Complete regression and visual verification

**Files:**
- Modify: `docs/superpowers/plans/2026-08-14-playground-workbench.md`

- [x] **Step 1: Run all automated checks**

```bash
npm test
npm run lint
npx astro check
GITHUB_SNAPSHOT_OFFLINE=1 npm run build
npm run test:e2e
git diff --check
```

Expected: all commands pass.

- [x] **Step 2: Inspect desktop rendering**

At 1440×900, inspect `/playground/` and each detail route. Verify the primary experiment leads the index, canvas is the dominant detail surface, controls do not resize the workbench, and no console errors appear.

- [x] **Step 3: Inspect mobile rendering**

At 390×844, inspect the index and all detail routes. Verify source-order stacking, no horizontal overflow, usable controls, and canvas framing.

- [x] **Step 4: Review the final diff**

Confirm only playground pages, components, styles, tests, and this plan changed; no runtime scene logic, content frontmatter, generated files, dependencies, or build output changed.
