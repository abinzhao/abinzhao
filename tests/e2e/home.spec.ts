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
  await page.goto("/abinzhao/");

  await expect(
    page.getByRole("heading", {
      name: /让模型能力/,
    }),
  ).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute(
    "data-page-variant",
    "home",
  );
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "写下能复用的技术判断。" })).toBeVisible();
  await expect(page.locator(".home-content-card")).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "代表项目不是陈列，而是工程判断的证据。" })).toBeVisible();
  await expect(page.locator(".home-project")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "实验是可以运行的技术说明。" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "认真对待技术，也认真对待长期关系。" }),
  ).toBeVisible();

  expect(diagnostics).toEqual({
    errors: [],
    heroWarnings: [],
    failedRequests: [],
  });
});

test("reduced-motion 保留完整内容且不启动 Canvas 场景", async ({ page }) => {
  const diagnostics = collectRuntimeDiagnostics(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/abinzhao/");

  await expect(page.getByRole("heading", { name: "写下能复用的技术判断。" })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
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

test("首页不再请求 GSAP 动态运行时", async ({ page }) => {
  const runtimeErrors: string[] = [];
  const gsapRequests: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("request", (request) => {
    if (/\/_astro\/gsap\..+\.js$/.test(request.url())) {
      gsapRequests.push(request.url());
    }
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/abinzhao/");

  expect(runtimeErrors).toEqual([]);
  expect(gsapRequests).toEqual([]);
});

test("无 JavaScript 时 Hero 文案与主要链接完整可用", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/abinzhao/");

  await expect(
    page.getByRole("heading", {
      name: /让模型能力/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /查看代表项目/ }),
  ).toHaveAttribute("href", "/abinzhao/projects/");
  await expect(
    page.getByRole("link", { name: /打开工具箱/ }),
  ).toHaveAttribute("href", "/abinzhao/toolbox/");
  await expect(page.locator("canvas")).toHaveCount(0);

  await context.close();
});

test("滚动后文章、动态与项目内容保持可访问", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/abinzhao/");
  await page.getByRole("heading", { name: "公开运行轨迹，而不是提交噪音。" }).scrollIntoViewIfNeeded();

  await expect(page.getByRole("heading", { name: "公开运行轨迹，而不是提交噪音。" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "代表项目不是陈列，而是工程判断的证据。" })).toBeVisible();
});
