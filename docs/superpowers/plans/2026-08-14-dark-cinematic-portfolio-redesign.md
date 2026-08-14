# Dark Cinematic Portfolio Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved abinzhao bilingual dark-cinematic portfolio, independent top-level pages, animated capsule navigation, local-first toolbox, command search, and resilient GitHub activity snapshot.

**Architecture:** Keep Astro static generation and existing content collections. Add a shared locale-aware site model and visual shell, then build page-specific components on top; interactive behavior remains small TypeScript modules with CSS fallbacks, while toolbox processors are pure tested functions loaded only by their own pages.

**Tech Stack:** Astro 7, TypeScript strict, MDX Content Collections, CSS custom properties, Pagefind, Vitest, Playwright, GitHub Pages.

---

## File Map

- `src/lib/site.ts`: brand, locale, navigation, social links, base-path helpers.
- `src/lib/i18n.ts`: locale route mapping and translated shared labels.
- `src/layouts/BaseLayout.astro`: theme/locale bootstrap, global shell and metadata.
- `src/components/global/*`: capsule header, command palette, fluid background, pointer effects and footer.
- `src/styles/cinematic-*.css`: tokens, shell, content, home, toolbox and responsive states.
- `src/pages/**`: independent Chinese routes and `/en/**` core-page counterparts.
- `src/lib/toolbox/*`: deterministic processors and typed tool registry.
- `src/pages/toolbox/**`: toolbox index and independently addressable tools.
- `src/lib/github-snapshot.ts` and `src/data/github-snapshot.json`: build-time GitHub normalization and fallback data.
- `tests/unit/**` and `tests/e2e/**`: behavior, routing, accessibility and visual-state coverage.

### Task 1: Site identity, locale model, and independent navigation

**Files:**
- Modify: `src/lib/site.ts`
- Create: `src/lib/i18n.ts`
- Modify: `src/components/global/BrandMark.astro`
- Test: `tests/unit/site-paths.test.ts`
- Create: `tests/unit/i18n.test.ts`

- [ ] **Step 1: Write failing tests for identity and locale routes**

```ts
import { describe, expect, it } from "vitest";
import { localizedPath, localeFromPath } from "@/lib/i18n";
import { site } from "@/lib/site";

describe("localized routes", () => {
  it("maps core routes to independent English pages", () => {
    expect(localizedPath("/projects/", "en")).toBe("/abinzhao/en/projects/");
    expect(localizedPath("/toolbox/", "en")).toBe("/abinzhao/en/toolbox/");
  });

  it("detects locale without mistaking the base path", () => {
    expect(localeFromPath("/abinzhao/en/about/")).toBe("en");
    expect(localeFromPath("/abinzhao/about/")).toBe("zh");
  });

  it("uses the approved identity", () => {
    expect(site.name).toBe("abinzhao");
    expect(site.owner).toBe("阿斌");
  });
});
```

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- tests/unit/site-paths.test.ts tests/unit/i18n.test.ts`

Expected: FAIL because `i18n.ts` and approved identity do not exist.

- [ ] **Step 3: Implement the locale API and navigation records**

```ts
export type Locale = "zh" | "en";

const coreRoutes = ["/", "/projects/", "/blog/", "/playground/", "/toolbox/", "/about/"] as const;

export function localeFromPath(pathname: string): Locale {
  return pathname.includes("/abinzhao/en/") || pathname.endsWith("/abinzhao/en") ? "en" : "zh";
}

export function localizedPath(path: string, locale: Locale): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return withBase(locale === "en" ? `/en${normalized === "/" ? "/" : normalized}` : normalized);
}
```

Update `site.navigation` to 首页、项目、文章、实验、工具箱、关于 and update brand/social metadata to the approved values.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- tests/unit/site-paths.test.ts tests/unit/i18n.test.ts`

Expected: PASS.

### Task 2: Cinematic shell, rounded surfaces, and animated scroll header

