import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { expect, test } from 'vitest';
import { validateTimeline } from '../docs/.vitepress/data/timeline';

test('accepts sourced records and rejects invented dates, duplicate anchors and absent provenance', () => {
  const entries = parse(readFileSync('docs/content/config/about.yml', 'utf8')).timeline;
  expect(entries.length).toBeGreaterThanOrEqual(3);
  expect(() => validateTimeline(entries)).not.toThrow();
  expect(() => validateTimeline([{ ...entries[0], date: '2026-02-30' }])).toThrow(/日期/);
  expect(() => validateTimeline([entries[0], entries[0]])).toThrow(/重复/);
  expect(() => validateTimeline([{ ...entries[0], source: '' }])).toThrow(/来源/);
});
