<script setup lang="ts">
import { computed, ref } from 'vue';
import { withBase } from 'vitepress';
import { ArrowRight, ArrowUpRight } from '@lucide/vue';
import {
  labCategories,
  labExperiments,
  type LabCategory,
} from '../../data/labs';

const activeCategory = ref<LabCategory | '全部'>('全部');
const visibleExperiments = computed(() =>
  activeCategory.value === '全部'
    ? labExperiments
    : labExperiments.filter(
        (experiment) => experiment.category === activeCategory.value,
      ),
);
</script>

<template>
  <div class="lab-filter" role="group" aria-label="筛选实验分类">
    <button
      v-for="category in ['全部', ...labCategories] as const"
      :key="category"
      type="button"
      :aria-pressed="activeCategory === category"
      :class="{ active: activeCategory === category }"
      @click="activeCategory = category"
    >
      {{ category }}
    </button>
  </div>

  <div class="lab-index">
    <article
      v-for="experiment in visibleExperiments"
      :id="experiment.id"
      :key="experiment.id"
    >
      <div>
        <h3>{{ experiment.title }}</h3>
        <p>{{ experiment.summary }}</p>
        <div class="meta">
          <span>{{ experiment.category }}</span>
          <span>{{ experiment.technologies.join(' / ') }}</span>
          <span>{{ experiment.status }}</span>
        </div>
      </div>
      <div class="commands">
        <a :href="withBase(experiment.href)">
          查看实验
          <ArrowRight :size="16" :stroke-width="1.8" />
        </a>
        <a
          v-if="experiment.sourceUrl"
          :href="experiment.sourceUrl"
          target="_blank"
          rel="noreferrer"
        >
          源码
          <ArrowUpRight :size="16" :stroke-width="1.8" />
        </a>
      </div>
    </article>
  </div>
</template>
