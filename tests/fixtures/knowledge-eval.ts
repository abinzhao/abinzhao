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
  {
    query: '接口幂等事务 Outbox 可靠投递',
    expectedDocumentId: '/blog/api-idempotency-outbox.html',
  },
  {
    query: 'PostgreSQL Keyset 分页微秒签名游标',
    expectedDocumentId: '/blog/postgres-keyset-pagination.html',
  },
  {
    query: 'Agent Harness 插件生命周期反向清理',
    expectedDocumentId: '/columns/agent-harness/02-plugin-lifecycle.html',
  },
  {
    query: 'Agent Harness 会话回放已结算消息',
    expectedDocumentId: '/columns/agent-harness/06-session-replay.html',
  },
  {
    query: 'SSE 模型工具增量与结算',
    expectedDocumentId: '/columns/agent-harness/03-streaming-provider.html',
  },
  {
    query: 'IndexedDB versionchange 多标签页迁移',
    expectedDocumentId: '/blog/indexeddb-local-first.html',
  },
];

export interface AssistantEvaluationCase {
  query: string;
  expectedDocumentId?: string;
  kind: 'answerable' | 'insufficient' | 'off-site' | 'greeting' | 'code' | 'summary' | 'compare' | 'typo' | 'short';
  scope?: 'article';
  criterion: string;
}

const chapter = (slug: string) => `/columns/fullstack-development/${slug}.html`;
const additionalQuestions: Array<[string, string, AssistantEvaluationCase['kind']?]> = [
  ['网页 HTTP 请求和浏览器如何协作', '00-web-foundations'],
  ['CSS 选择器层叠优先级', '02-css-cascade-specificity'],
  ['文字颜色对比度排版', '04-visual-styling'],
  ['CSS 自定义变量工程化', '05-css-variables-tooling'],
  ['CSS transition 过渡', '06-css-transitions'],
  ['CSS transform 变换坐标', '07-css-transforms'],
  ['CSS keyframes 动画', '08-keyframe-animation'],
  ['滚动驱动动画视图过渡', '09-scroll-view-transitions'],
  ['静态博客项目规划', '13-project-planning'],
  ['静态博客 CSS 架构', '14-css-architecture'],
  ['静态博客 HTML 页面', '15-html-pages'],
  ['静态博客 JavaScript 交互', '16-javascript-behavior'],
  ['Markdown 文章管理', '17-markdown-content'],
  ['静态站点部署', '18-static-deployment'],
  ['上线验收故障排查清单', '19-quality-checklist'],
  ['JavaScript 变量作用域闭包', '20-javascript-scope-closures'],
  ['原型类 ESM 错误处理', '21-prototypes-classes-modules-errors'],
  ['Promise async await 事件循环', '22-async-event-loop'],
  ['DOM 事件观察器', '23-dom-events-observers'],
  ['浏览器网络存储 API', '24-browser-data-apis'],
  ['图形文件定位实时通信', '25-media-files-realtime-apis'],
  ['Baseline Browserslist 特性检测', '26-browser-compatibility'],
  ['TypeScript 接口类型别名基础类型', '27-typescript-foundations'],
  ['TypeScript 工具类型类型守卫严格模式', '29-typescript-strict-tooling'],
  ['React 19 组件 JSX 属性', '30-react-foundations'],
  ['React 19 use 动作乐观更新', '32-react-19-actions'],
  ['React Router Zustand Zod', '33-react-router-zustand-zod'],
  ['解释React代码示例', '30-react-foundations', 'code'],
  ['Typescript 泛刑组合', '28-typescript-composition-generics', 'typo'],
  ['Flexbox', '03-box-model-layout', 'short'],
  ['Flexbox 和 Grid 有什么区别', '03-box-model-layout', 'compare'],
];

