import { describe, expect, it } from 'vitest';

describe('searchContent', () => {
  it('prioritizes exact title matches and keeps cross-section results', async () => {
    const { searchContent } = await import(
      '../docs/.vitepress/theme/utils/search'
    );
    const items = [
      {
        id: 'git-first',
        type: '教程',
        title: 'Git 从零开始',
        summary: '理解版本控制与第一次提交',
        tags: ['Git', '基础'],
        href: '/tutorials/git/',
      },
      {
        id: 'github-projects',
        type: '笔记',
        title: '把 GitHub 项目接入个人站',
        summary: '在构建阶段同步公开仓库',
        tags: ['GitHub', 'VitePress'],
        href: '/notes/github-projects',
      },
      {
        id: 'particle-field',
        type: '实验',
        title: 'AI 粒子光场',
        summary: '使用 Canvas 构建响应指针的粒子网络',
        tags: ['AI', '粒子'],
        href: '/lab/particle-ai-field',
      },
    ];

    const result = searchContent(items, 'git');

    expect(result.map((item) => item.id)).toEqual([
      'git-first',
      'github-projects',
    ]);
  });

  it('returns all content when the query is blank', async () => {
    const { searchContent } = await import(
      '../docs/.vitepress/theme/utils/search'
    );
    const items = [
      {
        id: 'one',
        type: '教程',
        title: 'HTML 语义化',
        summary: '页面结构',
        tags: ['HTML'],
        href: '/tutorials/frontend/html',
      },
    ];

    expect(searchContent(items, '  ')).toEqual(items);
  });
});
