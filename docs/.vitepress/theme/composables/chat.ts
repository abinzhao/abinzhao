import type {
  AnswerBlock,
  ChatContext,
  ChatIntent,
  ConfidenceLevel,
  EvidenceSource,
  KnowledgeScope,
  StructuredReply,
} from './local-assistant';

export const CHAT_STORAGE_KEY = 'abin-conversations-v2';
export const LEGACY_CHAT_STORAGE_KEY = 'abin-conversations-v1';

export interface KnowledgeSource {
  description?: string;
  href: string;
  tags?: string[];
  title: string;
}

export interface ChatMessage {
  content: string;
  createdAt?: number;
  id: string;
  legacyRecord?: boolean;
  reply?: StructuredReply;
  role: 'user' | 'assistant';
  sources?: KnowledgeSource[];
  status: 'complete' | 'stopped' | 'error';
}

export interface Conversation {
  articleId?: string;
  context?: ChatContext;
  id: string;
  legacyRecord?: boolean;
  messages: ChatMessage[];
  scope: KnowledgeScope;
  title: string;
  updatedAt: number;
}

export interface ConversationEnvelopeV2 {
  activeConversationId: string | null;
  conversations: Conversation[];
  migration: {
    completedAt: number;
    v1Completed: true;
  };
  version: 2;
}

export interface ConversationStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

const CHAT_INTENTS = new Set<ChatIntent>([
  'lookup',
  'explain',
  'compare',
  'learning-path',
  'troubleshoot',
  'summarize',
]);
const KNOWLEDGE_SCOPES = new Set<KnowledgeScope>(['site', 'blog', 'columns', 'article']);
const CONFIDENCE_LEVELS = new Set<ConfidenceLevel>(['high', 'medium', 'insufficient']);
const ANSWER_BLOCK_KINDS = new Set<AnswerBlock['kind']>([
  'paragraph',
  'list',
  'comparison',
  'steps',
  'clarification',
]);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? value as Record<string, unknown>
    : undefined;
}

function boundedString(value: unknown, maxLength: number): string | undefined {
  return typeof value === 'string' && value.trim()
    ? value.slice(0, maxLength)
    : undefined;
}

function parseJson(serialized: string | null): unknown {
  try {
    return JSON.parse(serialized ?? 'null');
  } catch {
    return undefined;
  }
}

function isAllowedSourceHref(href: string, allowedSourceHrefs: ReadonlySet<string>): boolean {
  return allowedSourceHrefs.has(href) || allowedSourceHrefs.has(href.split('#')[0]);
}

function sanitizeSources(
  value: unknown,
  allowedSourceHrefs: ReadonlySet<string>,
): KnowledgeSource[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const sources = value.slice(0, 32).flatMap((candidate): KnowledgeSource[] => {
    const source = asRecord(candidate);
    const title = boundedString(source?.title, 160);
    const href = boundedString(source?.href, 500);
    if (!title || !href || !isAllowedSourceHref(href, allowedSourceHrefs)) return [];

    return [{
      href,
      title,
      ...(boundedString(source?.description, 500)
        ? { description: boundedString(source?.description, 500) }
        : {}),
      ...(Array.isArray(source?.tags)
        ? {
            tags: source.tags
              .filter((tag): tag is string => typeof tag === 'string')
              .slice(0, 12)
              .map((tag) => tag.slice(0, 80)),
          }
        : {}),
    }];
  });

  return sources.length > 0 ? sources.slice(0, 8) : undefined;
}

