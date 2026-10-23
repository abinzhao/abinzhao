import { defineConfig } from 'vitepress';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadSiteConfig } from './data/site';
import { publicationExclusions } from './data/content';
import { writeOfflineAssets } from './data/offline-build';

const site = loadSiteConfig();
const configuredBase = process.env.VITEPRESS_BASE ?? '/abinzhao/';
const base = configuredBase.endsWith('/') ? configuredBase : `${configuredBase}/`;
if (!base.startsWith('/') || base.startsWith('//') || /[?#\\]/.test(base)) throw new Error('VITEPRESS_BASE 必须是站点绝对路径');
const siteOrigin = 'https://abinzhao.github.io';
const contentRoot = fileURLToPath(new URL('../', import.meta.url));
const modelRuntimeAssets = new Set<string>();
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
  description: site.description,
  head: [
    // 在主题 CSS 和页面模块加载前消除默认边距，避免首绘产生布局偏移。
    ['style', { id: 'page-reset' }, 'body{margin:0}'],
    ['script', { id: 'theme-bootstrap' }, themeBootstrapScript],
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
      name: 'capture-webllm-runtime-assets',
      generateBundle(_options, bundle) {
        for (const output of Object.values(bundle)) {
          if (output.type === 'chunk' &&
            output.moduleIds.some((id) => id.includes('/@mlc-ai/web-llm/'))) {
            modelRuntimeAssets.add(output.fileName);
          }
        }
      },
    }],
  },
  sitemap: {
    hostname: `${siteOrigin}${base}`,
    transformItems: (items) => items.filter((item) => item.url !== '404.html'),
  },
  transformPageData(page) {
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
  },
  async buildEnd(config) {
    await writeFile(join(config.outDir, 'release.json'), JSON.stringify({
      base,
      sha: process.env.GITHUB_SHA ?? 'local',
      builtAt: new Date().toISOString(),
    }) + '\n');
    await writeFile(join(config.outDir, 'robots.txt'), `User-agent: *\nAllow: ${base}\nSitemap: ${siteOrigin}${base}sitemap.xml\n`);
    await writeOfflineAssets(config.outDir, base, modelRuntimeAssets);
  },
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
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
