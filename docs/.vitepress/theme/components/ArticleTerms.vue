<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId } from 'vue';
defineProps<{ terms: Array<{ term: string; definition: string }> }>();
const id = useId().replace(/[^a-z0-9-]/gi, '');
const enhanced = ref(false);
const anchored = ref(false);
let removeResize: (() => void) | undefined;
onMounted(() => {
  const desktop = matchMedia('(min-width: 768px)');
  const update = () => { enhanced.value = 'showPopover' in HTMLElement.prototype && desktop.matches; };
  update();
  desktop.addEventListener('change', update);
  removeResize = () => desktop.removeEventListener('change', update);
  anchored.value = CSS.supports('anchor-name: --term') && CSS.supports('top: anchor(bottom)');
});
onBeforeUnmount(() => removeResize?.());
function open(event: MouseEvent) {
  if (!enhanced.value) return;
  event.preventDefault();
  const trigger = event.currentTarget as HTMLElement;
  const panel = trigger.nextElementSibling as HTMLElement;
  if (!anchored.value) {
    const rect = trigger.getBoundingClientRect();
    panel.style.left = `${Math.max(16, Math.min(rect.left, innerWidth - 376))}px`;
    panel.style.top = `${Math.max(16, Math.min(rect.bottom + 8, innerHeight - 250))}px`;
  }
  panel.togglePopover();
}
function close(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  const panel = event.currentTarget as HTMLElement;
  panel.hidePopover?.();
  (panel.previousElementSibling as HTMLElement)?.focus();
}
</script>
<template>
  <div class="article-terms" aria-label="术语速查">
    <span>术语速查</span>
    <template v-for="(entry, index) in terms" :key="entry.term">
      <template v-if="enhanced">
      <button type="button" class="term-trigger" :popovertarget="`term-panel-${id}-${index}`" :style="{ anchorName: `--term-${id}-${index}` }" @click="open">{{ entry.term }}</button>
      <div :id="`term-panel-${id}-${index}`" class="term-panel" :class="{ 'term-panel--anchored': anchored }"
        :style="{ positionAnchor: `--term-${id}-${index}` }"
        popover="auto" tabindex="-1" @keydown="close">
        <strong>{{ entry.term }}</strong><p>{{ entry.definition }}</p>
        <button type="button" class="button" @click="(event) => { const panel = (event.currentTarget as HTMLElement).parentElement!; panel.hidePopover(); (panel.previousElementSibling as HTMLElement).focus(); }">关闭说明</button>
      </div>
      </template>
      <details v-else>
        <summary>{{ entry.term }}</summary>
        <div class="term-panel"><strong>{{ entry.term }}</strong><p>{{ entry.definition }}</p></div>
      </details>
    </template>
  </div>
</template>
<style>
.article-terms { display: flex; flex-wrap: wrap; align-items: start; gap: 4px 12px; margin-top: 12px; font-size: 13px; }
.article-terms > span { line-height: 44px; color: var(--site-text-muted); }
.article-terms summary, .term-trigger { min-height: 44px; padding: 10px 4px; color: var(--site-accent); cursor: pointer; text-decoration: underline dotted; text-underline-offset: 5px; background: transparent; border: 0; font: inherit; }
.term-panel { padding: 18px; border: 1px solid var(--site-border); border-radius: var(--radius-card); background: var(--site-surface); color: var(--site-text); line-height: 1.8; max-width: 360px; }
.term-panel p { margin: 8px 0; }
.term-panel[popover] { position: fixed; inset: auto; margin: 0; width: min(360px, calc(100vw - 32px)); box-shadow: var(--site-shadow); }
.term-panel[popover].term-panel--anchored { left: anchor(left); top: anchor(bottom); margin-top: 8px; position-try-fallbacks: flip-block, flip-inline; }
@supports (transition-behavior: allow-discrete) {
  .term-panel[popover] { transition: opacity 160ms, transform 160ms, display 160ms allow-discrete, overlay 160ms allow-discrete; opacity: 0; transform: translateY(-4px); }
  .term-panel:popover-open { opacity: 1; transform: none; }
  @starting-style { .term-panel:popover-open { opacity: 0; transform: translateY(-4px); } }
}
@media (max-width: 767px) { .article-terms details[open] { flex-basis: 100%; } .term-panel { max-width: none; } }
</style>
