import githubProjects from './generated/github-projects.json';
import {
  mergeGithubProjects,
  type CuratedProject,
  type GithubProject,
} from '../theme/utils/projects';

export const curatedProjects: CuratedProject[] = [
  {
    repo: 'harmony-next-blog',
    title: '鸿蒙学习笔记与实践教程',
    description: '从真实案例进入 HarmonyOS、ArkTS 与 ArkUI 开发。',
    category: '应用开发',
    featured: true,
  },
  {
    repo: 'cps',
    title: '命令行图片压缩工具',
    description: '一个用 Node.js 与 TypeScript 构建、可以发布使用的 CLI。',
    category: '开源工具',
    featured: true,
  },
  {
    repo: 'scio-design',
    title: '工程规范与效能组件实践',
    description: '多包管理、前端工程规范和效能组件的完整实践。',
    category: '前端工程',
    featured: true,
  },
  {
    repo: 'scioPro',
    title: 'React 多包组件与工具仓库',
    description: '组件、Hooks 与工具函数组成的 Monorepo。',
    category: '组件工程',
    featured: false,
  },
  {
    repo: 'code-cnalysis',
    title: '代码分析工具',
    description: '围绕代码理解与分析工作流建立的开发工具。',
    category: '开发工具',
    featured: false,
  },
];

export const projects = mergeGithubProjects(
  githubProjects as GithubProject[],
  curatedProjects,
);

export const featuredProjects = projects.filter((project) => project.featured);
