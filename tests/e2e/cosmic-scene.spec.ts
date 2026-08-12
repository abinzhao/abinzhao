import { expect, test } from "@playwright/test";

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 900, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`宇宙首页构图适配 ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/abinzhao/");

    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await expect(page.locator("[data-hero-copy]")).toBeVisible();
    await expect(page.locator("[data-cosmic-scene]")).toBeVisible();
  });
}

test("移动端无 JavaScript 首帧导航不挤压首页内容", async ({ browser }) => {
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
  const heroBox = await page.locator("[data-cosmic-journey]").boundingBox();
  expect(headerBox).not.toBeNull();
  expect(heroBox).not.toBeNull();
  expect(heroBox!.y).toBeLessThanOrEqual(headerBox!.height + 1);

  await context.close();
});

test("普通页面只挂载一个全局宇宙 Canvas", async ({ page }) => {
  await page.goto("/abinzhao/projects/");

  await expect(page.locator("[data-cosmic-scene]")).toHaveAttribute(
    "data-cosmic-variant",
    "projects",
  );
  await expect(page.locator("[data-cosmic-canvas]")).toHaveCount(1);
});

test("实验详情只保留实验自身 Canvas", async ({ page }) => {
  await page.goto("/abinzhao/playground/particle-galaxy/");

  await expect(page.locator("[data-cosmic-scene]")).toHaveAttribute(
    "data-render-mode",
    "static",
  );
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

test("WebGL context loss switches to fallback without rebuilding", async ({
  page,
}) => {
  await page.goto("/abinzhao/");
  await expect(page.locator("[data-cosmic-scene]")).toHaveAttribute(
    "data-scene-state",
    "ready",
  );

  await page.locator("[data-cosmic-canvas]").evaluate((canvas) => {
    canvas.dispatchEvent(
      new Event("webglcontextlost", { cancelable: true }),
    );
  });

  await expect(page.locator("[data-cosmic-scene]")).toHaveAttribute(
    "data-scene-state",
    "fallback",
  );
  await expect(page.locator("[data-cosmic-canvas]")).toHaveCount(1);
});
