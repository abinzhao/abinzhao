import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const repositories = JSON.parse(readFileSync(new URL('../../docs/content/github/repos.json', import.meta.url), 'utf8')).projects as Array<{ name: string; url: string }>;

test('opens a recent article by clicking its description', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('');
  const card = page.locator('.article-card').first();
  await card.scrollIntoViewIfNeeded();
  const href = await card.locator('a').first().getAttribute('href');
  // 扩展后的原生链接覆盖文案区域；按真实鼠标坐标验收，避免定位器要求 p 接收事件。
  const description = await card.locator('p').boundingBox();
  await page.mouse.click(description!.x + 12, description!.y + 12);
  await expect(page).toHaveURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
});

test('finds every public repository by name and resets an empty search', async ({ page }) => {
  await page.goto('projects/');
  await expect(page.locator('.project-card')).toHaveCount(repositories.length);
  for (const repository of repositories) {
    await page.getByRole('searchbox', { name: '搜索公开项目' }).fill(repository.name);
    const card = page.locator('.project-card').filter({ has: page.getByRole('heading', { name: repository.name, exact: true }) });
    await expect(card).toHaveAttribute('href', repository.url);
  }
  await page.getByRole('searchbox', { name: '搜索公开项目' }).fill('no-such-repository');
  await expect(page.locator('.project-card')).toHaveCount(0);
  await page.getByRole('button', { name: '重置筛选' }).click();
  await expect(page.locator('.project-card')).toHaveCount(repositories.length);
});

test('shows actual highlighted TypeScript in the workbench', async ({ page }) => {
  await page.goto('');
  await expect(page.locator('.terminal-window__code')).toContainText('export const developer');
  await expect(page.locator('.terminal-token--keyword').first()).toBeVisible();
  await page.getByRole('button', { name: 'harness.config.ts' }).click();
  await expect(page.locator('.terminal-window__code')).toContainText("tools: ['list_files', 'read_file']");
  await expect(page.getByRole('button', { name: 'harness.config.ts' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.hero-metrics')).toContainText(String(repositories.length));
});

test('opens a column by clicking the card description and keeps chapter links independent', async ({ page }) => {
  await page.goto('columns/');
  const card = page.locator('.column-card').first();
  const href = await card.locator('h2 a').getAttribute('href');
  const description = await card.locator(':scope > p').first().boundingBox();
  await page.mouse.click(description!.x + 12, description!.y + 12);
  await expect(page).toHaveURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
  await page.goto('columns/');
  const chapter = page.locator('.column-card').first().locator('.column-card__chapters a').first();
  const chapterHref = await chapter.getAttribute('href');
  await chapter.click();
  await expect(page).toHaveURL(new RegExp(chapterHref!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
});

test('offers twelve Harness chapters, downloadable source and rendered runnable code', async ({ page }) => {
  await page.goto('columns/agent-harness/');
  const chapters = page.locator('.column-reading-chapters ol > li');
  await expect(chapters).toHaveCount(12);
  const download = page.getByRole('link', { name: '下载完整项目源码', exact: true });
  const response = await page.request.get((await download.getAttribute('href'))!);
  expect(response.ok()).toBe(true);
  const archive = await response.body();
  expect(archive.subarray(0, 4).toString('hex')).toBe('504b0304');
  const first = chapters.first();
  await first.scrollIntoViewIfNeeded();
  const description = await first.locator('div > span').boundingBox();
  await page.mouse.click(description!.x + 12, description!.y + 12);
  await expect(page).toHaveURL(/01-contracts\.html$/);
  await expect(page.locator('.reading-prose')).toContainText('createScope');
  await expect(page.locator('.reading-prose')).not.toContainText('Code snippet path not found');
});
