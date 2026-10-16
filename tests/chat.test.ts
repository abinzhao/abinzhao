import { describe, expect, test } from 'vitest';
import {
  createConversation,
  exportConversationMarkdown,
  type Conversation,
} from '../docs/.vitepress/theme/composables/chat';

describe('local chat protocol', () => {
  test('creates an isolated local conversation with the selected scope', () => {
    expect(createConversation('session-1', 100)).toEqual({
      id: 'session-1',
      messages: [],
      scope: 'site',
      title: '新会话',
      updatedAt: 100,
    });
    expect(
      createConversation(
        'session-2',
        200,
        'article',
        '/blog/local-first-agent.html',
      ),
    ).toEqual({
      articleId: '/blog/local-first-agent.html',
      id: 'session-2',
      messages: [],
      scope: 'article',
      title: '新会话',
      updatedAt: 200,
    });
  });

  test('exports visible local and legacy history without hidden state', () => {
    const conversation: Conversation = {
      id: 'session',
      legacyRecord: true,
      messages: [
        {
          content: 'CSS 布局怎么学',
          id: 'user',
          role: 'user',
          status: 'complete',
        },
        {
          content: '旧回答',
          id: 'legacy',
          legacyRecord: true,
          role: 'assistant',
          status: 'complete',
        },
        {
          content: '本地回答',
          id: 'local',
          role: 'assistant',
          status: 'complete',
          reply: {
            blocks: [{
              heading: '相关资料',
              items: [{
                sourceIds: ['flex'],
                text: 'Flexbox 控制一行或一列内元素的排布。',
              }],
              kind: 'list',
            }],
            confidence: { level: 'high', reasons: [], score: 0.8 },
            intent: 'lookup',
            nextContext: {
              entities: ['Flexbox'],
              intent: 'lookup',
              scope: 'site',
              sourceIds: ['flex'],
            },
            sources: [{
              href: '/columns/fullstack-development/03-box-model-layout.html#flexbox',
              id: 'flex',
              title: '现代 CSS 布局',
            }],
          },
        },
      ],
      scope: 'site',
      title: 'CSS 布局',
      updatedAt: 100,
    };
    const markdown = exportConversationMarkdown(conversation);

    expect(markdown).toContain('## 我');
    expect(markdown).toContain('## 助手（旧版记录）');
    expect(markdown).toContain('可信度：高');
    expect(markdown).toContain('Flexbox 控制一行或一列内元素的排布。');
    expect(markdown).toContain('/columns/fullstack-development/03-box-model-layout.html#flexbox');
    expect(markdown).not.toContain('sourceIds');
    expect(markdown).not.toContain('nextContext');
  });
});
