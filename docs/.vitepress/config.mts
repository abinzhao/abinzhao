import { defineConfig } from 'vitepress';
import { siteConfig } from '../../site.config';
import { tutorialGroups, tutorialStages } from './data/tutorials';

export default defineConfig({
  base: process.env.VITEPRESS_BASE ?? '/',
  lang: siteConfig.site.locale,
  title: siteConfig.site.title,
  description: siteConfig.site.description,
  cleanUrls: true,
  lastUpdated: true,
  appearance: true,
  markdown: {
    theme: { light: 'github-light', dark: 'github-dark' },
    lineNumbers: true,
  },
  vite: {
    build: {
      // Three.js is a lazy, standalone experiment chunk and never blocks docs.
      chunkSizeWarningLimit: 800,
    },
  },
  head: [
    ['meta', { name: 'theme-color', content: '#07090d' }],
    ['meta', { name: 'author', content: siteConfig.owner.name }],
    [
      'meta',
      {
        name: 'keywords',
        content:
          '全栈教程,Git,HTML,CSS,JavaScript,React,Node.js,WebGL,AI,独立开发者',
      },
    ],
  ],
  themeConfig: {
    siteTitle: siteConfig.site.title,
    nav: [
      ...siteConfig.navigation.map((item) => ({
        text: item.label,
        link: item.href,
      })),
      {
        text: 'GitHub',
        link: 'https://github.com/abinzhao',
      },
    ],
    search: {
      provider: 'local',
      options: {
        translations: {
          button: {
            buttonText: '搜索',
            buttonAriaLabel: '搜索站点内容',
          },
          modal: {
            displayDetails: '显示详细列表',
            resetButtonTitle: '清除查询条件',
            backButtonTitle: '关闭搜索',
            noResultsText: '没有找到相关内容',
            footer: {
              selectText: '选择',
              navigateText: '切换',
              closeText: '关闭',
            },
          },
        },
      },
    },
    sidebar: {
      '/tutorials/': [
        {
          text: '全栈学习路线',
          items: [
            { text: '总览', link: '/tutorials/' },
            ...tutorialStages.map((stage) => ({
              text: `${stage.number} ${stage.title}`,
              link: stage.href,
            })),
          ],
        },
        ...tutorialGroups.map((group) => ({
          text: group.title,
          collapsed: false,
          items: group.chapters.map((chapter) => ({
            text: chapter.title,
            link: chapter.href,
          })),
        })),
      ],
      '/projects/': [
        {
          text: '项目',
          items: [{ text: '项目总览', link: '/projects/' }],
        },
      ],
      '/lab/': [
        {
          text: '实验室',
          items: [
            { text: '实验总览', link: '/lab/' },
            { text: 'AI 粒子光场', link: '/lab/particle-ai-field' },
          ],
        },
      ],
      '/notes/': [
        {
          text: '开发笔记',
          items: [
            { text: '最近笔记', link: '/notes/' },
            {
              text: 'GitHub 项目接入个人站',
              link: '/notes/github-projects',
            },
          ],
        },
      ],
    },
    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/abinzhao',
        ariaLabel: '访问赵建斌的 GitHub',
      },
    ],
    outline: {
      level: [2, 3],
      label: '本页目录',
    },
    docFooter: {
      prev: '上一页',
      next: '下一页',
    },
    lastUpdated: {
      text: '最后更新',
      formatOptions: {
        dateStyle: 'medium',
        timeStyle: 'short',
      },
    },
    darkModeSwitchLabel: '切换深浅主题',
    sidebarMenuLabel: '菜单',
    returnToTopLabel: '返回顶部',
    externalLinkIcon: true,
    footer: {
      message: '持续构建，也持续公开过程。',
      copyright: siteConfig.site.copyright,
    },
  },
});
