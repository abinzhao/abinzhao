<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import LabPreview from '../components/LabPreview.vue';
import { createFrameLoop } from '../composables/motion-policy';
import { useMotionPolicy } from '../composables/use-motion-policy';
import type { LabRenderer, RenderInput } from './renderer-types';
import { createFrameBudget } from './frame-budget';

const props = defineProps<{ kind: 'particles' | 'spectral' }>();
const motion = useMotionPolicy();
const surface = ref<HTMLElement>();
const surfaceHeight = ref(0);
const state = ref<'loading' | 'running' | 'paused' | 'static' | 'error'>('loading');
const backend = ref('');
const message = ref('');
const count = ref(512);
const maximum = ref(8192);
const mode = ref(0);
const material = ref(0);
const speed = ref(1);
const roughness = ref(.2);
const lightX = ref(.65);
const lightY = ref(.65);
const isParticle = computed(() => props.kind === 'particles');
let renderer: LabRenderer | undefined;
let abort: AbortController | undefined;
let release: (() => void) | undefined;
let intersection: IntersectionObserver | undefined;
let resize: ResizeObserver | undefined;
let theme: MutationObserver | undefined;
let onScreen = true;
let disposed = false;
let dpr = 1;
const frameBudget = createFrameBudget();
let pointerActive = false;
let x = .65; let y = .65;
let palette: Pick<RenderInput, 'dark' | 'accent'> = { dark: true, accent: [.48, .84, .77] };

