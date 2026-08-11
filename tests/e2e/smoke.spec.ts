import { expect, test } from "@playwright/test";

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
}

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

test("主题持久化且响应式布局无横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: /切换到.+模式/ }).click();

  const selectedTheme = await page.locator("html").getAttribute("data-theme");
  expect(selectedTheme).toMatch(/^(dark|light)$/);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    selectedTheme!,
  );

  for (const [name, viewport, expectedColumns] of [
    ["desktop", { width: 1440, height: 900 }, 3],
    ["tablet", { width: 900, height: 900 }, 2],
    ["mobile", { width: 390, height: 844 }, 1],
  ] as const) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expectNoHorizontalOverflow(page);
    await page.goto("/writing/");
    await expectNoHorizontalOverflow(page);
    await expect
      .poll(() =>
        page.locator(".writing-grid").evaluate((element) => {
          const columns = getComputedStyle(element).gridTemplateColumns;
          return columns === "none" ? 0 : columns.split(" ").length;
        }),
      )
      .toBe(expectedColumns);
    await page.screenshot({
      path: `/tmp/task9-writing-${name}.png`,
      fullPage: false,
    });
  }
});

test("reduced-motion 使用静态星体且交互不产生位移", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.getByTestId("static-celestial")).toBeVisible();
  await expect(page.getByTestId("webgl-celestial")).toHaveCount(0);

  const card = page.locator(".featured-card").first();
  await card.hover();
  await expect
    .poll(() => card.evaluate((element) => getComputedStyle(element).transform))
    .toBe("none");
  await page.screenshot({
    path: "/tmp/task9-home-reduced-motion.png",
    fullPage: false,
  });
});

test("390px 使用静态星体并提供 44px 移动菜单触控目标", async ({ page }) => {
  await page.emulateMedia({
    colorScheme: "dark",
    reducedMotion: "no-preference",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expectNoHorizontalOverflow(page);
  await expect(page.getByTestId("static-celestial")).toBeVisible();
  await expect(page.getByTestId("webgl-celestial")).toHaveCount(0);

  const mobileNavigation = page.getByLabel("移动端主导航");
  await expect(mobileNavigation).not.toBeVisible();
  const menu = page.getByText("菜单", { exact: true });
  await menu.click();
  await expect(mobileNavigation).toBeVisible();

  for (const target of [
    menu,
    mobileNavigation.getByRole("link", { name: "首页", exact: true }),
    mobileNavigation.getByRole("button", { name: /切换到.+模式/ }),
  ]) {
    await expect
      .poll(async () => (await target.boundingBox())?.height ?? 0)
      .toBeGreaterThanOrEqual(44);
  }

  await page.screenshot({
    path: "/tmp/task9-home-mobile-menu.png",
    fullPage: false,
  });
});
