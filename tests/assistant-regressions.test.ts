import { resolve } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import { buildKnowledgeArtifacts } from '../docs/.vitepress/data/knowledge-build';
import { createKnowledgeSearchRuntime } from '../docs/.vitepress/theme/composables/knowledge-search';
import { answerQuestion, classifyIntent, resolveConversationContext } from '../docs/.vitepress/theme/composables/local-assistant';
import { restoreConversationEnvelope } from '../docs/.vitepress/theme/composables/chat';

let artifacts: Awaited<ReturnType<typeof buildKnowledgeArtifacts>>;
const loaders = {
  loadIndex: async () => artifacts.index,
  loadCorpus: async () => artifacts.corpus,
};

describe('real assistant regressions', () => {
  beforeAll(async () => {
    artifacts = await buildKnowledgeArtifacts(resolve(import.meta.dirname, '../docs'));
  }, 30_000);

  test('retries a failed index initialization on the next prepare', async () => {
    let attempts = 0;
    const runtime = createKnowledgeSearchRuntime({
      ...loaders,
      loadIndex: async () => {
        if (++attempts === 1) throw new Error('temporary resource failure');
        return artifacts.index;
      },
    });
    await expect(runtime.prepare()).rejects.toThrow('temporary resource failure');
    await expect(runtime.prepare()).resolves.toBeUndefined();
    expect(attempts).toBe(2);
  });

  test('retries a failed corpus download without reloading a valid index', async () => {
    let attempts = 0;
    const runtime = createKnowledgeSearchRuntime({
      ...loaders,
      loadCorpus: async () => {
        if (++attempts === 1) throw new Error('temporary corpus failure');
        return artifacts.corpus;
      },
    });
    await expect(runtime.search('React')).rejects.toThrow();
    expect((await runtime.search('React')).results.length).toBeGreaterThan(0);
    expect(attempts).toBe(2);
  });

  test('also retries when an index response cannot be decoded', async () => {
    let attempts = 0;
    const runtime = createKnowledgeSearchRuntime({
      ...loaders,
      loadIndex: async () => {
        attempts++;
        return attempts === 1 ? { ...artifacts.index, index: {} } as typeof artifacts.index : artifacts.index;
      },
    });
    await expect(runtime.prepare()).rejects.toThrow();
    await expect(runtime.prepare()).resolves.toBeUndefined();
    expect(attempts).toBe(2);
  });

  test('does not claim article evidence for greetings and unrelated questions', async () => {
    const runtime = createKnowledgeSearchRuntime(loaders);
    for (const question of ['你好', '嗨', '谢谢', '明天北京天气', '怎么烤酸面包', '附近哪家餐厅好吃']) {
      const reply = await answerQuestion({ question, search: runtime.search });
      expect(reply.sources, question).toHaveLength(0);
      expect(reply.confidence.level, question).not.toBe('high');
    }
  });

  test('returns readable code evidence rather than empty answer items', async () => {
    const runtime = createKnowledgeSearchRuntime(loaders);
    const reply = await answerQuestion({
      question: '解释React代码示例',
      search: runtime.search,
    });
    const items = reply.blocks.flatMap((block) => block.items);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.text.trim().length > 0)).toBe(true);
    expect(items.some((item) => item.kind === 'code' && item.language && item.text.trim()), 'explicit code questions should show retrieved code').toBe(true);
    const reactCode = artifacts.blocks.find((block) => block.kind === 'code' && block.documentId.includes('react'));
    expect(reactCode?.text.length).toBeGreaterThan(0);
    expect(reactCode).toHaveProperty('language');
  });

  test.each([
    ['rollback 代码', 'rollback', undefined, 6],
    ['useOptimisti 代码', 'useoptimistic', undefined, 6],
    ['useOptimisti 代码', 'useoptimistic', '/blog/react-actions-consistency.html', 2],
    ['versionchange 代码', 'versionchange', undefined, 6],
    ['rollbaxx 代码', 'rollback', undefined, 6],
    ['state 代码', 'state', undefined, 6],
  ])('prioritizes actual code containing the identifier for %s', async (query, identifier, documentId, limit) => {
    const runtime = createKnowledgeSearchRuntime(loaders);
    const { results } = await runtime.search(query, { documentId, limit });
    expect(results[0]?.kind).toBe('code');
    expect(results[0]?.text.toLocaleLowerCase()).toContain(identifier);
  });

  test('summarizes the selected article across its main sections', async () => {
    const runtime = createKnowledgeSearchRuntime(loaders);
    const reply = await answerQuestion({
      articleId: '/blog/arkts-page-architecture.html',
      question: '总结这篇文章',
      scope: 'article',
      search: runtime.search,
    });
    expect(reply.blocks.flatMap((block) => block.items).length).toBeGreaterThanOrEqual(3);
    expect(new Set(reply.sources.map((source) => source.sectionTitle)).size).toBeGreaterThanOrEqual(3);
    expect(reply.sources.every((source) => source.href.startsWith('/blog/arkts-page-architecture.html'))).toBe(true);
  });

  test('does not classify conjunctions in an introduction as comparison', () => {
    expect(classifyIntent('介绍 Vue 和 JavaScript 的工程实践')).toBe('explain');
    expect(classifyIntent('找 React 和 TypeScript 相关文章')).toBe('lookup');
  });

  test('a scope change discards the previous continuation sources', () => {
    const resolved = resolveConversationContext({
      question: '继续',
      entities: [],
      intent: 'lookup',
      scope: 'blog',
      previous: { entities: ['React'], intent: 'explain', scope: 'columns', sourceIds: ['old-source'] },
    });
    expect(resolved.scope).toBe('blog');
    expect(resolved.sourceIds).toEqual([]);
  });

  test('preserves a new structured reply after continuing a migrated model conversation', async () => {
    const href = '/columns/fullstack-development/03-box-model-layout.html';
    const allowed = new Set([href]);
    const envelope = restoreConversationEnvelope(null, JSON.stringify([{
      id: 'old', title: '旧会话', mode: 'model', messages: [
        { id: 'old-answer', role: 'assistant', content: '原回答', status: 'complete' },
      ],
    }]), allowed);
    const runtime = createKnowledgeSearchRuntime(loaders);
    const reply = await answerQuestion({ question: '解释 Flexbox', search: runtime.search });
    envelope.conversations[0].messages.push({
      id: 'new-answer', role: 'assistant', content: '新回答', status: 'complete', reply,
    });
    const restored = restoreConversationEnvelope(JSON.stringify(envelope), null, allowed);
    expect(restored.conversations[0].messages[0].legacyRecord).toBe(true);
    expect(restored.conversations[0].messages[1].legacyRecord).toBeUndefined();
    expect(restored.conversations[0].messages[1].reply?.blocks.length).toBeGreaterThan(0);
  });
});
