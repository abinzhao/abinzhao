<script setup lang="ts">
import { computed } from 'vue';
import type { GenerationState, ModelState } from '../assistant/types';
const props = defineProps<{ model: ModelState; generation: GenerationState; index: 'idle' | 'loading' | 'ready' | 'error' }>();
const label = computed(() => {
  if (props.index === 'loading') return '正在准备本地知识库…';
  if (props.index === 'error') return '知识库加载失败，可重试';
  const progress: Partial<Record<GenerationState, string>> = {
    retrieving: '正在检索站内资料…', prefill: '正在读取证据…', streaming: '本地模型正在生成…',
    stopped: '回答已停止', error: '回答未完成，可重试',
  };
  if (progress[props.generation]) return progress[props.generation];
  if (props.model === 'ready') return '本地模型就绪 · 内容不上传';
  if (['checking', 'loading'].includes(props.model)) return '模型加载中 · 可用本地检索';
  if (props.model === 'unsupported') return '当前设备使用本地检索';
  if (props.model === 'error') return '模型未就绪 · 可用本地检索';
  return '本地检索 · 可在设置中加载模型';
});
</script>
<template><span class="chat-local-status" :data-status="index" role="status" aria-live="polite">{{ label }}</span></template>
