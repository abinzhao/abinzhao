import { describe, expect, test } from 'vitest';
import { filterArticles } from '../docs/.vitepress/theme/composables/article-filter';

const articles = [
  {
    category: 'HarmonyOS',
    description: '用 ArkTS 组织可维护页面。',
    tags: ['ArkTS', 'ArkUI'],
    title: '构建可维护的 ArkTS 页面架构',
  },
  {
    category: '工程化',
    description: '用 VitePress 管理静态内容。',
    tags: ['VitePress', 'Tooling'],
    title: '面向个人开发者的静态站点',
  },
  {
    category: 'AI Agent',
    description: '本地优先的智能工具工作流。',
    tags: ['Local-first'],
    title: 'Agent 工具的本地边界',
  },
];

describe('article filters', () => {
  test('keeps publication order while filtering by category', () => {
    expect(filterArticles(articles, { category: '工程化', query: '' })).toEqual([
      articles[1],
    ]);
  });

  test('matches a keyword across title, description, and tags', () => {
    expect(filterArticles(articles, { category: '全部', query: '本地' })).toEqual([
      articles[2],
    ]);
    expect(filterArticles(articles, { category: '全部', query: 'vitepress' })).toEqual([
      articles[1],
    ]);
  });
});
