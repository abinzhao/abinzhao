import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { relative, resolve } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { expect, test } from 'vitest';
import { loadPublishedArticleSources } from '../docs/.vitepress/data/content';
import { experiments } from '../docs/.vitepress/data/labs';

const root = resolve(import.meta.dirname, '..');

test('every published experiment has a substantive tutorial and maintained runnable source', async () => {
  const sources = await loadPublishedArticleSources(resolve(root, 'docs'));
  for (const experiment of experiments) {
    const related = sources.filter(({ article }) => article.demoIds?.includes(experiment.id));
    expect(related.length, experiment.id).toBeGreaterThan(0);
    for (const { article, markdown } of related) {
      expect(article.source?.path).toBeTruthy();
      expect(article.source?.command).toBeTruthy();
      expect(article.runtime).toBeTruthy();
      expect(markdown.length).toBeGreaterThan(1500);
    }
  }
});

test('downloaded source includes a runnable site and exactly matches its SHA256 manifest', async () => {
  const output = await mkdtemp(resolve(tmpdir(), 'abinzhao-source-'));
  let archive: Buffer;
  try {
    execFileSync(process.execPath, [resolve(root, 'scripts/package-site-source.mjs'), output]);
    archive = await readFile(resolve(output, 'site-labs.zip'));
  } finally { await rm(output, { recursive: true, force: true }); }
  const entries = new Map<string, Buffer>();
  for (let offset = 0; archive.readUInt32LE(offset) === 0x04034b50;) {
    const compression = archive.readUInt16LE(offset + 8);
    const size = archive.readUInt32LE(offset + 18);
    const nameSize = archive.readUInt16LE(offset + 26);
    const extraSize = archive.readUInt16LE(offset + 28);
    const name = archive.subarray(offset + 30, offset + 30 + nameSize).toString();
    const start = offset + 30 + nameSize + extraSize;
    const packed = archive.subarray(start, start + size);
    entries.set(name, compression === 8 ? inflateRawSync(packed) : packed);
    offset = start + size;
  }
  const manifest = JSON.parse(entries.get('abinzhao/SOURCE-MANIFEST.json')!.toString());
  expect(manifest.files.length).toBeGreaterThan(200);
  expect(entries.has('abinzhao/pnpm-lock.yaml')).toBe(true);
  expect(entries.has('abinzhao/playwright.production.config.ts')).toBe(true);
  expect(entries.has('abinzhao/docs/.vitepress/config.mts')).toBe(true);
  expect(entries.has('abinzhao/.github/workflows/deploy-pages.yml')).toBe(true);
  expect(entries.has('abinzhao/examples/site-labs/spectral.frag')).toBe(true);
  const sources = await loadPublishedArticleSources(resolve(root, 'docs'));
  for (const { markdown } of sources) {
    for (const match of markdown.matchAll(/^<<<\s+@\/([^\s{#]+)/gm)) {
      const path = relative(root, resolve(root, 'docs', match[1]));
      expect(entries.has(`abinzhao/${path}`), `snippet ${path}`).toBe(true);
    }
  }
  const hash = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
  for (const file of manifest.files) expect(hash(entries.get(`abinzhao/${file.path}`)!)).toBe(file.sha256);
  expect(hash(entries.get('abinzhao/examples/site-labs/execution.ts')!))
    .toBe(hash(await readFile(resolve(root, 'examples/site-labs/execution.ts'))));
  expect([...entries.keys()].some((path) => /node_modules|\.env|\.DS_Store|\.vitepress\/(dist|cache)|downloads\/.*\.zip/.test(path))).toBe(false);
});
