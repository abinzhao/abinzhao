import { resolve } from 'node:path';
import { beforeAll, expect, test } from 'vitest';
import { buildKnowledgeArtifacts } from '../docs/.vitepress/data/knowledge-build';
import { createKnowledgeSearchRuntime } from '../docs/.vitepress/theme/composables/knowledge-search';
import { answerQuestion, classifyIntent, extractEntities, resolveConversationContext, type ChatContext } from '../docs/.vitepress/theme/composables/local-assistant';
import { assistantEvaluationCases, multiTurnEvaluationCases } from './fixtures/knowledge-eval';

let runtime: ReturnType<typeof createKnowledgeSearchRuntime>;
beforeAll(async () => {
  const artifacts = await buildKnowledgeArtifacts(resolve(import.meta.dirname, '../docs'));
  runtime = createKnowledgeSearchRuntime({
    loadIndex: async () => artifacts.index, loadCorpus: async () => artifacts.corpus,
  });
}, 30_000);

test('evaluates 66 fixed questions including the new blogs and Harness chapters', async () => {
  expect(assistantEvaluationCases).toHaveLength(66);
  expect(new Set(assistantEvaluationCases.map((item) => item.query)).size).toBe(66);
  let hits = 0;
  const answerable = assistantEvaluationCases.filter((item) => item.expectedDocumentId);
  for (const item of assistantEvaluationCases) {
    if (item.expectedDocumentId) {
      const result = await runtime.search(item.query, { limit: 6 });
      if (result.results.some((block) => block.documentId === item.expectedDocumentId)) hits++;
    } else {
      const reply = await answerQuestion({ question: item.query, search: runtime.search });
      expect(reply.sources, item.query).toHaveLength(0);
    }
  }
  expect(hits / answerable.length).toBeGreaterThanOrEqual(0.9);
});

test('keeps the subject and scope of 20 multi-turn tasks explicit', () => {
  expect(multiTurnEvaluationCases).toHaveLength(20);
  let correct = 0;
  for (const item of multiTurnEvaluationCases) {
    let context: ChatContext | undefined;
    item.questions.forEach((question, index) => {
      if (index > 0 && item.transition === 'session') context = undefined;
      context = resolveConversationContext({
        question, intent: classifyIntent(question),
        entities: extractEntities(question, context?.entities),
        scope: item.transition === 'scope' && index === 0 ? 'columns' : item.scope,
        previous: context,
      });
    });
    if (JSON.stringify(context?.entities) === JSON.stringify(item.expectedEntities) && context?.scope === item.scope) correct++;
  }
  expect(correct / multiTurnEvaluationCases.length).toBeGreaterThanOrEqual(0.9);
});
