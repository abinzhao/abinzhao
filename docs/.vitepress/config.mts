import { defineConfig } from 'vitepress';
import { loadSiteConfig } from './data/site';

const site = loadSiteConfig();
const configuredBase = process.env.VITEPRESS_BASE ?? '/abinzhao/';
const base = configuredBase.endsWith('/') ? configuredBase : `${configuredBase}/`;
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
  head: [['script', { id: 'theme-bootstrap' }, themeBootstrapScript]],
  lang: 'zh-CN',
  title: site.title,
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '博客', link: '/blog/' },
      { text: '专题', link: '/columns/' },
      { text: '项目', link: '/projects' },
      { text: '关于', link: '/about' },
    ],
    socialLinks: site.githubUrl ? [{ icon: 'github', link: site.githubUrl }] : [],
  },
});
