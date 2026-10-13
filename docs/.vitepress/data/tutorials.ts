export interface TutorialStage {
  id: string;
  number: string;
  title: string;
  description: string;
  technologies: string[];
  href: string;
  lessonTitle: string;
  lessonSummary: string;
}

export const tutorialStages: TutorialStage[] = [
  {
    id: 'git',
    number: '00',
    title: '开发环境与 Git',
    description: '建立可重复的开发环境，安全地管理与发布代码。',
    technologies: ['终端', 'Git', 'GitHub'],
    href: '/tutorials/git/',
    lessonTitle: '从 git init 开始理解版本控制',
    lessonSummary: '完成第一个仓库、第一次提交和远程发布。',
  },
  {
    id: 'frontend-basics',
    number: '01',
    title: '前端三剑客',
    description: '不依赖框架完成可访问、响应式、具有交互的网页。',
    technologies: ['HTML', 'CSS', 'JavaScript'],
    href: '/tutorials/frontend-basics/',
    lessonTitle: '用 HTML 建立第一个语义化页面',
    lessonSummary: '从结构、样式到交互，理解浏览器如何呈现页面。',
  },
  {
    id: 'frontend-engineering',
    number: '02',
    title: '前端工程化',
    description: '掌握类型、组件、构建、测试和现代前端协作方式。',
    technologies: ['TypeScript', 'React', '测试'],
    href: '/tutorials/frontend-engineering/',
    lessonTitle: '让代码从“能跑”走向“可维护”',
    lessonSummary: '使用 Vite、TypeScript 与测试建立工程基线。',
  },
  {
    id: 'backend',
    number: '03',
    title: '后端与数据库',
    description: '理解 HTTP、接口、数据建模、权限与错误处理。',
    technologies: ['Node.js', 'Express', 'SQLite'],
    href: '/tutorials/backend/',
    lessonTitle: '从一个 REST API 开始',
    lessonSummary: '完成路由、数据持久化和统一错误处理。',
  },
  {
    id: 'fullstack',
    number: '04',
    title: '全栈产品',
    description: '连接前后端、身份、文件、部署与监控，交付完整产品。',
    technologies: ['契约', '部署', '监控'],
    href: '/tutorials/fullstack/',
    lessonTitle: '从需求到上线',
    lessonSummary: '把真实需求拆成可以验证和部署的完整流程。',
  },
  {
    id: 'extensions',
    number: '05',
    title: '扩展能力',
    description: '进入浏览器插件、桌面应用、图形与 AI 应用开发。',
    technologies: ['WebGL', 'AI', 'Electron'],
    href: '/tutorials/extensions/',
    lessonTitle: '让 Web 应用突破浏览器边界',
    lessonSummary: '探索插件、桌面端和创意开发的实现方式。',
  },
];

export interface TutorialChapter {
  title: string;
  summary: string;
  href: string;
}

export interface TutorialGroup {
  stage: string;
  title: string;
  chapters: TutorialChapter[];
}

function chapter(stage: string, path: string, title: string, summary: string): TutorialChapter {
  return { title, summary, href: `/tutorials/${stage}/${path}` };
}

