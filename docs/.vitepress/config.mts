import { defineConfig } from 'vitepress';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadSiteConfig } from './data/site';
import { publicationExclusions, loadPublishedArticleSources } from './data/content';
import { articleStructuredData, createFeed } from './data/publication';
import { writeOfflineAssets } from './data/offline-build';
import { collectOptionalAssets } from './data/asset-groups';

const site = loadSiteConfig();
const configuredBase = process.env.VITEPRESS_BASE ?? '/abinzhao/';
const base = configuredBase.endsWith('/') ? configuredBase : `${configuredBase}/`;
if (!base.startsWith('/') || base.startsWith('//') || /[?#\\]/.test(base)) throw new Error('VITEPRESS_BASE 必须是站点绝对路径');
const siteOrigin = 'https://abinzhao.github.io';
const contentRoot = fileURLToPath(new URL('../', import.meta.url));
const modelRuntimeAssets = new Set<string>();
const experimentAssets = new Set<string>();
const knowledgeAssets = new Set<string>();
const themeBootstrapScript = `
  let storedTheme = null;

  try {
    storedTheme = window.localStorage.getItem('abin-lab-theme');
  } catch {
    // Persistent storage can be unavailable in private browsing.
  }

  const theme =
    storedTheme === 'light' || storedTheme === 'dark'
      ? storedTheme
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.classList.toggle('dark', theme === 'dark');
`;

export default defineConfig({
  appearance: false,
  base,
  // 长课程目录的可见链接很多；用户导航时再加载，避免冷首访预取全文。
  router: { prefetchLinks: false },
  scrollOffset: 88,
  description: site.description,
  head: [
    // 在主题 CSS 和页面模块加载前消除默认边距，避免首绘产生布局偏移。
    ['style', { id: 'page-reset' }, 'body{margin:0}'],
    ['script', { id: 'theme-bootstrap' }, themeBootstrapScript],
    ['link', { rel: 'alternate', type: 'application/rss+xml', title: `${site.title}订阅`, href: `${base}feed.xml` }],
  ],
  lang: 'zh-CN',
  title: site.title,
  srcExclude: publicationExclusions(contentRoot),
  vite: {
    build: {
      // Large files are lazy local-AI/corpus payloads with dedicated budgets in site-build.test.ts.
      chunkSizeWarningLimit: 6400,
    },
    plugins: [{
      name: 'capture-optional-assets',
      generateBundle(_options, bundle) {
        const groups = collectOptionalAssets(bundle);
        for (const file of groups.modelRuntime) modelRuntimeAssets.add(file);
        for (const file of groups.experiments) experimentAssets.add(file);
        for (const file of groups.knowledge) knowledgeAssets.add(file);
      },
    }],
  },
  sitemap: {
    hostname: `${siteOrigin}${base}`,
    transformItems: (items) => items.filter((item) => item.url !== '404.html'),
  },
  transformPageData(page) {
    // 动态路由参数不会插值 frontmatter；显式赋值让 SSG 标题、分享与正文同源。
    if (page.frontmatter.layout === 'lab' && typeof page.params?.title === 'string') {
      page.title = page.frontmatter.title = page.params.title;
      page.frontmatter.description = page.params.description;
    }
    const path = page.relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '.html');
    const url = `${siteOrigin}${base}${path}`;
    const description = page.frontmatter.description || site.description;
    page.description = description;
    page.frontmatter.head ??= [];
    page.frontmatter.head.push(
      ['link', { rel: 'canonical', href: url }],
      ['meta', { property: 'og:url', content: url }],
      ['meta', { property: 'og:title', content: page.title || site.title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:type', content: /^(blog|columns)\/.+\.html$/.test(path) ? 'article' : 'website' }],
    );
    if (path === '404.html') page.frontmatter.head.push(['meta', { name: 'robots', content: 'noindex' }]);
    if (/^(blog|columns)\/.+\.html$/.test(path)) {
      for (const data of articleStructuredData(page.frontmatter, page.title, description, url, `${siteOrigin}${base}`)) {
        page.frontmatter.head.push(['script', { type: 'application/ld+json' }, JSON.stringify(data).replace(/</g, '\\u003c')]);
      }
    }
  },
  async buildEnd(config) {
    await writeFile(join(config.outDir, 'release.json'), JSON.stringify({
      base,
      sha: process.env.GITHUB_SHA ?? 'local',
      builtAt: new Date().toISOString(),
    }) + '\n');
    await writeFile(join(config.outDir, 'robots.txt'), `User-agent: *\nAllow: ${base}\nSitemap: ${siteOrigin}${base}sitemap.xml\n`);
    const articles = (await loadPublishedArticleSources(contentRoot)).map(({ article }) => article);
    await writeFile(join(config.outDir, 'feed.xml'), createFeed(articles, site.title, site.description, `${siteOrigin}${base}`));
    await writeOfflineAssets(config.outDir, base, modelRuntimeAssets, { experiments: experimentAssets, knowledge: knowledgeAssets });
  },
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '实验室', link: '/labs/' },
      { text: '博客', link: '/blog/' },
      { text: '专题', link: '/columns/' },
      { text: '项目', link: '/projects/' },
      { text: '关于', link: '/about.html' },
      { text: '助手', link: '/chat/' },
    ],
    socialLinks: site.githubUrl ? [{ icon: 'github', link: site.githubUrl }] : [],
    outline: { label: '本页目录' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    lastUpdated: { text: '更新于' },
    returnToTopLabel: '返回顶部',
    sidebarMenuLabel: '目录',
    darkModeSwitchLabel: '切换主题',
    lightModeSwitchTitle: '切换浅色主题',
    darkModeSwitchTitle: '切换深色主题',
    skipToContentLabel: '跳到主要内容',
  },
  markdown: { codeCopyButtonTitle: '复制代码', languageAlias: { mjs: 'javascript' } },
});
