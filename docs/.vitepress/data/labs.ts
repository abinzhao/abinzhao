export type LabCategory =
  | 'WebGL'
  | 'AI'
  | '粒子'
  | '创意交互'
  | '功能实验';

export interface LabExperiment {
  id: string;
  title: string;
  summary: string;
  category: LabCategory;
  technologies: string[];
  input: string[];
  status: '可运行' | '源码开放' | '开发中';
  href: string;
  sourceUrl: string;
}

export const labCategories: LabCategory[] = [
  'WebGL',
  'AI',
  '粒子',
  '创意交互',
  '功能实验',
];

export const labExperiments: LabExperiment[] = [
  {
    id: 'particle-ai-field',
    title: 'AI 粒子光场',
    summary: '粒子在指针附近聚合、连接，并模拟神经节点的激活过程。',
    category: '粒子',
    technologies: ['Canvas', 'TypeScript', 'AI Visual'],
    input: ['鼠标', '触控', '键盘'],
    status: '可运行',
    href: '/lab/particle-ai-field',
    sourceUrl: 'https://github.com/abinzhao',
  },
  {
    id: 'shader-surface',
    title: '流体材质实验',
    summary: '用 GLSL 噪声和后处理构建响应光照的流体表面。',
    category: 'WebGL',
    technologies: ['Three.js', 'GLSL'],
    input: ['鼠标', '触控'],
    status: '开发中',
    href: '/lab/',
    sourceUrl: '',
  },
  {
    id: 'local-rag',
    title: '本地知识问答',
    summary: '探索内容索引、检索和本地模型之间的完整数据流。',
    category: 'AI',
    technologies: ['RAG', 'Embedding'],
    input: ['键盘'],
    status: '开发中',
    href: '/lab/',
    sourceUrl: '',
  },
  {
    id: 'pointer-distortion',
    title: '图像折射与指针场',
    summary: '用向量场和位移纹理建立可触控的图像形变。',
    category: '创意交互',
    technologies: ['WebGL', 'Pointer Events'],
    input: ['鼠标', '触控'],
    status: '开发中',
    href: '/lab/',
    sourceUrl: '',
  },
  {
    id: 'browser-files',
    title: '浏览器文件工作台',
    summary: '验证 File System Access API 的权限、读取和保存流程。',
    category: '功能实验',
    technologies: ['Browser API', 'File System'],
    input: ['鼠标', '键盘'],
    status: '开发中',
    href: '/lab/',
    sourceUrl: '',
  },
];
