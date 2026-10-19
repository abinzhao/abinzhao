import { describe, expect, test } from 'vitest';
import {
  calculateReadingProgress,
  selectActiveHeading,
} from '../docs/.vitepress/theme/composables/visual-effects';

describe('future lab visual effects', () => {
  test('clamps article reading progress to the document range', () => {
    expect(calculateReadingProgress(100, 200, 2200, 800)).toBe(0);
    expect(calculateReadingProgress(900, 200, 2200, 800)).toBe(0.5);
    expect(calculateReadingProgress(1800, 200, 2200, 800)).toBe(1);
    expect(calculateReadingProgress(2400, 200, 2200, 800)).toBe(1);
  });

  test('selects the latest article heading that crossed the reading offset', () => {
    const headings = [
      { id: 'intro', top: -240 },
      { id: 'layout', top: 96 },
      { id: 'paint', top: 420 },
    ];

    expect(selectActiveHeading(headings, 140)).toBe('layout');
    expect(selectActiveHeading([{ id: 'intro', top: 420 }], 140)).toBe('');
    expect(selectActiveHeading([], 140)).toBe('');
  });
});
