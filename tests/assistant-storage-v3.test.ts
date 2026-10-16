import { expect, test } from 'vitest';
import { normalizeEnvelope, serializeEnvelope, createAssistantStorage } from '../docs/.vitepress/theme/assistant/storage';
import { LEGACY_CHAT_STORAGE_KEY } from '../docs/.vitepress/theme/composables/chat';

const allowed = new Set(['/blog/react.html']);
const raw = {
  version: 3, activeConversationId: 'a', draft: '未发送的问题',
  conversations: [{ id: 'a', title: 'React', scope: 'site', updatedAt: 1, messages: [
    { id: 'm', role: 'assistant', content: '部分回答[S1]', provenance: 'webllm', status: 'streaming',
      versions: { modelId: 'local', promptVersion: 'v1', corpusVersion: 'abc' },
      citations: [{ id: 'S1', blockId: 'block', contentVersion: 'abc', title: 'React', href: '/blog/react.html' },
        { id: 'S2', blockId: 'bad', title: '外链', href: 'https://evil.test' }],
    },
  ] }],
};
test('restores provenance and versions, interrupts streaming and strips unknown private fields', () => {
  const envelope = normalizeEnvelope({ ...raw, apiKey: 'invalid' }, allowed);
  expect(envelope.draft).toBe('未发送的问题');
  expect(envelope.conversations[0].messages[0]).toMatchObject({
    status: 'stopped', provenance: 'webllm', versions: { corpusVersion: 'abc' },
    citations: [{ id: 'S1' }],
  });
  expect(envelope.conversations[0].messages[0].citations).toHaveLength(1);
  expect(envelope).not.toHaveProperty('apiKey');
});
test('strictly rejects aggregate byte overflow instead of silently truncating history', () => {
  expect(() => serializeEnvelope({ ...normalizeEnvelope(raw, allowed), draft: '中'.repeat(4000) }, 1000)).toThrow('容量');
});
test('a failed IndexedDB open preserves legacy backups and exposes an exportable memory session', async () => {
  const legacy = JSON.stringify([{ id: 'a', title: '旧会话', mode: 'model', messages: [{ id: 'm', role: 'assistant', content: '旧回答' }], updatedAt: 1 }]);
  const values = new Map([[LEGACY_CHAT_STORAGE_KEY, legacy]]);
  const storage = createAssistantStorage(allowed, {
    indexedDB: () => { throw new DOMException('blocked', 'SecurityError'); },
    legacy: { getItem: (key) => values.get(key) ?? null },
  });
  const restored = await storage.load();
  expect(restored.warning).toContain('内存');
  expect(restored.envelope.conversations[0].messages[0].provenance).toBe('legacy');
  expect(values.get(LEGACY_CHAT_STORAGE_KEY)).toBe(legacy);
  expect((await storage.save(restored.envelope)).saved).toBe(false);
});
