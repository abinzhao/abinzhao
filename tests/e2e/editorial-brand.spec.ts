import { expect, test } from "@playwright/test";

test("首页表达前端、鸿蒙与 AI 的编辑式品牌定位", async ({ page }) => {
  await page.goto("/abinzhao/");

  await expect(
    page.getByRole("heading", {
      name: /让模型能力/,
    }),
  ).toBeVisible();
  await expect(page.getByText("AI 原生应用")).toBeVisible();
  await expect(page.getByText("HarmonyOS", { exact: true })).toBeVisible();
  await expect(page.getByText("Agent 工具链")).toBeVisible();
  await expect(page.getByRole("heading", { name: "写下能复用的技术判断。" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "公开运行轨迹，而不是提交噪音。" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "认真对待技术，也认真对待长期关系。" })).toBeVisible();
  await expect(page.locator(".fluid-backdrop")).toBeVisible();
  await expect(page.locator(".signal-grid")).toHaveCSS("border-radius", "26px");
  await expect(page.locator(".site-header")).toHaveCSS("border-radius", "999px");
});

test("主站不加载全局 WebGL，实验详情保持独立 Canvas", async ({ page }) => {
  await page.goto("/abinzhao/");
  await expect(page.locator("[data-cosmic-canvas]")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator(".fluid-backdrop")).toHaveCount(1);

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
