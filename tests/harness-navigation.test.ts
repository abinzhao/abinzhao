import { describe, expect, test } from 'vitest';

describe('Harness learning units', () => {
  test('keeps every chapter in reading order and locates Skills, MCP and safety units', async () => {
    const module = await import('../docs/.vitepress/theme/composables/harness-navigation').catch(() => null);
    expect(module, 'learning unit navigation must be implemented').not.toBeNull();
    if (!module) return;
    const { groupHarnessChapters } = module;
    const articles = Array.from({ length: 72 }, (_, index) => ({
      seriesOrder: index + 1, href: `/columns/agent-harness/${index + 1}.html`, title: String(index + 1),
    }));
    const groups = groupHarnessChapters(articles);
    expect(groups.flatMap((group) => group.articles)).toEqual(articles);
    expect(groups.find((group) => group.title.includes('Skills'))?.articles.map((article) => article.seriesOrder))
      .toEqual([19, 20, 21, 22, 23, 24]);
    expect(groups.find((group) => group.title.includes('MCP'))?.articles.map((article) => article.seriesOrder))
      .toEqual([25, 26, 27, 28, 29, 30]);
    expect(groups.find((group) => group.title.includes('安全'))?.articles.map((article) => article.seriesOrder))
      .toEqual([49, 50, 51, 52, 53, 54]);
    expect(groups.at(-1)?.articles.at(-1)?.seriesOrder).toBe(72);
  });

  test('retains chapters added after the original production unit', async () => {
    const { groupHarnessChapters } = await import('../docs/.vitepress/theme/composables/harness-navigation');
    const articles = Array.from({ length: 74 }, (_, index) => ({ seriesOrder: index + 1 }));
    expect(groupHarnessChapters(articles).flatMap((group) => group.articles)).toEqual(articles);
  });

  test('groups the fullstack course into foundations, frontend and backend without losing chapters', async () => {
    const module = await import('../docs/.vitepress/theme/composables/harness-navigation');
    expect(module).toHaveProperty('groupCourseChapters');
    const articles = Array.from({ length: 55 }, (_, index) => ({ seriesOrder: index + 1 }));
    const groups = (module as unknown as { groupCourseChapters: (slug: string, items: typeof articles) => Array<{ title: string; articles: typeof articles }> })
      .groupCourseChapters('fullstack-development', articles);
    expect(groups.flatMap((group) => group.articles)).toEqual(articles);
    expect(groups.find((group) => group.title.includes('后端'))?.articles[0].seriesOrder).toBe(38);
  });
});
