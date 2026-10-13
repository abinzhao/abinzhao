import { describe, expect, it } from 'vitest';
import * as tutorials from '../docs/.vitepress/data/tutorials';
import { searchContentItems } from '../docs/.vitepress/data/search-content';
import { searchContent } from '../docs/.vitepress/theme/utils/search';

describe('tutorial discovery', () => {
  it('offers chapter level navigation for each learning stage', () => {
    const groups = (tutorials as Record<string, unknown>).tutorialGroups as
      | Array<{ stage: string; chapters: Array<{ href: string }> }>
      | undefined;
    expect(groups?.length ?? 0).toBeGreaterThanOrEqual(12);
    for (const stage of tutorials.tutorialStages) {
      expect(groups?.some((group) => group.stage === stage.id)).toBe(true);
    }
    const paths = groups?.flatMap((group) => group.chapters.map((item) => item.href)) ?? [];
    expect(paths.length).toBeGreaterThanOrEqual(45);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('finds a specific mechanism and lands on its chapter rather than the stage overview', () => {
    const results = searchContent(searchContentItems, '闭包');
    expect(results.some((item) =>
      item.href === '/tutorials/frontend-basics/javascript/closures-prototypes',
    )).toBe(true);
  });
});
