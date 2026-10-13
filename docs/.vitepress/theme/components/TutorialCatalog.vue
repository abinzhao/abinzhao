<script setup lang="ts">
import { computed, ref } from 'vue';
import { withBase } from 'vitepress';
import { ArrowUpRight, BookOpen, Search } from '@lucide/vue';
import { tutorialChapters, tutorialGroups, tutorialStages } from '../../data/tutorials';

const props = defineProps<{ stage?: string }>();
const query = ref('');
const selected = ref('all');
const visibleGroups = computed(() => tutorialGroups
  .filter((group) => (!props.stage || group.stage === props.stage) &&
    (selected.value === 'all' || selected.value === group.stage))
  .map((group) => ({
    ...group,
    chapters: group.chapters.filter((chapter) =>
      `${chapter.title} ${chapter.summary} ${group.title}`.toLowerCase()
        .includes(query.value.trim().toLowerCase())),
  }))
  .filter((group) => group.chapters.length > 0));
const count = computed(() => visibleGroups.value.reduce((sum, group) => sum + group.chapters.length, 0));
</script>

<template>
  <div class="tutorial-catalog">
    <div class="catalog-toolbar">
      <label class="catalog-search">
        <Search :size="17" aria-hidden="true" />
        <input v-model="query" type="search" aria-label="筛选教程章节" placeholder="搜索章节、技术或原理…" />
        <span>{{ count }} / {{ tutorialChapters.length }}</span>
      </label>
      <a class="catalog-play-link" :href="withBase('/tutorials/extensions/visuals/playground')">
        特效演练场 <ArrowUpRight :size="17" aria-hidden="true" />
      </a>
    </div>
    <div v-if="!stage" class="catalog-filters" role="group" aria-label="筛选学习阶段">
      <button type="button" :aria-pressed="selected === 'all'" @click="selected = 'all'">全部</button>
      <button v-for="item in tutorialStages" :key="item.id" type="button"
        :aria-pressed="selected === item.id" @click="selected = item.id">
        {{ item.title }}
      </button>
    </div>
    <div class="catalog-groups">
      <section v-for="group in visibleGroups" :key="group.title" class="catalog-group">
        <div class="catalog-group__heading">
          <BookOpen :size="17" aria-hidden="true" />
          <h2>{{ group.title }}</h2>
          <span>{{ group.chapters.length }} 章</span>
        </div>
        <a v-for="(chapter, index) in group.chapters" :key="chapter.href" :href="withBase(chapter.href)" class="chapter-row">
          <span class="chapter-row__number">{{ String(index + 1).padStart(2, '0') }}</span>
          <span><strong>{{ chapter.title }}</strong><small>{{ chapter.summary }}</small></span>
          <ArrowUpRight :size="17" aria-hidden="true" />
        </a>
      </section>
    </div>
    <p v-if="!count" class="catalog-empty" role="status">没有匹配的章节。尝试“异步”“布局”或“Electron”。</p>
  </div>
</template>
