import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface OfflineManifest {
  base: string;
  version: string;
  urls: string[];
}

export function createOfflineWorkerSource(manifest: OfflineManifest): string {
  const prefix = `abin-assistant-assets-${encodeURIComponent(manifest.base)}-`;
  return `
const MANIFEST = ${JSON.stringify(manifest)};
const PREFIX = ${JSON.stringify(prefix)};
const CACHE = PREFIX + MANIFEST.version;
const ASSETS = new Set(MANIFEST.urls);
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try { await cache.addAll(MANIFEST.urls.map((url) => new Request(url, { cache: 'reload' }))); }
    catch (error) { await caches.delete(CACHE); throw error; }
  })());
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('message', (event) => {
  if (event.data?.kind !== 'assistant-offline-status' || !event.ports[0]) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const keys = new Set((await cache.keys()).map((request) => new URL(request.url).pathname));
    event.ports[0].postMessage({ complete: MANIFEST.urls.every((url) => keys.has(url)), version: MANIFEST.version });
  })());
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(MANIFEST.base)) return;
  let path = url.pathname;
  if (path.endsWith('/')) path += 'index.html';
  if (!ASSETS.has(path)) return;
  event.respondWith((async () => {
    const cached = await (await caches.open(CACHE)).match(path);
    return cached || fetch(event.request);
  })());
});
`;
}

export async function writeOfflineAssets(outDir: string, base: string): Promise<OfflineManifest> {
  async function files(directory: string, prefix = ''): Promise<string[]> {
    const result: string[] = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) result.push(...await files(join(directory, entry.name), `${relative}/`));
      else if (/\.(html|js|css|json|svg|png|jpe?g|webp|woff2?|txt|xml)$/.test(entry.name) &&
          !['assistant-sw.js', 'assistant-assets.json'].includes(entry.name)) result.push(relative);
    }
    return result.sort();
  }
  const assets = await files(outDir);
  const digest = createHash('sha256').update(base);
  for (const file of assets) digest.update(file).update(await readFile(join(outDir, file)));
  const manifest = { base, version: digest.digest('hex').slice(0, 16), urls: [...assets.map((file) => `${base}${file}`), `${base}assistant-assets.json`] };
  await writeFile(join(outDir, 'assistant-assets.json'), JSON.stringify(manifest, null, 2));
  await writeFile(join(outDir, 'assistant-sw.js'), createOfflineWorkerSource(manifest));
  return manifest;
}
