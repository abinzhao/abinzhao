<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useMotionPolicy } from '../composables/use-motion-policy';
const stages = [
  { id: 'dom', label: 'DOM', detail: '解析文档，建立节点树。DOM 表达内容结构，本身不包含最终屏幕像素。' },
  { id: 'style', label: 'Style', detail: '层叠、继承与选择器匹配得到计算样式。样式变化可能只影响绘制，也可能改变布局。' },
  { id: 'layout', label: 'Layout', detail: '计算盒子的尺寸与位置。width 改变布局宽度；读取几何属性还可能强制同步布局。' },
  { id: 'paint', label: 'Paint', detail: '生成绘制记录并栅格化。颜色、阴影等变化可能触发重绘，合成优化不能免除首次绘制。' },
  { id: 'composite', label: 'Composite', detail: '把已绘制的层合成到屏幕。满足条件的 transform 动画可以复用栅格结果；独立合成并非 CSS 的保证。' },
];
const step = ref(0);
const mode = ref('manual');
const progress = ref(45);
const running = ref(false);
const root = ref<HTMLElement>();
const scroller = ref<HTMLElement>();
const widthSignal = ref<HTMLElement>();
const transformSignal = ref<HTMLElement>();
const motion = useMotionPolicy();
const current = computed(() => stages[step.value]);
let animations: Animation[] = [];
let observer: IntersectionObserver | undefined;
let frame = 0;
const pause = () => { animations.forEach((animation) => animation.pause()); running.value = false; };
const clear = () => { animations.forEach((animation) => animation.cancel()); animations = []; running.value = false; };
function hash() {
  const index = stages.findIndex((stage) => `#${stage.id}` === location.hash);
  if (index >= 0) { step.value = index; mode.value = 'manual'; }
}
function select(index: number, fromScroll = false) {
  if (!fromScroll) { mode.value = 'manual'; pause(); }
  else if (index !== step.value) pause();
  step.value = index;
  history.replaceState(history.state, '', `#${stages[index].id}`);
}
function scroll() {
  if (mode.value !== 'scroll' || frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const element = scroller.value;
    if (!element) return;
    select(Math.min(4, Math.floor((element.scrollTop / Math.max(1, element.scrollHeight - element.clientHeight)) * 4.999)), true);
  });
}
function play() {
  if (!motion.policy.value.motion || !widthSignal.value || !transformSignal.value) return;
  if (!animations.length) {
    const timing = { duration: 1800, direction: 'alternate' as const, iterations: Infinity, easing: 'ease-in-out' };
    animations = [
      widthSignal.value.animate([{ width: '10%' }, { width: '90%' }], timing),
      transformSignal.value.animate([{ transform: 'scaleX(.1)' }, { transform: 'scaleX(.9)' }], timing),
    ];
  }
  animations.forEach((animation) => animation.play());
  running.value = true;
}
watch(progress, clear);
watch([motion.policy, motion.visible], ([policy, visible]) => { if (!policy.motion) clear(); else if (!visible) pause(); });
onMounted(() => {
  hash();
  window.addEventListener('hashchange', hash);
  window.addEventListener('popstate', hash);
  observer = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) pause(); });
  if (root.value) observer.observe(root.value);
});
onBeforeUnmount(() => { clear(); cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('hashchange', hash); window.removeEventListener('popstate', hash); });
</script>

