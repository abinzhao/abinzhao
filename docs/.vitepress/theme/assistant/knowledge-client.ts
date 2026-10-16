import type { KnowledgeLoadState, KnowledgeSearchResponse, KnowledgeSearchRuntime } from '../composables/knowledge-search';

export function createBrowserKnowledgeSearch(): KnowledgeSearchRuntime & { dispose: () => void } {
  let worker: Worker | undefined;
  let serial = 0;
  let epoch = 0;
  let state: KnowledgeLoadState = 'idle';
  let preparation: Promise<void> | undefined;
  let corpusSent = false;
  const waiting = new Map<number, { resolve: (value: KnowledgeSearchResponse | undefined) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  function dispose(error = new Error('检索已关闭')): void {
    epoch++;
    worker?.terminate();
    worker = undefined;
    preparation = undefined;
    corpusSent = false;
    for (const task of waiting.values()) { clearTimeout(task.timer); task.reject(error); }
    waiting.clear();
  }
  function call(payload: object): Promise<KnowledgeSearchResponse | undefined> {
    if (!worker) return Promise.reject(new Error('检索尚未初始化'));
    const id = ++serial;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { state = 'error'; dispose(new Error('本地检索超时，请重试')); }, 15_000);
      waiting.set(id, { resolve, reject, timer });
      try { worker!.postMessage({ ...payload, id }); }
      catch (error) { state = 'error'; dispose(error instanceof Error ? error : new Error('检索消息失败')); }
    });
  }
  async function prepare(): Promise<void> {
    if (!preparation) {
      state = 'loading-index';
      const activeEpoch = epoch;
      const operation = (async () => {
        const { data: index } = await import('../../data/knowledge-index.data');
        if (epoch !== activeEpoch) throw new DOMException('检索已关闭', 'AbortError');
        worker = new Worker(new URL('./knowledge.worker.ts', import.meta.url), { type: 'module', name: 'site-knowledge-search' });
        worker.onmessage = (event) => {
          const task = waiting.get(event.data.id);
          if (!task) return;
          waiting.delete(event.data.id);
          clearTimeout(task.timer);
          if (event.data.error) task.reject(new Error(event.data.error));
          else task.resolve(event.data.response);
        };
        worker.onerror = worker.onmessageerror = () => {
          state = 'error';
          dispose(new Error('检索线程中断，请重试'));
        };
        await call({ kind: 'prepare', index });
        state = 'ready';
      })();
      preparation = operation.catch((error) => { state = 'error'; dispose(); throw error; });
    }
    await preparation;
  }
  return {
    get loadState() { return state; },
    prepare,
    async search(query, options = {}) {
      await prepare();
      try {
        const activeWorker = worker;
        state = 'loading-corpus';
        const corpus = corpusSent ? undefined : (await import('../../data/knowledge-corpus.data')).data;
        if (worker !== activeWorker) throw new DOMException('检索已关闭', 'AbortError');
        const response = await call({ kind: 'search', query, options, corpus });
        corpusSent = true;
        state = 'ready';
        if (!response) throw new Error('检索结果缺失');
        return response;
      } catch (error) { state = 'error'; throw error; }
    },
    dispose,
  };
}
