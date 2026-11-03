import { expect, test } from '@playwright/test';

test('filters experiments and navigates to statically rendered details without starting a renderer', async ({ page }) => {
  const optional: string[] = [];
  page.on('request', (request) => {
    if (/\/theme\/labs\/|\/examples\/site-labs\/|lab-.+\.worker|@mlc-ai\/web-llm|webllm\.worker/.test(request.url())) optional.push(request.url());
  });
  await page.goto('labs/');
  await expect(page.getByRole('heading', { name: '实验室', exact: true })).toBeVisible();
  await expect(page.locator('.lab-card')).toHaveCount(10);
  await page.getByRole('button', { name: 'GPU', exact: true }).click();
  await expect(page.locator('.lab-card')).toHaveCount(2);
  await page.getByRole('link', { name: '代码粒子场', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: '代码粒子场' })).toBeVisible();
  await expect(page).toHaveURL(/labs\/particles.html$/);
  expect(optional).toEqual([]);
  await page.goBack();
  await expect(page.locator('.lab-card')).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: '实验室', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('keeps course offline downloads explicitly opt in', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('columns/agent-harness/');
  await page.getByText('缓存本课程以离线阅读', { exact: true }).click();
  expect(requests.some((url) => /assistant-sw\.js|downloads\/.*zip/.test(url))).toBe(false);
  await page.getByRole('button', { name: '查看缓存大小', exact: true }).click();
  await expect(page.getByText('开发预览不提供离线资源，请使用生产构建。', { exact: true })).toBeVisible();
});
