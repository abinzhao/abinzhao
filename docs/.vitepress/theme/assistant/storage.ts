import {
  CHAT_STORAGE_KEY, LEGACY_CHAT_STORAGE_KEY, restoreConversationEnvelope, sanitizeConversation,
  type Conversation, type ConversationStorage,
} from '../composables/chat';

export const ASSISTANT_DB_NAME = 'abin-assistant';
export const ASSISTANT_STORAGE_BYTES = 2 * 1024 * 1024;
export interface ConversationEnvelopeV3 {
  version: 3;
  conversations: Conversation[];
  activeConversationId: string | null;
  draft: string;
  migrationCompletedAt: number;
}

export function normalizeEnvelope(value: unknown, allowed: ReadonlySet<string>): ConversationEnvelopeV3 {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const conversations = Array.isArray(raw.conversations) ? raw.conversations.slice(0, 30).flatMap((candidate) => {
    const session = sanitizeConversation(candidate, allowed);
    return session ? [session] : [];
  }) : [];
  return {
    version: 3, conversations,
    activeConversationId: conversations.some((s) => s.id === raw.activeConversationId) ? String(raw.activeConversationId) : conversations[0]?.id ?? null,
    draft: typeof raw.draft === 'string' ? raw.draft.slice(0, 4000) : '',
    migrationCompletedAt: typeof raw.migrationCompletedAt === 'number' ? raw.migrationCompletedAt : Date.now(),
  };
}

export function serializeEnvelope(envelope: ConversationEnvelopeV3, limit = ASSISTANT_STORAGE_BYTES): string {
  if (envelope.conversations.length > 30 || envelope.conversations.some((s) => s.messages.length > 100) || envelope.draft.length > 4000) {
    throw new Error('会话容量达到上限，请导出记录后整理历史。');
  }
  const json = JSON.stringify(envelope);
  if (new TextEncoder().encode(json).byteLength > limit) throw new Error('本地会话容量超过 2 MiB，请导出后整理历史。');
  return json;
}

export function createAssistantStorage(allowed: ReadonlySet<string>, options: {
  indexedDB?: () => IDBFactory;
  legacy?: Pick<ConversationStorage, 'getItem'>;
} = {}) {
  let dbPromise: Promise<IDBDatabase> | undefined;
  let memory = normalizeEnvelope(undefined, allowed);
  let queue = Promise.resolve();
  const warning = '会话暂存于内存，刷新后可能丢失。请导出需要保留的记录。';
  const legacy = options.legacy ?? { getItem: (key: string) => window.localStorage.getItem(key) };
  function open(): Promise<IDBDatabase> {
    dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = (options.indexedDB?.() ?? window.indexedDB).open(ASSISTANT_DB_NAME, 3);
      const timeout = setTimeout(() => reject(new Error('会话数据库打开超时')), 4000);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('snapshots')) request.result.createObjectStore('snapshots');
      };
      request.onerror = () => { clearTimeout(timeout); reject(request.error); };
      request.onblocked = () => { clearTimeout(timeout); reject(new Error('会话数据库被其他页面占用')); };
      request.onsuccess = () => {
        clearTimeout(timeout);
        request.result.onversionchange = () => { request.result.close(); dbPromise = undefined; };
        resolve(request.result);
      };
    }).catch((error) => { dbPromise = undefined; throw error; });
    return dbPromise!;
  }
  async function write(json: string): Promise<void> {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('snapshots', 'readwrite');
      transaction.objectStore('snapshots').put(JSON.parse(json), 'current');
      // request.onsuccess不能证明事务已提交。
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error('会话事务中断'));
    });
  }
  return {
    async load(): Promise<{ envelope: ConversationEnvelopeV3; warning?: string }> {
      let failure = false;
      try {
        const db = await open();
        const value = await new Promise<unknown>((resolve, reject) => {
          const transaction = db.transaction('snapshots', 'readonly');
          const request = transaction.objectStore('snapshots').get('current');
          transaction.oncomplete = () => resolve(request.result);
          transaction.onabort = transaction.onerror = () => reject(transaction.error);
        });
        if (value && (value as { version?: number }).version === 3) {
          memory = normalizeEnvelope(value, allowed);
          return { envelope: memory };
        }
      } catch { failure = true; }
      try {
        const old = restoreConversationEnvelope(legacy.getItem(CHAT_STORAGE_KEY), legacy.getItem(LEGACY_CHAT_STORAGE_KEY), allowed);
        memory = normalizeEnvelope({ ...old, migrationCompletedAt: old.migration.completedAt }, allowed);
      } catch { failure = true; }
      if (!failure) {
        try { await write(serializeEnvelope(memory)); } catch { failure = true; }
      }
      // v1/v2始终保留，只有已确认提交的v3会在下一次读取中优先使用。
      return { envelope: memory, ...(failure ? { warning } : {}) };
    },
    async save(envelope: ConversationEnvelopeV3): Promise<{ saved: boolean; warning?: string }> {
      let json: string;
      try { json = serializeEnvelope(envelope); }
      catch (error) { return { saved: false, warning: (error as Error).message }; }
      memory = JSON.parse(json);
      let saved = false;
      queue = queue.then(async () => {
        try { await write(json); saved = true; } catch { saved = false; }
      });
      await queue;
      return { saved, ...(!saved ? { warning } : {}) };
    },
    close() { void dbPromise?.then((db) => db.close()).catch(() => {}); dbPromise = undefined; },
  };
}