const input = (): RenderInput => ({ mode: Number(mode.value), speed: Number(speed.value), x, y, active: pointerActive, roughness: Number(roughness.value), material: Number(material.value), ...palette });
function draw(delta = 0) {
  if (!renderer || !onScreen || !motion.visible.value) return;
  const blend = delta ? 1 - Math.exp(-delta * 12) : 1;
  x += (Number(lightX.value) - x) * blend; y += (Number(lightY.value) - y) * blend;
  try { renderer.draw(delta, input()); } catch { failure('绘制已停止。可重新初始化图形上下文。'); }
}
const loop = createFrameLoop((delta, time) => {
  draw(delta);
  if (state.value !== 'running') return;
  const adjustment = frameBudget.observe(time, dpr);
  if (adjustment === 'lower') { dpr = Math.max(.75, dpr - .25); measure(); }
  else if (adjustment === 'static') {
    disposeRenderer(); state.value = 'static';
    message.value = '画面持续低于流畅帧率，已切换为静态预览。可手动继续。';
  }
});
function pause(reason = '已暂停，可继续。') {
  loop.pause(); frameBudget.reset(); abort?.abort(); abort = undefined;
  release?.(); release = undefined;
  if (state.value === 'running' || state.value === 'loading') { state.value = 'paused'; message.value = reason; }
}
function disposeRenderer() {
  pause(); renderer?.destroy(); renderer?.canvas.remove(); renderer = undefined; backend.value = '';
}
function failure(reason: string) {
  disposeRenderer(); state.value = 'error'; message.value = reason;
}
function measure() {
  if (!surface.value || !renderer) return;
  surfaceHeight.value = surface.value.clientHeight;
  renderer.resize(surface.value.clientWidth, surfaceHeight.value, dpr);
  draw();
}
function readTheme() {
  palette.dark = document.documentElement.dataset.theme === 'dark';
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--site-accent').trim();
  if (/^#[0-9a-f]{6}$/i.test(accent)) palette.accent = [1, 3, 5].map((index) => parseInt(accent.slice(index, index + 2), 16) / 255) as [number, number, number];
  draw();
}
async function start() {
  if (disposed || !surface.value) return;
  if (!motion.policy.value.motion) { disposeRenderer(); state.value = 'static'; message.value = '动态效果已精简，保留静态预览与参数说明。'; return; }
  if (!onScreen || !motion.visible.value) return;
  const lease = motion.gate.acquire(() => pause('已暂停：另一个实验或本地模型正在使用计算资源。'));
  if (!lease) { state.value = 'paused'; message.value = '本地模型正在运行，结束后可继续实验。'; return; }
  release = lease;
  if (renderer) { state.value = 'running'; message.value = ''; loop.resume(); return; }
  const controller = new AbortController(); abort = controller;
  state.value = 'loading'; message.value = '正在初始化图形上下文…';
  try {
    let next: LabRenderer;
    if (isParticle.value) {
      const module = await import('./particle-renderer');
      if (controller.signal.aborted) return;
      next = await module.createParticleRenderer(surface.value, count.value, controller.signal, failure);
    } else {
      const module = await import('./spectral-renderer');
      if (controller.signal.aborted) return;
      next = module.createSpectralRenderer(surface.value, failure);
    }
    if (disposed || controller.signal.aborted) { next.destroy(); next.canvas.remove(); return; }
    // 初始化取消只作用于启动过程；暂停保留已就绪的上下文供显式继续。
    abort = undefined;
    renderer = next; backend.value = next.backend; maximum.value = next.maxCount;
    count.value = Math.min(count.value, next.maxCount || count.value);
    next.canvas.setAttribute('role', 'img');
    next.canvas.setAttribute('aria-label', isParticle.value ? '可交互代码粒子场' : '程序化光谱材质');
    next.canvas.style.width = '100%'; next.canvas.style.height = '100%'; next.canvas.style.display = 'block';
    readTheme(); measure();
    if (renderer) { state.value = 'running'; message.value = ''; loop.resume(); }
  } catch (error) {
    if (!controller.signal.aborted && !disposed) failure(error instanceof Error ? error.message : '实验初始化失败，请重试。');
  }
}
function reset() {
  pause('已重置到确定性初态。');
  mode.value = 0; material.value = 0; speed.value = 1; roughness.value = .2; lightX.value = lightY.value = .65;
  x = y = .65; pointerActive = false;
  renderer?.reset(count.value); draw();
}
function pointer(event: PointerEvent) {
  if (event.pointerType !== 'mouse' && !event.isPrimary) return;
  // 触摸仅响应点击，纵向拖动交给页面；滑块提供不依赖手势的等价操作。
  if (event.type === 'pointermove' && event.pointerType !== 'mouse') return;
  const rect = surface.value!.getBoundingClientRect();
  lightX.value = Math.max(-1.5, Math.min(1.5, (event.clientX - rect.left - rect.width / 2) / (rect.height / 2)));
  lightY.value = Math.max(-1, Math.min(1, -(event.clientY - rect.top - rect.height / 2) / (rect.height / 2)));
  pointerActive = true;
  if (state.value === 'paused') draw();
}
watch([mode, speed, roughness, material, lightX, lightY], () => { if (state.value === 'paused') draw(); });
watch(count, () => { renderer?.reset(Number(count.value)); draw(); });
watch([motion.policy, motion.visible], ([policy, visible]) => {
  if (!policy.motion) { disposeRenderer(); state.value = 'static'; message.value = '动态效果已精简，保留静态预览与参数说明。'; }
  else if (!visible) pause('页面进入后台，已暂停。');
});
onMounted(() => {
  count.value = motion.policy.value.quality === 'high' ? 2048 : 512;
  dpr = Math.min(devicePixelRatio || 1, motion.policy.value.quality === 'high' ? 1.5 : 1);
  intersection = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; if (!onScreen) pause('画布离开视口，已暂停。'); });
  intersection.observe(surface.value!);
  resize = new ResizeObserver(measure); resize.observe(surface.value!);
  theme = new MutationObserver(readTheme); theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  void start();
});
onBeforeUnmount(() => { disposed = true; disposeRenderer(); loop.dispose(); intersection?.disconnect(); resize?.disconnect(); theme?.disconnect(); });
</script>

