<script setup lang="ts">
import { Send, Square } from '@lucide/vue';
import { nextTick, onMounted, ref, watch } from 'vue';
const props = defineProps<{ modelValue: string; pending: boolean; disabled: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: string]; submit: []; stop: [] }>();
const input = ref<HTMLTextAreaElement>();
function resize() {
  const element = input.value;
  if (!element) return;
  element.style.height = 'auto';
  element.style.height = `${Math.min(155, Math.max(44, element.scrollHeight))}px`;
}
function enter(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault();
    if (!props.pending && !props.disabled && props.modelValue.trim()) emit('submit');
  }
}
watch(() => props.modelValue, () => { void nextTick(resize); });
onMounted(resize);
defineExpose({ focus: () => input.value?.focus() });
</script>
<template>
  <form class="chat-composer" @submit.prevent="emit('submit')">
    <label class="sr-only" for="chat-input">输入问题</label>
    <textarea id="chat-input" ref="input" :value="modelValue" :disabled="disabled" rows="1" maxlength="4000"
      placeholder="询问站内知识…" @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)" @keydown="enter" />
    <button v-if="pending" class="chat-send" type="button" aria-label="停止回答" @click="emit('stop')">
      <Square :size="18" aria-hidden="true" />
    </button>
    <button v-else class="chat-send" type="submit" :disabled="disabled || !modelValue.trim()" aria-label="发送问题">
      <Send :size="18" aria-hidden="true" />
    </button>
    <p>回车发送 · Shift + 回车换行 · 问题与历史留在当前浏览器</p>
  </form>
</template>
