import { expect, test } from '@playwright/test';

test('tutorial and experiment share a working reading and source-download path', async ({ page }) => {
  await page.goto('labs/execution.html');
  await page.getByRole('link', { name: '把可运行示例变成可验证的执行轨迹', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: '把可运行示例变成可验证的执行轨迹' })).toBeVisible();
  await expect(page.getByRole('link', { name: '对应实验：执行轨迹显微镜' })).toBeVisible();
  await page.getByRole('link', { name: '本文源码', exact: true }).click();
  await expect(page.getByRole('link', { name: '下载同版本站点源码' })).toBeVisible();
  await page.getByRole('button', { name: '展开实验：执行轨迹显微镜' }).click();
  await expect(page.locator('.execution-trace')).toBeVisible();
  await page.getByRole('button', { name: '收起实验' }).click();
  await expect(page.locator('.execution-trace')).toHaveCount(0);
});

test('scrolling to another pipeline stage pauses the comparison animations', async ({ page }) => {
  await page.goto('labs/rendering.html');
  await page.getByRole('button', { name: '运行实验', exact: true }).click();
  await page.getByRole('combobox', { name: '管线驱动方式' }).selectOption('scroll');
  await page.getByRole('button', { name: '播放对照' }).click();
  await expect(page.getByRole('button', { name: '暂停对照' })).toBeVisible();
  await page.getByRole('region', { name: '真实 CSS 动画对照' }).evaluate(() => {
    const scroller = document.querySelector('.pipeline-scroll')!;
    scroller.scrollTop = scroller.scrollHeight;
  });
  await expect(page.getByRole('button', { name: '播放对照' })).toBeVisible();
  expect(await page.locator('.pipeline-demo').evaluate((node) =>
    node.getAnimations({ subtree: true }).every((animation) => animation.playState === 'paused'))).toBe(true);
});
