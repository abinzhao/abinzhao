import { describe, expect, test, vi } from 'vitest';
import { checkCapabilities } from '../docs/.vitepress/theme/assistant/capabilities';
import { createWebLLMRuntime, type RuntimeDependencies } from '../docs/.vitepress/theme/assistant/webllm-runtime';

const modelId = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC' as const;
const device = {
  features: new Set(['shader-f16']),
  limits: { maxStorageBufferBindingSize: 1 << 30, maxBufferSize: 1 << 30 },
};

function fixture() {
  const workers: Array<EventTarget & { terminate: ReturnType<typeof vi.fn> }> = [];
  const engine = {
    interruptGenerate: vi.fn(),
    resetChat: vi.fn(async () => {}),
    unload: vi.fn(async () => {}),
    chat: { completions: { create: vi.fn(async () => (async function* () {
      yield { choices: [{ delta: { content: '你好' }, finish_reason: null }] };
      yield { choices: [{ delta: { content: '，本地模型' }, finish_reason: null }] };
      yield { choices: [], usage: { completion_tokens: 5, prompt_tokens: 10, total_tokens: 15 } };
    })()) } },
  };
  const dependencies: RuntimeDependencies = {
    createWorker: () => {
      const worker = Object.assign(new EventTarget(), { terminate: vi.fn() });
      workers.push(worker);
      return worker;
    },
    probe: vi.fn(async () => ({ supported: true, features: ['shader-f16'], limits: device.limits })),
    createEngine: vi.fn(async () => engine),
  };
  return { dependencies, engine, workers, runtime: createWebLLMRuntime(dependencies) };
}

describe('worker capability checks', () => {
  test('rejects insecure contexts without requesting an adapter', async () => {
    const requestAdapter = vi.fn(async () => device);
    await expect(checkCapabilities({ secure: false, gpu: { requestAdapter } }, { required_features: [] }))
      .resolves.toMatchObject({ supported: false, reason: expect.stringContaining('安全') });
    expect(requestAdapter).not.toHaveBeenCalled();
  });

  test('checks actual features and binding limits instead of browser names or VRAM guesses', async () => {
    const environment = { secure: true, gpu: { requestAdapter: async () => device } };
    await expect(checkCapabilities(environment, { required_features: ['missing'] }))
      .resolves.toMatchObject({ supported: false, reason: expect.stringContaining('missing') });
    await expect(checkCapabilities(environment, { buffer_size_required_bytes: 2 ** 31 }))
      .resolves.toMatchObject({ supported: false, reason: expect.stringContaining('缓冲') });
    await expect(checkCapabilities(environment, { required_features: ['shader-f16'] }))
      .resolves.toMatchObject({ supported: true });
  });

  test('reports missing or failed adapters as usable retrieval fallback', async () => {
    await expect(checkCapabilities({ secure: true }, {})).resolves.toMatchObject({ supported: false });
    await expect(checkCapabilities({ secure: true, gpu: { requestAdapter: async () => null } }, {}))
      .resolves.toMatchObject({ supported: false });
    await expect(checkCapabilities({ secure: true, gpu: { requestAdapter: async () => { throw Error('GPU'); } } }, {}))
      .resolves.toMatchObject({ supported: false });
  });

  test('rejects adapters below the fixed SDK minimum before downloading weights', async () => {
    const lowLimits = { ...device, limits: { ...device.limits, maxComputeWorkgroupStorageSize: 16 * 1024, maxStorageBuffersPerShaderStage: 8 } };
    await expect(checkCapabilities({ secure: true, gpu: { requestAdapter: async () => lowLimits } }, {}))
      .resolves.toMatchObject({ supported: false, reason: expect.stringContaining('缓冲') });
  });
});

