import { describe, expect, test } from 'vitest';
import { createArticleOutline } from '../docs/.vitepress/theme/composables/article-outline';

describe('article outline', () => {
  test('creates navigable outline items from rendered headings', () => {
    expect(
      createArticleOutline([
        { id: 'local-first', level: 2, title: '本地优先' },
        { id: 'boundaries', level: 3, title: '边界设计' },
      ]),
    ).toEqual([
      { level: 2, link: '#local-first', title: '本地优先' },
      { level: 3, link: '#boundaries', title: '边界设计' },
    ]);
  });

  test('omits headings that cannot be linked', () => {
    expect(createArticleOutline([{ id: '', level: 2, title: '无锚点' }])).toEqual([]);
  });
});
