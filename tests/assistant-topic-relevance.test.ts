import { resolve } from 'node:path';
import { beforeAll, expect, test } from 'vitest';
import { buildKnowledgeArtifacts } from '../docs/.vitepress/data/knowledge-build';
import { createKnowledgeSearchRuntime } from '../docs/.vitepress/theme/composables/knowledge-search';
import { answerQuestion } from '../docs/.vitepress/theme/composables/local-assistant';

let runtime: ReturnType<typeof createKnowledgeSearchRuntime>;
beforeAll(async () => {
  const artifacts = await buildKnowledgeArtifacts(resolve(import.meta.dirname, '../docs'));
  runtime = createKnowledgeSearchRuntime({
    loadIndex: async () => artifacts.index,
    loadCorpus: async () => artifacts.corpus,
  });
}, 30_000);

test.each([
  ['解释 MCP 的工具发现', 'site'],
  ['介绍 MCP 工具发现', 'columns'],
  ['MCP 的工具是如何发现的？', 'site'],
] as const)('answers the actual discovery question: %s (%s)', async (question, scope) => {
  const reply = await answerQuestion({ question, scope, search: runtime.search });
  const core = reply.blocks[0]?.items[0];
  expect(core?.text, JSON.stringify(reply.blocks)).toContain('tools/list');
  expect(core?.text).not.toContain('转存还应保留结果类型与调用身份');
  const answer = reply.blocks.flatMap((block) => block.items).map((item) => item.text).join('\n');
  expect(answer).toContain('nextCursor');
  expect(answer).toContain('notifications/tools/list_changed');
  expect(answer).not.toContain('真实 Spill 存储');
  expect(answer).not.toContain('canonical MCP JSON');
  expect(reply.sources.some((source) => core?.sourceIds.includes(source.id))).toBe(true);
  expect(reply.sources.every((source) => source.href.startsWith('/columns/agent-harness/'))).toBe(true);
});

test('keeps Spill questions focused on storing complete tool results', async () => {
  const reply = await answerQuestion({ question: '解释 Spill 完整结果转存', search: runtime.search });
  expect(reply.blocks[0]?.items[0]?.text).toMatch(/Spill|转存|完整内容保存/);
  expect(reply.sources[0]?.href).toContain('33-tool-discovery-spill');
});