<template>
  <div ref="root" class="pipeline">
    <div class="lab-controls">
      <button v-for="(stage, index) in stages" :id="stage.id" :key="stage.id" class="filter-button" :class="{ 'filter-button--active': step === index }" :aria-pressed="step === index" @click="select(index)">{{ stage.label }}</button>
      <label>驱动方式<select v-model="mode" aria-label="管线驱动方式"><option value="manual">手动步骤</option><option value="scroll">局部滚动</option></select></label>
    </div>
    <div class="pipeline-scene">
      <svg viewBox="0 0 600 130" role="img" :aria-label="`渲染管线，当前 ${current.label}`">
        <path d="M55 50H545" stroke="var(--site-border)" stroke-width="2" />
        <path :d="`M55 50H${55 + step * 122}`" stroke="var(--site-accent)" stroke-width="3" />
        <g v-for="(stage, index) in stages" :key="stage.id" :transform="`translate(${55 + index * 122} 50)`">
          <circle r="20" :fill="index <= step ? 'var(--site-accent)' : 'var(--site-surface)'" stroke="var(--site-accent)" />
          <text y="5" text-anchor="middle" :fill="index <= step ? 'var(--site-bg)' : 'var(--site-text)'">{{ index + 1 }}</text>
          <text y="48" text-anchor="middle" fill="var(--site-text)">{{ stage.label }}</text>
        </g>
      </svg>
      <h2>{{ current.label }}</h2><p aria-live="polite">{{ current.detail }}</p>
      <p class="pipeline-note">概念图，不是浏览器内部实时追踪。管线可跳过未受影响的阶段，不代表每帧完整执行五步。</p>
    </div>
    <div v-if="mode === 'scroll'" ref="scroller" class="pipeline-scroll" tabindex="0" aria-label="滚动探索渲染阶段" @scroll.passive="scroll">
      <div class="pipeline-scroll__meter" aria-hidden="true"></div>
      <section v-for="stage in stages" :key="stage.id"><strong>{{ stage.label }}</strong><p>{{ stage.detail }}</p></section>
    </div>
    <section class="pipeline-demo" aria-label="真实 CSS 动画对照">
      <div><span>width · 布局尺寸改变</span><div class="pipeline-track"><div ref="widthSignal" data-comparison="width" class="pipeline-signal" :style="{ width: `${progress}%` }"></div></div></div>
      <div><span>transform · 布局尺寸保持</span><div class="pipeline-track"><div ref="transformSignal" data-comparison="transform" class="pipeline-signal" :style="{ transform: `scaleX(${progress / 100})` }"></div></div></div>
    </section>
    <div class="lab-controls">
      <button v-if="!running" class="button" :disabled="!motion.policy.value.motion" @click="play">播放对照</button>
      <button v-else class="button" @click="pause">暂停对照</button>
      <button class="button button--secondary" @click="clear(); progress = 45">重置</button>
      <label>手动进度 {{ progress }}%<input v-model="progress" type="range" min="5" max="95" aria-label="对照进度"></label>
    </div>
    <p v-if="!motion.policy.value.motion" class="lab-status">动态效果已精简，可手动调整对照进度。</p>
    <p class="lab-status">播放后可在开发者工具 Performance 录制同一时间窗口，对照 Layout / Paint 事件；此处不显示未经测量的 FPS 或提升比例。</p>
  </div>
</template>

<style scoped>
.pipeline-scene{padding:1rem 2rem;border-top:1px solid var(--site-border)}
.pipeline-scene svg{display:block;width:100%;max-width:800px;margin:auto;font:14px var(--vp-font-family-mono)}
.pipeline-scene h2{font:600 1.5rem var(--vp-font-family-mono)}
.pipeline-scene p{font-size:15px;line-height:1.8;max-width:54rem}
.pipeline-scene .pipeline-note{font-size:13px;color:var(--site-text-muted)}
.pipeline-demo{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;padding:1rem 2rem 2rem}
.pipeline-demo span{font-size:13px;color:var(--site-text-muted)}
.pipeline-track{padding:12px;background:var(--site-bg);margin-top:.75rem;border-radius:8px}
.pipeline-signal{height:32px;width:100%;background:var(--site-accent);border-radius:3px;transform-origin:left}
.pipeline-scroll{position:relative;max-height:220px;overflow:auto;scroll-timeline-name:--pipeline;scroll-timeline-axis:block;border-block:1px solid var(--site-border);padding:0 2rem}
.pipeline-scroll section{min-height:180px;padding:2rem 0;font-size:14px;line-height:1.8}
.pipeline-scroll__meter{position:sticky;top:0;height:3px;width:100%;background:var(--site-accent);transform-origin:left;transform:scaleX(.05)}
@supports(animation-timeline:scroll()){.pipeline-scroll__meter{animation:pipeline-progress linear both;animation-timeline:--pipeline}}
@keyframes pipeline-progress{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@media(max-width:600px){.pipeline-scene{padding:1rem}.pipeline-demo{grid-template-columns:1fr;padding:1rem}.pipeline-scene svg{min-height:110px}.pipeline-scene svg text{font-size:16px}}
@media(prefers-reduced-motion:reduce){.pipeline-scroll__meter{animation:none}}
</style>