export const tutorialGroups: TutorialGroup[] = [
  {
    stage: 'git', title: '开始 · 环境与版本控制',
    chapters: [
      chapter('git', 'setup/terminal', '终端、路径与开发环境', '建立本地开发环境，理解绝对路径、进程和端口。'),
      chapter('git', 'workflow/version-control', '提交、差异与撤销', '理解工作区、暂存区、提交快照和安全恢复。'),
      chapter('git', 'workflow/branches', '分支、冲突与协作', '通过实际冲突学习合并、远端同步和代码评审。'),
    ],
  },
  {
    stage: 'frontend-basics', title: 'HTML · 内容与语义',
    chapters: [
      chapter('frontend-basics', 'html/structure', '语义化与可访问性', 'DOM、文档结构、标题层级、键盘与辅助技术。'),
      chapter('frontend-basics', 'html/forms-media', '表单、图片与音视频', '表单校验、label、媒体、响应式图片与加载策略。'),
    ],
  },
  {
    stage: 'frontend-basics', title: 'CSS · 布局与动效',
    chapters: [
      chapter('frontend-basics', 'css/cascade-box', '层叠、选择器与盒模型', '计算样式、优先级、尺寸、溢出和布局调试。'),
      chapter('frontend-basics', 'css/layout', 'Flex、Grid 与响应式布局', '一维二维布局、断点、内容约束与流式排版。'),
      chapter('frontend-basics', 'css/motion', '过渡、动画与合成层', 'transform、keyframes、缓动与减少动态模式。'),
    ],
  },
  {
    stage: 'frontend-basics', title: 'JavaScript · 语言与运行机制',
    chapters: [
      chapter('frontend-basics', 'javascript/fundamentals', '类型、作用域与数据处理', '函数、数组对象、引用和边界条件。'),
      chapter('frontend-basics', 'javascript/closures-prototypes', '闭包、this 与原型链', '词法环境、函数调用方式、类与内存生命周期。'),
      chapter('frontend-basics', 'javascript/async', '事件循环与异步编程', 'Promise、微任务、async/await、取消与请求竞态。'),
    ],
  },
  {
    stage: 'frontend-basics', title: '浏览器 · DOM 与 Web API',
    chapters: [
      chapter('frontend-basics', 'browser/dom-events', 'DOM、事件与安全渲染', '事件传播、委托、表单与列表更新。'),
      chapter('frontend-basics', 'browser/storage-workers', '存储与 Web Worker', 'localStorage、IndexedDB、线程通信和故障恢复。'),
      chapter('frontend-basics', 'browser/network-devtools', '网络请求与开发者工具', 'fetch、HTTP、CORS、缓存与请求排查。'),
      chapter('frontend-basics', 'projects/task-board', '实战：任务看板', '完整的增删改查、过滤、持久化与错误处理。'),
    ],
  },
  {
    stage: 'frontend-engineering', title: '工程基础 · 工具与类型',
    chapters: [
      chapter('frontend-engineering', 'tooling/npm-vite', 'npm、模块与 Vite', '依赖、锁文件、ESM、开发服务器与构建。'),
      chapter('frontend-engineering', 'typescript/types', 'TypeScript 类型与边界', '类型收窄、联合、泛型、unknown 和运行时校验。'),
    ],
  },
  {
    stage: 'frontend-engineering', title: 'React · 组件与应用',
    chapters: [
      chapter('frontend-engineering', 'react/components-state', '组件、状态与渲染', 'props、更新队列、不可变数据和列表 key。'),
      chapter('frontend-engineering', 'react/effects-data', 'Effect、请求与生命周期', '外部同步、cleanup、取消和异步竞态。'),
      chapter('frontend-engineering', 'react/forms-routing', '表单与 URL 路由', '受控输入、校验、History 与浏览器返回。'),
    ],
  },
  {
    stage: 'frontend-engineering', title: 'Vue · 响应式原理',
    chapters: [
      chapter('frontend-engineering', 'vue/reactivity', '响应式、计算属性与侦听', 'ref、reactive、computed、依赖追踪与副作用清理。'),
    ],
  },
  {
    stage: 'frontend-engineering', title: '质量 · 测试与性能',
    chapters: [
      chapter('frontend-engineering', 'testing/unit-e2e', '单元、组件与 E2E 测试', 'Vitest、Testing Library 与 Playwright 的真实行为验证。'),
      chapter('frontend-engineering', 'performance/accessibility', '性能与无障碍', 'Core Web Vitals、懒加载、焦点管理和可访问性。'),
    ],
  },
  {
    stage: 'backend', title: '后端 · Node 与 HTTP',
    chapters: [
      chapter('backend', 'node/runtime', 'Node.js 运行时与文件', 'ESM、事件循环、流与错误边界。'),
      chapter('backend', 'http/rest', 'HTTP 与 REST 契约', '方法、状态码、幂等、分页和可运行服务。'),
      chapter('backend', 'express/middleware', 'Express 路由与中间件', '输入校验、执行顺序、错误处理中间件与 404。'),
    ],
  },
  {
    stage: 'backend', title: '数据 · SQLite 与身份',
    chapters: [
      chapter('backend', 'database/sqlite', 'SQLite 建模、查询与事务', '约束、索引、参数化、事务和持久化。'),
      chapter('backend', 'auth/sessions', '登录、会话与授权', '密码哈希、Cookie、会话、归属校验与安全边界。'),
    ],
  },
  {
    stage: 'fullstack', title: '全栈 · 从需求到交付',
    chapters: [
      chapter('fullstack', 'projects/notes-app', '实战：全栈笔记应用', '贯通页面、API、SQLite、CRUD 与失败反馈。'),
      chapter('fullstack', 'contracts/reliability', '契约、竞态与可靠性', '分页、取消、重试和幂等边界。'),
      chapter('fullstack', 'delivery/deploy-observe', '部署、日志与回滚', '静态站与 API、反向代理、健康检查和可观察性。'),
    ],
  },
  {
    stage: 'extensions', title: '浏览器插件 · Manifest V3',
    chapters: [
      chapter('extensions', 'browser/manifest', '第一个 MV3 插件', 'manifest、popup、权限与本地加载。'),
      chapter('extensions', 'browser/messaging-storage', '消息、存储与生命周期', 'Content Script、Service Worker 与异步通信。'),
      chapter('extensions', 'browser/release', '插件安全与发布', '权限、CSP、发布包、隐私说明与验收。'),
    ],
  },
  {
    stage: 'extensions', title: '桌面端 · Electron',
    chapters: [
      chapter('extensions', 'electron/process-ipc', '进程、preload 与 IPC', '主进程、渲染进程、隔离与窄接口。'),
      chapter('extensions', 'electron/files-windows', '本地文件与多窗口', '文件选择、路径边界、窗口生命周期与读写。'),
      chapter('extensions', 'electron/security', '桌面应用安全边界', '导航、窗口、IPC sender、CSP 与输入验证。'),
      chapter('extensions', 'electron/packaging', '打包、签名与更新', 'electron-builder、asar、平台限制和更新策略。'),
    ],
  },
  {
    stage: 'extensions', title: '图形 · Three.js 与 Shader',
    chapters: [
      chapter('extensions', 'graphics/three', '场景、相机与资源管理', '几何、材质、尺寸适配、渲染循环与 dispose。'),
      chapter('extensions', 'graphics/shaders', 'GLSL 与流动着色器', '顶点、片元、uniform、时间和颜色计算。'),
    ],
  },
  {
    stage: 'extensions', title: 'AI · 流式与本地检索',
    chapters: [
      chapter('extensions', 'ai/streaming', '流式响应与取消', 'SSE、分块解码、AbortController 与可运行本地服务。'),
      chapter('extensions', 'ai/local-rag', '本地检索与 RAG 边界', '切块、检索、上下文构建、注入风险与评测。'),
    ],
  },
  {
    stage: 'extensions', title: '创意编程 · 特效实践',
    chapters: [
      chapter('extensions', 'visuals/gradients', '渐变、流光与玻璃质感', '颜色插值、背景移动、层叠与性能取舍。'),
      chapter('extensions', 'visuals/particles', 'Canvas 粒子与连线', '时间步长、距离、交互、DPR 和渲染预算。'),
      chapter('extensions', 'visuals/scroll', '滚动、视差与进入动画', 'IntersectionObserver、进度、transform 与清理。'),
      chapter('extensions', 'visuals/playground', '交互特效演练场', '实时调整布局、渐变、粒子与缓动并观察结果。'),
    ],
  },
];

export const tutorialChapters = tutorialGroups.flatMap((group) =>
  group.chapters.map((item) => ({ ...item, stage: group.stage, group: group.title })),
);
