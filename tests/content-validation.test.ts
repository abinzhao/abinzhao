import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { createContentIndex, publicationExclusions } from '../docs/.vitepress/data/content';
import { validateConfig } from '../docs/.vitepress/data/config-validation';

const fixtures: string[] = [];
afterEach(() => { for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true }); });
test('reports incorrect YAML fields instead of silently dropping a published article', async () => {
  const root = mkdtempSync(join(tmpdir(), 'abin-validation-'));
  fixtures.push(root);
  mkdirSync(join(root, 'blog'));
  writeFileSync(join(root, 'blog/a.md'), '---\ntitle: Article\ndate: "2026-02-30"\ntags: [1]\n---');
  await expect(createContentIndex(root)).rejects.toThrow(/date|tags/);
  writeFileSync(join(root, 'blog/a.md'), '---\ntitle: Article\ndate: "2026-10-16"\ndraft: "false"\n---');
  await expect(createContentIndex(root)).rejects.toThrow(/draft/);
  writeFileSync(join(root, 'blog/a.md'), '---\ntitle: Article\ndate: "2026-10-16"\nseries: {order: "first"}\n---');
  await expect(createContentIndex(root)).rejects.toThrow(/series.order/);
});
test('uses one draft publication policy for article and column build exclusions', () => {
  const root = mkdtempSync(join(tmpdir(), 'abin-publication-'));
  fixtures.push(root);
  mkdirSync(join(root, 'blog'));
  mkdirSync(join(root, 'columns/private'), { recursive: true });
  writeFileSync(join(root, 'blog/a.md'), '---\ndraft: true\n---');
  writeFileSync(join(root, 'columns/private/index.md'), '---\ndraft: true\n---');
  writeFileSync(join(root, 'columns/private/a.md'), '---\ntitle: child\n---');
  expect(publicationExclusions(root)).toEqual(['blog/a.md', 'columns/private/**']);
});
test('validates structural YAML settings with the file and field in the error', () => {
  expect(() => validateConfig({ site: { title: 4 } }, { site: { title: 'string' } }, 'site.yml')).toThrow(/site.yml.*site.title/);
  expect(() => validateConfig({ metrics: [{ value: true }] }, { metrics: [{ value: 'string|number' }] }, 'home.yml')).toThrow(/metrics.0.value/);
  expect(() => validateConfig({ icons: ['invalid'] }, { icons: [['book', 'rocket']] }, 'home.yml')).toThrow(/icons.0/);
});
