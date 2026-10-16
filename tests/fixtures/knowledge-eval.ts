export interface KnowledgeEvaluationCase {
  expectedDocumentId: string;
  query: string;
}

export const knowledgeEvaluationCases: KnowledgeEvaluationCase[] = [
  {
    query: 'CSS Grid 二维布局怎么做',
    expectedDocumentId: '/columns/fullstack-development/03-box-model-layout.html',
  },
  {
    query: 'HTML 语义化标签有哪些',
    expectedDocumentId: '/columns/fullstack-development/01-semantic-html.html',
  },
  {
    query: '动画卡顿 GPU 合成层怎么优化',
    expectedDocumentId: '/columns/fullstack-development/10-animation-performance.html',
  },
  {
    query: 'Chrome DevTools 如何系统调试',
    expectedDocumentId: '/columns/fullstack-development/11-chrome-devtools.html',
  },
  {
    query: '浏览器 DOM CSSOM Render Tree 渲染流程',
    expectedDocumentId: '/columns/fullstack-development/12-browser-rendering.html',
  },
  {
    query: 'TypeScript 泛型如何保留输入输出关系',
    expectedDocumentId: '/columns/fullstack-development/28-typescript-composition-generics.html',
  },
  {
    query: 'React Hooks 副作用依赖怎么处理',
    expectedDocumentId: '/columns/fullstack-development/31-react-hooks.html',
  },
  {
    query: '用 VitePress 和 GitHub Pages 搭建静态站点',
    expectedDocumentId: '/blog/vitepress-static-site.html',
  },
  {
    query: 'ArkTS 页面状态与组件边界',
    expectedDocumentId: '/blog/arkts-page-architecture.html',
  },
];
