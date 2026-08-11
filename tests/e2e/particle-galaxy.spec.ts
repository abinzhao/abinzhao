import { expect, test } from "@playwright/test";

test("粒子银河支持暂停和重置", async ({ page }) => {
  await page.goto("/abinzhao/playground/particle-galaxy/");

  await expect(page.getByText("实验运行中", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "暂停实验" }).click();
  await expect(page.getByText("实验已暂停", { exact: true })).toBeVisible();

  const reset = page.getByRole("button", { name: "重置实验" });
  await expect(reset).toBeEnabled();
  await reset.click();
  await expect(page.getByText("实验已暂停", { exact: true })).toBeVisible();
});
