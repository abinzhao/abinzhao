import { expect, test } from 'vitest';
import * as budget from '../docs/.vitepress/theme/labs/frame-budget';

test('degrades only after a complete two-second window below 50fps', () => {
  expect(budget.createFrameBudget).toBeTypeOf('function');
  const sampler = budget.createFrameBudget();
  expect(sampler.observe(0, 1.5)).toBeUndefined();
  for (let time = 25; time < 2000; time += 25) expect(sampler.observe(time, 1.5)).toBeUndefined();
  expect(sampler.observe(2000, 1.5)).toBe('lower');
  for (let time = 2020; time <= 4000; time += 20) expect(sampler.observe(time, 1)).toBeUndefined();
  for (let time = 4025; time < 6000; time += 25) expect(sampler.observe(time, .75)).toBeUndefined();
  expect(sampler.observe(6000, .75)).toBe('static');
});

test('ignores paused time and measures actual timestamps rather than clamped simulation deltas', () => {
  const sampler = budget.createFrameBudget();
  sampler.observe(0, 1);
  sampler.observe(1000, 1);
  sampler.reset();
  expect(sampler.observe(10000, 1)).toBeUndefined();
  expect(sampler.observe(12000, 1)).toBe('lower');
});
