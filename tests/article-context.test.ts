import { describe, expect, test } from 'vitest';
import {
  buildArticleChatHref,
  getSeriesNavigation,
  normalizeContentHref,
  resolveArticleChatContext,
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

  test('builds a base-aware chat URL with only public article context', () => {
    expect(
      buildArticleChatHref(
        '/blog/local-first-agent.html',
        'summary',
        '/abinzhao/',
      ),
    ).toBe(
      '/abinzhao/chat/?article=%2Fblog%2Flocal-first-agent.html&action=summary',
    );
    expect(
      buildArticleChatHref(
        '/columns/fullstack-development/03-box-model-layout.html',
        'ask',
        '/',
      ),
    ).toBe(
      '/chat/?article=%2Fcolumns%2Ffullstack-development%2F03-box-model-layout.html&action=ask',
    );
  });

  test('accepts only published articles and controlled actions from chat params', () => {
    const published = new Set([
      '/blog/local-first-agent.html',
      '/columns/fullstack-development/03-box-model-layout.html',
    ]);

    expect(resolveArticleChatContext(
      '?article=%2Fblog%2Flocal-first-agent.html&action=key-points',
      published,
    )).toEqual({
      action: 'key-points',
      articleId: '/blog/local-first-agent.html',
      valid: true,
    });
    expect(resolveArticleChatContext(
      '?article=https%3A%2F%2Fexample.com&action=delete',
      published,
    )).toEqual({
      action: 'ask',
      valid: false,
    });
    expect(resolveArticleChatContext('', published)).toEqual({
      action: 'ask',
      valid: true,
    });
  });
});