function sanitizeContext(value: unknown): ChatContext | undefined {
  const context = asRecord(value);
  if (
    !context ||
    !CHAT_INTENTS.has(context.intent as ChatIntent) ||
    !KNOWLEDGE_SCOPES.has(context.scope as KnowledgeScope) ||
    !Array.isArray(context.entities) ||
    !Array.isArray(context.sourceIds)
  ) {
    return undefined;
  }

  return {
    entities: context.entities
      .filter((entity): entity is string => typeof entity === 'string')
      .slice(0, 8)
      .map((entity) => entity.slice(0, 160)),
    intent: context.intent as ChatIntent,
    scope: context.scope as KnowledgeScope,
    sourceIds: context.sourceIds
      .filter((id): id is string => typeof id === 'string')
      .slice(0, 8)
      .map((id) => id.slice(0, 500)),
    ...(Array.isArray(context.pendingClarification)
      ? {
          pendingClarification: context.pendingClarification
            .filter((item): item is string => typeof item === 'string')
            .slice(0, 3)
            .map((item) => item.slice(0, 160)),
        }
      : {}),
  };
}

function sanitizeEvidenceSources(
  value: unknown,
  allowedSourceHrefs: ReadonlySet<string>,
): EvidenceSource[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 8).flatMap((candidate): EvidenceSource[] => {
    const source = asRecord(candidate);
    const id = boundedString(source?.id, 500);
    const title = boundedString(source?.title, 160);
    const href = boundedString(source?.href, 500);
    if (!id || !title || !href || !isAllowedSourceHref(href, allowedSourceHrefs)) return [];

    return [{
      href,
      id,
      title,
      ...(boundedString(source?.sectionTitle, 160)
        ? { sectionTitle: boundedString(source?.sectionTitle, 160) }
        : {}),
    }];
  });
}

function sanitizeAnswerBlocks(value: unknown): AnswerBlock[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 12).flatMap((candidate): AnswerBlock[] => {
    const block = asRecord(candidate);
    if (!block || !ANSWER_BLOCK_KINDS.has(block.kind as AnswerBlock['kind'])) return [];
    const items = Array.isArray(block.items)
      ? block.items.slice(0, 12).flatMap((item): AnswerBlock['items'] => {
          const evidence = asRecord(item);
          const text = boundedString(evidence?.text, 100_000);
          if (!text || !Array.isArray(evidence?.sourceIds)) return [];
          return [{
            sourceIds: evidence.sourceIds
              .filter((id): id is string => typeof id === 'string')
              .slice(0, 8)
              .map((id) => id.slice(0, 500)),
            text,
          }];
        })
      : [];

    return [{
      items,
      kind: block.kind as AnswerBlock['kind'],
      ...(boundedString(block.heading, 160)
        ? { heading: boundedString(block.heading, 160) }
        : {}),
    }];
  });
}

function sanitizeReply(
  value: unknown,
  allowedSourceHrefs: ReadonlySet<string>,
): StructuredReply | undefined {
  const reply = asRecord(value);
  const confidence = asRecord(reply?.confidence);
  const nextContext = sanitizeContext(reply?.nextContext);
  if (
    !reply ||
    !CHAT_INTENTS.has(reply.intent as ChatIntent) ||
    !confidence ||
    !CONFIDENCE_LEVELS.has(confidence.level as ConfidenceLevel) ||
    typeof confidence.score !== 'number' ||
    !nextContext
  ) {
    return undefined;
  }

  return {
    blocks: sanitizeAnswerBlocks(reply.blocks),
    confidence: {
      level: confidence.level as ConfidenceLevel,
      reasons: Array.isArray(confidence.reasons)
        ? confidence.reasons
            .filter((reason): reason is string => typeof reason === 'string')
            .slice(0, 8)
            .map((reason) => reason.slice(0, 160))
        : [],
      score: Math.max(0, Math.min(1, confidence.score)),
    },
    intent: reply.intent as ChatIntent,
    nextContext,
    sources: sanitizeEvidenceSources(reply.sources, allowedSourceHrefs),
    ...(Array.isArray(reply.clarification)
      ? {
          clarification: reply.clarification
            .filter((item): item is string => typeof item === 'string')
            .slice(0, 3)
            .map((item) => item.slice(0, 160)),
        }
      : {}),
  };
}

