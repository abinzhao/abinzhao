<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vitepress';
import { copyCode, extractCode } from '../utils/code-copy';

const route = useRoute();
const progress = ref(0);
const quiet = ref(false);
const systemReduced = ref(false);
const nearBottom = ref(false);
let observer: IntersectionObserver | undefined;
let media: MediaQueryList | undefined;
let scrollFrame = 0;
const copyTimers = new Map<HTMLButtonElement, ReturnType<typeof setTimeout>>();
const copyMessage = ref('');
let messageTimer: ReturnType<typeof setTimeout> | undefined;

async function handleCopy(event: MouseEvent) {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>('div[class*="language-"] > button.copy');
  if (!button) return;
  // Default VitePress 1.6.4 misses asynchronous permission rejection.
  event.stopImmediatePropagation();
  const success = await copyCode(extractCode(button.parentElement!));
  clearTimeout(copyTimers.get(button));
  button.classList.toggle('copied', success);
  button.setAttribute('aria-label', success ? '代码已复制' : '复制失败，请手动选择代码');
  copyMessage.value = success ? '代码已复制' : '浏览器禁止复制，请手动选择代码。';
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { copyMessage.value = ''; }, 2400);
  copyTimers.set(button, setTimeout(() => {
    button.classList.remove('copied');
    button.setAttribute('aria-label', '复制代码');
    copyTimers.delete(button);
  }, 2000));
}

function measure() {
  scrollFrame = 0;
  const max = document.documentElement.scrollHeight - innerHeight;
  progress.value = max > 0 ? Math.min(scrollY / max, 1) : 0;
  nearBottom.value = scrollY > 600;
}
function onScroll() {
  if (!scrollFrame) scrollFrame = requestAnimationFrame(measure);
}
function applyPreference() {
  systemReduced.value = !!media?.matches;
  document.documentElement.classList.toggle('quiet-motion', quiet.value || systemReduced.value);
}
function preferenceChanged() {
  applyPreference();
  reveal();
}
function backToTop() {
  window.scrollTo({ top: 0, behavior: quiet.value || media?.matches ? 'instant' : 'smooth' });
}
async function reveal() {
  observer?.disconnect();
  await nextTick();
  measure();
  document.querySelectorAll('button.copy').forEach((button) => button.setAttribute('aria-label', '复制代码'));
  if (quiet.value || media?.matches) return;
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      observer?.unobserve(entry.target);
    }
  }, { threshold: 0.08 });
  document.querySelectorAll('.reveal, .catalog-group, .concept-flow').forEach((element) => {
    element.classList.add('motion-reveal');
    observer?.observe(element);
  });
}
function toggle() {
  quiet.value = !quiet.value;
  try { localStorage.setItem('tutorial-quiet-motion', String(quiet.value)); } catch { /* Storage may be disabled. */ }
  applyPreference();
  reveal();
}
watch(() => route.path, reveal);
onMounted(() => {
  try { quiet.value = localStorage.getItem('tutorial-quiet-motion') === 'true'; } catch { /* Use animation preference from the operating system. */ }
  media = matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', preferenceChanged);
  applyPreference();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  window.addEventListener('click', handleCopy, true);
  reveal();
});
onUnmounted(() => {
  observer?.disconnect();
  cancelAnimationFrame(scrollFrame);
  media?.removeEventListener('change', preferenceChanged);
  window.removeEventListener('scroll', onScroll);
  window.removeEventListener('resize', onScroll);
  window.removeEventListener('click', handleCopy, true);
  copyTimers.forEach(clearTimeout);
  clearTimeout(messageTimer);
});
</script>

<template>
  <div class="reading-progress" :style="{ transform: `scaleX(${progress})` }" aria-hidden="true" />
  <div class="doc-motion-tools">
    <button type="button" :disabled="systemReduced" :aria-pressed="quiet || systemReduced" @click="toggle">{{ systemReduced ? '动态：系统减少' : quiet ? '动态：关闭' : '动态：开启' }}</button>
    <button v-if="nearBottom" type="button" aria-label="返回页面顶部" @click="backToTop">↑</button>
  </div>
  <p v-if="copyMessage" class="code-copy-message" role="status">{{ copyMessage }}</p>
</template>
