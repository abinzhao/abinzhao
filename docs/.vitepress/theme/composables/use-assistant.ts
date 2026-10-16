import { onBeforeUnmount, ref, shallowRef } from 'vue';
import { useAssistantRuntime } from '../assistant/runtime-context';
import { runAssistant } from '../assistant/orchestrator';
import type { GenerationState } from '../assistant/types';

export function useAssistant() {
  const runtime = useAssistantRuntime();
  const model = shallowRef(runtime.snapshot);
  const generation = ref<GenerationState>('idle');
  let serial = 0;
  let active = false;
  let cancelled = false;
  let cancelRetrieval: (() => void) | undefined;
  const unsubscribe = runtime.subscribe((state) => {
    model.value = state;
    if (active && ['prefill', 'streaming'].includes(state.generationState)) generation.value = state.generationState;
  });
  async function run(options: Omit<Parameters<typeof runAssistant>[0], 'generate' | 'modelId' | 'isActive'> & { modelEnabled: boolean }) {
    const requestSerial = ++serial;
    active = true;
    cancelled = false;
    generation.value = 'retrieving';
    try {
      const cancellation = new Promise<never>((_, reject) => {
        cancelRetrieval = () => reject(new DOMException('检索已停止', 'AbortError'));
      });
      const result = await Promise.race([runAssistant({
        ...options, modelId: runtime.snapshot.modelId,
        generate: options.modelEnabled && runtime.snapshot.modelState === 'ready' ? runtime.generate : undefined,
        isActive: () => requestSerial === serial && !cancelled,
      }), cancellation]);
      if (requestSerial === serial) generation.value = result.provenance === 'webllm' && result.stopped ? 'stopped' : 'complete';
      return result;
    } catch (error) {
      if (requestSerial === serial) generation.value = cancelled || (error as Error).name === 'AbortError' ? 'stopped' : 'error';
      throw error;
    } finally {
      if (requestSerial === serial) { active = false; cancelRetrieval = undefined; }
    }
  }
  function stop() {
    cancelled = true;
    runtime.stop();
    if (generation.value === 'retrieving') {
      cancelRetrieval?.();
      generation.value = 'stopped';
    }
  }
  onBeforeUnmount(() => { serial++; stop(); unsubscribe(); });
  return { model, generation, run, stop };
}
