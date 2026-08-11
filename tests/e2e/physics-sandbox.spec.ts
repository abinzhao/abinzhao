import { expect, test } from "@playwright/test";

test("物理沙盒正常运行并支持重力切换和通用重置", async ({ page }) => {
  await page.goto("/playground/physics-sandbox/");

  await expect(page.getByText("实验运行中", { exact: true })).toBeVisible();

  const gravity = page.getByRole("button", { name: "关闭重力" });
  await expect(gravity).toBeEnabled();
  await gravity.click();
  await expect(
    page.getByRole("button", { name: "开启重力" }),
  ).toBeEnabled();

  const reset = page.getByRole("button", { name: "重置实验" });
  await expect(reset).toBeEnabled();
  await reset.click();
  await expect(page.getByText("实验运行中", { exact: true })).toBeVisible();
});

test.describe("减少动态效果", () => {
  test("物理沙盒提供可用的单步运行", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/playground/physics-sandbox/");

    await expect(page.getByText("实验运行中", { exact: true })).toBeVisible();
    const step = page.getByRole("button", { name: "运行一次" });
    await expect(step).toBeEnabled();
    await step.click();

    await context.close();
  });
});
