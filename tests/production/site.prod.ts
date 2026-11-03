import { expect, test, type Response } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

test('cold pages do not request optional experiment, model or knowledge assets', async ({ browser }) => {
  const manifest = JSON.parse(await readFile('docs/.vitepress/dist/assistant-assets.json', 'utf8'));
  const optional = new Set<string>(['experiments', 'modelRuntime', 'knowledge'].flatMap((group) => manifest.groups[group]));
  for (const path of ['', 'columns/fullstack-development/09-scroll-view-transitions.html', 'blog/webgpu-particles.html']) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const requested: string[] = [];
    const payloads: Response[] = [];
    page.on('request', (request) => requested.push(new URL(request.url()).pathname));
    page.on('response', (response) => {
      const type = new URL(response.url()).pathname.match(/\.(js|css)$/)?.[1];
      if (type) payloads.push(response);
    });
    await page.goto(`http://127.0.0.1:5203/abinzhao/${path}`);
    await expect(page.locator('html')).toHaveAttribute('data-motion', /^(full|static)$/);
    await expect(page.locator('h1')).toHaveCount(1);
    // 页面外壳挂载后仍会加载当前路由模块；等全部请求完成再读取并关闭上下文。
    await page.waitForLoadState('networkidle');
    expect(requested.filter((url) => optional.has(url))).toEqual([]);
    const bytes = await Promise.all(payloads.map(async (response) => ({
      type: new URL(response.url()).pathname.endsWith('.js') ? 'js' : 'css',
      bytes: gzipSync(await response.body()).byteLength,
    })));
    expect(bytes.filter((file) => file.type === 'js').reduce((sum, file) => sum + file.bytes, 0), `${path} JS gzip`).toBeLessThanOrEqual(110 * 1024);
    expect(bytes.filter((file) => file.type === 'css').reduce((sum, file) => sum + file.bytes, 0), `${path} CSS gzip`).toBeLessThanOrEqual(25 * 1024);
    await context.close();
  }
});

for (const theme of ['light', 'dark'] as const) {
  test(`responsive containment and readable metadata in ${theme}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.addInitScript((theme) => localStorage.setItem('abin-lab-theme', theme), theme);
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const observations = [];
    const routes = ['', 'labs/', 'blog/', 'columns/', 'columns/agent-harness/', 'projects/', 'about.html', 'chat/', 'blog/webgpu-particles.html', '404.html'];
    for (const width of [360, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      for (const path of routes) {
        await page.goto(path);
        await expect(page.locator('html')).toHaveAttribute('data-motion', 'static');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const row = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - innerWidth,
          smallMetadata: Array.from(document.querySelectorAll('.article-card header,.article-list-item__meta,.article-list-item__tags>span,.listing-count,.project-card__tags,.reading-header__meta,.reading-header__tag,.column-card__summary'))
            .filter((element) => element.getClientRects().length && parseFloat(getComputedStyle(element).fontSize) < 13)
            .map((element) => ({ className: element.className, size: getComputedStyle(element).fontSize })),
        }));
        observations.push({ width, path, ...row });
        expect(row.overflow, `${theme} ${width} ${path}`).toBeLessThanOrEqual(0);
        expect(row.smallMetadata, `${theme} ${width} ${path}`).toEqual([]);
      }
    }
    // CSS zoom=2 与浏览器缩放并非同一实现；另以 720 CSS px 复核 1440px/200% 的重排宽度。
    await page.setViewportSize({ width: 720, height: 450 });
    await page.goto('blog/webgpu-particles.html');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('labs/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    await testInfo.attach('responsive-matrix.json', { body: JSON.stringify(observations, null, 2), contentType: 'application/json' });
  });
}

test('explicit course cache opens an unvisited chapter offline without other optional groups', async ({ page, context }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('columns/agent-harness/');
  await page.getByText('缓存本课程以离线阅读', { exact: true }).click();
  await page.getByRole('button', { name: '查看缓存大小', exact: true }).click();
  await expect(page.getByRole('button', { name: '确认缓存', exact: true })).toBeVisible();
  expect(requests.filter((url) => url.includes('assistant-sw.js'))).toEqual([]);
  await page.getByRole('button', { name: '确认缓存', exact: true }).click();
  await expect(page.getByText('离线包已缓存。浏览器仍可能回收存储。', { exact: true })).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const keys = await page.evaluate(() => caches.keys());
  expect(keys.filter((key) => /knowledge|experiments|model-runtime/.test(key))).toEqual([]);
  const chapter = await page.locator('.harness-unit li h3 a').nth(1).getAttribute('href');
  await context.setOffline(true);
  const offlinePage = await context.newPage();
  await offlinePage.goto(`http://127.0.0.1:5203${chapter}`);
  await expect(offlinePage.locator('.reading-prose h2').first()).toBeVisible();
  await expect(offlinePage.locator('html')).toHaveAttribute('data-motion', /^(full|static)$/);
});

test('tutorial prose, experiment links and source download remain available without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:5203/abinzhao/blog/webgpu-particles.html');
    await expect(page.locator('.reading-header h1')).toContainText('WebGPU');
    await expect(page.locator('.reading-prose pre').first()).toBeVisible();
    await expect(page.getByRole('link', { name: '下载同版本站点源码', exact: true })).toHaveAttribute('href', '/abinzhao/downloads/site-labs.zip');
    await page.getByRole('link', { name: '对应实验：代码粒子场', exact: true }).click();
    await expect(page.locator('h1')).toHaveText('代码粒子场');
  } finally { await context.close(); }
});
