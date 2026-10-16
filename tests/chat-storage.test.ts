import { beforeAll, describe, expect, test } from 'vitest';

type ChatModule = typeof import('../docs/.vitepress/theme/composables/chat');

let chat: ChatModule | undefined;

const allowedSources = new Set([
  '/blog/local-first-agent.html',
  '/columns/fullstack-development/03-box-model-layout.html#flexbox',
]);

function legacyConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'legacy-session',
    title: '旧模型问题',
    mode: 'model',
    updatedAt: 100,
    apiKey: 'must-not-survive',
    messages: [
      {
        id: 'user-1',
        role: 'user',
        content: 'CSS 布局怎么学',
        status: 'complete',
        createdAt: 10,
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '旧模型回答，仅保留展示。',
        status: 'streaming',
        createdAt: 11,
        sources: [
          { title: '本地优先', href: '/blog/local-first-agent.html' },
          { title: '外部资料', href: 'https://example.com/private' },
        ],
      },
    ],
    ...overrides,
  };
}

describe('chat storage v2', () => {
  beforeAll(async () => {
    chat = await import('../docs/.vitepress/theme/composables/chat');
  });

  test('migrates v1 without losing visible history and marks old model records', () => {
    expect(chat?.restoreConversationEnvelope).toBeTypeOf('function');
    if (!chat) return;

    const envelope = chat.restoreConversationEnvelope(
      null,
      JSON.stringify([legacyConversation()]),
      allowedSources,
      1234,
    );
    const session = envelope.conversations[0];

    expect(envelope).toEqual(expect.objectContaining({
      activeConversationId: 'legacy-session',
      migration: { completedAt: 1234, v1Completed: true },
      version: 2,
    }));
    expect(session.legacyRecord).toBe(true);
    expect(session.messages.map((message) => message.content)).toEqual([
      'CSS 布局怎么学',
      '旧模型回答，仅保留展示。',
    ]);
    expect(session.messages[1].status).toBe('stopped');
    expect(session.messages[1].legacyRecord).toBe(true);
    expect(session.messages[1].sources).toEqual([
      { title: '本地优先', href: '/blog/local-first-agent.html' },
    ]);
    expect(session).not.toHaveProperty('apiKey');
  });

  test('uses a valid completed v2 envelope as the only source', () => {
    expect(chat?.restoreConversationEnvelope).toBeTypeOf('function');
    if (!chat) return;

    const migrated = chat.restoreConversationEnvelope(
      null,
      JSON.stringify([legacyConversation()]),
      allowedSources,
      1234,
    );
    const restored = chat.restoreConversationEnvelope(
      JSON.stringify(migrated),
      JSON.stringify([legacyConversation({ title: '不应再次迁移' })]),
      allowedSources,
      9999,
    );

    expect(restored).toEqual(migrated);
  });

  test('skips malformed records and enforces conversation, message and source limits', () => {
    expect(chat?.restoreConversationEnvelope).toBeTypeOf('function');
    if (!chat) return;

    const messages = Array.from({ length: 105 }, (_, index) => ({
      id: `message-${index}`,
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `消息 ${index}`,
      status: 'complete',
      sources: [
        { title: '允许', href: '/blog/local-first-agent.html' },
        { title: '非法', href: '//example.com/path' },
        ...Array.from({ length: 9 }, (_, sourceIndex) => ({
          title: `来源 ${sourceIndex}`,
          href: '/columns/fullstack-development/03-box-model-layout.html#flexbox',
        })),
      ],
    }));
    const legacy = [
      { id: 'bad', title: 1, mode: 'knowledge', messages: [] },
      ...Array.from({ length: 35 }, (_, index) =>
        legacyConversation({
          id: `session-${index}`,
          mode: 'knowledge',
          messages,
          title: `会话 ${index}`,
          updatedAt: index,
        }),
      ),
    ];
    const envelope = chat.restoreConversationEnvelope(
      '{broken',
      JSON.stringify(legacy),
      allowedSources,
      1,
    );

    expect(envelope.conversations).toHaveLength(30);
    expect(envelope.conversations[0].messages).toHaveLength(100);
    expect(envelope.conversations[0].messages[1].sources?.length).toBeLessThanOrEqual(8);
    expect(envelope.conversations[0].messages[1].sources?.every((source) =>
      allowedSources.has(source.href),
    )).toBe(true);
  });

  test('writes only v2 and reports storage failure without deleting the v1 backup', () => {
    expect(chat?.loadConversationStorage).toBeTypeOf('function');
    if (!chat) return;

    const values = new Map<string, string>([
      [chat.LEGACY_CHAT_STORAGE_KEY, JSON.stringify([legacyConversation()])],
      ['unrelated', 'keep-me'],
    ]);
    const storage = {
      getItem(key: string) {
        return values.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        if (key === chat!.CHAT_STORAGE_KEY) throw new Error('quota');
        values.set(key, value);
      },
    };
    const result = chat.loadConversationStorage(storage, allowedSources, 55);

    expect(result.envelope.conversations).toHaveLength(1);
    expect(result.storageWarning).toContain('无法保存会话');
    expect(values.get(chat.LEGACY_CHAT_STORAGE_KEY)).toBeDefined();
    expect(values.get('unrelated')).toBe('keep-me');
    expect(values.has(chat.CHAT_STORAGE_KEY)).toBe(false);
  });
});
