<script setup lang="ts">
import { MessageCircle, Sparkles } from '@lucide/vue';
import { withBase } from 'vitepress';
</script>

<template>
  <a class="ai-launcher" :href="withBase('/chat/')" aria-label="打开智能问答" data-magnetic>
    <span class="ai-launcher__icon"><MessageCircle :size="23" aria-hidden="true" /><Sparkles :size="12" aria-hidden="true" /></span>
    <span>智能问答</span>
  </a>
</template>