function sanitizeMessage(
  value: unknown,
  allowedSourceHrefs: ReadonlySet<string>,
  legacyRecord: boolean,
): ChatMessage | undefined {
  const message = asRecord(value);
  const id = boundedString(message?.id, 160);
  const content = boundedString(message?.content, 100_000);
  if (!message || !id || !content || !['user', 'assistant'].includes(String(message.role))) {
    return undefined;
  }

  const status = message.status === 'streaming'
    ? 'stopped'
    : ['complete', 'stopped', 'error'].includes(String(message.status))
      ? message.status as ChatMessage['status']
      : 'complete';
  const reply = legacyRecord
    ? undefined
    : sanitizeReply(message.reply, allowedSourceHrefs);

  return {
    content,
    id,
    role: message.role as ChatMessage['role'],
    status,
    ...(typeof message.createdAt === 'number' ? { createdAt: message.createdAt } : {}),
    ...(legacyRecord && message.role === 'assistant' ? { legacyRecord: true } : {}),
    ...(reply ? { reply } : {}),
    ...(sanitizeSources(message.sources, allowedSourceHrefs)
      ? { sources: sanitizeSources(message.sources, allowedSourceHrefs) }
      : {}),
  };
}

function sanitizeConversation(
  value: unknown,
  allowedSourceHrefs: ReadonlySet<string>,
  legacyMode?: boolean,
): Conversation | undefined {
  const conversation = asRecord(value);
  const id = boundedString(conversation?.id, 160);
  const title = boundedString(conversation?.title, 60);
  if (!conversation || !id || !title || !Array.isArray(conversation.messages)) {
    return undefined;
  }

  const legacyRecord = legacyMode ?? conversation.legacyRecord === true;
  const messages = conversation.messages
    .slice(-100)
    .flatMap((message): ChatMessage[] => {
      const sanitized = sanitizeMessage(message, allowedSourceHrefs, legacyRecord);
      return sanitized ? [sanitized] : [];
    });
  const scope = KNOWLEDGE_SCOPES.has(conversation.scope as KnowledgeScope)
    ? conversation.scope as KnowledgeScope
    : 'site';
  const articleId = boundedString(conversation.articleId, 500);

  return {
    id,
    legacyRecord,
    messages,
    scope,
    title,
    updatedAt: typeof conversation.updatedAt === 'number' ? conversation.updatedAt : 0,
    ...(scope === 'article' && articleId ? { articleId } : {}),
    ...(sanitizeContext(conversation.context)
      ? { context: sanitizeContext(conversation.context) }
      : {}),
  };
}

function restoreValidV2(
  serialized: string | null,
  allowedSourceHrefs: ReadonlySet<string>,
): ConversationEnvelopeV2 | undefined {
  const parsed = asRecord(parseJson(serialized));
  const migration = asRecord(parsed?.migration);
  if (
    !parsed ||
    parsed.version !== 2 ||
    !migration ||
    migration.v1Completed !== true ||
    typeof migration.completedAt !== 'number' ||
    !Array.isArray(parsed.conversations)
  ) {
    return undefined;
  }

  const conversations = parsed.conversations
    .flatMap((conversation): Conversation[] => {
      const sanitized = sanitizeConversation(conversation, allowedSourceHrefs);
      return sanitized ? [sanitized] : [];
    })
    .slice(0, 30);
  const requestedActiveId = typeof parsed.activeConversationId === 'string'
    ? parsed.activeConversationId
    : null;

  return {
    activeConversationId: conversations.some(({ id }) => id === requestedActiveId)
      ? requestedActiveId
      : conversations[0]?.id ?? null,
    conversations,
    migration: {
      completedAt: migration.completedAt,
      v1Completed: true,
    },
    version: 2,
  };
}

