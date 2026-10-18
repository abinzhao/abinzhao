import { expect, test } from '@playwright/test';

test('shows preparation, start and source download before the mobile chapter list', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('columns/agent-harness/');

  const start = page.getByRole('link', { name: '开始第一章', exact: true });
  const download = page.getByRole('link', { name: '下载完整项目源码', exact: true }).first();
  await expect(start).toBeVisible();
  await expect(download).toBeVisible();
  const preparation = page.getByText('准备：JavaScript / TypeScript 基础 · Node.js 22+', { exact: true });
  await expect(preparation).toBeVisible();
  expect((await preparation.boundingBox())!.y).toBeLessThan(844);
  for (const link of [start, download]) {
    const bounds = (await link.boundingBox())!;
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
  const chapters = page.locator('.column-reading-chapters ol > li');
  await expect(chapters).toHaveCount(72);
  expect((await chapters.first().boundingBox())!.y).toBeLessThan(720);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.getByRole('link', { name: '运行说明', exact: true }).click();
  const instructions = page.locator('#从下载包开始');
  await expect(instructions).toBeInViewport();
  expect((await instructions.boundingBox())!.y).toBeGreaterThanOrEqual(80);
  await page.goto('columns/agent-harness/');
  await start.click();
  await expect(page).toHaveURL(/01-contracts\.html$/);
});

test('keeps a deep-linked learning unit reachable after adding the quick entry', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('columns/agent-harness/');
  const unit = page.getByRole('navigation', { name: '学习单元' }).getByRole('link', { name: '25–30 · MCP 协议与集成' });
  const href = await unit.getAttribute('href');
  await unit.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  const target = page.locator(href!);
  expect((await target.boundingBox())!.y).toBeGreaterThanOrEqual(80);
  expect((await target.boundingBox())!.y).toBeLessThan(200);
});

test('explains MCP discovery from its own source section without unrelated Spill paragraphs', async ({ page }) => {
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== 'http://127.0.0.1:5176') externalRequests.push(request.url());
  });
  await page.goto('chat/');
  await page.getByLabel('输入问题').fill('解释 MCP 的工具发现');
  await page.getByRole('button', { name: '发送问题' }).click();
  const answer = page.locator('.chat-answer').last();
  await expect(answer).toContainText('tools/list');
  await expect(answer).toContainText('nextCursor');
  await expect(answer).toContainText('notifications/tools/list_changed');
  await expect(answer).not.toContainText('真实 Spill 存储');
  const source = answer.getByRole('link').first();
  await expect(source).toHaveAttribute('href', /26-mcp-tools-resources\.html#mcp-工具发现$/);
  expect(externalRequests).toEqual([]);
  await source.click();
  await expect(page.locator('#mcp-工具发现')).toBeInViewport();
});
