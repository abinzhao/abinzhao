import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadPublishedArticleSources } from '../docs/.vitepress/data/content';
import { unpackKnowledgeArtifact, unpackKnowledgeIndex } from '../docs/.vitepress/data/knowledge-index-codec';

const projectRoot = resolve(import.meta.dirname, '..');
const fixtureRoot = mkdtempSync(join(tmpdir(), 'abinzhao-build-'));
const distDirectory = join(fixtureRoot, 'site');
const chunksDirectory = resolve(distDirectory, 'assets/chunks');
const execFileAsync = promisify(execFile);

describe('VitePress static site', () => {
  beforeAll(async () => {
    const source = join(fixtureRoot, 'docs');
    cpSync(join(projectRoot, 'docs'), source, { recursive: true, filter: (file) => !/[/\\]\.vitepress[/\\](dist|cache)([/\\]|$)/.test(file) });
    // 教程通过 VitePress snippet 引入实际示例源码，构建夹具保持同样目录关系。
    cpSync(join(projectRoot, 'examples', 'agent-harness'), join(fixtureRoot, 'examples', 'agent-harness'), { recursive: true });
    writeFileSync(join(fixtureRoot, 'package.json'), '{"type":"module"}');
    symlinkSync(join(projectRoot, 'node_modules'), join(fixtureRoot, 'node_modules'), 'dir');
    writeFileSync(join(source, 'blog', 'private-draft.md'), '---\ntitle: 私密草稿\ndate: "2026-10-16"\ndraft: true\n---\nprivate-draft-marker');
    mkdirSync(join(source, 'columns', 'private-series'), { recursive: true });
    writeFileSync(join(source, 'columns', 'private-series', 'index.md'), '---\ntitle: 未公开专题\ndraft: true\n---\nprivate-column-marker');
    writeFileSync(join(source, 'columns', 'private-series', 'note.md'), '---\ntitle: 草稿专题子页\ndate: "2026-10-16"\n---\nprivate-child-marker');
    await execFileAsync(join(projectRoot, 'node_modules/.bin/vitepress'), ['build', 'docs', '--outDir', distDirectory], {
      cwd: fixtureRoot,
      timeout: 45_000,
    });
  }, 60_000);

  afterAll(() => rmSync(fixtureRoot, { force: true, recursive: true }));

  test('builds a deployable home page with the configured base path', () => {
    const indexPath = resolve(distDirectory, 'index.html');

    expect(existsSync(indexPath)).toBe(true);
    expect(readFileSync(indexPath, 'utf8')).toContain('/abinzhao/');
  });

  test('keeps chat code, search index and answer corpus in independent lazy chunks', () => {
    const chunks = readdirSync(chunksDirectory);
    const chatChunk = chunks.find((file) => file.startsWith('ChatPage.') && file.endsWith('.js'));
    const indexChunk = chunks.find((file) =>
      file.startsWith('knowledge-index.data.') && file.endsWith('.js'),
    );
    const corpusChunk = chunks.find((file) =>
      file.startsWith('knowledge-corpus.data.') && file.endsWith('.js'),
    );

    expect(chatChunk).toBeDefined();
    expect(indexChunk).toBeDefined();
    expect(corpusChunk).toBeDefined();
    expect(new Set([chatChunk, indexChunk, corpusChunk])).toHaveLength(3);

    const homeHtml = readFileSync(resolve(distDirectory, 'index.html'), 'utf8');
    expect(homeHtml).not.toContain(chatChunk);
    expect(homeHtml).not.toContain(indexChunk);
    expect(homeHtml).not.toContain(corpusChunk);

    const corpusSource = readFileSync(resolve(chunksDirectory, corpusChunk!), 'utf8');
    expect(corpusSource).toContain('DOM 树');
    expect(gzipSync(readFileSync(resolve(chunksDirectory, indexChunk!))).byteLength)
      .toBeLessThanOrEqual(250 * 1024);
  });

  test('decodes the emitted compact chunk into every published document and block identity', async () => {
    const file = readdirSync(chunksDirectory).find((name) =>
      name.startsWith('knowledge-index.data.') && name.endsWith('.js'),
    );
    expect(file).toBeDefined();
    const { data } = await import(pathToFileURL(join(chunksDirectory, file!)).href);
    expect(data.packed.encoding).toBe('gzip-columns-v1');
    const artifact = await unpackKnowledgeArtifact(data);
    const index = unpackKnowledgeIndex(artifact.index);
    const sources = await loadPublishedArticleSources(join(fixtureRoot, 'docs'));
    const documentIds = sources.map(({ article }) => article.href).sort();
    expect(Object.values(index.documentIds).sort()).toEqual(documentIds);
    expect([...new Set(Object.values(artifact.metadata).map((block) => block.documentId))].sort())
      .toEqual(documentIds);
    expect(index.index.length).toBeGreaterThan(0);
    for (const [id, block] of Object.entries(artifact.metadata)) {
      expect(block.id).toBe(id);
      expect(block.href).toBe(block.anchor ? `${block.documentId}#${block.anchor}` : block.documentId);
    }
  });

  test('excludes draft HTML, column descendants, page bundles, knowledge and sitemap entries', () => {
    expect(existsSync(join(distDirectory, 'blog/private-draft.html'))).toBe(false);
    expect(existsSync(join(distDirectory, 'columns/private-series/index.html'))).toBe(false);
    expect(existsSync(join(distDirectory, 'columns/private-series/note.html'))).toBe(false);
    const published = readdirSync(chunksDirectory).filter((file) => file.endsWith('.js'))
      .map((file) => readFileSync(join(chunksDirectory, file), 'utf8')).join('');
    for (const marker of ['private-draft-marker', 'private-column-marker', 'private-child-marker']) expect(published).not.toContain(marker);
    expect(readFileSync(join(distDirectory, 'sitemap.xml'), 'utf8')).not.toContain('private-');
  });

  test('writes base-aware SEO and a versioned offline manifest that covers lazy workers and knowledge', () => {
    const home = readFileSync(join(distDirectory, 'index.html'), 'utf8');
    expect(home).toContain('rel="canonical" href="https://abinzhao.github.io/abinzhao/"');
    expect(home).toContain('property="og:url" content="https://abinzhao.github.io/abinzhao/"');
    const blog = readFileSync(join(distDirectory, 'blog/index.html'), 'utf8');
    expect(blog).toContain('name="description"');
    expect(readFileSync(join(distDirectory, 'robots.txt'), 'utf8')).toContain('Sitemap: https://abinzhao.github.io/abinzhao/sitemap.xml');
    const manifest = JSON.parse(readFileSync(join(distDirectory, 'assistant-assets.json'), 'utf8'));
    expect(manifest.base).toBe('/abinzhao/');
    expect(manifest.urls).toContain('/abinzhao/chat/index.html');
    expect(manifest.urls).toContain('/abinzhao/hashmap.json');
    expect(manifest.urls.some((url: string) => /webllm\.worker.*\.js$/.test(url))).toBe(true);
    expect(manifest.urls.some((url: string) => /knowledge\.worker.*\.js$/.test(url))).toBe(true);
    expect(manifest.urls.some((url: string) => /knowledge-corpus\.data.*\.js$/.test(url))).toBe(true);
    expect(manifest.urls.every((url: string) => url.startsWith('/abinzhao/'))).toBe(true);
    expect(existsSync(join(distDirectory, 'assistant-sw.js'))).toBe(true);
  });
});
