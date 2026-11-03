import { expect, test } from '@playwright/test';

test('code steps keep copyable source, explanation and live preview in sync after jumps', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('labs/code-morph.html');
  await page.getByRole('button', { name: '运行实验', exact: true }).click();
  const steps = page.getByRole('slider', { name: '代码步骤' });
  await steps.fill('2');
  await expect(page.getByRole('heading', { name: '隔离布局影响', exact: true })).toBeVisible();
  await expect(page.locator('.morph-source')).toContainText('contain: layout paint');
  await steps.fill('0');
  await steps.fill('1');
  await expect(page.locator('.morph-source')).toContainText('scaleX');
  await page.getByRole('slider', { name: '预览进度' }).fill('60');
  const signal = page.frameLocator('iframe[title="同源 CSS 预览"]').locator('.signal');
  await expect(signal).toHaveCSS('transform', 'matrix(0.6, 0, 0, 1, 0, 0)');
  await page.getByRole('button', { name: '复制当前源码' }).click();
  await expect(page.getByRole('status').filter({ hasText: '源码已复制' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('scaleX');
  await page.getByRole('button', { name: '反向播放' }).click();
  await expect(steps).toHaveValue('0');
  await expect(page.getByRole('button', { name: '暂停' , exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('render pipeline has hash steps and runs actual width and transform animations', async ({ page }) => {
  await page.goto('labs/rendering.html#paint');
  await page.getByRole('button', { name: '运行实验', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Paint', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Composite', exact: true }).click();
  await expect(page).toHaveURL(/#composite$/);
  await page.getByRole('button', { name: '播放对照' }).click();
  await expect.poll(() => page.locator('.pipeline-demo').evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(2);
  await page.getByRole('button', { name: '暂停对照' }).click();
  expect(await page.locator('.pipeline-demo').evaluate((node) => node.getAnimations({ subtree: true }).every((animation) => animation.playState === 'paused'))).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByText('动态效果已精简，可手动调整对照进度。', { exact: true })).toBeVisible();
  await page.getByRole('slider', { name: '对照进度' }).fill('75');
  await expect(page.locator('[data-comparison="transform"]')).toHaveCSS('transform', 'matrix(0.75, 0, 0, 1, 0, 0)');
});

test('project grid preserves true DOM order through rapid filter, sort and density changes', async ({ page }) => {
  await page.goto('projects/');
  await page.getByRole('combobox', { name: '项目排序' }).selectOption('name');
  await expect(page.locator('.project-card h2').first()).toHaveText('abinzhao');
  await page.getByRole('button', { name: '紧凑', exact: true }).click();
  for (let index = 0; index < 5; index++) {
    await page.getByRole('button', { name: 'Rust', exact: true }).click();
    await page.getByRole('button', { name: '全部', exact: true }).click();
  }
  const names = await page.locator('.project-card h2').allTextContents();
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
  await expect.poll(() => page.locator('.project-grid').evaluate((node) => node.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length)).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(page.locator('.project-card').first()).toHaveAttribute('target', '_blank');
});

test('shared navigation keeps the final route, theme, focus and filtered history', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('labs/');
  await page.getByRole('button', { name: '交互', exact: true }).click();
  await page.getByRole('link', { name: '代码演化时间轴', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: '代码演化时间轴' })).toBeVisible();
  await expect(page.locator('#page-content')).toBeFocused();
  await page.goBack();
  await expect(page.locator('.lab-card')).toHaveCount(4);
  await page.evaluate(() => {
    document.querySelector<HTMLAnchorElement>('[data-shared-id="code-morph"]')!.click();
    document.querySelector<HTMLAnchorElement>('[data-shared-id="layers"]')!.click();
  });
  await expect(page).toHaveURL(/layers.html$/);
  await expect(page.getByRole('heading', { level: 1, name: '站点空间剖面' })).toBeVisible();
  await expect(page.locator('#page-content')).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.transition ?? '')).toBe('');
  expect(errors).toEqual([]);
});

test('lab metadata uses the real title rather than template placeholders', async ({ page }) => {
  await page.goto('labs/code-morph.html');
  await expect(page).toHaveTitle(/代码演化时间轴/);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', '代码演化时间轴');
});

test('takes a valid shared snapshot and preserves navigation when a theme reveal interrupts it', async ({ page }) => {
  await page.addInitScript(() => {
    const native = document.startViewTransition.bind(document);
    (window as any).snapshots = [];
    document.startViewTransition = ((callback: any) => {
      const transition = native(callback);
      void transition.ready.then(() => {
        (window as any).snapshots.push(Array.from(document.querySelectorAll('[style*="view-transition-name"]')).map((element) => (element as HTMLElement).style.viewTransitionName));
      }).catch(() => {});
      return transition;
    }) as typeof document.startViewTransition;
  });
  await page.goto('labs/');
  await page.getByRole('link', { name: '代码演化时间轴', exact: true }).click();
  await expect(page.getByRole('heading', { name: '代码演化时间轴', level: 1 })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).snapshots.some((names: string[]) => names.includes('lab-title') && names.includes('lab-preview')))).toBe(true);
  await page.goto('labs/');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
  const initialTheme = await page.locator('html').getAttribute('data-theme');
  await page.evaluate(() => {
    document.querySelector<HTMLAnchorElement>('[data-shared-id="rendering"]')!.click();
    document.querySelector<HTMLButtonElement>('.theme-toggle[title*="切换至"]')!.click();
  });
  await expect(page.getByRole('heading', { name: '浏览器渲染管线', level: 1 })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', initialTheme === 'dark' ? 'light' : 'dark');
});

test('history restores scroll without View Transitions and failed loading still exposes navigation', async ({ page }) => {
  await page.addInitScript(() => { document.startViewTransition = undefined as any; });
  await page.goto('labs/');
  const link = page.getByRole('link', { name: '可回溯作品时间线', exact: true });
  await link.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  await link.click();
  await expect(page.getByRole('heading', { name: '可回溯作品时间线', level: 1 })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: '实验室', level: 1 })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(before, -1);
  await page.route('**/labs/particles.md?*', (route) => route.abort('failed'));
  await page.getByRole('link', { name: '代码粒子场', exact: true }).click();
  await expect(page.getByRole('heading', { name: '这里还没有内容' })).toBeVisible();
  await page.locator('.site-nav').getByRole('link', { name: '博客', exact: true }).click();
  await expect(page.getByRole('heading', { name: '博客', level: 1 })).toBeVisible();
});

test('a failed lazy page component presents a recovery action instead of an empty body', async ({ page }) => {
  await page.goto('labs/');
  await page.route('**/theme/pages/ProjectsPage.vue', (route) => route.abort('failed'));
  await page.locator('.site-nav').getByRole('link', { name: '项目', exact: true }).click();
  await expect(page.getByRole('heading', { name: '页面加载失败' })).toBeVisible();
  await expect(page.getByRole('button', { name: '重新加载页面' })).toBeVisible();
  await page.locator('.site-nav').getByRole('link', { name: '博客', exact: true }).click();
  await expect(page.getByRole('heading', { name: '博客', level: 1 })).toBeVisible();
});
