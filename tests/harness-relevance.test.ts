import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { buildKnowledgeArtifacts } from '../docs/.vitepress/data/knowledge-build';
import { createKnowledgeSearchRuntime } from '../docs/.vitepress/theme/composables/knowledge-search';
import { answerQuestion } from '../docs/.vitepress/theme/composables/local-assistant';

test('expanded Harness content does not turn shared fragments into off-site evidence', async () => {
  const artifacts = await buildKnowledgeArtifacts(resolve(import.meta.dirname, '../docs'));
  const runtime = createKnowledgeSearchRuntime({
    loadIndex: async () => artifacts.index, loadCorpus: async () => artifacts.corpus,
  });
  const question = '超导量子比特纠错';
  const reply = await answerQuestion({ question, search: runtime.search });
  expect(reply.sources).toHaveLength(0);
  for (const [query, chapter] of [
    ['MCP OAuth 授权', '28-mcp-authorization'],
    ['Agent Harness 上下文装配', '31-context-assembly'],
    ['Skill 渐进加载', '19-skills-format'],
  ]) {
    const relevant = await answerQuestion({ question: query, search: runtime.search });
    expect(relevant.sources.some((source) => source.href.includes(chapter)), query).toBe(true);
    expect(relevant.blocks.flatMap((block) => block.items)[0]?.kind, query).not.toBe('code');
  }
}, 30_000);
