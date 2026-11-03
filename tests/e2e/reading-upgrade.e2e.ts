import { expect, test } from '@playwright/test';

test('records a heading, resumes a course and completes only on explicit input', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('columns/agent-harness/01-contracts.html');
  const finish = page.getByRole('button', { name: '标记本章完成', exact: true });
  await expect(finish).toBeVisible();
  const heading = page.locator('.reading-prose h2[id]').nth(2);
  const id = await heading.getAttribute('id');
  await page.locator('.reading-desktop-outline a').filter({ hasText: '1.3 公开入口不负责启动程序' }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('abin-reading-v1'))).toContain(id);
  await page.goto('columns/agent-harness/');
  await expect(page.getByText('已完成 0 / 73 章', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '继续阅读', exact: true }).click();
  await expect(page).toHaveURL(/01-contracts.html#/);
  await page.getByRole('button', { name: '标记本章完成', exact: true }).click();
  await page.goto('columns/agent-harness/');
  await expect(page.getByText('已完成 1 / 73 章', { exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: '搜索当前课程章节' }).fill('MCP');
  await expect(page.locator('.harness-unit li')).not.toHaveCount(73);
  await page.getByRole('searchbox', { name: '搜索当前课程章节' }).fill('nomatchxyz');
  await expect(page.getByText('没有匹配章节，换个关键词试试。')).toBeVisible();
});

test('opens term explanations with keyboard and preserves the mobile inline fallback', async ({ page }) => {
  await page.goto('columns/agent-harness/01-contracts.html');
  const summary = page.getByRole('button', { name: '服务契约', exact: true });
  await summary.focus();
  await summary.press('Enter');
  await expect(page.locator('.term-panel').first()).toBeVisible();
  const triggerBox = await summary.boundingBox();
  const panelBox = await page.locator('.term-panel').first().boundingBox();
  expect(panelBox!.y).toBeGreaterThanOrEqual(triggerBox!.y + triggerBox!.height);
  expect(Math.abs(panelBox!.x - triggerBox!.x)).toBeLessThan(2);
  await page.locator('.term-panel').first().getByRole('button', { name: '关闭说明' }).click();
  await expect(summary).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator('.article-terms summary').first().click();
  await expect(page.locator('.article-terms details').first()).toHaveAttribute('open', '');
  await expect(page.locator('.term-panel').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('reports source download completion, failure and cancellation from real requests', async ({ page }) => {
  await page.goto('columns/agent-harness/');
  const link = page.getByRole('navigation', { name: '教程快速入口' }).getByRole('link', { name: '下载完整项目源码', exact: true });
  const download = page.waitForEvent('download');
  await link.click();
  expect((await download).suggestedFilename()).toBe('agent-harness.zip');
  await expect(page.getByText('源码已交给浏览器保存')).toBeVisible();
  await page.route('**/downloads/agent-harness.zip', (route) => route.fulfill({ status: 503 }));
  await link.click();
  await expect(page.getByText('下载失败，请重试或使用原始链接')).toBeVisible();
  await page.unroute('**/downloads/agent-harness.zip');
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/downloads/agent-harness.zip', async (route) => { await pending; await route.abort(); });
  try {
    await link.click();
    await page.getByRole('button', { name: '取消下载', exact: true }).click();
    await expect(page.getByText('下载已取消，可重新下载')).toBeVisible();
    await expect(page.getByRole('progressbar', { name: '源码下载进度' })).toHaveCount(0);
  } finally { release(); }
});
