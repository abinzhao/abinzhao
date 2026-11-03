import { expect, test, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createOfflineWorkerSource } from '../../docs/.vitepress/data/offline-build';

async function fixture(failure?: 'network' | 'quota') {
  const state = { version: 'v1', failed: false };
  const server = createServer((request, response) => {
    const path = new URL(request.url!, 'http://localhost').pathname;
    response.setHeader('Cache-Control', 'no-store');
    if (path === '/worker.js') {
      response.setHeader('Content-Type', 'application/javascript');
      const quota = failure === 'quota' ? `
        const addAll = Cache.prototype.addAll;
        let rejected = false;
        Cache.prototype.addAll = function(requests) {
          if (!rejected && requests.some(request => request.url.endsWith('/optional.js'))) {
            rejected = true;
            return Promise.reject(new DOMException('Injected storage quota exhaustion', 'QuotaExceededError'));
          }
          return addAll.call(this, requests);
        };` : '';
      response.end(quota + createOfflineWorkerSource({
        base: '/', version: state.version,
        groups: { site: ['/index.html', `/marker-${state.version}.js`], modelRuntime: [], experiments: ['/optional.js'] },
        sizes: { site: 1, modelRuntime: 0, experiments: 1 },
      }));
    } else if (path === '/optional.js' && failure === 'network' && !state.failed) {
      state.failed = true; response.statusCode = 503; response.end('Injected interrupted download');
    } else if (path.endsWith('.js')) {
      response.setHeader('Content-Type', 'application/javascript');
      response.end(`/* ${path} */`);
    } else {
      response.setHeader('Content-Type', 'text/html');
      response.end(`<main>${state.version}</main>`);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { state, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}
async function register(page: Page, url: string) {
  await page.goto(url);
  await page.evaluate(async () => { await navigator.serviceWorker.register('/worker.js'); await navigator.serviceWorker.ready; });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}
async function cacheOptional(page: Page) {
  return page.evaluate(() => new Promise<{ complete: boolean; version: string }>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => { channel.port1.close(); resolve(event.data); };
    navigator.serviceWorker.controller!.postMessage({ kind: 'assistant-offline-cache', group: 'experiments' }, [channel.port2]);
  }));
}

test('waiting update preserves old controlled pages and only retires old caches after activation', async ({ context }) => {
  const app = await fixture();
  try {
    const old = await context.newPage();
    await register(old, app.url);
    await old.evaluate(async () => { await caches.open('webllm/model'); await caches.open('other-site-cache'); });
    app.state.version = 'v2';
    await old.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
    await old.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state === 'installed');
    expect(await old.evaluate(() => caches.keys())).toEqual(expect.arrayContaining([
      'abin-assistant-assets-%2F-site-v1', 'abin-assistant-assets-%2F-site-v2',
    ]));
    expect(await old.evaluate(async () => (await fetch('/marker-v1.js')).text())).toContain('marker-v1');
    await old.close();
    const next = await context.newPage();
    await next.goto(app.url);
    await next.waitForFunction(async () => {
      const keys = await caches.keys();
      return navigator.serviceWorker.controller && !keys.includes('abin-assistant-assets-%2F-site-v1');
    });
    expect(await next.evaluate(() => caches.keys())).toEqual(expect.arrayContaining([
      'abin-assistant-assets-%2F-site-v2', 'webllm/model', 'other-site-cache',
    ]));
    expect(await next.evaluate(async () => (await fetch('/marker-v2.js')).text())).toContain('marker-v2');
  } finally { await app.close(); }
});

for (const failure of ['network', 'quota'] as const) {
  test(`${failure} failure removes the incomplete group, preserves shell and supports retry`, async ({ page }) => {
    const app = await fixture(failure);
    try {
      await register(page, app.url);
      expect(await cacheOptional(page)).toMatchObject({ complete: false });
      const keys = await page.evaluate(() => caches.keys());
      expect(keys).toContain('abin-assistant-assets-%2F-site-v1');
      expect(keys).not.toContain('abin-assistant-assets-%2F-experiments-v1');
      expect(await cacheOptional(page)).toEqual({ complete: true, version: 'v1', group: 'experiments' });
    } finally { await app.close(); }
  });
}
