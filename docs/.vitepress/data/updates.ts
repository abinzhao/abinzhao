export interface UpdateItem {
  id: string;
  type: '教程' | '开发日志' | '实验' | '文章';
  title: string;
  summary: string;
  date: string;
  href: string;
  tags: string[];
}

export const recentUpdates: UpdateItem[] = [
  {
    id: 'git-first',
    type: '教程',
    title: '从 git init 开始理解版本控制',
    summary: '拆解 Git 初始化、暂存区与第一次提交。',
    date: '2026.10',
    href: '/tutorials/git/',
    tags: ['Git', '基础'],
  },
  {
    id: 'html-semantics',
    type: '教程',
    title: 'HTML 语义化不是背标签',
    summary: '从页面结构、辅助技术和维护成本理解语义化。',
    date: '2026.10',
    href: '/tutorials/frontend-basics/',
    tags: ['HTML', '可访问性'],
  },
  {
    id: 'github-projects',
    type: '开发日志',
    title: '把 GitHub 项目接入个人站',
    summary: '在构建阶段同步公开仓库，同时保留人工策展能力。',
    date: '2026.10',
    href: '/notes/github-projects',
    tags: ['GitHub', 'VitePress'],
  },
  {
    id: 'particle-field',
    type: '实验',
    title: '用粒子构建一个 AI 光场',
    summary: '将指针、连接距离和性能档位组合成可交互实验。',
    date: '2026.10',
    href: '/lab/particle-ai-field',
    tags: ['AI', 'Canvas', '粒子'],
  },
];
