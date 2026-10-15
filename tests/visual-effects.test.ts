import { describe, expect, test } from 'vitest';
import {
  calculateReadingProgress,
  createParticleField,
  getAmbientParticleCount,
  selectActiveHeading,
} from '../docs/.vitepress/theme/composables/visual-effects';

describe('future lab visual effects', () => {
  test('keeps the ambient particle field restrained across viewports', () => {
    expect(getAmbientParticleCount(390, false)).toBe(18);
    expect(getAmbientParticleCount(768, false)).toBe(32);
    expect(getAmbientParticleCount(1440, false)).toBe(52);
    expect(getAmbientParticleCount(1440, true)).toBe(18);
  });

  test('creates particles inside the normalized canvas bounds', () => {
    const values = [0, 0.25, 0.5, 0.75, 1];
    let index = 0;
    const random = () => values[index++ % values.length];

    const particles = createParticleField(3, random);

    expect(particles).toHaveLength(3);
    for (const particle of particles) {
      expect(particle.x).toBeGreaterThanOrEqual(0);
      expect(particle.x).toBeLessThanOrEqual(1);
      expect(particle.y).toBeGreaterThanOrEqual(0);
      expect(particle.y).toBeLessThanOrEqual(1);
      expect(Math.abs(particle.velocityX)).toBeLessThanOrEqual(0.00008);
      expect(Math.abs(particle.velocityY)).toBeLessThanOrEqual(0.00008);
      expect(particle.radius).toBeGreaterThanOrEqual(0.7);
      expect(particle.radius).toBeLessThanOrEqual(1.8);
    }
  });

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
