import { expect, test } from '@playwright/test';

test('filters courses by subject and search, and recovers from an empty result', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('columns/');
  const cards = page.locator('.column-card');
  await expect(cards).toHaveCount(6);
  await page.getByRole('button', { name: '游戏开发', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Godot');
  await page.getByRole('button', { name: '全部', exact: true }).click();
  const search = page.getByRole('searchbox', { name: '搜索专题教程' });
  await search.fill('Cordis');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Agent Harness');
  await search.fill('没有这个专题xyz');
  await expect(cards).toHaveCount(0);
  await page.getByRole('button', { name: '重置筛选', exact: true }).click();
  await expect(cards).toHaveCount(6);
});

test('makes every course accessible from the home page and starts its first chapter', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('');
  const courses = page.getByRole('navigation', { name: '专题快捷入口' });
  await expect(courses.getByRole('link')).toHaveCount(6);
  await courses.getByRole('link', { name: /Godot/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Godot');
  await page.getByRole('link', { name: '开始第一章', exact: true }).click();
  await expect(page.locator('.reading-prose')).toBeVisible();
  await expect(page.locator('.reading-pagination')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('keeps all course page families contained at phone, tablet and desktop widths', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const slug of ['fullstack-development', 'agent-harness', 'wechat-mini-program', 'agent-product-manager', 'uni-app', 'godot']) {
      await page.goto(`columns/${slug}/`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('link', { name: '开始第一章', exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${slug} at ${width}`).toBe(true);
    }
  }
});

test('contains long chapter bodies and preserves pagination in every curriculum', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const slug of ['fullstack-development', 'agent-harness', 'wechat-mini-program', 'agent-product-manager', 'uni-app', 'godot']) {
      await page.goto(`columns/${slug}/`);
      const links = page.locator('.column-reading-chapters h3 a');
      const chapters = [await links.first().getAttribute('href'), await links.last().getAttribute('href')];
      for (const chapter of chapters) {
        expect(chapter, slug).toBeTruthy();
        await page.goto(chapter!);
        await expect(page.locator('.reading-prose h2').first()).toBeVisible();
        await expect(page.locator('.reading-pagination')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${chapter} at ${width}`).toBe(true);
      }
    }
  }
});
