import { describe, expect, test } from 'vitest';
import {
  buildKnowledgeReply,
  normalizeModelEndpoint,
  readCompletionStream,
  restoreConversations,
} from '../docs/.vitepress/theme/composables/chat';

describe('site knowledge and model conversations', () => {
  const documents = [
    { title: 'CSS 布局', description: '盒模型、弹性布局与网格布局', href: '/css.html', tags: ['CSS'] },
    { title: '本地优先的智能体', description: '隐私与模型接口', href: '/agent.html', tags: ['智能体'] },
  ];

  test('retrieves relevant sources and admits when the site has no answer', () => {
    const reply = buildKnowledgeReply('CSS 布局怎么学习', documents);
    expect(reply.sources.map((source) => source.href)).toEqual(['/css.html']);
    expect(reply.text).toContain('盒模型');
    expect(buildKnowledgeReply('烘焙面包', documents).sources).toHaveLength(0);
  });

  test('normalizes compatible API bases and rejects credentials and unsafe schemes', () => {
    expect(normalizeModelEndpoint('http://localhost:11434/v1/')).toBe('http://localhost:11434/v1/chat/completions');
    expect(normalizeModelEndpoint('https://example.com/v1/chat/completions')).toBe('https://example.com/v1/chat/completions');
    expect(() => normalizeModelEndpoint('javascript:alert(1)')).toThrow();
    expect(() => normalizeModelEndpoint('http://example.com/v1')).toThrow();
    expect(() => normalizeModelEndpoint('https://user:password@example.com/v1')).toThrow();
  });

  test('parses UTF-8 and SSE events split across arbitrary network chunks', async () => {
    const bytes = new TextEncoder().encode(
      'data: {"choices":[{"delta":{"content":"你好"}}]}\r\n\r\n' +
      'data: {"choices":[{"delta":{"content":"，世界"}}]}\n\n' +
      'data: [DONE]\n\n',
    );
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < bytes.length; index += 7) {
          controller.enqueue(bytes.slice(index, index + 7));
        }
        controller.close();
      },
    });
    let text = '';
    await readCompletionStream(stream, (chunk) => { text += chunk; });
    expect(text).toBe('你好，世界');
  });

  test('reports API errors and interrupted streams instead of silently succeeding', async () => {
    const stream = (text: string) => new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    });
    await expect(readCompletionStream(stream('data: {"error":{"message":"private provider detail"}}\n\n'), () => {})).rejects.toThrow('模型服务');
    await expect(readCompletionStream(stream('data: {"choices":[{"delta":{"content":"部分"}}]}\n\n'), () => {})).rejects.toThrow('中断');
  });

  test('validates saved history and recovers interrupted generation without restoring credentials', () => {
    expect(restoreConversations('broken')).toEqual([]);
    expect(restoreConversations(JSON.stringify([{ id: 'bad', messages: [null] }]))).toEqual([]);
    const sessions = restoreConversations(JSON.stringify([{
      id: 'session', title: '问题', mode: 'model', updatedAt: 100,
      apiKey: 'do-not-restore',
      messages: [{ id: 'message', role: 'assistant', content: '部分回答', status: 'streaming' }],
    }]));
    expect(sessions[0].messages[0].status).toBe('stopped');
    expect(sessions[0]).not.toHaveProperty('apiKey');
  });
});
