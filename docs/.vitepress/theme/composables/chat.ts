export interface KnowledgeSource {
  title: string;
  description?: string;
  href: string;
  tags?: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'complete' | 'streaming' | 'stopped' | 'error';
  sources?: KnowledgeSource[];
}

export interface Conversation {
  id: string;
  title: string;
  mode: 'knowledge' | 'model';
  updatedAt: number;
  messages: ChatMessage[];
}

export function buildKnowledgeReply(query: string, documents: KnowledgeSource[]): {
  text: string;
  sources: KnowledgeSource[];
} {
  const normalized = query.toLowerCase();
  const words = normalized.match(/[a-z][a-z0-9.+-]*|[\u4e00-\u9fff]{2,}/g) ?? [];
  const tokens = new Set(words.flatMap((word) =>
    /^[a-z]/.test(word) ? [word] : Array.from({ length: word.length - 1 }, (_, index) => word.slice(index, index + 2)),
  ));
  const sources = documents.map((document) => {
    const title = document.title.toLowerCase();
    const details = `${document.description ?? ''} ${(document.tags ?? []).join(' ')}`.toLowerCase();
    const score = [...tokens].reduce((total, token) => total + (title.includes(token) ? 3 : details.includes(token) ? 1 : 0), 0);
    return { document, score };
  }).filter((item) => item.score >= 2).sort((left, right) => right.score - left.score)
    .slice(0, 4).map((item) => item.document);

  return {
    text: sources.length
      ? `根据站内内容，以下资料与你的问题相关：\n\n${sources.map((source, index) =>
        `${index + 1}. ${source.title}\n${source.description ?? '点击下方来源阅读完整内容。'}`,
      ).join('\n\n')}\n\n这是站内检索结果。需要进一步讨论时，可以切换到模型对话。`
      : '暂时没有找到直接相关的站内内容。可以尝试“CSS 布局”“鸿蒙页面架构”“本地优先”或“静态部署”，也可以切换到模型对话继续讨论。',
    sources,
  };
}

export function normalizeModelEndpoint(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('请输入完整的模型服务地址。'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) {
    throw new Error('模型地址须使用 HTTPS 或本机 HTTP，且不能包含账号、密码或查询参数。');
  }
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path.endsWith('/chat/completions') ? path : `${path}/chat/completions`;
  return url.toString();
}

export async function readCompletionStream(
  stream: ReadableStream<Uint8Array>,
  onChunk: (chunk: string) => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let complete = false;
  const consume = (event: string): void => {
    const payload = event.split('\n').filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart()).join('\n');
    if (!payload) return;
    if (payload === '[DONE]') { complete = true; return; }
    let data: { error?: unknown; choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }> };
    try { data = JSON.parse(payload); } catch { throw new Error('模型服务返回了无法解析的响应。'); }
    if (data.error) throw new Error('模型服务返回错误，请检查模型、权限或额度。');
    for (const choice of data.choices ?? []) {
      if (typeof choice.delta?.content === 'string') onChunk(choice.delta.content);
      if (choice.finish_reason) complete = true;
    }
  };
  try {
    while (!complete) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      // Normalize after buffering so a CRLF split between chunks stays intact.
      buffer = buffer.replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        consume(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
      }
      if (done) {
        if (buffer.trim()) consume(buffer);
        break;
      }
    }
    if (!complete) throw new Error('模型连接中断，已保留部分回答，可以重试。');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function restoreConversations(serialized: string | null): Conversation[] {
  try {
    const parsed: unknown = JSON.parse(serialized ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 30).flatMap((entry): Conversation[] => {
      if (!entry || typeof entry.id !== 'string' || typeof entry.title !== 'string' ||
        !Array.isArray(entry.messages) || !['model', 'knowledge'].includes(entry.mode)) return [];
      const messages: ChatMessage[] = entry.messages.slice(-100).flatMap((message: ChatMessage): ChatMessage[] => {
        if (!message || typeof message.id !== 'string' || typeof message.content !== 'string' ||
          !['user', 'assistant'].includes(message.role)) return [];
        return [{
          id: message.id, role: message.role, content: message.content.slice(0, 100_000),
          status: message.status === 'streaming' ? 'stopped' : ['complete', 'stopped', 'error'].includes(message.status) ? message.status : 'complete',
          sources: Array.isArray(message.sources) ? message.sources.filter((source) =>
            source && typeof source.title === 'string' && typeof source.href === 'string' &&
            /^\/(blog|columns)\//.test(source.href) && !source.href.startsWith('//'),
          ).map((source) => ({ title: source.title, href: source.href })) : undefined,
        }];
      });
      return [{ id: entry.id, title: entry.title.slice(0, 60), mode: entry.mode, updatedAt: Number(entry.updatedAt) || 0, messages }];
    });
  } catch { return []; }
}
