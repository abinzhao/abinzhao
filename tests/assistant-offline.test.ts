import { describe, expect, test } from 'vitest';
import { inspectModelCache, clearModelCache } from '../docs/.vitepress/theme/assistant/model-cache';
import { createOfflineWorkerSource } from '../docs/.vitepress/data/offline-build';
import { runInNewContext } from 'node:vm';

const model = { model: 'https://huggingface.co/mlc-ai/test', model_lib: 'https://example.com/test.wasm' };
const root = `${model.model}/resolve/main/`;

function cacheFixture() {
  const entries = new Map<string, Map<string, Response>>([
    ['webllm/config', new Map([[`${root}mlc-chat-config.json`, Response.json({ tokenizer_files: ['tokenizer.json', 'tokenizer_config.json'] })]])],
    ['webllm/wasm', new Map([[model.model_lib, new Response('wasm')]])],
    ['webllm/model', new Map([
      [`${root}tensor-cache.json`, Response.json({ records: [{ dataPath: 'params_0.bin', nbytes: 4 }, { dataPath: 'params_1.bin', nbytes: 4 }] })],
      [`${root}tokenizer.json`, new Response('tokenizer')],
      [`${root}params_0.bin`, new Response('data', { headers: { 'content-length': '4' } })],
      [`${root}params_1.bin`, new Response('data', { headers: { 'content-length': '4' } })],
      ['https://huggingface.co/mlc-ai/other/resolve/main/params_0.bin', new Response('other')],
    ])],
    ['abin-assistant-assets-other', new Map([['https://site.test/', new Response('shell')]])],
  ]);
  const storage = {
    keys: async () => [...entries.keys()],
    open: async (name: string) => ({
      match: async (url: string) => entries.get(name)?.get(url)?.clone(),
      keys: async () => [...(entries.get(name)?.keys() ?? [])].map((url) => new Request(url)),
      delete: async (url: Request | string) => entries.get(name)?.delete(typeof url === 'string' ? url : url.url) ?? false,
    }),
  } as unknown as CacheStorage;
  return { storage, entries };
}

describe('local offline boundaries', () => {
  test('requires config, the actual tokenizer, WASM, manifest and every weight shard without fetching', async () => {
    const { storage, entries } = cacheFixture();
    expect(await inspectModelCache(model, storage)).toMatchObject({ complete: true, shardCount: 2, weightBytes: 8 });
    entries.get('webllm/wasm')!.delete(model.model_lib);
    expect(await inspectModelCache(model, storage)).toMatchObject({ complete: false, missing: [model.model_lib] });
    entries.get('webllm/model')!.delete(`${root}params_1.bin`);
    expect((await inspectModelCache(model, storage)).missing).toContain(`${root}params_1.bin`);
    entries.get('webllm/config')!.set(`${root}mlc-chat-config.json`, Response.json({ tokenizer_files: ['unsupported.txt'] }));
    expect((await inspectModelCache(model, storage)).complete).toBe(false);
  });

  test('rejects malformed manifests, empty shards and incompatible byte lengths', async () => {
    const { storage, entries } = cacheFixture();
    entries.get('webllm/model')!.set(`${root}params_0.bin`, new Response('', { headers: { 'content-length': '0' } }));
    expect((await inspectModelCache(model, storage)).complete).toBe(false);
    entries.get('webllm/model')!.set(`${root}tensor-cache.json`, Response.json({ records: [{ dataPath: 'https://other.test/a.bin', nbytes: 4 }] }));
    expect((await inspectModelCache(model, storage)).complete).toBe(false);
  });

  test('clears only the selected model resources and leaves other models and the page shell', async () => {
    const { storage, entries } = cacheFixture();
    await clearModelCache(model, storage);
    expect([...entries.get('webllm/model')!.keys()]).toEqual(['https://huggingface.co/mlc-ai/other/resolve/main/params_0.bin']);
    expect(entries.get('webllm/config')!.size).toBe(0);
    expect(entries.get('webllm/wasm')!.size).toBe(0);
    expect(entries.get('abin-assistant-assets-other')!.size).toBe(1);
  });

  test.each(['/', '/abinzhao/'])('serves only versioned local assets under %s and preserves model caches', async (base) => {
    const handlers: Record<string, (event: any) => void> = {};
    const deleted: string[] = [];
    const key = `abin-assistant-assets-${encodeURIComponent(base)}-`;
    const source = createOfflineWorkerSource({ base, version: 'v2', urls: [`${base}index.html`, `${base}chat/index.html`, `${base}assets/main.js`] });
    runInNewContext(source, {
      URL, Response,
      self: { location: { origin: 'https://site.test' }, clients: { claim: async () => {} }, addEventListener: (kind: string, handler: any) => { handlers[kind] = handler; } },
      caches: { keys: async () => [`${key}v1`, `${key}v2`, 'webllm/model', 'abin-assistant-assets-other-v1'], delete: async (name: string) => { deleted.push(name); }, open: async () => ({ match: async () => new Response('cached'), addAll: async () => {} }) },
      fetch: async () => new Response('network'),
    });
    let response: Promise<Response> | undefined;
    handlers.fetch({ request: new Request(`https://site.test${base}chat/?article=local`), respondWith: (value: Promise<Response>) => { response = value; } });
    expect(await (await response)?.text()).toBe('cached');
    response = undefined;
    handlers.fetch({ request: new Request('https://huggingface.co/test/params.bin'), respondWith: (value: Promise<Response>) => { response = value; } });
    expect(response).toBeUndefined();
    handlers.fetch({ request: new Request(`https://site.test${base}assets/main.js`, { method: 'POST', body: 'history' }), respondWith: (value: Promise<Response>) => { response = value; } });
    expect(response).toBeUndefined();
    let activation: Promise<void> | undefined;
    handlers.activate({ waitUntil: (value: Promise<void>) => { activation = value; } });
    await activation;
    expect(deleted).toEqual([`${key}v1`]);
    expect(source).not.toContain('skipWaiting');
  });
});
