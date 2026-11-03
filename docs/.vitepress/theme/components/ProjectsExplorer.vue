<script setup lang="ts">
import { ArrowUpRight, Code2, Search, Star } from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { data as repositoryData } from '../../data/projects.data';
import { useFlip } from '../composables/use-flip';
import { useMotionPolicy } from '../composables/use-motion-policy';
const projects = repositoryData.projects;
const category = ref('全部');
const query = ref('');
const order = ref('updated');
const density = ref('standard');
const root = ref<HTMLElement>();
const count = ref<HTMLElement>();
const motion = useMotionPolicy();
const categories = ['全部', ...new Set(projects.map((project) => project.language ?? '文档'))];
const filtered = computed(() => projects.filter((project) =>
  (category.value === '全部' || (project.language ?? '文档') === category.value) &&
  [project.name, project.description, project.language, ...project.topics].join(' ').toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase()),
).sort((a, b) => order.value === 'name' ? a.name.localeCompare(b.name, 'en') : b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name, 'en')));
const { moving } = useFlip(root, () => `${filtered.value.map((item) => item.name).join(',')}:${density.value}`, '[data-flip]', () => count.value?.focus());
let restoring = false;
function restore() {
  restoring = true;
  const params = new URLSearchParams(location.search);
  category.value = categories.includes(params.get('language') ?? '') ? params.get('language')! : '全部';
  query.value = params.get('q') ?? '';
  order.value = params.get('order') === 'name' ? 'name' : 'updated';
  density.value = params.get('density') === 'compact' ? 'compact' : 'standard';
  restoring = false;
}
watch([category, query, order, density], () => {
  if (restoring) return;
  const url = new URL(location.href);
  for (const [key, value, initial] of [['language', category.value, '全部'], ['q', query.value, ''], ['order', order.value, 'updated'], ['density', density.value, 'standard']]) {
    if (value === initial) url.searchParams.delete(key); else url.searchParams.set(key, value);
  }
  history.replaceState(history.state, '', url);
}, { flush: 'sync' });
function tilt(event: PointerEvent) {
  if (event.pointerType !== 'mouse' || moving.value || !motion.policy.value.motion || document.getSelection()?.toString()) return;
  const card = event.currentTarget as HTMLElement;
  const rect = card.getBoundingClientRect();
  const x = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
  const y = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1));
  card.style.setProperty('--tilt-x', `${-y * 4}deg`);
  card.style.setProperty('--tilt-y', `${x * 4}deg`);
  card.style.setProperty('--edge-x', `${(x + 1) * 50}%`);
}
function resetTilt(event: PointerEvent) {
  const card = event.currentTarget as HTMLElement;
  card.style.removeProperty('--tilt-x'); card.style.removeProperty('--tilt-y'); card.style.removeProperty('--edge-x');
}
onMounted(() => { restore(); window.addEventListener('popstate', restore); });
onBeforeUnmount(() => window.removeEventListener('popstate', restore));
</script>

<template>
  <div class="projects-explorer">
    <section class="article-filters" aria-label="项目筛选">
      <div class="article-filters__categories" role="group" aria-label="项目分类">
        <button v-for="item in categories" :key="item" type="button" class="filter-button" :class="{ 'filter-button--active': category === item }" :aria-pressed="category === item" @click="category = item">{{ item }}</button>
      </div>
      <label class="article-search"><Search :size="17" aria-hidden="true" /><span class="sr-only">搜索公开项目</span><input v-model="query" type="search" placeholder="搜索仓库、简介或技术" /></label>
    </section>
    <div class="project-options">
      <label>排序<select v-model="order" aria-label="项目排序"><option value="updated">最近更新</option><option value="name">名称</option></select></label>
      <div role="group" aria-label="展示密度">
        <button class="filter-button" :aria-pressed="density === 'standard'" @click="density = 'standard'">标准</button>
        <button class="filter-button" :aria-pressed="density === 'compact'" @click="density = 'compact'">紧凑</button>
      </div>
      <p ref="count" class="listing-count" tabindex="-1" aria-live="polite">{{ filtered.length }} 个项目 · GitHub 核验于 {{ repositoryData.checkedAt }}</p>
    </div>
    <section ref="root" class="project-grid" :class="{ 'project-grid--compact': density === 'compact', 'project-grid--moving': moving }" aria-label="项目列表">
      <a v-for="project in filtered" :key="project.name" :data-flip="project.name" class="project-card" :href="project.url" target="_blank" rel="noopener noreferrer" @pointermove="tilt" @pointerleave="resetTilt">
        <header><span class="project-card__icon"><Code2 :size="25" aria-hidden="true" /></span><span>{{ project.language ?? '文档' }}</span><ArrowUpRight :size="20" aria-hidden="true" /></header>
        <h2>{{ project.name }}</h2><p>{{ project.description || '此公开仓库尚未填写 GitHub 简介，可前往仓库阅读源码与文档。' }}</p>
        <div class="project-card__tags">
          <span v-if="project.fork">Fork</span><span v-if="project.archived">已归档</span>
          <span v-for="tag in project.topics.slice(0, 4)" :key="tag">{{ tag }}</span>
          <span><Star :size="12" aria-hidden="true" /> {{ project.stars }}</span><span>更新 {{ project.updatedAt.slice(0, 10) }}</span>
        </div>
        <footer><Code2 :size="16" aria-hidden="true" /> 查看 GitHub 仓库 <ArrowUpRight :size="16" aria-hidden="true" /></footer>
      </a>
    </section>
    <section v-if="!filtered.length" class="listing-empty" aria-live="polite">
      <p>没有符合当前筛选条件的公开项目。</p><button type="button" class="button button--secondary" @click="category = '全部'; query = ''">重置筛选</button>
    </section>
  </div>
</template>

<style scoped>
.project-options{display:flex;align-items:center;flex-wrap:wrap;gap:1rem;margin:.75rem 0 1rem}
.project-options label,.project-options>div{display:flex;align-items:center;gap:.5rem;font-size:14px}
.project-options .listing-count{margin:0 0 0 auto}
.project-options select{min-height:44px;padding:.5rem 2rem .5rem .75rem;background:var(--site-surface);border:1px solid var(--site-border);border-radius:8px}
.project-options button[aria-pressed=true]{color:var(--site-accent);background:var(--vp-c-brand-soft);border-color:var(--site-accent)}
.project-card{position:relative;transition:border-color 160ms;transform:none}
.project-card:hover{transform:none}
.project-card::after{content:"";position:absolute;top:-1px;left:12px;right:12px;height:1px;pointer-events:none;background:radial-gradient(ellipse at var(--edge-x,50%) 50%,var(--site-accent),transparent 70%);opacity:0}
.project-card:hover::after,.project-card:focus-visible::after{opacity:1}
.project-card__icon{transform:perspective(320px) rotateX(var(--tilt-x,0deg)) rotateY(var(--tilt-y,0deg));transition:transform 120ms}
.project-grid--moving .project-card__icon{transform:none}
.project-grid--compact{gap:12px}
.project-grid--compact .project-card{padding:16px}
.project-grid--compact h2{font-size:20px;margin:14px 0 8px}
.project-grid--compact .project-card__tags{margin:12px 0}
@media(max-width:600px){.project-options .listing-count{flex-basis:100%;margin:0}}
:root[data-motion=static] .project-card__icon{transform:none;transition:none}
</style>
