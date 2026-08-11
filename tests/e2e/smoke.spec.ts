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
  await page.goto("/");

  await expect(page).toHaveTitle("ZJB.DEV｜赵建斌的数字实验室");
  await expect(page.getByRole("link", { name: "ZJB.DEV 首页" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "把复杂，做得有意思。" }),
  ).toBeVisible();
  const primaryEntries = page.getByLabel("首页快速入口");
  for (const entry of ["关于", "项目", "博客", "实验室"]) {
    await expect(
      primaryEntries.getByRole("link", { name: new RegExp(entry) }),
    ).toBeVisible();
  }
});

test("博客详情不加载首页与实验场景资源", async ({ page }) => {
  const scriptRequests: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script") {
      scriptRequests.push(request.url());
    }
  });

  await page.goto("/blog/harmonyos-next-learning-path/");
  await page.waitForLoadState("networkidle");

  expect(scriptRequests.join("\n")).not.toMatch(
    /three|hero|particle-galaxy|shader-art|physics-sandbox/i,
  );
});

test("全站核心页面在三档视口下无横向溢出", async ({ page }) => {
  const routes = ["/", "/projects/", "/blog/", "/playground/", "/about/"];
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
  await page.goto("/");

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

test("reduced-motion 首页保留静态 fallback 且不创建 Three.js Canvas", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await expect(page.locator(".hero__fallback")).toBeVisible();
  await expect(page.locator("[data-hero-scene]")).toHaveCount(0);
  await expect(page.locator("[data-hero]")).toHaveAttribute(
    "data-scene-state",
    "static",
  );
});

test("联系兼容路由跳转到 About 联系区或提供可用迁移入口", async ({
  page,
}) => {
  await page.goto("/contact/");

  await page
    .waitForURL(/\/about\/#contact$/, { timeout: 2_000 })
    .catch(() => undefined);
  if (new URL(page.url()).pathname === "/contact/") {
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://abinzhao.github.io/about/",
    );
    await expect(page.getByRole("link", { name: "立即跳转" })).toHaveAttribute(
      "href",
      "/about/#contact",
    );
    return;
  }

  await expect(page).toHaveURL(/\/about\/#contact$/);
  await expect(page.getByRole("heading", { name: "保持联系" })).toBeVisible();
});
