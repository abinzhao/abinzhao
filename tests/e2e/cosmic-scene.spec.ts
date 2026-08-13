import { expect, test } from "@playwright/test";

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 900, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`编辑式首页构图适配 ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/abinzhao/");

    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await expect(page.locator(".hero__copy")).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);
  });
}

test("移动端无 JavaScript 首帧导航与首页保持合理间距", async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto("/abinzhao/");

  const navigation = page.locator("[data-mobile-navigation]");
  await expect(navigation).toBeVisible();
  await expect(navigation).toHaveCSS("position", "fixed");

  const headerBox = await page.locator("[data-site-header]").boundingBox();
  const heroBox = await page.locator(".hero").boundingBox();
  expect(headerBox).not.toBeNull();
  expect(heroBox).not.toBeNull();
  expect(heroBox!.y).toBeLessThanOrEqual(
    headerBox!.y + headerBox!.height + 24,
  );

  await context.close();
});

test("普通页面不挂载全局宇宙 Canvas", async ({ page }) => {
  await page.goto("/abinzhao/projects/");

  await expect(page.locator("body")).toHaveAttribute(
    "data-page-variant",
    "projects",
  );
  await expect(page.locator("canvas")).toHaveCount(0);
});

test("实验详情只保留实验自身 Canvas", async ({ page }) => {
  await page.goto("/abinzhao/playground/particle-galaxy/");

  await expect(page.locator("[data-cosmic-canvas]")).toHaveCount(0);
  await expect(page.locator("[data-experiment-canvas]")).toHaveCount(1);
});

test("地球纹理可从 GitHub Pages base 下本地访问", async ({ request }) => {
  for (const asset of [
    "earth_atmos_2048.jpg",
    "earth_clouds_1024.png",
    "earth_lights_2048.png",
    "earth_normal_2048.jpg",
    "earth_specular_2048.jpg",
  ]) {
    const response = await request.get(`/abinzhao/assets/cosmic/${asset}`);
    expect(response.ok(), asset).toBe(true);
  }
});

test("主站页面切换后仍不创建全局 Canvas", async ({ page }) => {
  await page.goto("/abinzhao/");
  await page.getByRole("link", { name: "项目", exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/$/);
  await expect(page.locator("canvas")).toHaveCount(0);
});
