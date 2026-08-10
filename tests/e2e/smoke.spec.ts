import { expect, test } from "@playwright/test";

test("核心页面在桌面和移动端可访问", async ({ page }) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText !== "net::ERR_ABORTED") {
      failedRequests.push(`${request.method()} ${request.url()}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedRequests.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page).toHaveTitle(/赵建斌/);
  await expect(
    page.getByRole("heading", { name: "构建跨端数字体验。" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "/tmp/personal-home-desktop.png",
    fullPage: false,
  });

  await page.getByRole("link", { name: "查看项目", exact: true }).click();
  await expect(page).toHaveURL(/\/work\/?$/);
  await expect(page.getByText("HarmonyOS Next 开发知识库")).toBeVisible();
  await page.getByText("HarmonyOS Next 开发知识库").click();
  await expect(page).toHaveURL(/\/work\/harmony-next-blog\/?$/);
  await expect(
    page.getByRole("link", { name: "查看 GitHub 仓库" }),
  ).toHaveAttribute(
    "href",
    "https://github.com/abinzhao/harmony-next-blog",
  );

  await page
    .getByLabel("主导航")
    .getByRole("link", { name: "文章", exact: true })
    .click();
  await expect(page).toHaveURL(/\/writing\/?$/);
  await page
    .getByText("从公开仓库整理 HarmonyOS Next 学习路径")
    .click();
  await expect(page).toHaveURL(
    /\/writing\/harmonyos-next-learning-path\/?$/,
  );
  await expect(
    page.getByRole("heading", {
      name: "从公开仓库整理 HarmonyOS Next 学习路径",
    }),
  ).toBeVisible();

  await page.getByRole("link", { name: "赵建斌个人网站首页" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "/tmp/personal-home-mobile-closed.png",
    fullPage: false,
  });
  await page.getByText("菜单", { exact: true }).click();
  await page.screenshot({
    path: "/tmp/personal-home-mobile.png",
    fullPage: false,
  });
  await page
    .getByLabel("移动端主导航")
    .getByRole("link", { name: "联系", exact: true })
    .click();
  await expect(page).toHaveURL(/\/contact\/?$/);
  await expect(
    page.getByText("联系表单将在服务确认后开放。"),
  ).toBeVisible();

  expect(failedRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
