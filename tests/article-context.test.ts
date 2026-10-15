import { describe, expect, test } from 'vitest';
import {
  getSeriesNavigation,
  normalizeContentHref,
  resolveArticlePagination,
} from '../docs/.vitepress/theme/composables/article-context';

const columns = [
  {
    articles: [
      { href: '/columns/harmonyos/first.html', title: '第一章' },
      { href: '/columns/harmonyos/second.html', title: '第二章' },
    ],
    href: '/columns/harmonyos/',
    slug: 'harmonyos',
    title: 'HarmonyOS 工程化实践',
  },
];

describe('article context', () => {
  test('normalizes VitePress article paths to content index hrefs', () => {
    expect(normalizeContentHref('/blog/local-first-agent.html')).toBe(
      '/blog/local-first-agent/',
    );
    expect(normalizeContentHref('/columns/harmonyos/index.html')).toBe(
      '/columns/harmonyos/',
    );
    expect(
      normalizeContentHref('/abinzhao/columns/harmonyos/first.html'),
    ).toBe('/columns/harmonyos/first/');
  });

  test('returns neighboring chapters for a column article', () => {
    expect(getSeriesNavigation(columns, '/columns/harmonyos/first/')).toEqual({
      column: columns[0],
      next: columns[0].articles[1],
      previous: undefined,
    });
  });

  test('keeps series pagination inside the current column', () => {
    expect(
      resolveArticlePagination(
        {
          column: columns[0],
          next: columns[0].articles[1],
          previous: undefined,
        },
        {
          next: { href: '/blog/newer/', title: '全站下一篇' },
          previous: { href: '/blog/older/', title: '全站上一篇' },
        },
      ),
    ).toEqual({
      next: columns[0].articles[1],
      previous: undefined,
    });
  });
});
