<script setup lang="ts">
import { MessageCircle, Sparkles } from '@lucide/vue';
import { withBase } from 'vitepress';
</script>

<template>
  <a class="ai-launcher" :href="withBase('/chat/')" aria-label="打开 AI 助手" data-magnetic>
    <span class="ai-launcher__icon"><MessageCircle :size="23" aria-hidden="true" /><Sparkles :size="12" aria-hidden="true" /></span>
    <span>AI 助手</span>
  </a>
</template>
