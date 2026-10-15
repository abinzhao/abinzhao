import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createContentIndex } from '../docs/.vitepress/data/content';

let fixtureRoot = '';

describe('content index', () => {
  beforeAll(async () => {
    fixtureRoot = await mkdtemp(join(tmpdir(), 'abinzhao-content-'));
    await mkdir(join(fixtureRoot, 'blog'), { recursive: true });
    await mkdir(join(fixtureRoot, 'columns', 'web-performance'), { recursive: true });

    await writeFile(
      join(fixtureRoot, 'blog', 'static-site.md'),
      [
        '---',
        'title: 静态站点架构',
        'description: 用 VitePress 构建可部署站点。',
        'date: "2026-10-15"',
        'category: 工程化',
        'tags: [VitePress, GitHub Pages]',
        'featured: true',
        '---',
        '',
        '# 静态站点架构',
      ].join('\n'),
    );

    await writeFile(
      join(fixtureRoot, 'blog', 'draft-note.md'),
      [
        '---',
        'title: 未发布草稿',
        'date: "2026-10-16"',
        'draft: true',
        '---',
      ].join('\n'),
    );

    await writeFile(
      join(fixtureRoot, 'columns', 'web-performance', 'index.md'),
      [
        '---',
        'title: Web 性能实践',
        'description: 从指标到优化的系列文章。',
        'status: ongoing',
        'featured: true',
        '---',
      ].join('\n'),
    );

    await writeFile(
      join(fixtureRoot, 'columns', 'web-performance', 'rendering.md'),
      [
        '---',
        'title: 理解浏览器渲染',
        'date: "2026-10-13"',
        'tags: [Rendering]',
        'series:',
        '  order: 2',
        '---',
      ].join('\n'),
    );

    await writeFile(
      join(fixtureRoot, 'columns', 'web-performance', 'metrics.md'),
      [
        '---',
        'title: 性能指标入门',
        'date: "2026-10-10"',
        'tags: [Web Vitals]',
        'series:',
        '  order: 1',
        '---',
      ].join('\n'),
    );
  });

  afterAll(() => rm(fixtureRoot, { force: true, recursive: true }));

  test('indexes published articles and orders column articles by series order', async () => {
    const index = await createContentIndex(fixtureRoot);

    expect(index.articles.map((article) => article.href)).toEqual([
      '/blog/static-site/',
      '/columns/web-performance/rendering/',
      '/columns/web-performance/metrics/',
    ]);
    expect(index.columns).toEqual([
      expect.objectContaining({
        href: '/columns/web-performance/',
        slug: 'web-performance',
        articles: [
          expect.objectContaining({ title: '性能指标入门' }),
          expect.objectContaining({ title: '理解浏览器渲染' }),
        ],
      }),
    ]);
    expect(index.tags).toEqual(['GitHub Pages', 'Rendering', 'VitePress', 'Web Vitals']);
    expect(index.categories).toEqual(['工程化']);
  });
});
