import type { KnowledgeScope } from '../composables/local-assistant';

export type ModelState = 'idle' | 'checking' | 'unsupported' | 'awaiting-download' | 'loading' | 'ready' | 'unloading' | 'error';
export type GenerationState = 'idle' | 'retrieving' | 'prefill' | 'streaming' | 'stopped' | 'complete' | 'error';
export type MessageProvenance = 'legacy' | 'retrieval' | 'webllm';

export interface RequestSnapshot {
  requestId: string;
  conversationId: string;
  question: string;
  scope: KnowledgeScope;
  articleId?: string;
}

export interface ModelProgress {
  stage: string;
  progress?: number;
  elapsedSeconds?: number;
}

export interface AssistantVersions {
  modelId?: string;
  promptVersion: string;
  corpusVersion: string;
}

export interface DeviceMeasurement {
  browser: string;
  chip: string;
  ram: string;
  gpu: string;
  modelId: string;
  contextTokens: number;
  firstTokenMs: number[];
  tokensPerSecond: number[];
}
