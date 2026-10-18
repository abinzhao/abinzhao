import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface OfflineManifest {
  base: string;
  version: string;
  groups: {
    site: string[];
    modelRuntime: string[];
  };
}

export function createOfflineWorkerSource(manifest: OfflineManifest): string {
  const prefix = `abin-assistant-assets-${encodeURIComponent(manifest.base)}-`;
  return `
const MANIFEST = ${JSON.stringify(manifest)};
const PREFIX = ${JSON.stringify(prefix)};
const CACHE_NAMES = {
  site: PREFIX + 'site-' + MANIFEST.version,
  modelRuntime: PREFIX + 'model-runtime-' + MANIFEST.version,
};
const ASSET_GROUPS = new Map(Object.entries(MANIFEST.groups).flatMap(([group, urls]) => urls.map((url) => [url, group])));
async function cacheGroup(group) {
  const cache = await caches.open(CACHE_NAMES[group]);
  try {
    await cache.addAll(MANIFEST.groups[group].map((url) => new Request(url, { cache: 'reload' })));
  } catch (error) {
    await caches.delete(CACHE_NAMES[group]);
    throw error;
  }
}
async function groupStatus(group) {
  const cache = await caches.open(CACHE_NAMES[group]);
  const keys = new Set((await cache.keys()).map((request) => new URL(request.url).pathname));
  return { complete: MANIFEST.groups[group].every((url) => keys.has(url)), group, version: MANIFEST.version };
}
self.addEventListener('install', (event) => {
  event.waitUntil(cacheGroup('site'));
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(PREFIX) && !Object.values(CACHE_NAMES).includes(name)) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('message', (event) => {
  const { kind, group = 'site' } = event.data ?? {};
  if (!['site', 'modelRuntime'].includes(group) || !event.ports[0]) return;
  if (!['assistant-offline-status', 'assistant-offline-cache'].includes(kind)) return;
  event.waitUntil((async () => {
    try {
      if (kind === 'assistant-offline-cache') await cacheGroup(group);
      event.ports[0].postMessage(await groupStatus(group));
    } catch (error) {
      event.ports[0].postMessage({ complete: false, group, version: MANIFEST.version });
    }
  })());
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(MANIFEST.base)) return;
  let path = url.pathname;
  if (path.endsWith('/')) path += 'index.html';
  const group = ASSET_GROUPS.get(path);
  if (!group) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAMES[group]);
    if (event.request.mode === 'navigate' || path.endsWith('.html')) {
      try { return await fetch(event.request); }
      catch (error) {
        const cached = await cache.match(path);
        if (cached) return cached;
        throw error;
      }
    }
    const cached = await cache.match(path);
    return cached || fetch(event.request);
  })());
});
`;
}

export async function writeOfflineAssets(
  outDir: string,
  base: string,
  modelRuntimeFiles: ReadonlySet<string> = new Set(),
): Promise<OfflineManifest> {
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
  const isModelRuntime = (file: string) =>
    modelRuntimeFiles.has(file) || /^assets\/webllm\.worker-[^/]+\.js$/.test(file);
  const digest = createHash('sha256').update(base);
  for (const file of assets) {
    digest.update(isModelRuntime(file) ? 'modelRuntime' : 'site');
    digest.update(file).update(await readFile(join(outDir, file)));
  }
  const groups = {
    site: [...assets.filter((file) => !isModelRuntime(file)).map((file) => `${base}${file}`), `${base}assistant-assets.json`],
    modelRuntime: assets.filter(isModelRuntime).map((file) => `${base}${file}`),
  };
  const manifest = { base, version: digest.digest('hex').slice(0, 16), groups };
  await writeFile(join(outDir, 'assistant-assets.json'), JSON.stringify(manifest, null, 2));
  await writeFile(join(outDir, 'assistant-sw.js'), createOfflineWorkerSource(manifest));
  return manifest;
}
