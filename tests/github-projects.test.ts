import { describe, expect, it } from 'vitest';

describe('mergeGithubProjects', () => {
  it('keeps curated order and lets manual content override GitHub metadata', async () => {
    const { mergeGithubProjects } = await import(
      '../docs/.vitepress/theme/utils/projects'
    );
    const remote = [
      {
        name: 'cps',
        description: 'Remote description',
        htmlUrl: 'https://github.com/abinzhao/cps',
        homepage: '',
        language: 'TypeScript',
        topics: ['cli'],
        stars: 8,
        updatedAt: '2026-10-10T00:00:00Z',
        archived: false,
      },
      {
        name: 'harmony-next-blog',
        description: 'Remote HarmonyOS description',
        htmlUrl: 'https://github.com/abinzhao/harmony-next-blog',
        homepage: 'https://example.com',
        language: 'ArkTS',
        topics: ['harmonyos'],
        stars: 12,
        updatedAt: '2026-10-11T00:00:00Z',
        archived: false,
      },
      {
        name: 'not-selected',
        description: 'Should not be shown',
        htmlUrl: 'https://github.com/abinzhao/not-selected',
        homepage: '',
        language: 'JavaScript',
        topics: [],
        stars: 0,
        updatedAt: '2026-10-01T00:00:00Z',
        archived: false,
      },
    ];
    const curated = [
      {
        repo: 'harmony-next-blog',
        title: '鸿蒙学习笔记与实践教程',
        description: '从真实项目进入 HarmonyOS 与 ArkTS。',
        category: '应用开发',
        featured: true,
      },
      {
        repo: 'cps',
        title: '命令行图片压缩工具',
        description: '用 Node.js 完成可发布的 CLI。',
        category: '开源工具',
        featured: false,
      },
    ];

    const result = mergeGithubProjects(remote, curated);

    expect(result.map((project) => project.repo)).toEqual([
      'harmony-next-blog',
      'cps',
    ]);
    expect(result[0]).toMatchObject({
      title: '鸿蒙学习笔记与实践教程',
      description: '从真实项目进入 HarmonyOS 与 ArkTS。',
      language: 'ArkTS',
      stars: 12,
      featured: true,
    });
  });

  it('keeps manually configured projects when GitHub is unavailable', async () => {
    const { mergeGithubProjects } = await import(
      '../docs/.vitepress/theme/utils/projects'
    );
    const curated = [
      {
        repo: 'local-demo',
        title: '本地实验项目',
        description: '即使同步失败也能显示。',
        category: '创意开发',
        featured: true,
      },
    ];

    const result = mergeGithubProjects([], curated);

    expect(result).toEqual([
      expect.objectContaining({
        repo: 'local-demo',
        title: '本地实验项目',
        stars: 0,
        topics: [],
      }),
    ]);
  });
});