<template>
  <div class="gpu-experiment" :data-state="state" :data-backend="backend">
    <div ref="surface" class="gpu-surface" @pointerdown="pointer" @pointermove="pointer" @pointerleave="pointerActive = false">
      <LabPreview v-if="!backend" :id="kind" />
      <div v-if="!isParticle && backend" class="light-marker" :style="{ left: `calc(50% + ${Number(lightX) * surfaceHeight / 2}px)`, top: `${50 - Number(lightY) * 50}%` }" aria-hidden="true">+</div>
    </div>
    <div class="lab-controls">
      <button v-if="state === 'running'" class="button" @click="pause()">暂停</button>
      <button v-else class="button" :disabled="state === 'loading' || !motion.policy.value.motion" @click="start">{{ state === 'error' ? '重新初始化' : state === 'loading' ? '正在初始化…' : '继续' }}</button>
      <button class="button button--secondary" :disabled="!backend" @click="reset">重置</button>
      <template v-if="isParticle">
        <label>演化<select v-model.number="mode" aria-label="粒子演化"><option :value="0">聚合</option><option :value="1">流动</option><option :value="2">回归</option></select></label>
        <label>密度<select v-model.number="count" aria-label="粒子数量"><option v-for="n in [512, 1024, 2048, 4096, 8192].filter(n => n <= maximum)" :key="n" :value="n">{{ n }}</option></select></label>
        <label>速度<input v-model.number="speed" type="range" min=".25" max="2" step=".25" aria-label="粒子速度"></label>
      </template>
      <template v-else>
        <label>材质<select v-model.number="material" aria-label="材质"><option :value="0">玻璃</option><option :value="1">薄膜</option><option :value="2">金属</option></select></label>
        <label>粗糙度<input v-model.number="roughness" type="range" min=".05" max=".9" step=".05" aria-label="粗糙度"></label>
      </template>
    </div>
    <div class="lab-controls gpu-input">
      <label>{{ isParticle ? '扰动' : '光源' }} X<input v-model.number="lightX" type="range" min="-1.5" max="1.5" step=".05" :aria-label="isParticle ? '扰动横向位置' : '光源横向位置'" @input="pointerActive = true"></label>
      <label>Y<input v-model.number="lightY" type="range" min="-1" max="1" step=".05" :aria-label="isParticle ? '扰动纵向位置' : '光源纵向位置'" @input="pointerActive = true"></label>
    </div>
    <p class="lab-status" role="status"><template v-if="backend">{{ backend }} · {{ isParticle ? `${count} 粒子${backend === 'Canvas2D' ? ' · 低密度降级' : ' · compute + render'}` : '程序化材质 · 光学视觉近似' }} · </template>{{ message || '运行中' }}</p>
    <p v-if="state !== 'static'" class="lab-status">{{ isParticle ? '移动指针或点击画布扰动粒子；回归模式重新形成代码符号。' : '移动指针或点击画布调整光源；滑块也可用键盘操作。' }}</p>
  </div>
</template>

<style scoped>
.gpu-surface{position:relative;height:clamp(230px,32vw,410px);overflow:hidden;background:radial-gradient(ellipse at center,var(--vp-c-brand-soft),transparent 72%);touch-action:pan-y}
.gpu-surface>.lab-preview{position:absolute;inset:0}
.light-marker{position:absolute;color:var(--site-accent);font:20px var(--vp-font-family-mono);pointer-events:none;transform:translate(-50%,-50%)}
.gpu-input{border-top:0;padding-top:0}
.lab-controls select{appearance:auto;background:var(--site-bg);border:1px solid var(--site-border);border-radius:6px;color:var(--site-text);padding:0 .5rem}
.lab-controls input{width:110px}
@media(max-width:600px){.gpu-surface{height:250px}.lab-controls{gap:.5rem;padding:.75rem}.lab-controls label{font-size:13px}}
</style>
