<script setup lang="ts">
import { Code2, ChevronDown } from '@lucide/vue';
import { ref, useId } from 'vue';
defineProps<{ preview: { language: string; code: string } }>();
const id = useId();
const open = ref(false);
const hovering = ref(false);
</script>

<template>
  <div class="article-preview" @pointerenter="hovering = $event.pointerType === 'mouse'" @pointerleave="hovering = false" @keydown.esc="open = false; hovering = false">
    <button type="button" :aria-expanded="open || hovering" :aria-controls="id" aria-label="预览代码片段" @click="open = !open" @focus="hovering = true" @blur="hovering = false">
      <Code2 :size="15" aria-hidden="true" /> <span>{{ preview.language }} · 代码片段</span><ChevronDown :size="15" aria-hidden="true" />
    </button>
    <pre v-show="open || hovering" :id="id" tabindex="0"><code>{{ preview.code }}</code></pre>
  </div>
</template>
