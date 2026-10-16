import { expect, test } from '@playwright/test';

test('hydrates and searches the knowledge index in a dedicated worker', async ({ page }) => {
  const workers: string[] = [];
  page.on('worker', (worker) => workers.push(worker.url()));
  await page.goto('chat/');
  await expect(page.getByLabel('输入问题')).toBeEnabled();
  expect(workers.some((url) => url.includes('knowledge.worker'))).toBe(true);
  await page.getByLabel('输入问题').fill('解释 Grid');
  await page.getByRole('button', { name: '发送问题' }).click();
  await expect(page.locator('.chat-answer')).toBeVisible();
});

test('does not steal history focus when the knowledge index finishes loading', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/knowledge-index.data.ts*', async (route) => { await gate; await route.continue(); });
  await page.goto('chat/');
  const trigger = page.getByRole('button', { name: '打开会话历史' });
  try {
    await trigger.click();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  } finally { release(); }
  await expect(page.getByLabel('输入问题')).toBeEnabled();
  await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
  await expect(trigger).toBeFocused();
});

test('restores blog filters through reload and browser history', async ({ page }) => {
  await page.goto('blog/?category=智能体&q=本地');
  await expect(page.getByRole('button', { name: '智能体', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('searchbox')).toHaveValue('本地');
  await page.getByRole('button', { name: '全部', exact: true }).click();
  await expect(page).not.toHaveURL(/category=/);
  await page.goBack();
  await expect(page.getByRole('button', { name: '智能体', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByRole('searchbox')).toHaveValue('本地');
  await page.getByRole('searchbox').fill('浏览器');
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('浏览器');
  await page.reload();
  await expect(page.getByRole('searchbox')).toHaveValue('浏览器');
});

test('moves focus to the destination on site navigation', async ({ page }) => {
  await page.goto('');
  await page.locator('.site-nav').getByRole('link', { name: '博客', exact: true }).click();
  await expect(page).toHaveURL(/blog\/$/);
  await expect(page.locator('#page-content')).toBeFocused();
});

test('updates the shareable hash when choosing a mobile article heading', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('columns/fullstack-development/00-web-foundations.html');
  await page.getByRole('button', { name: '打开本页目录' }).click();
  const link = page.getByRole('dialog', { name: '本页目录' }).getByRole('link').first();
  const hash = await link.getAttribute('href');
  await link.click();
  await expect.poll(() => decodeURIComponent(new URL(page.url()).hash)).toBe(hash);
  await expect(page.locator('.reading-prose h2[id]').first()).toBeFocused();
});

for (const width of [390, 768, 1024, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`${width}px ${theme} page families remain contained`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.addInitScript((value) => localStorage.setItem('abin-lab-theme', value), theme);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      for (const path of ['', 'blog/', 'columns/', 'projects/', 'about', 'chat/', 'columns/fullstack-development/00-web-foundations.html']) {
        await page.goto(path);
        await expect(page.locator('h1').first()).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      }
      await page.goto('chat/');
      await expect(page.getByLabel('输入问题')).toBeEnabled();
      expect(await page.getByLabel('输入问题').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
      const button = await page.getByRole('button', { name: '发送问题' }).boundingBox();
      expect(button?.height).toBeGreaterThanOrEqual(44);
    });
  }
}
