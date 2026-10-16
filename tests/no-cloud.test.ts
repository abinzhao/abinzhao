import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const projectRoot = resolve(import.meta.dirname, '..');
const runtimeFiles = [
  'docs/.vitepress/theme/pages/ChatPage.vue',
  'docs/.vitepress/theme/composables/chat.ts',
  'docs/.vitepress/theme/composables/local-assistant.ts',
  'docs/.vitepress/theme/composables/knowledge-search.ts',
  'docs/.vitepress/theme/styles/chat.css',
];
const documentationFiles = [
  'README.md',
  'docs/chat/index.md',
];

describe('local-only chat boundary', () => {
  test('contains no remote inference transport or provider configuration', async () => {
    const source = (
      await Promise.all(runtimeFiles.map((file) =>
        readFile(resolve(projectRoot, file), 'utf8'),
      ))
    ).join('\n');

    const forbidden = [
      /\bfetch\s*\(/u,
      /\bWebSocket\b/u,
      /\bEventSource\b/u,
      /chat\/completions/iu,
      /text\/event-stream/iu,
      /\bapiKey\b/u,
      /normalizeModelEndpoint/u,
      /readCompletionStream/u,
      /OpenAI/iu,
      /Ollama/iu,
      /模型设置/u,
      /模型对话/u,
      /访问密钥/u,
    ];

    for (const pattern of forbidden) {
      expect(source).not.toMatch(pattern);
    }
  });

  test('documents only the browser-local knowledge assistant boundary', async () => {
    const documentation = (
      await Promise.all(documentationFiles.map((file) =>
        readFile(resolve(projectRoot, file), 'utf8'),
      ))
    ).join('\n');

    expect(documentation).not.toMatch(/OpenAI|Ollama|模型设置|模型对话|访问密钥|跨域代理/iu);
    expect(documentation).toContain('本地');
    expect(documentation).toContain('当前浏览器');
  });
});
