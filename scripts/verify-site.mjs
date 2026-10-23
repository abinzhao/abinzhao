import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, join, relative, sep } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    dist: { type: 'string', default: 'docs/.vitepress/dist' },
    url: { type: 'string' },
    'expected-sha': { type: 'string' },
  },
});
const root = resolve(values.dist);
const release = JSON.parse(await readFile(join(root, 'release.json'), 'utf8'));
const base = release.base;
const origin = 'https://abinzhao.github.io';
const pages = new Map();
const resources = new Set();
const failures = [];
const decode = (value) => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (entry.name.endsWith('.html') && entry.name !== '404.html') {
      const html = await readFile(path, 'utf8');
      const name = relative(root, path).split(sep).join('/');
      pages.set(name, { html, ids: new Set([...html.matchAll(/\sid="([^"]*)"/g)].map((match) => decode(match[1]))) });
    }
  }
}
await collect(root);
if (!pages.has('index.html')) failures.push('Missing home page index.html');

for (const [name, { html }] of pages) {
  const pageUrl = new URL(`${base}${name}`, origin);
  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const href = decode(match[1]);
    if (/^(?:mailto:|tel:|data:|blob:)/i.test(href)) continue;
    let target;
    try { target = new URL(href, pageUrl); }
    catch { failures.push(`${name}: invalid URL ${href}`); continue; }
    if (target.origin !== origin) continue;
    if (!target.pathname.startsWith(base)) {
      failures.push(`${name}: link escapes Pages base: ${href}`);
      continue;
    }
    let path;
    try { path = decodeURIComponent(target.pathname.slice(base.length)); }
    catch { failures.push(`${name}: invalid encoded path ${href}`); continue; }
    if (path.endsWith('/') || path === '') path += 'index.html';
    const file = resolve(root, path);
    if (file !== root && !file.startsWith(`${root}${sep}`)) {
      failures.push(`${name}: invalid file path ${href}`);
      continue;
    }
    if (!(await stat(file).catch(() => null))?.isFile()) {
      failures.push(`${name}: missing target ${href}`);
      continue;
    }
    if (target.hash && pages.has(path)) {
      try {
        const anchor = decodeURIComponent(target.hash.slice(1)).split(':~:')[0];
        if (anchor && !pages.get(path).ids.has(anchor)) failures.push(`${name}: missing anchor ${href}`);
      } catch { failures.push(`${name}: invalid anchor ${href}`); }
    }
    resources.add(path);
  }
}

const manifestFile = join(root, 'assistant-assets.json');
if ((await stat(manifestFile).catch(() => null))?.isFile()) {
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  if (manifest.base !== base) failures.push('Offline manifest uses a different base');
  for (const href of [...Object.values(manifest.groups).flat(), `${base}assistant-assets.json`]) {
    if (typeof href !== 'string' || !href.startsWith(base)) {
      failures.push(`Invalid offline asset path: ${href}`);
      continue;
    }
    const path = href.slice(base.length);
    const file = resolve(root, path);
    if (!file.startsWith(`${root}${sep}`) || !(await stat(file).catch(() => null))?.isFile()) {
      failures.push(`Missing offline asset: ${href}`);
      continue;
    }
    resources.add(path);
  }
  if ((await stat(join(root, 'assistant-sw.js')).catch(() => null))?.isFile()) resources.add('assistant-sw.js');
}

if (values.url && !failures.length) {
  const live = new URL(values.url);
  if (live.pathname !== base || !live.pathname.endsWith('/')) throw new Error(`Online URL must end with ${base}`);
  async function request(path, expected) {
    const url = new URL(path, live);
    url.searchParams.set('_verify', release.sha);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: 'no-store' });
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        if (expected) {
          const body = await response.text();
          expected(body);
        } else {
          // Consume responses to release connections before checking the next resource.
          await response.arrayBuffer();
        }
        return;
      } catch (error) {
        if (attempt === 2) failures.push(`${url}: ${error.message}`);
        else await new Promise((done) => setTimeout(done, 1500));
      }
    }
  }
  await request(`release.json?check=${Date.now()}`, (body) => {
    const deployed = JSON.parse(body);
    if (deployed.sha !== (values['expected-sha'] ?? release.sha)) throw new Error('Deployed revision does not match this build');
    if (deployed.base !== base) throw new Error('Deployed base does not match this build');
  });
  if (!failures.length) {
    await request('', (body) => {
      if (!body.includes('<h1')) throw new Error('Home URL does not serve the site');
      if (body !== pages.get('index.html').html) throw new Error('Deployed HTML differs from the build');
    });
    const pending = [...new Set([...pages.keys(), ...resources])];
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (pending.length) {
        const path = pending.shift();
        await request(path, pages.has(path) ? (body) => {
          if (!body.includes('<h1') || /There isn't a GitHub Pages site here/.test(body)) throw new Error('Not the expected site page');
          const title = pages.get(path).html.match(/<title>(.*?)<\/title>/s)?.[1];
          if (title && !body.includes(`<title>${title}</title>`)) throw new Error('Page title differs from the build');
          if (body !== pages.get(path).html) throw new Error('Deployed HTML differs from the build');
        } : undefined);
      }
    }));
  }
}
if (failures.length) {
  console.error([...new Set(failures)].join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Verified ${pages.size} pages and ${resources.size} linked targets${values.url ? ` at ${values.url}` : ' in the static build'}.`);
}
