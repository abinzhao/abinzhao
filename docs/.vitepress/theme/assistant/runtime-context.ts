import { inject, type InjectionKey } from 'vue';
import type { WebLLMRuntime } from './webllm-runtime';

export const ASSISTANT_RUNTIME_KEY: InjectionKey<() => WebLLMRuntime> = Symbol('local-assistant-runtime');

export function useAssistantRuntime(): WebLLMRuntime {
  const factory = inject(ASSISTANT_RUNTIME_KEY);
  if (!factory) throw new Error('本地助手运行时未绑定到页面布局。');
  return factory();
}
