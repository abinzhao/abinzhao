<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { data as steps } from '../../data/code-morph.data';
import { useFlip } from '../composables/use-flip';
import { useMotionPolicy } from '../composables/use-motion-policy';

const step = ref(0);
const progress = ref(45);
const code = ref<HTMLElement>();
const root = ref<HTMLElement>();
const playing = ref(0);
const copied = ref('');
const current = computed(() => steps[step.value]);
const motion = useMotionPolicy();
useFlip(code, step, '[data-flip]');
let timer: ReturnType<typeof setTimeout> | undefined;
let observer: IntersectionObserver | undefined;
const pause = () => { clearTimeout(timer); playing.value = 0; };
function choose(value: number) { pause(); step.value = Math.max(0, Math.min(steps.length - 1, value)); copied.value = ''; }
function play(direction: number) {
  pause();
  playing.value = direction;
  const advance = () => {
    const next = step.value + direction;
    if (next < 0 || next >= steps.length) return pause();
    step.value = next;
    if (next === 0 || next === steps.length - 1) pause();
    else timer = setTimeout(advance, 1500);
  };
  timer = setTimeout(advance, 800);
}
const preview = computed(() => `<!doctype html><html><head><style>body{margin:0;padding:32px 20px;background:transparent}.track{border-radius:8px}.signal{border-radius:3px}${current.value.source}</style></head><body style="--progress:${progress.value / 100}"><div class="track"><div class="signal"></div></div></body></html>`);
async function copy() {
  try { await navigator.clipboard.writeText(current.value.source); copied.value = '源码已复制'; }
  catch { copied.value = '复制不可用，请选中代码手动复制。'; }
}
watch(step, () => { copied.value = ''; });
watch([motion.policy, motion.visible], ([policy, visible]) => { if (!policy.motion || !visible) pause(); });
onMounted(() => {
  observer = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) pause(); });
  if (root.value) observer.observe(root.value);
});
onBeforeUnmount(() => { pause(); observer?.disconnect(); });
</script>

<template>
  <div ref="root" class="code-morph">
    <div class="lab-controls">
      <button class="button button--secondary" :disabled="step === 0" @click="choose(step - 1)">上一步</button>
      <button class="button button--secondary" :disabled="step === steps.length - 1" @click="choose(step + 1)">下一步</button>
      <template v-if="!playing">
        <button class="button" :disabled="step === steps.length - 1" @click="play(1)">播放</button>
        <button class="button" :disabled="step === 0" @click="play(-1)">反向播放</button>
      </template>
      <button v-else class="button" @click="pause">暂停</button>
      <label>步骤 {{ step + 1 }} / {{ steps.length }} <input :value="step" type="range" min="0" :max="steps.length - 1" aria-label="代码步骤" @input="choose(Number(($event.target as HTMLInputElement).value))"></label>
    </div>
    <div class="morph-columns">
      <section class="morph-code" aria-label="当前步骤源码">
        <div class="morph-file"><span>{{ current.file }}</span><button @click="copy">复制当前源码</button></div>
        <pre ref="code" class="morph-source" tabindex="0"><code><template v-for="token in current.tokens" :key="token.id"><template v-if="token.kind === 'space'">{{ token.text }}</template><span v-else :data-flip="token.id" :class="`token-${token.kind}`">{{ token.text }}</span></template></code></pre>
      </section>
      <section class="morph-preview">
        <p class="technical-label">LIVE / 同源样式</p>
        <iframe title="同源 CSS 预览" sandbox="" :srcdoc="preview"></iframe>
        <label>预览进度 {{ progress }}%<input v-model="progress" type="range" min="5" max="100" aria-label="预览进度"></label>
        <h2>{{ current.title }}</h2><p>{{ current.explanation }}</p>
      </section>
    </div>
    <p class="lab-status" role="status">{{ copied || `当前步骤 ${step + 1}：${current.title}。改变右侧进度可核对 CSS 的实际输出。` }}</p>
  </div>
</template>

<style scoped>
.morph-columns{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);border-top:1px solid var(--site-border)}
.morph-code{min-width:0;background:var(--site-code-bg)}
.morph-file{display:flex;justify-content:space-between;align-items:center;gap:.5rem;padding:.5rem 1rem;color:var(--site-text-muted);font:13px var(--vp-font-family-mono);border-bottom:1px solid var(--site-border)}
.morph-file button{min-height:44px;color:var(--site-accent);flex-shrink:0}
.morph-source{margin:0;min-height:350px;max-height:520px;overflow:auto;padding:1.5rem;font:14px/1.9 var(--vp-font-family-mono);tab-size:2}
.morph-source span{display:inline-block;white-space:pre}
.token-word{color:var(--site-accent)}.token-number{color:var(--site-warm)}
.morph-preview{padding:1.5rem;min-width:0}
.morph-preview iframe{width:100%;height:164px;border:0;border-radius:8px;background:var(--site-bg)}
.morph-preview label{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;font-size:14px}
.morph-preview input{min-height:44px;accent-color:var(--site-accent);max-width:100%}
.morph-preview h2{font-size:1.4rem;line-height:1.4;margin:1.5rem 0 .75rem}
.morph-preview p{font-size:14px;line-height:1.8;color:var(--site-text-muted)}
.lab-status{padding-top:1rem}
@media(max-width:760px){.morph-columns{grid-template-columns:minmax(0,1fr)}.morph-source{min-height:0;max-height:320px;padding:1rem}.morph-preview{padding:1rem}}
</style>
