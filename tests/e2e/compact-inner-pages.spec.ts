import { expect, test, type Page } from "@playwright/test";

const pages = [
  {
    route: "/abinzhao/projects/",
    legacyHero: ".projects-hero",
    content: ".project-card",
  },
  {
    route: "/abinzhao/blog/",
    legacyHero: ".blog-hero",
    content: "[data-blog-entry]",
  },
  {
    route: "/abinzhao/toolbox/",
    legacyHero: ".toolbox-hero",
    content: ".tool-card",
  },
  {
    route: "/abinzhao/about/",
    legacyHero: ".about-hero",
    content: ".about-overview",
  },
] as const;

const englishRoutes = [
  "/abinzhao/en/projects/",
  "/abinzhao/en/blog/",
  "/abinzhao/en/toolbox/",
  "/abinzhao/en/about/",
] as const;

async function expectInFirstViewport(page: Page, selector: string) {
  await expect
    .poll(async () => {
      const box = await page.locator(selector).first().boundingBox();
      return box?.y ?? Number.POSITIVE_INFINITY;
    })
    .toBeLessThan(900);
}

test("中文核心内页移除大型说明 Hero 并在首屏展示内容", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const item of pages) {
    await page.goto(item.route);
    await expect(page.locator(item.legacyHero)).toHaveCount(0);
    await expect(page.locator(".compact-page-header")).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator(".compact-page-header h1")
          .evaluate((heading) => Number.parseFloat(getComputedStyle(heading).fontSize)),
      )
      .toBeLessThanOrEqual(48);
    await expectInFirstViewport(page, item.content);
  }
});

test("英文核心内页使用相同的紧凑标题栏", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const route of englishRoutes) {
    await page.goto(route);
    await expect(
      page.locator(
        ".projects-hero, .blog-hero, .toolbox-hero, .about-hero",
      ),
    ).toHaveCount(0);
    await expect(page.locator(".compact-page-header")).toBeVisible();
  }
});

test("紧凑内页在移动端无横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const item of pages) {
    await page.goto(item.route);
    await expect
      .poll(() =>
        page
          .locator(".compact-page-header h1")
          .evaluate((heading) => Number.parseFloat(getComputedStyle(heading).fontSize)),
      )
      .toBeLessThanOrEqual(36);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
  }
});
