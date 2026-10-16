import { createKnowledgeSearchRuntime, type KnowledgeSearchRuntime, type KnowledgeSearchOptions } from '../composables/knowledge-search';
import type { KnowledgeCorpusArtifact, KnowledgeIndexArtifact } from '../../data/knowledge';

let runtime: KnowledgeSearchRuntime | undefined;
let corpus: KnowledgeCorpusArtifact | undefined;

self.onmessage = async (event: MessageEvent<{
  id: number;
  kind: 'prepare' | 'search';
  index?: KnowledgeIndexArtifact;
  corpus?: KnowledgeCorpusArtifact;
  query?: string;
  options?: KnowledgeSearchOptions;
}>) => {
  const request = event.data;
  try {
    if (request.kind === 'prepare' && request.index) {
      const index = request.index;
      runtime = createKnowledgeSearchRuntime({
        loadIndex: async () => index,
        loadCorpus: async () => {
          if (!corpus) throw new Error('资料正文尚未加载');
          return corpus;
        },
      });
      await runtime.prepare();
      self.postMessage({ id: request.id });
    } else {
      if (!runtime) throw new Error('检索尚未初始化');
      if (request.corpus) corpus = request.corpus;
      const options = { ...request.options, limit: Math.min(40, Math.max(1, request.options?.limit ?? 6)) };
      const response = await runtime.search((request.query ?? '').slice(0, 8000), options);
      self.postMessage({ id: request.id, response });
    }
  } catch (error) {
    self.postMessage({ id: request.id, error: error instanceof Error ? error.message : '检索失败' });
  }
};
