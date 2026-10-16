import type { InitProgressReport, ChatCompletionMessageParam, ChatCompletionChunk, CompletionUsage } from '@mlc-ai/web-llm';
import type { CapabilityReport } from './capabilities';
import { ASSISTANT_CONTEXT_TOKENS, ASSISTANT_OUTPUT_TOKENS, type AssistantModelId } from './model-config';
import type { GenerationState, ModelState } from './types';

export interface RuntimeWorker extends EventTarget { terminate: () => void }
export interface RuntimeEngine {
  resetChat: () => Promise<void>;
  interruptGenerate: () => void;
  unload: () => Promise<void>;
  chat: { completions: { create: (request: {
    messages: ChatCompletionMessageParam[];
    stream: true;
    stream_options: { include_usage: true };
    max_tokens: number;
    temperature: number;
  }) => Promise<AsyncIterable<ChatCompletionChunk>> } };
}
export interface RuntimeDependencies {
  createWorker: () => RuntimeWorker;
  probe: (worker: RuntimeWorker, model: AssistantModelId) => Promise<CapabilityReport>;
  createEngine: (worker: RuntimeWorker, model: AssistantModelId, progress: (report: InitProgressReport) => void) => Promise<RuntimeEngine>;
}
export interface RuntimeSnapshot {
  modelState: ModelState;
  generationState: GenerationState;
  busy: boolean;
  modelId?: AssistantModelId;
  capabilities?: CapabilityReport;
  progress?: InitProgressReport;
  error?: string;
}

const browserDependencies: RuntimeDependencies = {
  createWorker: () => new Worker(new URL('./webllm.worker.ts', import.meta.url), { type: 'module' }),
  probe: (worker, modelId) => new Promise((resolve) => {
    const actualWorker = worker as Worker;
    const receive = (event: MessageEvent) => {
      if (event.data?.channel !== 'assistant-capability' || event.data.modelId !== modelId) return;
      actualWorker.removeEventListener('message', receive);
      resolve(event.data.report);
    };
    actualWorker.addEventListener('message', receive);
    actualWorker.postMessage({ channel: 'assistant-capability', modelId });
  }),
  async createEngine(worker, modelId, progress) {
    const { CreateWebWorkerMLCEngine, prebuiltAppConfig } = await import('@mlc-ai/web-llm');
    return CreateWebWorkerMLCEngine(worker, modelId, {
      appConfig: { ...prebuiltAppConfig, cacheBackend: 'cache' },
      initProgressCallback: progress,
      logLevel: 'ERROR',
    }, { context_window_size: ASSISTANT_CONTEXT_TOKENS });
  },
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : '本地模型操作失败。';
}

