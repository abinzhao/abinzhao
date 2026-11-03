import { expect, test } from 'vitest';
import { createParticles, stepParticles, createFixedStepper } from '../examples/site-labs/particle-model';

test('reproduces the same particle seed and a bounded code-shaped target for each density', () => {
  const data = createParticles(512);
  expect(data).toEqual(createParticles(512));
  expect(data.length).toBe(512 * 8);
  expect(createParticles(1024).length).toBe(1024 * 8);
  for (let i = 0; i < data.length; i += 8) {
    expect(Math.abs(data[i + 4])).toBeLessThan(1.2);
    expect(Math.abs(data[i + 5])).toBeLessThan(.7);
  }
});

test('return converges to the glyph while flow evolves the same set without changing targets', () => {
  const returning = createParticles(128);
  const flowing = returning.slice();
  const distance = (data: Float32Array) => {
    let sum = 0;
    for (let i = 0; i < data.length; i += 8) sum += Math.hypot(data[i] - data[i + 4], data[i + 1] - data[i + 5]);
    return sum;
  };
  const initial = distance(returning);
  const input = { mode: 2, speed: 1, x: 0, y: 0, active: false };
  for (let i = 0; i < 240; i++) {
    stepParticles(returning, 1 / 120, i / 120, input);
    stepParticles(flowing, 1 / 120, i / 120, { ...input, mode: 1 });
  }
  expect(distance(returning)).toBeLessThan(initial * .1);
  expect(distance(flowing)).toBeGreaterThan(distance(returning) * 2);
  expect([...returning].every(Number.isFinite)).toBe(true);
  for (let i = 0; i < returning.length; i += 8) expect(returning.slice(i + 4, i + 8)).toEqual(flowing.slice(i + 4, i + 8));
});

test('fixed step is refresh-rate independent and drops suspended wall time', () => {
  let a = 0; let b = 0;
  const first = createFixedStepper(() => a++);
  const second = createFixedStepper(() => b++);
  for (let i = 0; i < 60; i++) first.advance(1 / 60);
  for (let i = 0; i < 120; i++) second.advance(1 / 120);
  expect(a).toBe(120);
  expect(b).toBe(a);
  first.advance(30);
  expect(a).toBeLessThanOrEqual(126);
  first.reset();
  first.advance(1 / 240);
  expect(a).toBeLessThanOrEqual(126);
});
