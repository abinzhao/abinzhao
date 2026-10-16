import { execFile } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rm } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const projectRoot = resolve(import.meta.dirname, '..');
const distDirectory = resolve(projectRoot, 'docs/.vitepress/dist');
const chunksDirectory = resolve(distDirectory, 'assets/chunks');
const execFileAsync = promisify(execFile);

describe('VitePress static site', () => {
  beforeAll(async () => {
    await execFileAsync('pnpm', ['build'], {
      cwd: projectRoot,
    });
  }, 60_000);

  afterAll(() => rm(distDirectory, { force: true, recursive: true }));

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
});
