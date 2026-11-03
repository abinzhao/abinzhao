<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { withBase } from 'vitepress';
import { data as about } from '../../data/about.data';
import { useMotionPolicy } from '../composables/use-motion-policy';
const motion = useMotionPolicy();
const entries = about.timeline;
const root = ref<HTMLElement>(), track = ref<HTMLElement>();
const active = ref(0), positions = ref<number[]>([]), height = ref(1);
const years = computed(() => [...new Set(entries.map((entry) => entry.date.slice(0, 4)))]);
const path = computed(() => positions.value.length ? `M12 ${positions.value[0]} V${positions.value.at(-1)}` : '');
const progressPath = computed(() => positions.value.length ? `M12 ${positions.value[0]} V${positions.value[active.value]}` : '');
let frame = 0, resize: ResizeObserver | undefined, disposed = false;
let documentTops: number[] = [];
function measure() {
  const element = track.value;
  if (!element || disposed) return;
  const top = element.getBoundingClientRect().top;
  const nodes = [...element.querySelectorAll<HTMLElement>('.work-entry')];
  documentTops = nodes.map((node) => node.getBoundingClientRect().top + scrollY);
  positions.value = nodes.map((node) => node.getBoundingClientRect().top - top + 30);
  height.value = element.scrollHeight;
  update();
}
function update() {
  const threshold = scrollY + Math.min(innerHeight * .38, 260);
  let index = 0;
  documentTops.forEach((top, i) => { if (top <= threshold) index = i; });
  active.value = index;
}
function scroll() {
  if (!frame) frame = requestAnimationFrame(() => { frame = 0; update(); });
}
function navigate(index: number) {
  const entry = entries[index];
  if (!entry) return;
  const hash = `#work-${entry.id}`;
  if (location.hash !== hash) history.pushState(history.state, '', hash);
  active.value = index;
  document.getElementById(`work-${entry.id}`)?.scrollIntoView({ behavior: motion.policy.value.motion ? 'smooth' : 'instant', block: 'start' });
}
function restore() {
  const index = entries.findIndex((entry) => `#work-${entry.id}` === location.hash);
  if (index < 0) return;
  active.value = index;
  document.getElementById(`work-${entries[index].id}`)?.scrollIntoView({ behavior: 'instant', block: 'start' });
}
onMounted(() => {
  void nextTick(() => { measure(); restore(); });
  resize = new ResizeObserver(measure); if (track.value) resize.observe(track.value);
  window.addEventListener('scroll', scroll, { passive: true });
  window.addEventListener('resize', measure); window.addEventListener('popstate', restore); window.addEventListener('hashchange', restore);
  void document.fonts?.ready.then(() => { if (!disposed) measure(); });
});
onBeforeUnmount(() => {
  disposed = true; cancelAnimationFrame(frame); resize?.disconnect();
  window.removeEventListener('scroll', scroll); window.removeEventListener('resize', measure); window.removeEventListener('popstate', restore); window.removeEventListener('hashchange', restore);
});
</script>

