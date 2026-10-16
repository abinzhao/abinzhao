import { describe, expect, test } from 'vitest';
import { getCustomPageKind } from '../docs/.vitepress/theme/composables/page-kind';

describe('custom page routing', () => {
  test('selects the bespoke home and about layouts', () => {
    expect(getCustomPageKind('/')).toBe('home');
    expect(getCustomPageKind('/index')).toBe('home');
    expect(getCustomPageKind('/about')).toBe('about');
    expect(getCustomPageKind('/about/')).toBe('about');
  });

  test('keeps content routes on the default VitePress layout', () => {
    expect(getCustomPageKind('/blog/')).toBeUndefined();
    expect(getCustomPageKind('/columns/web-performance/')).toBeUndefined();
  });

  test('prefers the stable frontmatter layout marker over a runtime route', () => {
    expect(getCustomPageKind('/runtime-page', 'home')).toBe('home');
    expect(getCustomPageKind('/runtime-page', 'about')).toBe('about');
    expect(getCustomPageKind('/runtime-page', 'blog')).toBe('blog');
    expect(getCustomPageKind('/runtime-page', 'columns')).toBe('columns');
    expect(getCustomPageKind('/runtime-page', 'projects')).toBe('projects');
    expect(getCustomPageKind('/runtime-page', 'chat')).toBe('chat');
  });

  test('recognizes published articles and column home pages from frontmatter', () => {
    expect(getCustomPageKind('/blog/post', undefined, { date: '2026-10-15' })).toBe(
      'article',
    );
    expect(getCustomPageKind('/columns/harmonyos-engineering', undefined, {
      status: 'ongoing',
    })).toBe('column');
  });
});
