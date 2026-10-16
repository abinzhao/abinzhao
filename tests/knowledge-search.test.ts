import { resolve } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import { buildKnowledgeArtifacts } from '../docs/.vitepress/data/knowledge-build';
import { knowledgeEvaluationCases } from './fixtures/knowledge-eval';

type KnowledgeSearchModule = typeof import(
  '../docs/.vitepress/theme/composables/knowledge-search'
);

let artifacts: Awaited<ReturnType<typeof buildKnowledgeArtifacts>>;
let knowledgeSearch: KnowledgeSearchModule | undefined;

describe('knowledge search', () => {
  beforeAll(async () => {
    knowledgeSearch = await import(
      '../docs/.vitepress/theme/composables/knowledge-search'
    ).catch(() => undefined);
    artifacts = await buildKnowledgeArtifacts(resolve(import.meta.dirname, '../docs'));
  }, 30_000);

  test('loads the index and corpus only after a meaningful query', async () => {
    expect(knowledgeSearch?.createKnowledgeSearchRuntime).toBeTypeOf('function');
    if (!knowledgeSearch) return;

    let indexLoads = 0;
    let corpusLoads = 0;
    const runtime = knowledgeSearch.createKnowledgeSearchRuntime({
      loadCorpus: async () => {
        corpusLoads += 1;
        return artifacts.corpus;
      },
      loadIndex: async () => {
        indexLoads += 1;
        return artifacts.index;
      },
    });

    expect(runtime.loadState).toBe('idle');
    expect(await runtime.search('  ')).toEqual(
      expect.objectContaining({ results: [] }),
    );
    expect(indexLoads).toBe(0);
    expect(corpusLoads).toBe(0);

    expect(runtime.prepare).toBeTypeOf('function');
    await runtime.prepare();
    expect(indexLoads).toBe(1);
    expect(corpusLoads).toBe(0);
    expect(runtime.loadState).toBe('ready');

    const response = await runtime.search('CSS Grid 二维布局');
    expect(response.results[0].text.length).toBeGreaterThan(0);
    expect(indexLoads).toBe(1);
    expect(corpusLoads).toBe(1);
    expect(runtime.loadState).toBe('ready');

    await runtime.search('Chrome DevTools');
    expect(indexLoads).toBe(1);
    expect(corpusLoads).toBe(1);
  });

  test('meets the fixed Top-3 recall and reciprocal-rank targets', async () => {
    expect(knowledgeSearch?.createKnowledgeSearchRuntime).toBeTypeOf('function');
    if (!knowledgeSearch) return;

    const runtime = knowledgeSearch.createKnowledgeSearchRuntime({
      loadCorpus: async () => artifacts.corpus,
      loadIndex: async () => artifacts.index,
    });
    let topThreeHits = 0;
    let reciprocalRank = 0;

    for (const evaluation of knowledgeEvaluationCases) {
      const { results } = await runtime.search(evaluation.query, { limit: 6 });
      const rankedDocuments = [...new Set(results.map((result) => result.documentId))];
      const rank = rankedDocuments.indexOf(evaluation.expectedDocumentId);
      if (rank >= 0 && rank < 3) topThreeHits += 1;
      if (rank >= 0) reciprocalRank += 1 / (rank + 1);
    }

    expect(topThreeHits / knowledgeEvaluationCases.length).toBeGreaterThanOrEqual(0.85);
    expect(reciprocalRank / knowledgeEvaluationCases.length).toBeGreaterThanOrEqual(0.75);
  });

  test('supports controlled synonyms, fuzzy terms, article scope and diverse sources', async () => {
    expect(knowledgeSearch?.createKnowledgeSearchRuntime).toBeTypeOf('function');
    if (!knowledgeSearch) return;

    const runtime = knowledgeSearch.createKnowledgeSearchRuntime({
      loadCorpus: async () => artifacts.corpus,
      loadIndex: async () => artifacts.index,
    });

    const synonymResults = await runtime.search('弹性布局和网格布局怎么选', { limit: 6 });
    expect(synonymResults.results.some((result) =>
      result.documentId.endsWith('/03-box-model-layout.html'),
    )).toBe(true);

    const fuzzyResults = await runtime.search('Typescript 泛刑组合');
    expect(fuzzyResults.results.some((result) =>
      result.documentId.includes('28-typescript-composition-generics'),
    )).toBe(true);

    const scoped = await runtime.search('状态', {
      documentId: '/blog/arkts-page-architecture.html',
      limit: 6,
    });
    expect(scoped.results.length).toBeGreaterThan(0);
    expect(scoped.results.every((result) =>
      result.documentId === '/blog/arkts-page-architecture.html',
    )).toBe(true);

    const broad = await runtime.search('状态 组件 工程', { limit: 6 });
    const counts = new Map<string, number>();
    for (const result of broad.results) {
      counts.set(result.documentId, (counts.get(result.documentId) ?? 0) + 1);
    }
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
  });

  test('keeps first and warm in-memory queries inside the performance budgets', async () => {
    expect(knowledgeSearch?.createKnowledgeSearchRuntime).toBeTypeOf('function');
    if (!knowledgeSearch) return;

    const runtime = knowledgeSearch.createKnowledgeSearchRuntime({
      loadCorpus: async () => artifacts.corpus,
      loadIndex: async () => artifacts.index,
    });
    await runtime.prepare();
    const firstStartedAt = performance.now();
    await runtime.search('浏览器渲染流程');
    const firstDuration = performance.now() - firstStartedAt;
    const warmDurations: number[] = [];

    for (let index = 0; index < 20; index += 1) {
      const startedAt = performance.now();
      await runtime.search(index % 2 === 0 ? 'CSS Grid' : 'React Hooks');
      warmDurations.push(performance.now() - startedAt);
    }

    warmDurations.sort((left, right) => left - right);
    const warmP95 = warmDurations[Math.floor(warmDurations.length * 0.95) - 1];

    expect(firstDuration).toBeLessThanOrEqual(150);
    expect(warmP95).toBeLessThanOrEqual(50);
  });
});
