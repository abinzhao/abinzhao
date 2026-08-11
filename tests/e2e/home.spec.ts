import { expect, test, type Page } from "@playwright/test";

function collectRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("桌面首页优先展示真实静态内容并按顺序组织叙事", async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "把复杂，做得有意思。" }),
  ).toBeVisible();
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
  expect(errors).toEqual([]);
});

test("reduced-motion 保留 fallback 且不启动 Canvas 场景", async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await expect(page.locator(".hero__fallback")).toBeVisible();
  await expect(page.locator("[data-hero-scene]")).toHaveCount(0);
  await expect(page.locator("[data-hero]")).toHaveAttribute(
    "data-scene-state",
    "static",
  );
  expect(errors).toEqual([]);
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
