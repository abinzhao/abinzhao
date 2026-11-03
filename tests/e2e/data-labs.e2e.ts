import { expect, test } from '@playwright/test';

test('knowledge graph lays out in a real worker and synchronizes accessible selection', async ({ page }) => {
  const workers: string[] = [];
  page.on('worker', (worker) => workers.push(worker.url()));
  await page.goto('labs/knowledge-graph.html');
  await page.getByRole('button', { name: '运行实验', exact: true }).click();
  await expect(page.locator('.knowledge-map')).toHaveAttribute('data-layout', 'ready');
  expect(workers.some((url) => url.includes('graph'))).toBe(true);
  const choices = page.locator('.graph-links button');
  expect(await choices.count()).toBeLessThanOrEqual(30);
  await choices.nth(1).focus();
  await expect(choices.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.graph-selection h2')).toHaveText(await choices.nth(1).innerText());
  const bounds = await page.locator('.graph-visual canvas').boundingBox();
  await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await expect(choices.first()).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '展开此节点' }).click();
  await expect(page.locator('.knowledge-map')).toHaveAttribute('data-layout', 'ready');
  await page.getByRole('searchbox', { name: '查找图谱内容' }).fill('不会存在的课程abcdef');
  await expect(page.getByText('没有匹配内容。')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('graph releases workers after layout and keeps links when workers are unavailable', async ({ page }) => {
  const live = new Set();
  page.on('worker', (worker) => { live.add(worker); worker.on('close', () => live.delete(worker)); });
  await page.goto('labs/knowledge-graph.html');
  for (let index = 0; index < 4; index++) {
    await page.getByRole('button', { name: '运行实验', exact: true }).click();
    await expect(page.locator('.knowledge-map')).toHaveAttribute('data-layout', 'ready');
    await expect.poll(() => live.size).toBe(0);
    await page.getByRole('button', { name: '关闭实验', exact: true }).click();
  }
  await page.addInitScript(() => { window.Worker = class { constructor() { throw new Error('Worker unavailable'); } } as any; });
  await page.reload();
  await page.getByRole('button', { name: '运行实验', exact: true }).click();
  await expect(page.locator('.knowledge-map')).toHaveAttribute('data-layout', 'error');
  await expect(page.locator('.graph-links a')).toHaveCount(30);
});

test('source layers expose pinned source and support a flat reduced-motion view', async ({ page }) => {
  await page.goto('labs/layers.html');
  await page.getByRole('button', { name: '运行实验', exact: true }).click();
  await page.getByRole('slider', { name: '分层展开程度' }).fill('100');
  await page.getByRole('button', { name: '03 · 检索计算', exact: true }).click();
  await expect(page.locator('.layer-detail')).toContainText('knowledge.worker.ts');
  await expect(page.locator('.layer-detail a').first()).toHaveAttribute('href', /blob\/e9595400b7d5239cee3413dd6a0d695f6ac30ecc\//);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.layer-space')).toHaveAttribute('data-flat', 'true');
  await page.locator('.layer-accordion summary').nth(2).click();
  await expect(page.locator('.layer-accordion details').nth(2)).toContainText('knowledge.worker.ts');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('execution steps run, replay, cancel and reset without late events', async ({ page }) => {
  await page.goto('labs/execution.html');
  await page.getByRole('button', { name: '运行实验', exact: true }).click();
  await page.getByRole('spinbutton', { name: '处理数量' }).fill('4');
  await page.getByRole('spinbutton', { name: '处理几项后取消，0 表示不取消' }).fill('2');
  await page.getByRole('button', { name: '运行到结束' }).click();
  await expect(page.locator('.trace-current')).toContainText('已取消');
  await expect(page.locator('.trace-current')).toContainText('total = 6');
  await page.getByRole('slider', { name: '回看已执行步骤' }).fill('1');
  await expect(page.locator('.trace-current')).toContainText('total = 2');
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await expect(page.locator('.trace-events li')).toHaveCount(0);
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(page.locator('.trace-events li')).toHaveCount(1);
  await page.getByRole('button', { name: '关闭实验', exact: true }).click();
  await expect(page.locator('.trace-events')).toHaveCount(0);
});

test('about timeline has real evidence, direct anchors and reversible position selection', async ({ page }) => {
  await page.goto('about.html#work-six-courses');
  await expect(page.locator('#work-six-courses')).toBeVisible();
  await expect(page.locator('.work-timeline')).toHaveAttribute('data-active', 'six-courses');
  await page.getByRole('slider', { name: '作品位置' }).fill('0');
  await expect(page).toHaveURL(/#work-local-assistant$/);
  await expect(page.locator('.work-timeline')).toHaveAttribute('data-active', 'local-assistant');
  await expect(page.locator('#work-local-assistant a').filter({ hasText: '提交记录' })).toHaveAttribute('href', /commit\/[a-f0-9]{40}$/);
  await page.goBack();
  await expect(page).toHaveURL(/#work-six-courses$/);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