export const assistantEvaluationCases: AssistantEvaluationCase[] = [
  ...knowledgeEvaluationCases.map((item): AssistantEvaluationCase => ({
    ...item, kind: 'answerable', criterion: 'Top-6命中预期发布文章；回答事实需人工抽查原文支持',
  })),
  ...additionalQuestions.map(([query, slug, kind = 'answerable']): AssistantEvaluationCase => ({
    query, kind, expectedDocumentId: chapter(slug),
    criterion: 'Top-6命中预期文章；代码保留正文，短问不引用无关资料',
  })),
  ...['你好', '您好', '嗨', '谢谢', 'hello'].map((query): AssistantEvaluationCase => ({
    query, kind: 'greeting', criterion: '无文章来源，不声称高可信事实',
  })),
  ...['明天北京天气', '怎么烤酸面包', '推荐咖啡机', '法国签证申请', '股票投资建议',
    '世界杯冠军', '附近餐厅', '日本行程', '房贷利率', '治疗感冒'].map((query): AssistantEvaluationCase => ({
    query, kind: 'off-site', criterion: '无文章来源，说明本站范围',
  })),
  ...['超导量子比特纠错', '脑机接口植入手术', '火星土壤分析', '深海珊瑚繁殖', '未知框架 frobnicate'].map((query): AssistantEvaluationCase => ({
    query, kind: 'insufficient', criterion: '无支持资料时不强答、不伪造来源',
  })),
];

export interface MultiTurnEvaluationCase {
  id: string;
  questions: string[];
  expectedEntities: string[];
  scope: 'site' | 'blog' | 'columns' | 'article';
  transition?: 'scope' | 'session' | 'stop-retry';
  criterion: string;
}

export const multiTurnEvaluationCases: MultiTurnEvaluationCase[] = [
  { id: 'react-pronoun', questions: ['解释 React', '它适合什么场景'], expectedEntities: ['React'], scope: 'site' },
  { id: 'vue-pronoun', questions: ['介绍 Vue', '这个怎么用'], expectedEntities: ['Vue'], scope: 'site' },
  { id: 'ts-pronoun', questions: ['介绍 TypeScript', '它有什么优势'], expectedEntities: ['TypeScript'], scope: 'site' },
  { id: 'js-pronoun', questions: ['解释 JavaScript', '它怎么学'], expectedEntities: ['JavaScript'], scope: 'site' },
  { id: 'css-continuation', questions: ['CSS 布局怎么学', '继续展开'], expectedEntities: ['CSS 布局'], scope: 'site' },
  { id: 'react-continuation', questions: ['解释 React Hooks', '更多细节'], expectedEntities: ['React Hooks'], scope: 'columns' },
  { id: 'grid-continuation', questions: ['解释 Grid', '接着说'], expectedEntities: ['Grid'], scope: 'columns' },
  { id: 'render-continuation', questions: ['解释浏览器渲染', '继续'], expectedEntities: ['浏览器渲染'], scope: 'columns' },
  { id: 'former', questions: ['Flexbox 与 Grid 有什么区别', '前者适合什么'], expectedEntities: ['Flexbox'], scope: 'site' },
  { id: 'latter', questions: ['Flexbox 与 Grid 有什么区别', '后者呢'], expectedEntities: ['Grid'], scope: 'site' },
  { id: 'canvas-former', questions: ['比较 Canvas 和 SVG', '前者适合什么'], expectedEntities: ['Canvas'], scope: 'site' },
  { id: 'canvas-latter', questions: ['比较 Canvas 和 SVG', '后者呢'], expectedEntities: ['SVG'], scope: 'site' },
  { id: 'topic-react', questions: ['解释 Grid', '介绍 React'], expectedEntities: ['React'], scope: 'site' },
  { id: 'topic-vue', questions: ['解释 React', '换个话题介绍 Vue'], expectedEntities: ['Vue'], scope: 'site' },
  { id: 'topic-arkts', questions: ['解释 CSS Grid', '介绍 ArkTS'], expectedEntities: ['ArkTS'], scope: 'blog' },
  { id: 'scope-blog', questions: ['解释 React', '继续'], expectedEntities: [], scope: 'blog', transition: 'scope' },
  { id: 'scope-article', questions: ['解释 Grid', '总结这篇文章'], expectedEntities: [], scope: 'article', transition: 'scope' },
  { id: 'new-session', questions: ['解释 React', '介绍 Vue'], expectedEntities: ['Vue'], scope: 'site', transition: 'session' },
  { id: 'switch-session', questions: ['介绍 TypeScript', '解释 Grid'], expectedEntities: ['Grid'], scope: 'columns', transition: 'session' },
  { id: 'stop-retry', questions: ['解释 React', '解释 React'], expectedEntities: ['React'], scope: 'site', transition: 'stop-retry' },
].map((item) => ({ ...item, criterion: '主体、范围、会话相互隔离；继续不重复证据；停止后可重发' })) as MultiTurnEvaluationCase[];
