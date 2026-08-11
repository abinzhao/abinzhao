import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

function collectRuntimeDiagnostics(page: Page) {
  const errors: string[] = [];
  const heroWarnings: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
    if (
      message.type() === "warning" &&
      message.text().includes("Hero scene initialization failed")
    ) {
      heroWarnings.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) => {
    failedRequests.push(
      `${request.url()}: ${request.failure()?.errorText ?? "unknown error"}`,
    );
  });
  return { errors, heroWarnings, failedRequests };
}

test("桌面首页优先展示真实静态内容并按顺序组织叙事", async ({ page }) => {
  const diagnostics = collectRuntimeDiagnostics(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "把复杂，做得有意思。" }),
  ).toBeVisible();
  await expect(page.locator("[data-hero]")).toHaveAttribute(
    "data-scene-state",
    "ready",
  );
  await expect(page.locator("[data-hero-scene]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "精选项目" })).toBeVisible();
  await expect(page.locator("[data-home-project]")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "最新博客" })).toBeVisible();
  await expect(page.locator("[data-home-post]")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "实验预览" })).toBeVisible();
  await expect(page.locator("[data-home-experiment]")).toHaveCount(3);
  await expect(
    page.getByRole("heading", { name: "还想知道更多？" }),
  ).toBeVisible();

  const sectionOrder = await page
    .locator("main > [data-home-section]")
    .evaluateAll((sections) => sections.map((section) => section.id));
  expect(sectionOrder).toEqual([
    "hero",
    "featured-projects",
    "latest-blog",
    "playground-preview",
    "about",
  ]);
  expect(diagnostics).toEqual({
    errors: [],
    heroWarnings: [],
    failedRequests: [],
  });
});

test("reduced-motion 保留 fallback 且不启动 Canvas 场景", async ({ page }) => {
  const diagnostics = collectRuntimeDiagnostics(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await expect(page.locator(".hero__fallback")).toBeVisible();
  await expect(page.locator("[data-hero-scene]")).toHaveCount(0);
  await expect(page.locator("[data-hero]")).toHaveAttribute(
    "data-scene-state",
    "static",
  );
  expect(diagnostics).toEqual({
    errors: [],
    heroWarnings: [],
    failedRequests: [],
  });
});

test("滚动增强在动态导入前建立离页清理边界", () => {
  const source = readFileSync("src/scripts/transitions.ts", "utf8");
  const disposedDeclaration = source.indexOf("let disposed = false");
  const cleanupRegistration = source.indexOf(
    'window.addEventListener("pagehide", dispose',
    disposedDeclaration,
  );
  const dynamicImport = source.indexOf('import("gsap")');
  const postImportGuard = source.indexOf(
    "disposed || !hero.isConnected || !visual.isConnected",
  );

  expect(disposedDeclaration).toBeGreaterThan(-1);
  expect(cleanupRegistration).toBeGreaterThan(disposedDeclaration);
  expect(dynamicImport).toBeGreaterThan(cleanupRegistration);
  expect(postImportGuard).toBeGreaterThan(dynamicImport);
});

test("GSAP 动态导入失败时不产生未处理 rejection", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  await page.addInitScript(() => {
    window.addEventListener("unhandledrejection", (event) => {
      document.documentElement.dataset.unhandledRejection = String(
        event.reason,
      );
    });
  });
  await page.route(/\/_astro\/gsap\..+\.js$/, (route) =>
    route.abort("failed"),
  );
  const failedImport = page.waitForEvent(
    "requestfailed",
    (request) => /\/_astro\/gsap\..+\.js$/.test(request.url()),
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await failedImport;
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));

  expect(runtimeErrors).toEqual([]);
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-unhandled-rejection",
  );
});

test("无 JavaScript 时 Hero 文案与主要链接完整可用", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "把复杂，做得有意思。" }),
  ).toBeVisible();
  await expect(page.getByText("赵建斌 / 开发者与实验者")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "查看项目", exact: true }),
  ).toHaveAttribute("href", "/projects/");
  await expect(
    page.getByRole("link", { name: "进入实验室", exact: true }),
  ).toHaveAttribute("href", "/playground/");
  await expect(page.locator(".hero__fallback")).toBeVisible();

  await context.close();
});