**Files:**
- Create: `src/components/global/FluidBackdrop.astro`
- Create: `src/components/global/PointerEffects.astro`
- Create: `src/components/global/CommandPalette.astro`
- Modify: `src/components/global/SiteHeader.astro`
- Modify: `src/components/global/Footer.astro`
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/scripts/navigation.ts`
- Create: `src/scripts/pointer-effects.ts`
- Create: `src/styles/cinematic-system.css`
- Create: `src/styles/cinematic-content.css`
- Test: `tests/e2e/shell.spec.ts`

- [ ] **Step 1: Add failing shell assertions**

```ts
test("capsule header transitions after scrolling", async ({ page }) => {
  await page.goto("/abinzhao/");
  const header = page.locator("[data-site-header]");
  await expect(header).toHaveAttribute("data-scrolled", "false");
  const initial = await header.boundingBox();
  await page.evaluate(() => scrollTo(0, 120));
  await expect(header).toHaveAttribute("data-scrolled", "true");
  const compact = await header.boundingBox();
  expect(compact!.width).toBeLessThan(initial!.width);
});

test("top-level navigation uses pages, not anchors", async ({ page }) => {
  await page.goto("/abinzhao/");
  const hrefs = await page.locator(".desktop-navigation a").evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")),
  );
  expect(hrefs.every((href) => href && !href.startsWith("#"))).toBe(true);
});
```

- [ ] **Step 2: Verify E2E fails**

Run: `npx playwright test tests/e2e/shell.spec.ts --project=chromium`

Expected: FAIL because the approved capsule dimensions and independent toolbox link are absent.

- [ ] **Step 3: Implement the shell**

Use `data-scrolled` at `scrollY > 32`, coalesce updates through `requestAnimationFrame`, and define:

```css
.site-header {
  width: min(calc(100% - 32px), 1180px);
  margin: 12px auto 0;
  border-radius: 999px;
  transition:
    width 320ms cubic-bezier(.22, 1, .36, 1),
    transform 320ms cubic-bezier(.22, 1, .36, 1),
    background-color 320ms ease,
    box-shadow 320ms ease;
}

