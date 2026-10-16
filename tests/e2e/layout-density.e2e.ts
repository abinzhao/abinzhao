import { expect, test, type Page } from '@playwright/test';

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

test.describe('desktop layout density', () => {
  test.use({ viewport: { height: 900, width: 1440 } });

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('brings blog filters and cards into the first viewport', async ({ page }) => {
    await page.goto('blog/');

    await expect(page.getByRole('heading', { level: 1, name: '博客' })).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);

    const header = await page.locator('.site-header__frame').boundingBox();
    const firstCard = await page.locator('.article-list-item').first().boundingBox();

    expect(header?.height).toBeLessThanOrEqual(56);
    expect(firstCard?.y).toBeLessThanOrEqual(300);
    await expectNoHorizontalOverflow(page);

    await page.getByRole('button', { name: '智能体' }).click();
    await expect(page.locator('.listing-count')).toContainText('智能体 · 1 篇文章');
    await expect(page.locator('.article-list-item')).toHaveCount(1);
  });

  test('starts article content before the 320px threshold', async ({ page }) => {
    await page.goto('columns/fullstack-development/00-web-foundations.html');

    await expect(page.locator('h1:visible')).toHaveCount(1);
    const readingLayout = await page.locator('.reading-layout').boundingBox();
    expect(readingLayout?.y).toBeLessThanOrEqual(320);

    const firstHeading = page.locator('.reading-prose h2[id]').first();
    const headingId = await firstHeading.getAttribute('id');
    expect(headingId).toBeTruthy();

    await page.goto(
      `columns/fullstack-development/00-web-foundations.html#${encodeURIComponent(headingId!)}`,
    );
    const headingTop = await page.locator('.reading-prose h2[id]').first().evaluate(
      (element) => element.getBoundingClientRect().top,
    );
    expect(headingTop).toBeGreaterThanOrEqual(88);
  });

  test('keeps key content visible across the remaining page families', async ({ page }) => {
    await page.goto('columns/');
    expect((await page.locator('.column-card').first().boundingBox())?.y).toBeLessThan(300);

    await page.goto('projects/');
    expect((await page.locator('.project-card').first().boundingBox())?.y).toBeLessThan(320);

    await page.goto('');
    const moduleTop = (await page.locator('.home-section--modules').boundingBox())?.y;
    expect(moduleTop).toBeLessThan(900);

    await page.goto('about');
    await expect(page.locator('.about-profile')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('mobile layout density', () => {
  test.use({ viewport: { height: 844, width: 390 } });

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('shows blog content early and closes navigation with Escape', async ({ page }) => {
    await page.goto('blog/');

    const header = await page.locator('.site-header__frame').boundingBox();
    const firstCard = await page.locator('.article-list-item').first().boundingBox();

    expect(header?.height).toBeLessThanOrEqual(56);
    expect(firstCard?.y).toBeLessThanOrEqual(400);
    await expectNoHorizontalOverflow(page);

    const menuButton = page.getByRole('button', { name: '切换导航菜单' });
    await menuButton.click();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#site-mobile-nav')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await expect(menuButton).toBeFocused();
  });

  test('starts article content before the 380px threshold', async ({ page }) => {
    await page.goto('columns/fullstack-development/00-web-foundations.html');

    const readingLayout = await page.locator('.reading-layout').boundingBox();
    expect(readingLayout?.y).toBeLessThanOrEqual(380);
    await expect(page.locator('h1:visible')).toHaveCount(1);
    await expectNoHorizontalOverflow(page);
  });

  test('folds the terminal and shows modules and a recent article in the first viewport', async ({ page }) => {
    await page.goto('');
    expect((await page.locator('.home-section--modules').boundingBox())?.y).toBeLessThanOrEqual(600);
    expect((await page.locator('.home-section--articles .article-card').first().boundingBox())?.y).toBeLessThan(844);
    const toggle = page.getByRole('button', { name: '展开开发终端' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.terminal-window__code')).not.toBeVisible();
    await toggle.click();
    await expect(page.locator('.terminal-window__code')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('opens the article outline before the body and returns focus with Escape', async ({ page }) => {
    await page.goto('columns/fullstack-development/00-web-foundations.html');
    const toggle = page.getByRole('button', { name: '打开本页目录' });
    expect((await toggle.boundingBox())?.y).toBeLessThan(380);
    await toggle.click();
    const dialog = page.getByRole('dialog', { name: '本页目录' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(toggle).toBeFocused();
    await toggle.click();
    await dialog.getByRole('link').first().click();
    await expect(dialog).not.toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('keeps all top-level page families within the mobile viewport', async ({ page }) => {
    for (const path of ['columns/', 'projects/', 'about', 'not-found-layout-check']) {
      await page.goto(path);
      await expectNoHorizontalOverflow(page);
    }

    await page.goto('');
    await expectNoHorizontalOverflow(page);

    const action = await page.locator('.home-hero__actions .button--primary').boundingBox();
    const launcher = await page.locator('.ai-launcher').boundingBox();
    const overlaps =
      action !== null &&
      launcher !== null &&
      !(
        action.x + action.width < launcher.x ||
        action.x > launcher.x + launcher.width ||
        action.y + action.height < launcher.y ||
        action.y > launcher.y + launcher.height
      );

    expect(overlaps).toBe(false);
  });
});
