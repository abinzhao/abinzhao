import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const projectRoot = resolve(import.meta.dirname, '..');

function readSource(relativePath: string): string {
  const filePath = resolve(projectRoot, relativePath);
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
}

describe('compact site layout', () => {
  test('defines shared navigation, touch, page-top, and anchor density tokens', () => {
    const tokens = readSource('docs/.vitepress/theme/styles/tokens.css');
    const base = readSource('docs/.vitepress/theme/styles/base.css');

    expect(tokens).toContain('--site-nav-height: 56px;');
    expect(tokens).toContain('--site-touch-target: 44px;');
    expect(tokens).toContain('--site-page-top: 28px;');
    expect(tokens).toContain('--site-anchor-offset: 88px;');
    expect(base).toContain('scroll-padding-top: var(--site-anchor-offset);');
  });

  test('connects the mobile navigation button to a stable controlled region', () => {
    const header = readSource(
      'docs/.vitepress/theme/components/SiteHeader.vue',
    );

    expect(header).toContain('aria-controls="site-mobile-nav"');
    expect(header).toContain('id="site-mobile-nav"');
    expect(header).toContain('@keydown.esc="handleHeaderEscape"');
  });

  test('uses one compact page header across every listing page', () => {
    const component = readSource(
      'docs/.vitepress/theme/components/CompactPageHeader.vue',
    );
    const styles = readSource('docs/.vitepress/theme/styles/site.css');
    const listingPages = [
      'docs/.vitepress/theme/pages/BlogIndexPage.vue',
      'docs/.vitepress/theme/pages/ColumnsIndexPage.vue',
      'docs/.vitepress/theme/pages/ProjectsPage.vue',
    ].map(readSource);

    expect(component).toContain('class="compact-page-header"');
    expect(component).toContain('class="compact-page-header__main"');
    expect(component).toContain('<h1>{{ title }}</h1>');
    expect(styles).toContain(
      '.compact-page-header__main { display: flex; min-width: 0; min-height: var(--site-touch-target); align-items: center; gap: 16px; }',
    );
    for (const page of listingPages) {
      expect(page).toContain("import CompactPageHeader from '../components/CompactPageHeader.vue';");
      expect(page).toContain('<CompactPageHeader');
      expect(page).not.toContain('<header class="listing-header');
    }
  });

  test('removes the duplicate article label and uses the compact reading offset', () => {
    const article = readSource(
      'docs/.vitepress/theme/pages/ArticlePage.vue',
    );

    expect(article).not.toContain(
      "isSeriesArticle ? '课程章节 · 循序学习' : '独立笔记 · 阅读模式'",
    );
    expect(article).toContain('    88,');
  });

  test('records the compact spacing contract for listing, reading, profile, and error pages', () => {
    const styles = readSource('docs/.vitepress/theme/styles/site.css');

    expect(styles).toContain(
      '.site-header__frame { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; min-height: var(--site-nav-height);',
    );
    expect(styles).toContain(
      '.listing-page__main { padding-top: var(--site-page-top); }',
    );
    expect(styles).toContain(
      '.home-hero { position: relative; isolation: isolate; display: grid; grid-template-columns: minmax(0,1.15fr) minmax(340px,.8fr); align-items: center; gap: clamp(32px,5vw,88px); padding: 28px 0 24px; }',
    );
    expect(styles).toContain(
      '.about-profile { display: grid; grid-template-columns: minmax(0,1fr) 240px; gap: 24px 36px; margin-top: 28px; padding: 24px; }',
    );
    expect(styles).toContain(
      '.not-found { padding-block: 56px; text-align: center; }',
    );
  });

  test('keeps the static aurora on home and uses stable solid cards on content pages', () => {
    const layout = readSource('docs/.vitepress/theme/Layout.vue');
    const styles = readSource('docs/.vitepress/theme/styles/site.css');
    const visualEffects = readSource('docs/.vitepress/theme/styles/visual-effects.css');

    expect(layout).toContain('<AmbientField v-if="pageKind === \'home\'"');
    expect(visualEffects).toContain('.aurora-background { position: fixed;');
    expect(styles).toContain('.article-list { display: grid; grid-template-columns: repeat(3,minmax(0,1fr));');
    expect(styles).not.toContain('backdrop-filter');
    expect(styles).not.toContain('transform: translateY(-3px);');
  });
});