.site-header[data-scrolled="true"] {
  width: min(calc(100% - 40px), 920px);
  transform: translateY(-4px);
  box-shadow: 0 18px 50px var(--shadow-medium);
}
```

Add 12/18/26/999px radii, light/dark contrast tokens, CSS fluid layers, pointer light, keyboard focus and reduced-motion/coarse-pointer fallbacks.

- [ ] **Step 4: Run shell tests and type checks**

Run: `npm test && npx playwright test tests/e2e/shell.spec.ts --project=chromium`

Expected: PASS.

### Task 3: Home, projects, blog, playground, and About redesign

**Files:**
- Modify: `src/pages/index.astro`
- Modify: `src/pages/projects/index.astro`
- Modify: `src/pages/projects/[slug].astro`
- Modify: `src/pages/blog/index.astro`
- Modify: `src/pages/blog/[slug].astro`
- Modify: `src/pages/playground/index.astro`
- Modify: `src/layouts/ExperimentLayout.astro`
- Modify: `src/pages/about.astro`
- Modify: `src/components/home/*.astro`
- Modify: `src/components/projects/*.astro`
- Modify: `src/components/blog/*.astro`
- Modify: `src/components/playground/*.astro`
- Create: `src/styles/cinematic-home.css`
- Create: `src/styles/cinematic-pages.css`
- Test: `tests/e2e/home.spec.ts`
- Test: `tests/e2e/projects.spec.ts`
- Test: `tests/e2e/blog.spec.ts`
- Test: `tests/e2e/playground.spec.ts`
- Test: `tests/e2e/about-seo.spec.ts`

- [ ] **Step 1: Replace old visual assertions with approved content hierarchy**

```ts
await expect(page.getByRole("heading", { name: /让模型能力/ })).toBeVisible();
await expect(page.getByRole("link", { name: "Singularity Engine" })).toBeVisible();
await expect(page.getByText("纯爱掌门人")).toBeVisible();
await expect(page.locator("main canvas")).toHaveCount(0);
```

Add page-specific assertions for project evidence fields, article language labels, experiment boundaries and About capability groups.

- [ ] **Step 2: Verify focused page tests fail**

Run: `npx playwright test tests/e2e/home.spec.ts tests/e2e/projects.spec.ts tests/e2e/blog.spec.ts tests/e2e/playground.spec.ts tests/e2e/about-seo.spec.ts --project=chromium`

Expected: FAIL on approved copy, structure and visual selectors.

- [ ] **Step 3: Implement the approved page structures**

Build semantic sections with no nested decorative cards. Use rounded 18px repeated items and 26px primary workspaces, real project/content collection data, stable solid article text and independent page links.

- [ ] **Step 4: Run focused E2E**

Run: `npx playwright test tests/e2e/home.spec.ts tests/e2e/projects.spec.ts tests/e2e/blog.spec.ts tests/e2e/playground.spec.ts tests/e2e/about-seo.spec.ts --project=chromium`

Expected: PASS.

### Task 4: Local-first toolbox and independent tool routes

**Files:**
- Create: `src/lib/toolbox/types.ts`
- Create: `src/lib/toolbox/registry.ts`
- Create: `src/lib/toolbox/processors.ts`
- Create: `src/components/toolbox/ToolShell.astro`
- Create: `src/components/toolbox/ToolCard.astro`
- Create: `src/pages/toolbox/index.astro`
- Create: `src/pages/toolbox/[slug].astro`
- Create: `src/scripts/toolbox.ts`
- Create: `src/styles/cinematic-toolbox.css`
- Create: `tests/unit/toolbox.test.ts`
- Create: `tests/e2e/toolbox.spec.ts`

- [ ] **Step 1: Write processor tests**

```ts
import { describe, expect, it } from "vitest";
import { formatJson, convertTimestamp, encodeBase64, uniqueLines } from "@/lib/toolbox/processors";

describe("toolbox processors", () => {
  it("formats valid JSON and rejects invalid JSON", () => {
    expect(formatJson('{"a":1}')).toEqual({ ok: true, value: '{\n  "a": 1\n}' });
    expect(formatJson("{")).toMatchObject({ ok: false });
  });

  it("keeps line order while removing duplicates", () => {
    expect(uniqueLines("a\nb\na")).toBe("a\nb");
  });

  it("encodes unicode Base64 locally", () => {
    expect(encodeBase64("阿斌")).toBe("6Zi/5paM");
  });

  it("rejects invalid timestamps", () => {
    expect(convertTimestamp("not-a-time")).toMatchObject({ ok: false });
  });
});
```

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- tests/unit/toolbox.test.ts`

Expected: FAIL because toolbox modules are absent.

- [ ] **Step 3: Implement registry and processors**

Use a discriminated result:

```ts
export type ToolResult = { ok: true; value: string } | { ok: false; error: string };
```

Register all approved developer, text, design and AI tools. Each `/toolbox/[slug]/` page imports only its selected processor UI; no network requests or persistence occur.

- [ ] **Step 4: Add and run toolbox E2E**

Verify `/abinzhao/toolbox/`, `/abinzhao/toolbox/json/`, invalid input states, keyboard operation, direct URL loading, mobile layout and no API requests.

Run: `npm test -- tests/unit/toolbox.test.ts && npx playwright test tests/e2e/toolbox.spec.ts --project=chromium`

Expected: PASS.

### Task 5: English core routes and command palette

**Files:**
- Create: `src/pages/en/index.astro`
- Create: `src/pages/en/projects/index.astro`
- Create: `src/pages/en/blog/index.astro`
- Create: `src/pages/en/playground/index.astro`
- Create: `src/pages/en/toolbox/index.astro`
- Create: `src/pages/en/about.astro`
- Modify: `src/components/global/CommandPalette.astro`
- Create: `src/scripts/command-palette.ts`
- Modify: `src/pages/search.astro`
- Create: `tests/e2e/i18n.spec.ts`
- Create: `tests/e2e/command-palette.spec.ts`

- [ ] **Step 1: Add failing route and command tests**

```ts
test("language switch preserves the core page", async ({ page }) => {
  await page.goto("/abinzhao/projects/");
  await page.getByRole("link", { name: "EN" }).click();
  await expect(page).toHaveURL(/\/abinzhao\/en\/projects\/$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("command palette opens with keyboard and finds tools", async ({ page }) => {
  await page.goto("/abinzhao/");
  await page.keyboard.press("Control+K");
  await page.getByRole("combobox").fill("JSON");
  await expect(page.getByRole("option", { name: /JSON Formatter/ })).toBeVisible();
});
```

- [ ] **Step 2: Verify tests fail**

Run: `npx playwright test tests/e2e/i18n.spec.ts tests/e2e/command-palette.spec.ts --project=chromium`

Expected: FAIL because English routes and command palette are absent.

- [ ] **Step 3: Implement static English pages and palette**

Use shared page components with locale props. Load Pagefind lazily when the palette opens; merge static action records and content results, preserve `/search/` as fallback, trap focus and close on Escape/backdrop.

- [ ] **Step 4: Run focused tests**

Run: `npx playwright test tests/e2e/i18n.spec.ts tests/e2e/command-palette.spec.ts --project=chromium`

Expected: PASS.

### Task 6: Resilient GitHub static snapshot

**Files:**
- Create: `scripts/sync-github-snapshot.mjs`
- Create: `src/lib/github-snapshot.ts`
- Create: `src/data/github-snapshot.json`
- Modify: `package.json`
- Modify: `src/pages/index.astro`
- Create: `tests/unit/github-snapshot.test.ts`

- [ ] **Step 1: Test snapshot validation and fallback**

```ts
import { expect, it } from "vitest";
import { normalizeSnapshot } from "@/lib/github-snapshot";

it("returns the previous snapshot when remote data is invalid", () => {
  const previous = { updatedAt: "2026-08-14T00:00:00Z", releases: [], repositories: [], contributions: [] };
  expect(normalizeSnapshot(null, previous)).toEqual(previous);
});
```

- [ ] **Step 2: Verify test fails**

Run: `npm test -- tests/unit/github-snapshot.test.ts`

Expected: FAIL because snapshot normalization is absent.

- [ ] **Step 3: Implement non-blocking build synchronization**

Add `prebuild` script that fetches public GitHub data with timeout and user-agent, writes only validated JSON, and exits successfully with the previous checked-in snapshot on network, API or rate-limit failure.

- [ ] **Step 4: Verify success and fallback paths**

Run: `npm test -- tests/unit/github-snapshot.test.ts && GITHUB_SNAPSHOT_OFFLINE=1 node scripts/sync-github-snapshot.mjs`

Expected: PASS and existing snapshot remains valid.

### Task 7: Full regression, responsive visual QA, and cleanup

**Files:**
- Modify: affected `tests/e2e/*.spec.ts`
- Delete only after imports are gone: obsolete `src/styles/glass-*.css`
- Delete only after imports are gone: obsolete `src/components/global/AmbientLight.astro`

- [ ] **Step 1: Run static verification**

Run: `npm test && npm run lint && npx astro check && npm run build && git diff --check`

Expected: all commands PASS.

- [ ] **Step 2: Run complete browser suite**

Run: `npm run test:e2e`

Expected: all tests PASS on configured desktop and mobile projects.

- [ ] **Step 3: Inspect target viewports**

Use browser screenshots at 390×844, 768×1024, 1024×768 and 1440×1000 for home, projects, blog, playground, toolbox and About in both themes. Verify no overlap, clipped text, horizontal overflow, blank canvas or header transition jump.

- [ ] **Step 4: Verify runtime boundaries**

Confirm home, content and toolbox network requests contain no Three.js, GSAP or remote image assets; verify Three.js loads only on experiment detail routes.

- [ ] **Step 5: Review final diff**

Run: `git status --short && git diff --stat && git diff --check`

Expected: only approved design, content, route, toolbox, snapshot and test changes; no generated build output, secrets or unrelated formatting.

## Execution Policy

- Implement in the listed order with tests before production changes.
- Do not commit or push without explicit user authorization.
- Preserve unrelated user changes and do not modify lockfiles unless dependency changes become necessary; this plan requires no new dependency.
