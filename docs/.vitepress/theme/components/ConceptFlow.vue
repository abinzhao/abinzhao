<script setup lang="ts">
withDefaults(defineProps<{ steps: string[]; caption?: string }>(), {
  caption: '从输入到结果，沿着数据流理解每一步。',
});
</script>

<template>
  <figure class="concept-flow" :aria-label="caption">
    <ol>
      <li v-for="(step, index) in steps" :key="`${index}-${step}`">
        <span class="concept-flow__number">{{ String(index + 1).padStart(2, '0') }}</span>
        <strong>{{ step }}</strong>
        <span v-if="index < steps.length - 1" class="concept-flow__arrow" aria-hidden="true">→</span>
      </li>
    </ol>
    <figcaption>{{ caption }}</figcaption>
  </figure>
</template>
