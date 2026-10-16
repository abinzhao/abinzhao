import { expect, test } from '@playwright/test';

test('opens local model setup without starting a model download', async ({ page }) => {
  const remote: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== 'http://127.0.0.1:5176') remote.push(request.url());
  });
  await page.goto('chat/');
  await page.getByRole('button', { name: '配置本地模型' }).click();
  const setup = page.getByRole('dialog', { name: '本地模型' });
  await expect(setup).toBeVisible();
  await expect(setup.getByText('Qwen 2.5 · 1.5B', { exact: true })).toBeVisible();
  await expect(setup.getByRole('button', { name: '下载并加载模型' })).toBeVisible();
  expect(remote).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(setup).not.toBeVisible();
  await expect(page.getByRole('button', { name: '配置本地模型' })).toBeFocused();
});

test('checks empty model caches without downloading and explains that offline assets need a production build', async ({ page }) => {
  const remote: string[] = [];
  page.on('request', (request) => { if (new URL(request.url()).origin !== 'http://127.0.0.1:5176') remote.push(request.url()); });
  await page.goto('chat/');
  await page.getByRole('button', { name: '配置本地模型' }).click();
  await page.getByRole('button', { name: '核查模型缓存' }).click();
  await expect(page.getByText(/模型缓存不完整：缺失或无效/)).toBeVisible();
  await page.getByRole('button', { name: '准备站点离线' }).click();
  await expect(page.getByText(/开发服务器不生成离线资产/)).toBeVisible();
  expect(remote).toEqual([]);
  await page.keyboard.press('Escape');
  await page.getByRole('textbox', { name: '输入问题' }).fill('解释React代码示例');
  await page.getByRole('button', { name: '发送问题' }).click();
  await expect(page.locator('.chat-answer__code').first()).toBeVisible();
});

test('cancels initialization and pauses background drawing while the worker is loading', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends EventTarget {
      onmessage: ((event: MessageEvent) => void) | null = null;
      constructor(url: URL | string, options?: WorkerOptions) {
        super();
        if (!String(url).includes('webllm')) return new NativeWorker(url, options);
      }
      postMessage(message: { channel?: string; modelId?: string }) {
        if (message.channel === 'assistant-capability') {
          queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', {
            data: { ...message, report: { supported: true } },
          })));
        }
      }
      terminate() {}
    } as unknown as typeof Worker;
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    let count = 0;
    Object.defineProperty(window, '__ambientDrawCount', { get: () => count });
    CanvasRenderingContext2D.prototype.drawImage = function (...args: Parameters<typeof draw>) {
      count++;
      return draw.apply(this, args);
    };
  });
  await page.goto('chat/');
  await page.getByRole('button', { name: '配置本地模型' }).click();
  await page.getByRole('button', { name: '下载并加载模型' }).click();
  await expect(page.locator('.site-shell')).toHaveClass(/site-shell--inference/);
  const counts = await page.evaluate(async () => {
    const counter = () => (window as unknown as { __ambientDrawCount: number }).__ambientDrawCount;
    const before = counter();
    for (let frame = 0; frame < 4; frame++) await new Promise(requestAnimationFrame);
    return [before, counter()];
  });
  expect(counts[1]).toBe(counts[0]);
  await page.getByRole('button', { name: '取消加载' }).click();
  await expect(page.locator('.site-shell')).not.toHaveClass(/site-shell--inference/);
  await expect(page.getByRole('button', { name: '下载并加载模型' })).toBeEnabled();
});
