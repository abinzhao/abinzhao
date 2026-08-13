import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
}

test("首页展示品牌、Slogan 与四个主入口", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/abinzhao/");

  await expect(page).toHaveTitle("ZJB.DEV｜前端、鸿蒙与 AI 应用实践");
  await expect(page.getByRole("link", { name: "ZJB.DEV 首页" })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "在鸿蒙上，用前端的方式，把 AI 变成应用。",
    }),
  ).toBeVisible();
  for (const role of ["前端工程师", "鸿蒙开发者", "AI 实践者"]) {
    await expect(page.getByText(role)).toBeVisible();
  }
});

test("博客详情不加载全局宇宙场景或实验 Canvas", async ({ page }) => {
  await page.goto("/abinzhao/blog/harmonyos-next-learning-path/");

  await expect(page.locator("body")).toHaveAttribute(
    "data-page-variant",
    "article",
  );
  await expect(page.locator("[data-cosmic-canvas]")).toHaveCount(0);
  await expect(page.locator("[data-experiment-canvas]")).toHaveCount(0);
});

test("favicon 资源可正常访问", async ({ request }) => {
  const response = await request.get("/abinzhao/favicon.ico");

  expect(
    response.ok(),
    `GET /favicon.ico returned ${response.status()}`,
  ).toBe(true);
  expect(response.headers()["content-type"]).toMatch(
    /^image\/(?:x-icon|vnd\.microsoft\.icon)(?:;|$)/,
  );
});

test("全站核心页面在三档视口下无横向溢出", async ({ page }) => {
  const routes = ["/abinzhao/", "/abinzhao/projects/", "/abinzhao/blog/", "/abinzhao/playground/", "/abinzhao/about/"];
  const viewports = [
    { width: 1440, height: 900 },
    { width: 900, height: 900 },
    { width: 390, height: 844 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      await page.goto(route);
      await expectNoHorizontalOverflow(page);
    }
  }
});

test("390px 菜单可打开且核心触控目标不小于 44px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/abinzhao/");

  const menu = page.locator("[data-menu-toggle]");
  const mobileNavigation = page.getByLabel("移动端主导航");
  await expect(mobileNavigation).not.toBeVisible();
  await menu.click();
  await expect(mobileNavigation).toBeVisible();

  for (const target of [menu, mobileNavigation.getByRole("link", { name: "项目" })]) {
    await expect
      .poll(async () => (await target.boundingBox())?.height ?? 0)
      .toBeGreaterThanOrEqual(44);
  }
});

test("reduced-motion 首页保留完整内容且不创建 Three.js Canvas", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/abinzhao/");

  await expect(page.getByRole("heading", { name: "最新文章" })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
});

test("联系兼容路由跳转到 About 联系区或提供可用迁移入口", async ({
  page,
}) => {
  await page.goto("/abinzhao/contact/");

  await page
    .waitForURL(/\/about\/#contact$/, { timeout: 2_000 })
    .catch(() => undefined);
  if (new URL(page.url()).pathname === "/abinzhao/contact/") {
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://abinzhao.github.io/abinzhao/about/",
    );
    await expect(page.getByRole("link", { name: "立即跳转" })).toHaveAttribute(
      "href",
      "/abinzhao/about/#contact",
    );
    return;
  }

  await expect(page).toHaveURL(/\/about\/#contact$/);
  await expect(page.getByRole("heading", { name: "保持联系" })).toBeVisible();
});
