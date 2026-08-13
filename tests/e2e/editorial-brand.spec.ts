import { expect, test } from "@playwright/test";

test("首页表达前端、鸿蒙与 AI 的编辑式品牌定位", async ({ page }) => {
  await page.goto("/abinzhao/");

  await expect(
    page.getByRole("heading", {
      name: "在鸿蒙上，用前端的方式，把 AI 变成应用。",
    }),
  ).toBeVisible();
  await expect(page.getByText("前端工程师")).toBeVisible();
  await expect(page.getByText("鸿蒙开发者")).toBeVisible();
  await expect(page.getByText("AI 实践者")).toBeVisible();
  await expect(page.getByRole("heading", { name: "最新文章" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "动态碎片" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "保持低频联系" })).toBeVisible();
});

test("主站不加载全局 WebGL，实验详情保持独立 Canvas", async ({ page }) => {
  await page.goto("/abinzhao/");
  await expect(page.locator("[data-cosmic-canvas]")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);

  await page.goto("/abinzhao/playground/shader-art/");
  await expect(page.locator("[data-experiment-canvas]")).toHaveCount(1);
  await expect(page.locator("[data-cosmic-canvas]")).toHaveCount(0);
});

test("文章页提供阅读进度、目录与观点反馈", async ({ page }) => {
  await page.goto("/abinzhao/blog/harmonyos-next-learning-path/");

  await expect(page.locator("[data-reading-progress]")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "文章目录" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "这个观点改变了我的想法" }),
  ).toBeVisible();
});

test("搜索页提供 Pagefind 容器和无脚本说明", async ({ page }) => {
  await page.goto("/abinzhao/search/");

  await expect(page.getByRole("heading", { name: "全文搜索" })).toBeVisible();
  await expect(page.locator("[data-pagefind-search]")).toBeVisible();
  await expect(page.locator("noscript")).toHaveCount(1);
  expect(await page.content()).toContain("启用 JavaScript");
});
