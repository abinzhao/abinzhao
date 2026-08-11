import { expect, test } from "@playwright/test";

test("着色器艺术暴露三个可访问参数控件", async ({ page }) => {
  await page.goto("/playground/shader-art/");

  await expect(page.getByText("实验运行中", { exact: true })).toBeVisible();
  await expect(page.getByRole("slider", { name: "速度" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "噪声尺度" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "色相" })).toBeVisible();
});

test("减少动态效果时仍可手动调整噪声尺度", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/playground/shader-art/");

  const scale = page.getByRole("slider", { name: "噪声尺度" });
  await scale.fill("1.5");

  await expect(scale).toHaveValue("1.5");
  await expect(scale).toHaveAttribute("aria-valuetext", "1.5");
});
