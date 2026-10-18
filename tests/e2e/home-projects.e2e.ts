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

test('offers seventy-two Harness chapters, grouped navigation and downloadable source', async ({ page }) => {
  await page.goto('columns/agent-harness/');
  const chapters = page.locator('.column-reading-chapters ol > li');
  await expect(chapters).toHaveCount(72);
  await expect(page.getByRole('navigation', { name: '学习单元' }).locator('a')).toHaveCount(12);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await chapters.first().boundingBox())!.y).toBeLessThan(720);
  await page.setViewportSize({ width: 1440, height: 900 });
  const download = page.getByRole('navigation', { name: '教程快速入口' }).getByRole('link', { name: '下载完整项目源码', exact: true });
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

test('reads expanded topics and preserves navigation between chapter twelve and thirteen', async ({ page }) => {
  await page.goto('columns/agent-harness/12-web-transport.html');
  await page.getByRole('navigation', { name: '文章导航' }).getByRole('link', { name: /下一篇/ }).click();
  await expect(page).toHaveURL(/13-agent-foundations\.html$/);
  await expect(page.locator('.series-unit[open]')).toHaveCount(1);
  for (const slug of [
    '19-skills-format', '25-mcp-architecture', '31-context-assembly',
    '50-filesystem-sandbox', '55-subagent-delegation', '63-codex-app-server',
    '68-agent-evaluation', '72-production-capstone',
  ]) {
    await page.goto(`columns/agent-harness/${slug}.html`);
    await expect(page.locator('.reading-prose h2').first()).toBeVisible();
    await expect(page.locator('.reading-prose')).not.toContainText('Code snippet path not found');
    await expect(page.locator('.series-list a[aria-current="page"]')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
