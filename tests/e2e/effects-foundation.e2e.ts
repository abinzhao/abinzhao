import { expect, test } from '@playwright/test';

test('theme follows system changes, explicit choice and cross-tab storage', async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: /切换至浅色模式/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const sibling = await context.newPage();
  await sibling.goto('about');
  await sibling.evaluate(() => localStorage.setItem('abin-lab-theme', 'dark'));
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: '显示设置' }).click();
  await page.getByLabel('主题偏好').selectOption('system');
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByLabel('动态效果').selectOption('full');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'static');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '显示设置' })).toBeFocused();
});

test('opens site search with a shortcut and navigates real results without loading the assistant corpus', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('');
  await expect(page.locator('html')).toHaveAttribute('data-motion', /full|static/);
  await page.keyboard.press('ControlOrMeta+k');
  const dialog = page.getByRole('dialog', { name: '搜索站点' });
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole('searchbox', { name: '搜索教程与文章' });
  await expect(input).toBeFocused();
  await input.fill('浏览器');
  await expect(dialog.getByRole('link').first()).toBeVisible();
  await input.fill('不存在的内容xyz');
  await expect(dialog.getByText('没有匹配的内容，试试其他关键词。')).toBeVisible();
  await input.fill('Grid');
  await expect(dialog.getByRole('link').first()).toContainText(/Grid/i);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: '搜索站点' })).toBeFocused();
  // 开发模式会请求轻量 runtime facade；模型 SDK 和推理 worker 必须保持未加载。
  expect(requests.filter((url) => /knowledge-corpus|webllm\.worker|knowledge\.worker|@mlc-ai/.test(url))).toEqual([]);
  await page.getByRole('button', { name: '搜索站点' }).click();
  const target = await dialog.getByRole('link').first().getAttribute('href');
  await input.press('ArrowDown');
  await expect(dialog.getByRole('link').first()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`${target?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  await expect(page.locator('#page-content')).toBeFocused();
});

test('previews a real article code excerpt without fetching its page', async ({ page }) => {
  await page.goto('blog/');
  const card = page.locator('.article-list-item').filter({ has: page.getByRole('button', { name: '预览代码片段' }) }).first();
  const href = await card.locator('h2 a').getAttribute('href');
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await card.getByRole('button', { name: '预览代码片段' }).click();
  await expect(card.locator('.article-preview code')).toBeVisible();
  expect(await card.locator('.article-preview code').textContent()).toBeTruthy();
  expect(requests.some((url) => href && url.includes(href))).toBe(false);
});

test('theme input survives navigation and two rapid toggles preserve the final intent', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  await page.goto('');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
  await page.evaluate(() => {
    const toggle = document.querySelector<HTMLButtonElement>('.theme-toggle[title*="切换至"]')!;
    toggle.click();
    toggle.click();
  });
  await expect(page.locator('html')).not.toHaveAttribute('data-transition', 'theme');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('.theme-toggle[title*="切换至"]')!.click();
    document.querySelector<HTMLAnchorElement>('.site-nav a[href$="/blog/"]')!.click();
  });
  await expect(page).toHaveURL(/blog\/$/);
  await expect(page.locator('html')).not.toHaveAttribute('data-transition', 'theme');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
