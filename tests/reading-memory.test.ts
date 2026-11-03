import { expect, test } from 'vitest';
import { createReadingMemory, decodeReadingMemory, resolveResume } from '../docs/.vitepress/theme/composables/reading-memory';

test('keeps explicit completion independent from the last visited heading', () => {
  let saved = '';
  const memory = createReadingMemory({ getItem: () => saved, setItem: (_key, value) => { saved = value; } });
  memory.visit('first', 'section-2', 10);
  expect(memory.snapshot().first).toEqual({ headingId: 'section-2', updatedAt: 10, completed: false });
  memory.complete('first', true, 11);
  memory.visit('first', 'section-3', 12);
  expect(memory.snapshot().first.completed).toBe(true);
  expect(decodeReadingMemory(saved).first.headingId).toBe('section-3');
  memory.complete('first', false, 13);
  expect(memory.snapshot().first.completed).toBe(false);
});

test('rejects malformed persisted data and limits history without throwing on storage denial', () => {
  expect(decodeReadingMemory('{')).toEqual({});
  expect(decodeReadingMemory('{"version":9,"records":{"a":{"completed":true}}}')).toEqual({});
  const memory = createReadingMemory({ getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } });
  for (let i = 0; i < 501; i++) memory.visit(`article-${i}`, '', i);
  expect(Object.keys(memory.snapshot())).toHaveLength(500);
  expect(memory.snapshot()['article-0']).toBeUndefined();
  expect(memory.persistent()).toBe(false);
  memory.clear();
  expect(memory.snapshot()).toEqual({});
});

test('resumes only known headings and reports a deleted anchor', () => {
  expect(resolveResume('/blog/a.html', { headingId: '读到这里', updatedAt: 1, completed: false }, ['读到这里']))
    .toEqual({ href: '/blog/a.html#%E8%AF%BB%E5%88%B0%E8%BF%99%E9%87%8C', missing: false });
  expect(resolveResume('/blog/a.html', { headingId: 'removed', updatedAt: 1, completed: false }, ['current']))
    .toEqual({ href: '/blog/a.html', missing: true });
});

test('migrates URL-based records to stable identities without losing newer progress', () => {
  let saved = JSON.stringify({ version: 1, records: {
    '/blog/a.html': { headingId: 'old-heading', completed: true, updatedAt: 20 },
    stable: { headingId: 'new-heading', completed: false, updatedAt: 30 },
    '/blog/b.html': { headingId: 'resume-here', completed: true, updatedAt: 40 },
  } });
  const memory = createReadingMemory({ getItem: () => saved, setItem: (_key, value) => { saved = value; } });
  memory.migrate([{ id: 'stable', href: '/blog/a.html' }, { id: 'stable-b', href: '/blog/b.html' }]);
  expect(memory.snapshot().stable).toEqual({ headingId: 'new-heading', completed: false, updatedAt: 30 });
  expect(memory.snapshot()['stable-b']).toEqual({ headingId: 'resume-here', completed: true, updatedAt: 40 });
  expect(memory.snapshot()['/blog/a.html']).toBeUndefined();
  expect(decodeReadingMemory(saved)['stable-b'].completed).toBe(true);
});
