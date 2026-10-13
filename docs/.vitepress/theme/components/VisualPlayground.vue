<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

const modes = ['渐变流光', '粒子网络', '弹性缓动', 'Grid 布局'] as const;
const mode = ref<(typeof modes)[number]>('渐变流光');
const speed = ref(4);
const density = ref(60);
const columns = ref(3);
const paused = ref(false);
const reduced = ref(false);
const canvas = ref<HTMLCanvasElement>();
const host = ref<HTMLElement>();
const phase = ref(0);
const frameStyle = computed(() => ({ '--play-duration': `${12 / speed.value}s`, '--play-columns': columns.value }));
let frame = 0;
let resizeObserver: ResizeObserver | undefined;
let visibilityObserver: IntersectionObserver | undefined;
let media: MediaQueryList | undefined;
let active = true;
let previous = 0;
let particles: Array<{ x: number; y: number; vx: number; vy: number }> = [];
let width = 1;
let height = 1;

function seedParticles() {
  particles = Array.from({ length: density.value }, (_, index) => ({
    x: ((index * 137.508) % 100) / 100 * width,
    y: ((index * 71.19) % 100) / 100 * height,
    vx: Math.sin(index * 2.4) * 22,
    vy: Math.cos(index * 1.9) * 22,
  }));
}

function paint(delta: number) {
  const context = canvas.value?.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, width, height);
  for (let index = 0; index < particles.length; index++) {
    const point = particles[index];
    point.x = (point.x + point.vx * delta * speed.value + width) % width;
    point.y = (point.y + point.vy * delta * speed.value + height) % height;
    for (let next = index + 1; next < particles.length; next++) {
      const other = particles[next];
      const distance = Math.hypot(point.x - other.x, point.y - other.y);
      if (distance >= 90) continue;
      context.strokeStyle = `rgba(120, 180, 255, ${(1 - distance / 90) * 0.5})`;
      context.beginPath();
      context.moveTo(point.x, point.y);
      context.lineTo(other.x, other.y);
      context.stroke();
    }
    context.fillStyle = index % 3 ? '#8faaff' : '#61e2c8';
    context.beginPath();
    context.arc(point.x, point.y, index % 5 ? 1.8 : 3, 0, Math.PI * 2);
    context.fill();
  }
}

function draw(time: number) {
  frame = 0;
  const delta = previous ? Math.min((time - previous) / 1000, 0.04) : 0;
  previous = time;
  if (mode.value === '粒子网络') paint(paused.value || reduced.value ? 0 : delta);
  if (active && !document.hidden && !paused.value && !reduced.value && mode.value === '粒子网络') {
    frame = requestAnimationFrame(draw);
  }
}

function sync() {
  cancelAnimationFrame(frame);
  frame = 0;
  previous = 0;
  if (active && !document.hidden && mode.value === '粒子网络') {
    paint(0);
    if (!paused.value && !reduced.value) frame = requestAnimationFrame(draw);
  }
}

function resize() {
  if (!canvas.value || !host.value) return;
  width = host.value.clientWidth;
  height = 280;
  const ratio = Math.min(devicePixelRatio, 2);
  canvas.value.width = Math.round(width * ratio);
  canvas.value.height = Math.round(height * ratio);
  canvas.value.getContext('2d')?.setTransform(ratio, 0, 0, ratio, 0, 0);
  seedParticles();
  sync();
}

function preference() {
  reduced.value = !!media?.matches || document.documentElement.classList.contains('quiet-motion');
  sync();
}

let motionObserver: MutationObserver | undefined;
watch([mode, paused], sync);
watch(density, () => { seedParticles(); sync(); });
onMounted(() => {
  media = matchMedia('(prefers-reduced-motion: reduce)');
  preference();
  media.addEventListener('change', preference);
  motionObserver = new MutationObserver(preference);
  motionObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  resizeObserver = new ResizeObserver(resize);
  if (host.value) resizeObserver.observe(host.value);
  visibilityObserver = new IntersectionObserver(([entry]) => { active = entry.isIntersecting; sync(); });
  if (host.value) visibilityObserver.observe(host.value);
  document.addEventListener('visibilitychange', sync);
});
onUnmounted(() => {
  cancelAnimationFrame(frame);
  resizeObserver?.disconnect();
  visibilityObserver?.disconnect();
  motionObserver?.disconnect();
  media?.removeEventListener('change', preference);
  document.removeEventListener('visibilitychange', sync);
});
</script>

<template>
  <div ref="host" class="visual-playground" :style="frameStyle">
    <div class="play-tabs" role="group" aria-label="选择特效演示">
      <button v-for="item in modes" :key="item" type="button" :aria-pressed="mode === item" @click="mode = item">{{ item }}</button>
    </div>
    <div class="play-scene" :class="{ 'play-scene--paused': paused || reduced, 'play-scene--grid': mode === 'Grid 布局' }">
      <div v-show="mode === '渐变流光'" class="play-aurora">
        <div class="play-orb play-orb--one" /><div class="play-orb play-orb--two" />
        <div class="play-glass"><span>CSS / LIVE</span><strong>让光，流动起来。</strong><small>渐变 · 模糊 · 层叠 · 时间</small></div>
      </div>
      <canvas v-show="mode === '粒子网络'" ref="canvas" aria-label="粒子距离小于 90 像素时连线的实时动画" />
      <div v-show="mode === '弹性缓动'" class="play-easing">
        <span>linear</span><div><i :class="{ moved: phase % 2 }" style="transition-timing-function: linear" /></div>
        <span>ease-out</span><div><i :class="{ moved: phase % 2 }" style="transition-timing-function: ease-out" /></div>
        <span>spring</span><div><i :class="{ moved: phase % 2 }" style="transition-timing-function: cubic-bezier(.34, 1.56, .64, 1)" /></div>
        <button type="button" @click="phase++">运行缓动对比 →</button>
      </div>
      <div v-show="mode === 'Grid 布局'" class="play-grid">
        <span v-for="index in 6" :key="index">0{{ index }}</span>
      </div>
      <span class="play-status">{{ reduced ? '减少动态模式' : paused ? '已暂停' : '实时预览' }}</span>
    </div>
    <div class="play-controls">
      <label v-if="mode !== 'Grid 布局'">速度 <output>{{ speed }}</output><input v-model.number="speed" aria-label="动画速度" type="range" min="1" max="8" /></label>
      <label v-if="mode === '粒子网络'">粒子数量 <output>{{ density }}</output><input v-model.number="density" aria-label="粒子数量" type="range" min="20" max="120" step="10" /></label>
      <label v-if="mode === 'Grid 布局'">列数 <output>{{ columns }}</output><input v-model.number="columns" aria-label="Grid 列数" type="range" min="1" max="4" /></label>
      <button type="button" :disabled="reduced || mode === 'Grid 布局' || mode === '弹性缓动'" :aria-pressed="paused" @click="paused = !paused">{{ paused ? '继续动画' : '暂停动画' }}</button>
    </div>
    <p class="play-caption">调整参数观察结果，再到对应章节理解实现。粒子连线采用 O(n²) 比较；数量上限控制在 120。</p>
  </div>
</template>