<template>
  <section ref="root" class="work-timeline" :data-active="entries[active]?.id" aria-label="有来源的作品时间线">
    <header class="work-heading"><div><p class="technical-label">公开构建 · 可查证的记录</p><h2>作品如何生长</h2></div><p>每个节点对应代码提交与可访问作品。</p></header>
    <div class="work-layout">
      <nav class="work-index" aria-label="作品时间索引">
        <a v-for="year in years" :key="year" :href="`#work-${entries.find(entry => entry.date.startsWith(year))?.id}`" @click.prevent="navigate(entries.findIndex(entry => entry.date.startsWith(year)))">{{ year }}</a>
        <label>定位作品<input type="range" aria-label="作品位置" min="0" :max="entries.length - 1" :value="active" @change="navigate(Number(($event.target as HTMLInputElement).value))"></label>
        <span>{{ entries[active]?.date }}</span>
      </nav>
      <ol ref="track" class="work-track">
        <svg v-if="positions.length" class="work-path" :viewBox="`0 0 24 ${height}`" preserveAspectRatio="none" aria-hidden="true"><path :d="path" stroke="var(--site-border)" stroke-width="2" /><path :d="progressPath" stroke="var(--site-accent)" stroke-width="3" /><circle v-for="(y, index) in positions" :key="index" cx="12" :cy="y" :r="active === index ? 7 : 4" :fill="index <= active ? 'var(--site-accent)' : 'var(--site-surface)'" stroke="var(--site-accent)" /></svg>
        <li v-for="(entry, index) in entries" :id="`work-${entry.id}`" :key="entry.id" class="work-entry" :data-active="active === index">
          <time :datetime="entry.date">{{ entry.date }}</time><h3><a :href="withBase(entry.href)">{{ entry.title }} ↗</a></h3><p>{{ entry.description }}</p>
          <div class="work-tags"><span v-for="tag in entry.tags" :key="tag">{{ tag }}</span><a :href="entry.source" target="_blank" rel="noreferrer">提交记录 ↗</a></div>
        </li>
      </ol>
    </div>
    <nav class="work-next" aria-label="继续了解作品"><a :href="withBase('/projects/')">浏览项目 →</a><a :href="withBase('/columns/')">开始一条学习路径 →</a></nav>
  </section>
</template>

<style scoped>
.work-timeline{padding:1.5rem 0}.work-heading{display:flex;justify-content:space-between;align-items:end;gap:1rem}.work-heading h2{font-size:1.65rem;margin:.5rem 0}.work-heading>p{font-size:13px;color:var(--site-text-muted)}
.work-layout{display:grid;grid-template-columns:160px minmax(0,1fr);gap:2rem;margin-top:1rem}.work-index{position:sticky;top:100px;align-self:start;display:flex;flex-direction:column;gap:12px;padding-top:14px}
.work-index a{display:flex;align-items:center;min-height:44px;font:600 1.7rem var(--vp-font-family-mono);color:var(--site-accent)}.work-index label{font-size:13px;display:flex;flex-direction:column;color:var(--site-text-muted)}.work-index input{min-height:44px;width:100%;max-width:160px;accent-color:var(--site-accent)}.work-index>span{font:13px var(--vp-font-family-mono)}
.work-track{position:relative;list-style:none;margin:0;padding:0 0 0 44px}.work-path{position:absolute;left:0;top:0;width:24px;height:100%;fill:none;pointer-events:none}
.work-entry{padding:18px 0 28px;border-bottom:1px solid var(--site-border);scroll-margin-top:100px}.work-entry time{font:13px var(--vp-font-family-mono);color:var(--site-text-muted)}.work-entry h3{font-size:1.25rem;line-height:1.6;margin:10px 0}.work-entry h3 a{display:inline-flex;align-items:center;min-height:44px}.work-entry[data-active=true] h3 a{color:var(--site-accent)}.work-entry p{font-size:15px;line-height:1.8;max-width:48rem;color:var(--site-text-muted)}
.work-tags{display:flex;gap:12px;flex-wrap:wrap;align-items:center;font-size:13px}.work-tags>span{color:var(--site-text-muted)}.work-tags a{min-height:44px;display:inline-flex;align-items:center;color:var(--site-accent);margin-left:auto}
.work-next{display:flex;gap:24px;justify-content:flex-end;padding-top:20px}.work-next a{min-height:44px;display:flex;align-items:center;color:var(--site-accent);font-size:14px}
@media(max-width:700px){.work-heading{display:block}.work-layout{grid-template-columns:1fr;gap:4px}.work-index{position:static;flex-direction:row;align-items:center;padding:0;gap:16px}.work-index a{font-size:1.2rem}.work-index label{flex:1}.work-index>span{font-size:13px}.work-track{padding-left:32px}.work-entry h3{font-size:1.1rem}.work-next{justify-content:flex-start}}
</style>