function migrateV1(
  serialized: string | null,
  allowedSourceHrefs: ReadonlySet<string>,
  now: number,
): ConversationEnvelopeV2 {
  const parsed = parseJson(serialized);
  const conversations = Array.isArray(parsed)
    ? parsed.flatMap((candidate): Conversation[] => {
        const entry = asRecord(candidate);
        const mode = entry?.mode;
        if (mode !== 'knowledge' && mode !== 'model') return [];
        const sanitized = sanitizeConversation(
          candidate,
          allowedSourceHrefs,
          mode === 'model',
        );
        return sanitized ? [sanitized] : [];
      }).slice(0, 30)
    : [];

  return {
    activeConversationId: conversations[0]?.id ?? null,
    conversations,
    migration: {
      completedAt: now,
      v1Completed: true,
    },
    version: 2,
  };
}

export function restoreConversationEnvelope(
  v2Serialized: string | null,
  v1Serialized: string | null,
  allowedSourceHrefs: ReadonlySet<string>,
  now = Date.now(),
): ConversationEnvelopeV2 {
  return restoreValidV2(v2Serialized, allowedSourceHrefs)
    ?? migrateV1(v1Serialized, allowedSourceHrefs, now);
}

export function persistConversationEnvelope(
  storage: Pick<ConversationStorage, 'setItem'>,
  envelope: ConversationEnvelopeV2,
): boolean {
  try {
    storage.setItem(CHAT_STORAGE_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

export function loadConversationStorage(
  storage: ConversationStorage,
  allowedSourceHrefs: ReadonlySet<string>,
  now = Date.now(),
): {
  envelope: ConversationEnvelopeV2;
  migrated: boolean;
  storageWarning?: string;
} {
  let v2Serialized: string | null = null;
  let v1Serialized: string | null = null;

  try {
    v2Serialized = storage.getItem(CHAT_STORAGE_KEY);
    const validV2 = restoreValidV2(v2Serialized, allowedSourceHrefs);
    if (validV2) {
      return { envelope: validV2, migrated: false };
    }
    v1Serialized = storage.getItem(LEGACY_CHAT_STORAGE_KEY);
  } catch {
    return {
      envelope: migrateV1(null, allowedSourceHrefs, now),
      migrated: false,
      storageWarning: '浏览器无法读取会话，当前页面仍可正常使用。',
    };
  }

  const envelope = migrateV1(v1Serialized, allowedSourceHrefs, now);
  const saved = persistConversationEnvelope(storage, envelope);

  return {
    envelope,
    migrated: true,
    ...(!saved
      ? {
          storageWarning:
            '浏览器无法保存会话，刷新后记录可能丢失。你仍可导出当前会话。',
        }
      : {}),
  };
}

export function createConversation(
  id: string,
  now = Date.now(),
  scope: KnowledgeScope = 'site',
  articleId?: string,
): Conversation {
  return {
    id,
    messages: [],
    scope,
    title: '新会话',
    updatedAt: now,
    ...(scope === 'article' && articleId ? { articleId } : {}),
  };
}

const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  high: '高',
  medium: '中',
  insufficient: '资料不足',
};

export function exportConversationMarkdown(conversation: Conversation): string {
  const sections = conversation.messages.map((message) => {
    const speaker = message.role === 'user'
      ? '我'
      : message.legacyRecord
        ? '助手（旧版记录）'
        : '助手';
    const details: string[] = [`## ${speaker}`, '', message.content];

    if (message.reply) {
      details.push(
        '',
        `可信度：${CONFIDENCE_LABELS[message.reply.confidence.level]}`,
      );
      for (const block of message.reply.blocks) {
        if (block.heading) details.push('', `### ${block.heading}`);
        for (const item of block.items) details.push('', `- ${item.text}`);
      }
      if (message.reply.sources.length > 0) {
        details.push('', '### 来源');
        for (const source of message.reply.sources) {
          const label = source.sectionTitle
            ? `${source.title} · ${source.sectionTitle}`
            : source.title;
          details.push('', `- [${label}](${source.href})`);
        }
      }
    }

    return details.join('\n');
  });

  return [`# ${conversation.title}`, ...sections].join('\n\n');
}
