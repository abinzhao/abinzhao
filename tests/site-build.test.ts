import { execFile } from 'node:child_process';
import { existsSync, readFileSync, rm } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const projectRoot = resolve(import.meta.dirname, '..');
const distDirectory = resolve(projectRoot, 'docs/.vitepress/dist');
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
});
