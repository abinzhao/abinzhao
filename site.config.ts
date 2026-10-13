export interface SocialLinkConfig {
  platform: 'csdn' | 'juejin' | 'github' | 'gitee';
  label: string;
  url: string;
  showInHeader: boolean;
  showInFooter: boolean;
}

export const siteConfig = {
  owner: {
    name: '赵建斌',
    nickname: '纯爱掌门人',
    role: '独立开发者 · 全栈工程教程作者',
    headline: '从第一条 Git 命令，到独立上线一个完整产品。',
    description:
      '我把全栈开发拆成可以理解、可以运行、可以验证的系统教程，也公开我的项目、AI 实验和 WebGL 创意实现。',
  },
  site: {
    title: '赵建斌 / 纯爱掌门人',
    description:
      '从 Git、前端三剑客到全栈产品，系统学习开发并查看真实项目、AI 与 WebGL 实验。',
    locale: 'zh-CN',
    copyright: `© ${new Date().getFullYear()} 赵建斌`,
  },
  navigation: [
    { label: '教程', href: '/tutorials/' },
    { label: '项目', href: '/projects/' },
    { label: '实验室', href: '/lab/' },
    { label: '笔记', href: '/notes/' },
    { label: '关于', href: '/about/' },
  ],
  socials: [
    {
      platform: 'github',
      label: 'GitHub',
      url: 'https://github.com/abinzhao',
      showInHeader: true,
      showInFooter: true,
    },
    {
      platform: 'gitee',
      label: 'Gitee',
      url: '',
      showInHeader: false,
      showInFooter: true,
    },
    {
      platform: 'csdn',
      label: 'CSDN',
      url: '',
      showInHeader: false,
      showInFooter: true,
    },
    {
      platform: 'juejin',
      label: '掘金',
      url: '',
      showInHeader: false,
      showInFooter: true,
    },
  ] satisfies SocialLinkConfig[],
  github: {
    username: 'abinzhao',
    featuredRepositories: [
      'harmony-next-blog',
      'cps',
      'scio-design',
      'scioPro',
      'code-cnalysis',
    ],
  },
  appearance: {
    defaultTheme: 'system' as const,
    particleQuality: 'high' as const,
    enableSpotlight: true,
    enablePageTransitions: true,
  },
} as const;

export type SiteConfig = typeof siteConfig;
