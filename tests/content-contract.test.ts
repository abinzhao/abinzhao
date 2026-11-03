import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { createContentIndex } from '../docs/.vitepress/data/content';

const roots: string[] = [];
async function fixture(articles: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'content-contract-'));
  roots.push(root);
  await mkdir(join(root, 'docs/blog'), { recursive: true });
  await mkdir(join(root, 'examples'), { recursive: true });
  await writeFile(join(root, 'examples/demo.ts'), 'export const answer = 42;\n');
  for (const [slug, extra] of Object.entries(articles)) {
    await writeFile(join(root, `docs/blog/${slug}.md`), `---\ntitle: ${slug}\ndate: "2026-10-01"\n${extra}\n---\n正文。\n\`\`\`ts\nconst x = 42;\n\`\`\`\n`);
  }
  return join(root, 'docs');
}
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

test('preserves legacy URLs while accepting stable identities and real example metadata', async () => {
  const root = await fixture({
    old: '',
    advanced: 'id: content-advanced\nupdatedAt: "2026-11-01"\nverifiedAt: "2026-11-02"\nlevel: advanced\nprerequisites: [/blog/old.html]\ndemoIds: [code-morph]\nsource:\n  path: examples/demo.ts\n  ref: working-tree\n  command: pnpm test\nruntime: Node.js 22\nverification:\n  kind: unit\n  evidence: tests/content-contract.test.ts',
  });
  const index = await createContentIndex(root);
  expect(index.blogArticles.find((article) => article.title === 'old')).toMatchObject({ id: '/blog/old.html', href: '/blog/old.html', readingTime: 1 });
  expect(index.blogArticles.find((article) => article.title === 'advanced')).toMatchObject({
    id: 'content-advanced', href: '/blog/advanced.html', updatedAt: '2026-11-01', level: 'advanced',
    prerequisites: ['/blog/old.html'], demoIds: ['code-morph'], source: { path: 'examples/demo.ts', ref: 'working-tree' },
  });
});

test.each([
  [{ a: 'id: repeated', b: 'id: repeated' }, /id.*重复/],
  [{ a: 'prerequisites: [absent]' }, /先修.*不存在/],
  [{ a: 'id: a\nprerequisites: [b]', b: 'id: b\nprerequisites: [a]' }, /先修.*环/],
  [{ a: 'prerequisites: [draft]', b: 'id: draft\ndraft: true' }, /先修.*不存在/],
  [{ a: 'demoIds: [missing-lab]' }, /demoIds/],
  [{ a: 'updatedAt: "2026-02-30"' }, /updatedAt/],
  [{ a: 'updatedAt: "2025-01-01"' }, /updatedAt/],
  [{ a: 'level: expert' }, /level/],
  [{ a: 'source:\n  path: examples/missing.ts' }, /source.path.*不存在/],
  [{ a: 'source:\n  path: ../outside.ts' }, /source.path/],
  [{ a: 'source:\n  path: examples/demo.ts\n  ref: dev' }, /source.ref/],
  [{ a: 'prerequisites: something' }, /prerequisites/],
  [{ a: 'id: __proto__' }, /id/],
] as const)('rejects broken published content contracts: %j', async (articles, message) => {
  await expect(createContentIndex(await fixture(articles))).rejects.toThrow(message);
});