export function createWebLLMRuntime(dependencies: RuntimeDependencies = browserDependencies) {
  let snapshot: RuntimeSnapshot = { modelState: 'idle', generationState: 'idle', busy: false };
  const listeners = new Set<(state: RuntimeSnapshot) => void>();
  let worker: RuntimeWorker | undefined;
  let engine: RuntimeEngine | undefined;
  let epoch = 0;
  let operation: { reject: (error: Error) => void } | undefined;
  let stopped = false;
  let stopTimer: ReturnType<typeof setTimeout> | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  function update(patch: Partial<RuntimeSnapshot>): void {
    snapshot = { ...snapshot, ...patch };
    snapshot.busy = ['checking', 'loading', 'unloading'].includes(snapshot.modelState) ||
      ['prefill', 'streaming'].includes(snapshot.generationState);
    for (const listener of listeners) listener(snapshot);
  }

  function destroy(): void {
    epoch++;
    clearTimeout(stopTimer);
    clearTimeout(idleTimer);
    worker?.removeEventListener('error', crash);
    worker?.removeEventListener('messageerror', crash);
    worker?.terminate();
    worker = undefined;
    engine = undefined;
  }

  function crash(): void {
    const error = new Error('本地模型运行中断，请重新加载模型。');
    operation?.reject(error);
    destroy();
    update({ modelState: 'error', generationState: snapshot.busy ? 'error' : snapshot.generationState, error: error.message });
  }

  function ensureWorker(): RuntimeWorker {
    if (!worker) {
      worker = dependencies.createWorker();
      worker.addEventListener('error', crash);
      worker.addEventListener('messageerror', crash);
    }
    return worker;
  }

  async function guarded<T>(task: () => Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const interrupted = new Promise<never>((_, reject) => {
      operation = { reject };
      timer = setTimeout(() => {
        reject(new Error('本地模型操作超时，请重试或使用本地检索。'));
        destroy();
      }, timeoutMs);
    });
    try {
      return await Promise.race([task(), interrupted]);
    } finally {
      clearTimeout(timer);
      operation = undefined;
    }
  }

  async function check(modelId: AssistantModelId): Promise<CapabilityReport> {
    if (snapshot.busy) throw new Error('请等待当前模型操作结束。');
    if (snapshot.modelId !== modelId) destroy();
    update({ modelState: 'checking', modelId, error: undefined });
    try {
      const report = await guarded(() => dependencies.probe(ensureWorker(), modelId), 15_000);
      update({ capabilities: report, modelState: report.supported ? 'awaiting-download' : 'unsupported' });
      if (!report.supported) destroy();
      return report;
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        destroy();
        update({ modelState: 'error', error: errorText(error) });
      }
      throw error;
    }
  }

  async function initialize(modelId: AssistantModelId): Promise<void> {
    if (snapshot.modelState === 'ready' && snapshot.modelId === modelId) return;
    if (snapshot.busy) throw new Error('请等待当前模型操作结束。');
    const report = await check(modelId);
    if (!report.supported) return;
    const currentEpoch = epoch;
    update({ modelState: 'loading', progress: undefined, generationState: 'idle' });
    try {
      engine = await guarded(async () => {
        const loaded = await dependencies.createEngine(ensureWorker(), modelId, (progress) => {
          if (epoch === currentEpoch) update({ progress });
        });
        if (epoch !== currentEpoch) throw new DOMException('初始化已取消', 'AbortError');
        return loaded;
      }, 15 * 60_000);
      update({ modelState: 'ready' });
      scheduleIdleUnload();
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        destroy();
        update({ modelState: 'error', error: errorText(error) });
      }
      throw error;
    }
  }

  function cancelInitialization(): void {
    if (!['checking', 'loading'].includes(snapshot.modelState)) return;
    operation?.reject(new DOMException('初始化已取消', 'AbortError'));
    destroy();
    update({ modelState: 'idle', progress: undefined });
  }

  function stop(): void {
    if (!['prefill', 'streaming'].includes(snapshot.generationState)) return;
    stopped = true;
    engine?.interruptGenerate();
    // SDK 不响应时终止 Worker，保证停止不会无限等待；已有文本由调用者保留。
    stopTimer = setTimeout(() => {
      operation?.reject(new DOMException('生成已停止', 'AbortError'));
      destroy();
      update({ modelState: 'idle', generationState: 'stopped' });
    }, 1000);
  }

  async function generate(
    messages: ChatCompletionMessageParam[],
    onDelta: (delta: string) => void,
  ): Promise<{ text: string; stopped: boolean; usage?: CompletionUsage; firstTokenMs?: number; elapsedMs: number }> {
    if (!engine || snapshot.modelState !== 'ready') throw new Error('请先加载本地模型。');
    if (snapshot.busy) throw new Error('当前生成尚未结束。');
    clearTimeout(idleTimer);
    const activeEngine = engine;
    const currentEpoch = epoch;
    const startedAt = performance.now();
    let firstTokenMs: number | undefined;
    let text = '';
    let usage: CompletionUsage | undefined;
    stopped = false;
    update({ generationState: 'prefill', error: undefined });
    try {
      await guarded(async () => {
        // 每次请求显式传入历史，清掉引擎内部 KV 状态以隔离会话和重试。
        await activeEngine.resetChat();
        if (stopped) return;
        const stream = await activeEngine.chat.completions.create({
          messages, stream: true, stream_options: { include_usage: true },
          max_tokens: ASSISTANT_OUTPUT_TOKENS, temperature: 0.3,
        });
        for await (const chunk of stream) {
          if (epoch !== currentEpoch) break;
          if (chunk.usage) usage = chunk.usage;
          const delta = chunk.choices[0]?.delta.content;
          if (delta && !stopped) {
            firstTokenMs ??= performance.now() - startedAt;
            text += delta;
            update({ generationState: 'streaming' });
            onDelta(delta);
          }
        }
      }, 120_000);
      update({ generationState: stopped ? 'stopped' : 'complete' });
    } catch (error) {
      if (stopped) update({ generationState: 'stopped' });
      else {
        destroy();
        update({ modelState: 'error', generationState: 'error', error: errorText(error) });
        throw error;
      }
    } finally {
      clearTimeout(stopTimer);
      scheduleIdleUnload();
    }
    return { text, stopped, usage, firstTokenMs, elapsedMs: performance.now() - startedAt };
  }

  function scheduleIdleUnload(): void {
    clearTimeout(idleTimer);
    if (snapshot.modelState === 'ready') idleTimer = setTimeout(() => {
      void unload().catch(() => update({ modelState: 'error', error: '模型释放失败，运行实例已关闭。' }));
    }, 5 * 60_000);
  }

  async function unload(): Promise<void> {
    if (snapshot.busy) throw new Error('请先停止当前模型操作。');
    update({ modelState: 'unloading' });
    try { if (engine) await guarded(() => engine!.unload(), 10_000); }
    finally {
      destroy();
      update({ modelState: 'idle', generationState: 'idle', progress: undefined });
    }
  }

  return {
    get snapshot() { return snapshot; },
    subscribe(listener: (state: RuntimeSnapshot) => void) {
      listeners.add(listener);
      listener(snapshot);
      return () => { listeners.delete(listener); };
    },
    check, initialize, cancelInitialization, generate, stop, unload,
  };
}

export type WebLLMRuntime = ReturnType<typeof createWebLLMRuntime>;