describe('local model lifecycle', () => {
  test('creates no worker or model download until explicitly initialized', async () => {
    const { runtime, workers, dependencies } = fixture();
    expect(workers).toHaveLength(0);
    expect(runtime.snapshot.modelState).toBe('idle');
    await runtime.check(modelId);
    expect(runtime.snapshot.modelState).toBe('awaiting-download');
    expect(dependencies.createEngine).not.toHaveBeenCalled();
    await runtime.initialize(modelId);
    expect(runtime.snapshot.modelState).toBe('ready');
    expect(workers).toHaveLength(1);
  });

  test('streams deltas and usage, resetting internal history before each explicit request', async () => {
    const { runtime, engine } = fixture();
    await runtime.initialize(modelId);
    const text: string[] = [];
    const result = await runtime.generate([{ role: 'user', content: '你好' }], (delta) => text.push(delta));
    expect(text.join('')).toBe('你好，本地模型');
    expect(result).toMatchObject({ text: '你好，本地模型', stopped: false, usage: { completion_tokens: 5 } });
    expect(engine.resetChat).toHaveBeenCalledTimes(1);
    expect(runtime.snapshot.generationState).toBe('complete');
    expect(runtime.snapshot.busy).toBe(false);
  });

  test('cancel initialization terminates the worker and ignores a late ready response', async () => {
    const { runtime, dependencies, workers, engine } = fixture();
    let resolve!: (value: typeof engine) => void;
    dependencies.createEngine = async () => new Promise((done) => { resolve = done; });
    const loading = runtime.initialize(modelId);
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    runtime.cancelInitialization();
    await expect(loading).rejects.toMatchObject({ name: 'AbortError' });
    resolve(engine);
    await Promise.resolve();
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(runtime.snapshot.modelState).toBe('idle');
  });

  test('worker crash fails the in-flight request and retry creates a fresh worker', async () => {
    const { runtime, workers, dependencies, engine } = fixture();
    dependencies.createEngine = async () => new Promise(() => {});
    const loading = runtime.initialize(modelId);
    await vi.waitFor(() => expect(runtime.snapshot.modelState).toBe('loading'));
    workers[0].dispatchEvent(new Event('error'));
    await expect(loading).rejects.toThrow('运行');
    expect(runtime.snapshot.modelState).toBe('error');
    dependencies.createEngine = async () => engine;
    await runtime.initialize(modelId);
    expect(workers).toHaveLength(2);
    expect(runtime.snapshot.modelState).toBe('ready');
  });

  test('preserves SDK string errors as a readable retry state', async () => {
    const { runtime, dependencies } = fixture();
    dependencies.createEngine = async () => { throw '下载失败'; };
    await expect(runtime.initialize(modelId)).rejects.toBe('下载失败');
    expect(runtime.snapshot).toMatchObject({ modelState: 'error', busy: false, error: '下载失败' });
  });

  test('stop calls SDK interruption and keeps already emitted text', async () => {
    const { runtime, engine } = fixture();
    let release!: () => void;
    engine.interruptGenerate.mockImplementation(() => release());
    engine.chat.completions.create.mockImplementation(async () => (async function* () {
      yield { choices: [{ delta: { content: '部分' }, finish_reason: null }] };
      await new Promise<void>((done) => { release = done; });
      yield { choices: [], usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 } };
    })());
    await runtime.initialize(modelId);
    const output = runtime.generate([{ role: 'user', content: '解释' }], () => {});
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    runtime.stop();
    await expect(output).resolves.toMatchObject({ stopped: true, text: '部分' });
    expect(engine.interruptGenerate).toHaveBeenCalledOnce();
    expect(runtime.snapshot.generationState).toBe('stopped');
  });

  test('unload releases the model and worker without clearing any browser storage', async () => {
    const { runtime, workers, engine } = fixture();
    await runtime.initialize(modelId);
    await runtime.unload();
    expect(engine.unload).toHaveBeenCalledOnce();
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(runtime.snapshot.modelState).toBe('idle');
  });

  test('unload excludes concurrent generation until GPU release has finished', async () => {
    const { runtime, engine } = fixture();
    let release!: () => void;
    engine.unload.mockImplementation(async () => new Promise((done) => { release = done; }));
    await runtime.initialize(modelId);
    const unloading = runtime.unload();
    expect(runtime.snapshot.busy).toBe(true);
    await expect(runtime.generate([{ role: 'user', content: '新问题' }], () => {})).rejects.toThrow();
    release();
    await unloading;
    expect(runtime.snapshot.busy).toBe(false);
  });
});
