import { expect, test, type Page } from '@playwright/test';

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

test.describe('desktop local chat', () => {
  test.use({ viewport: { height: 900, width: 1440 } });

  test('answers from local evidence without cross-origin data requests', async ({ context, page }) => {
    const crossOriginRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== 'http://127.0.0.1:5176') {
        crossOriginRequests.push(request.url());
      }
    });
    await page.goto('chat/');

    await expect(page.getByRole('heading', { level: 1, name: '智能问答' })).toBeVisible();
    await expect(page.locator('.chat-local-status')).toContainText('完全本地 · 内容不上传');
    await expect(page.locator('.site-footer')).toHaveCount(0);
    await expect(page.locator('.ai-launcher')).toHaveCount(0);

    const workspace = await page.locator('.chat-workspace').boundingBox();
    const composer = await page.locator('.chat-composer').boundingBox();
    expect(workspace?.y).toBeLessThanOrEqual(100);
    expect(composer && composer.y + composer.height).toBeLessThanOrEqual(900);

    await page.getByLabel('输入问题').fill('Flexbox 和 Grid 有什么区别');
    await page.getByRole('button', { name: '发送问题' }).click();

    await expect(page.locator('.chat-answer')).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: '对比依据' })).toBeVisible();
    await expect(page.getByText(/可信度：(高|中)/)).toBeVisible();
    const sourceCount = await page.locator('.chat-source-link').count();
    expect(sourceCount).toBeGreaterThanOrEqual(2);
    expect(sourceCount).toBeLessThanOrEqual(8);
    await expect(page.getByRole('log')).toHaveAttribute('aria-busy', 'false');
    expect(crossOriginRequests).toEqual([]);

    await context.setOffline(true);
    await page.locator('.chat-panel__commands').getByRole('button', { name: '新建会话' }).click();
    await page.getByLabel('输入问题').fill('解释浏览器渲染流程');
    await page.getByRole('button', { name: '发送问题' }).click();
    await expect(page.locator('.chat-answer').last()).toBeVisible();
    await context.setOffline(false);
  });

  test('enters article scope and automatically summarizes a published article', async ({ page }) => {
    await page.goto('blog/local-first-agent.html');
    await page.getByRole('button', { name: '问答本文' }).click();
    await page.getByRole('link', { name: '总结本文' }).click();

    await expect(page).toHaveURL(/chat\/\?article=.*local-first-agent\.html.*action=summary/);
    await expect(page.getByText('当前文章')).toBeVisible();
    await expect(page.locator('.chat-answer')).toBeVisible();
    await expect(page.locator('.chat-source-link').first()).toHaveAttribute(
      'href',
      /local-first-agent\.html/,
    );
  });

  test('keeps every local quick action connected to a visible result', async ({ page }) => {
    await page.goto('chat/');
    const cases = [
      { action: '找资料', question: '查找 VitePress 静态站点资料' },
      { action: '总结', question: '总结内容' },
      { action: '对比', question: 'Flexbox 和 Grid 有什么区别' },
      { action: '学习路线', question: 'CSS 应该怎么学' },
      { action: '排查清单', question: '动画卡顿怎么排查' },
    ];

    for (const entry of cases) {
      await page.getByRole('button', { exact: true, name: entry.action }).click();
      await page.getByLabel('输入问题').fill(entry.question);
      await page.getByRole('button', { name: '发送问题' }).click();
      await expect(page.locator('.chat-answer').last()).toBeVisible();
      await page.locator('.chat-panel__commands').getByRole('button', { name: '新建会话' }).click();
    }

    const userMessages = page.locator('.chat-message--user');
    await page.getByRole('button', { name: '随机探索' }).click();
    await expect(userMessages).toHaveCount(1);
    await page.locator('.chat-panel__commands').getByRole('button', { name: '新建会话' }).click();
    await page.getByRole('button', { name: '15 分钟' }).click();
    await expect(userMessages).toHaveCount(1);
  });
});

test.describe('mobile local chat', () => {
  test.use({ viewport: { height: 844, width: 390 } });

  test('keeps the composer visible and restores focus after closing history', async ({ page }) => {
    await page.goto('chat/');

    const workspace = await page.locator('.chat-workspace').boundingBox();
    const composer = await page.locator('.chat-composer').boundingBox();
    expect(workspace?.y).toBeLessThanOrEqual(80);
    expect(composer && composer.y + composer.height).toBeLessThanOrEqual(844);
    await expectNoHorizontalOverflow(page);

    const historyButton = page.getByRole('button', { name: '打开会话历史' });
    await historyButton.click();
    await expect(page.getByRole('dialog', { name: '会话历史' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '会话历史' })).not.toBeVisible();
    await expect(historyButton).toBeFocused();
  });
});
