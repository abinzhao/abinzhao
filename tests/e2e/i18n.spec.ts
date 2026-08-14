import { expect, test } from "@playwright/test";

test("语言切换保留核心独立页面", async ({ page }) => {
  await page.goto("/abinzhao/projects/");
  await page.getByRole("link", { name: "EN", exact: true }).click();

  await expect(page).toHaveURL(/\/abinzhao\/en\/projects\/$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { name: "Projects", exact: true }),
  ).toBeVisible();

  await page.getByRole("link", { name: "中", exact: true }).click();
  await expect(page).toHaveURL(/\/abinzhao\/projects\/$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
});

test("英文核心导航全部使用独立路由", async ({ page }) => {
  await page.goto("/abinzhao/en/");
  const hrefs = await page.locator(".desktop-navigation a").evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")),
  );

  expect(hrefs).toEqual([
    "/abinzhao/en/",
    "/abinzhao/en/projects/",
    "/abinzhao/en/blog/",
    "/abinzhao/en/playground/",
    "/abinzhao/en/toolbox/",
    "/abinzhao/en/about/",
  ]);
});
