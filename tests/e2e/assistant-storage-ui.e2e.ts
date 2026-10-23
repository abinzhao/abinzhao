import { expect, test, type Page } from '@playwright/test';

async function waitForAssistant(page: Page) {
  // 输入就绪意味着会话恢复和本地索引初始化均完成，避免将冷加载误判为数据丢失。
  await expect(page.getByLabel('输入问题')).toBeEnabled({ timeout: 20_000 });
}

async function mockModel(page: Page) {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends EventTarget {
      onmessage: ((event: MessageEvent) => void) | null = null;
      chunk = 0;
      stopped = false;
      constructor(url: string | URL, options?: WorkerOptions) {
        super();
        if (!String(url).includes('webllm')) return new NativeWorker(url, options);
      }
      respond(data: unknown) {
        const event = new MessageEvent('message', { data });
        this.dispatchEvent(event);
        this.onmessage?.(event);
      }
      postMessage(message: { channel?: string; modelId?: string; uuid?: string; kind?: string }) {
        if (message.channel === 'assistant-capability') {
          queueMicrotask(() => this.respond({ ...message, report: { supported: true } }));
          return;
        }
        if (message.kind === 'chatCompletionStreamInit') { this.chunk = 0; this.stopped = false; }
        if (message.kind === 'interruptGenerate') this.stopped = true;
        if (message.kind === 'completionStreamNextChunk') {
          const text = this.chunk++ === 0 ? 'React 的状态触发渲染。[S1]\n' : '应结合原文理解。[S1]\n';
          setTimeout(() => this.respond({ kind: 'return', uuid: message.uuid, content: this.stopped || this.chunk > 12 ? undefined : { choices: [{ delta: { content: text } }] } }), 150);
        } else queueMicrotask(() => this.respond({ kind: 'return', uuid: message.uuid, content: null }));
      }
      terminate() {}
    } as unknown as typeof Worker;
  });
}

test('migrates v1 in a real IDB transaction, then preserves new replies and drafts across reload', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    if (!localStorage.getItem('abin-conversations-v1')) localStorage.setItem('abin-conversations-v1', JSON.stringify([{
      id: 'legacy', mode: 'model', title: '历史 React', updatedAt: 1,
      messages: [{ id: 'u', role: 'user', content: 'React 是什么' }, { id: 'a', role: 'assistant', content: '旧回答' }],
    }]));
  });
  await page.goto('chat/');
  await waitForAssistant(page);
  await expect(page.getByText('旧回答', { exact: true })).toBeVisible();
  await page.getByLabel('输入问题').fill('解释 Flexbox');
  await page.getByRole('button', { name: '发送问题' }).click();
  // 首次请求才加载正文语料；完成后仍严格检查答案与实际 IDB 持久化。
  await expect(page.getByRole('button', { name: '发送问题' })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.chat-answer')).toBeVisible();
  await page.getByLabel('输入问题').fill('未发送草稿');
  await expect.poll(() => page.evaluate(async () => {
    const request = indexedDB.open('abin-assistant', 3);
    const db = await new Promise<IDBDatabase>((resolve) => { request.onsuccess = () => resolve(request.result); });
    const get = db.transaction('snapshots').objectStore('snapshots').get('current');
    const value = await new Promise<{ draft: string }>((resolve) => { get.onsuccess = () => resolve(get.result); });
    db.close();
    return value.draft;
  })).toBe('未发送草稿');
  await page.reload();
  await waitForAssistant(page);
  await expect(page.locator('.chat-message')).toHaveCount(4);
  await expect(page.locator('.chat-answer')).toBeVisible();
  await expect(page.getByLabel('输入问题')).toHaveValue('未发送草稿');
  expect(await page.evaluate(() => localStorage.getItem('abin-conversations-v1'))).toContain('旧回答');
});

test('an aborted IDB transaction retains the legacy backup and provides export', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('abin-conversations-v1', JSON.stringify([{
      id: 'old', mode: 'knowledge', title: '旧数据', updatedAt: 1,
      messages: [{ id: 'u', role: 'user', content: 'Flexbox' }],
    }]));
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof transaction>) {
      const result = transaction.apply(this, args);
      if (args[1] === 'readwrite') queueMicrotask(() => result.abort());
      return result;
    };
  });
  await page.goto('chat/');
  await expect(page.locator('.chat-notice')).toContainText('内存');
  await expect(page.getByRole('button', { name: '导出会话' })).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem('abin-conversations-v1'))).toContain('旧数据');
});

test('streams plain text, stops with partial content, opens trusted sources and restores focus', async ({ page }) => {
  test.setTimeout(60_000);
  await mockModel(page);
  await page.goto('chat/');
  await waitForAssistant(page);
  await page.getByRole('button', { name: '配置本地模型' }).click();
  await page.getByRole('button', { name: '下载并加载模型' }).click();
  await expect(page.getByText('本地模型已就绪', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('checkbox', { name: /实验生成/ }).check();
  await page.getByLabel('输入问题').fill('解释 React');
  await page.getByRole('button', { name: '发送问题' }).click();
  await expect(page.locator('.chat-message--assistant .chat-message__text')).toContainText('React', { timeout: 20_000 });
  await expect(page.locator('.chat-message__markdown')).toHaveCount(0);
  await page.getByRole('button', { name: '停止回答' }).click();
  await expect(page.getByText('已停止', { exact: true })).toBeVisible();
  await expect(page.locator('.chat-message__markdown')).toContainText('React');
  const source = page.getByRole('button', { name: /查看 \d+ 条来源/ });
  await source.click();
  await expect(page.getByRole('dialog', { name: '回答来源' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(source).toBeFocused();
  await page.reload();
  await waitForAssistant(page);
  await expect(page.getByText('已停止', { exact: true })).toBeVisible();
});

test('IME Enter never sends; input uses 16px and stops growing after five lines', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('chat/');
  const input = page.getByLabel('输入问题');
  await input.fill('输入法还在组合');
  await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  await expect(page.locator('.chat-message--user')).toHaveCount(0);
  await input.fill('一\n二\n三\n四\n五\n六\n七');
  expect(await input.evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px');
  expect((await input.boundingBox())!.height).toBeLessThanOrEqual(155);
  expect((await page.locator('.chat-send').boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('stopping retrieval ignores late results and permits a fresh request', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/knowledge-corpus.data.ts*', async (route) => { await gate; await route.continue(); });
  await page.goto('chat/');
  await page.getByLabel('输入问题').fill('解释 React');
  await page.getByRole('button', { name: '发送问题' }).click();
  await page.getByRole('button', { name: '停止回答' }).click();
  await expect(page.getByRole('button', { name: '发送问题' })).toBeVisible();
  release();
  await expect(page.locator('.chat-answer')).toHaveCount(0);
  await page.getByLabel('输入问题').fill('解释 Grid');
  await page.getByRole('button', { name: '发送问题' }).click();
  await expect(page.locator('.chat-answer')).toBeVisible();
});
