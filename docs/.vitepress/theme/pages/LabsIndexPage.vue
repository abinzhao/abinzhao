<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { withBase } from 'vitepress';
import { experiments, experimentHref } from '../../data/labs';
import CompactPageHeader from '../components/CompactPageHeader.vue';
import LabPreview from '../components/LabPreview.vue';
import OfflineDownload from '../components/OfflineDownload.vue';
import '../styles/labs.css';
const categories = ['全部', ...new Set(experiments.map((item) => item.category))];
const category = ref('全部');
const level = ref('全部');
const visible = computed(() => experiments.filter((item) => (category.value === '全部' || item.category === category.value) && (level.value === '全部' || item.level === level.value)));
let restoring = false;
function restore() {
  restoring = true;
  const params = new URLSearchParams(location.search);
  category.value = categories.includes(params.get('category') ?? '') ? params.get('category')! : '全部';
  level.value = ['intermediate', 'advanced'].includes(params.get('level') ?? '') ? params.get('level')! : '全部';
  restoring = false;
}
watch([category, level], () => {
  if (restoring) return;
  const url = new URL(location.href);
  for (const [key, value] of [['category', category.value], ['level', level.value]]) {
    if (value === '全部') url.searchParams.delete(key); else url.searchParams.set(key, value);
  }
  history.replaceState(history.state, '', url);
}, { flush: 'sync' });
onMounted(() => { restore(); window.addEventListener('popstate', restore); });
onBeforeUnmount(() => window.removeEventListener('popstate', restore));
</script>

<template>
  <main class="site-container listing-page__main labs-index">
    <CompactPageHeader title="实验室" eyebrow="交互 · 图形 · 系统" description="把抽象原理变成可以操作、理解与复现的实验。" :stats="[{ label: '项实验', value: experiments.length, mobilePrimary: true }]" />
    <section class="lab-filters" aria-label="实验筛选">
      <div role="group" aria-label="实验类别"><button v-for="item in categories" :key="item" type="button" class="filter-button" :class="{ 'filter-button--active': category === item }" :aria-pressed="category === item" @click="category = item">{{ item }}</button></div>
      <label>难度 <select v-model="level" aria-label="实验难度"><option>全部</option><option value="intermediate">进阶</option><option value="advanced">高阶</option></select></label>
    </section>
    <p class="listing-count" role="status">{{ visible.length }} 项实验 · 点击进入，按需运行</p>
    <section class="labs-grid" aria-label="实验列表">
      <article v-for="item in visible" :key="item.id" class="lab-card" :data-lab-id="item.id">
        <div class="lab-card__preview" :data-shared-preview="item.id"><LabPreview :id="item.id" /><span>{{ item.effect }} / {{ item.category }}</span></div>
        <div class="lab-card__body">
          <h2><a :href="withBase(experimentHref(item.id))" :data-shared-id="item.id">{{ item.title }}</a></h2>
          <p>{{ item.description }}</p>
          <footer><span>{{ item.technologies.join(' · ') }}</span><span aria-hidden="true">↗</span></footer>
        </div>
      </article>
    </section>
    <p v-if="!visible.length" role="status">没有匹配实验。<button class="button" @click="category = '全部'; level = '全部'">重置筛选</button></p>
    <OfflineDownload group="experiments" label="缓存实验合集" />
  </main>
</template>
