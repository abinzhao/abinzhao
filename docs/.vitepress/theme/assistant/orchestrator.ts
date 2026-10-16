import { answerQuestion, type AssistantRequest } from '../composables/local-assistant';
import { ASSISTANT_PROMPT_VERSION } from './model-config';
import { buildPrompt, type PromptHistory } from './prompt-builder';
import { auditCitations } from './citations';
import type { RequestSnapshot } from './types';
import type { WebLLMRuntime } from './webllm-runtime';

export async function runAssistant(options: {
  request: RequestSnapshot;
  history: PromptHistory[];
  search: AssistantRequest['search'];
  action?: AssistantRequest['action'];
  context?: AssistantRequest['context'];
  modelId?: string;
  generate?: WebLLMRuntime['generate'];
  onDelta: (delta: string) => void;
  onEvidence?: (prompt: ReturnType<typeof buildPrompt>) => void;
  isActive?: () => boolean;
}) {
  const { request } = options;
  const reply = await answerQuestion({
    ...request, action: options.action, context: options.context,
    // 工具边界在宿主固定，模型输出永远不会成为搜索/读取/导航指令。
    search: (query, settings) => options.search(query.slice(0, 8000), {
      ...settings, limit: Math.min(40, settings?.limit ?? 40),
      scope: request.scope, documentId: request.scope === 'article' ? request.articleId : undefined,
    }),
  });
  if (options.isActive?.() === false) throw new DOMException('请求已取消', 'AbortError');
  if (!options.generate || reply.confidence.level === 'insufficient' || reply.clarification || !reply.sources.length) {
    return { provenance: 'retrieval' as const, reply };
  }
  const prompt = buildPrompt(request.question, options.history, reply);
  if (!prompt.citations.length) return { provenance: 'retrieval' as const, reply };
  options.onEvidence?.(prompt);
  const generation = await options.generate(prompt.messages, (delta) => {
    if (options.isActive?.() !== false) options.onDelta(delta);
  });
  return {
    provenance: 'webllm' as const, reply, ...generation,
    citations: prompt.citations,
    citationAudit: auditCitations(generation.text, prompt.citations),
    truncated: prompt.truncated,
    versions: {
      modelId: options.modelId, promptVersion: ASSISTANT_PROMPT_VERSION,
      corpusVersion: [...new Set(prompt.citations.map((source) => source.contentVersion))].join(','),
    },
  };
}
