import { describe, expect, test } from 'vitest';
import * as motion from '../docs/.vitepress/theme/composables/motion-policy';

describe('motion and heavy work lifecycle', () => {
  test('respects reduced motion even when full effects are requested', () => {
    expect(motion.resolveMotionPolicy('full', true, false)).toEqual({ motion: false, quality: 'static' });
    expect(motion.resolveMotionPolicy('minimal', false, false)).toEqual({ motion: false, quality: 'static' });
    expect(motion.resolveMotionPolicy('auto', false, true)).toEqual({ motion: true, quality: 'low' });
    expect(motion.resolveMotionPolicy('full', false, false)).toEqual({ motion: true, quality: 'high' });
  });

  test('allows one frame chain, clamps background gaps and cannot revive after dispose', () => {
    const queue = new Map<number, FrameRequestCallback>();
    let id = 0;
    const frames: number[] = [];
    const loop = motion.createFrameLoop((delta) => { frames.push(delta); }, {
      request: (cb) => { queue.set(++id, cb); return id; },
      cancel: (key) => { queue.delete(key); },
    });
    const tick = (time: number) => {
      const [key, callback] = queue.entries().next().value!;
      queue.delete(key);
      callback(time);
    };
    loop.resume();
    loop.resume();
    expect(queue.size).toBe(1);
    tick(0);
    tick(2000);
    expect(frames).toEqual([0, 0.05]);
    loop.pause();
    expect(queue.size).toBe(0);
    loop.resume();
    tick(3000);
    expect(frames.at(-1)).toBe(0);
    loop.dispose();
    loop.resume();
    expect(queue.size).toBe(0);
  });

  test('releases old renderers before granting a new lease and blocks AI competition', () => {
    const events: string[] = [];
    const gate = motion.createWorkloadGate();
    const old = gate.acquire(() => events.push('pause old'));
    expect(old).toBeTypeOf('function');
    const current = gate.acquire(() => events.push('pause current'));
    expect(events).toEqual(['pause old']);
    old?.();
    gate.block(true);
    expect(events).toEqual(['pause old', 'pause current']);
    expect(gate.acquire(() => events.push('blocked'))).toBeNull();
    gate.block(false);
    expect(events).toHaveLength(2);
    current?.();
    expect(gate.acquire(() => {})).toBeTypeOf('function');
  });
});
