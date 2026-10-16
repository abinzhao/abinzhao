import type { KnowledgeSearchResult } from '../../docs/.vitepress/theme/composables/knowledge-search';

function result(
  id: string,
  text: string,
  overrides: Partial<KnowledgeSearchResult> = {},
): KnowledgeSearchResult {
  return {
    articleTitle: '现代 CSS 布局',
    codeTerms: [],
    documentId: '/columns/fullstack-development/03-box-model-layout.html',
    href: `/columns/fullstack-development/03-box-model-layout.html#${id}`,
    id,
    kind: 'paragraph',
    matchedTerms: ['css', '布局'],
    publishedAt: '2026-10-15',
    readingMinutes: 4,
    score: 48,
    sectionTitle: '布局选择',
    seriesOrder: 4,
    tags: ['CSS3', '弹性布局', '网格布局'],
    text,
    ...overrides,
  };
}

export const chatKnowledgeResults: KnowledgeSearchResult[] = [
  result(
    'flex',
    'Flexbox 控制一行或一列内元素的排布，适合导航栏、按钮组和表单行。',
    { sectionTitle: 'Flexbox', matchedTerms: ['flexbox', '弹性布局'] },
  ),
  result(
    'grid',
    'Grid 同时控制行和列，适合卡片列表、整页布局和仪表盘。',
    { sectionTitle: 'Grid', matchedTerms: ['grid', '网格布局'] },
  ),
  result(
    'debug',
    '先稳定复现问题，再收集 Console 与 Network 的首个异常，最后缩小范围并回归验证。',
    {
      articleTitle: 'Chrome DevTools 调试',
      documentId: '/columns/fullstack-development/11-chrome-devtools.html',
      href: '/columns/fullstack-development/11-chrome-devtools.html#建立可重复的调试流程',
      matchedTerms: ['调试', '复现'],
      sectionTitle: '建立可重复的调试流程',
      seriesOrder: 12,
      tags: ['Chrome DevTools', '调试'],
    },
  ),
  result(
    'rendering',
    '浏览器依次构建 DOM 与 CSSOM，再生成 Render Tree，完成 Layout、Paint 和 Composite。',
    {
      articleTitle: '浏览器渲染流程',
      documentId: '/columns/fullstack-development/12-browser-rendering.html',
      href: '/columns/fullstack-development/12-browser-rendering.html#完整链路',
      matchedTerms: ['浏览器', '渲染'],
      sectionTitle: '完整链路',
      seriesOrder: 13,
      tags: ['浏览器', '渲染'],
    },
  ),
  result(
    'vitepress',
    'Markdown 文章与 YAML 配置进入版本控制，文章、专栏与导航由构建时索引自动生成。',
    {
      articleTitle: '面向个人开发者的静态站点',
      documentId: '/blog/vitepress-static-site.html',
      href: '/blog/vitepress-static-site.html#内容是源代码',
      matchedTerms: ['vitepress', '静态站点'],
      sectionTitle: '内容是源代码',
      seriesOrder: undefined,
      tags: ['VitePress', 'GitHub Pages'],
    },
  ),
];

export const conflictKnowledgeResults: KnowledgeSearchResult[] = [
  result('support', '该能力支持离线使用。'),
  result('unsupported', '该能力不支持离线使用。', {
    href: '/columns/fullstack-development/03-box-model-layout.html#限制',
    sectionTitle: '限制',
  }),
];

export const invalidKnowledgeResult = result('invalid', '这条内容不应成为回答证据。', {
  documentId: 'https://example.com/article',
  href: 'https://example.com/article',
});
