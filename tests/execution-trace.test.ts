import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { runCancellation } from '../examples/site-labs/execution';
import { traceLines } from '../docs/.vitepress/data/trace-source';

test('actual execution yields stable state snapshots and mapped source statements', async () => {
  const input = { count: 3, factor: 2, cancelAfter: 0 };
  const collect = async () => {
    const events = [];
    for await (const event of runCancellation(input, new AbortController().signal)) events.push(event);
    return events;
  };
  const events = await collect();
  expect(events).toEqual(await collect());
  expect(events.filter((event) => event.kind === 'value').map((event) => event.total)).toEqual([2, 6, 12]);
  expect(events.at(-1)).toMatchObject({ kind: 'done', total: 12, index: 3 });
  const source = readFileSync('examples/site-labs/execution.ts', 'utf8');
  const lines = traceLines(source);
  expect(events.every((event) => source.split('\n')[lines[event.kind] - 1].includes(`@trace ${event.kind}`))).toBe(true);
});

test('cancellation stops downstream work and closing the generator runs cleanup', async () => {
  const events = [];
  for await (const event of runCancellation({ count: 5, factor: 3, cancelAfter: 2 }, new AbortController().signal)) events.push(event);
  expect(events.filter((event) => event.kind === 'value')).toHaveLength(2);
  expect(events.at(-1)).toMatchObject({ kind: 'cancelled', index: 2, total: 9 });
  const controller = new AbortController();
  const iterator = runCancellation({ count: 8, factor: 1, cancelAfter: 0 }, controller.signal);
  await iterator.next();
  controller.abort();
  expect((await iterator.next()).value).toMatchObject({ kind: 'cancelled', total: 0 });
  await iterator.return();
  expect((await iterator.next()).done).toBe(true);
});

test('rejects excessive inputs instead of silently producing unbounded traces', async () => {
  const iterator = runCancellation({ count: 501, factor: 2, cancelAfter: 0 }, new AbortController().signal);
  await expect(iterator.next()).rejects.toThrow(/1.*100/);
});
