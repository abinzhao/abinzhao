<script setup lang="ts">
import { ArrowUpRight, Code2, Search, Star } from '@lucide/vue';
import { computed, ref } from 'vue';
import CompactPageHeader from '../components/CompactPageHeader.vue';
import { data as repositoryData } from '../../data/projects.data';

const projects = computed(() => repositoryData.projects);
const category = ref('全部');
const query = ref('');
const categories = computed(() => ['全部', ...new Set(projects.value.map((project) => project.language ?? '文档'))]);
const filtered = computed(() => projects.value.filter((project) =>
  (category.value === '全部' || (project.language ?? '文档') === category.value) &&
  [project.name, project.description, project.language, ...project.topics].join(' ').toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase()),
));
</script>

<template>
  <main class="site-container listing-page__main projects-page">
    <CompactPageHeader
      description="工具、课程、组件与智能体。全部公开仓库，一处检索。"
      eyebrow="公开构建 · 实践积累"
      title="开源项目"
      :stats="[
        { label: '公开仓库', value: projects.length, mobilePrimary: true },
      ]"
    />
    <section class="article-filters" aria-label="项目筛选">
      <div class="article-filters__categories" role="group" aria-label="项目分类">
        <button v-for="item in categories" :key="item" type="button" class="filter-button" :class="{ 'filter-button--active': category === item }" :aria-pressed="category === item" @click="category = item">{{ item }}</button>
      </div>
      <label class="article-search">
        <Search :size="17" aria-hidden="true" />
        <span class="sr-only">搜索公开项目</span>
        <input v-model="query" type="search" placeholder="搜索仓库、简介或技术" />
      </label>
    </section>
    <p class="listing-count" aria-live="polite">{{ filtered.length }} 个项目 · GitHub 核验于 {{ repositoryData.checkedAt }}</p>
    <TransitionGroup v-if="filtered.length" name="cards" tag="section" class="project-grid" aria-label="项目列表">
      <a v-for="project in filtered" :key="project.name" class="project-card" :href="project.url" target="_blank" rel="noopener noreferrer">
        <header><span class="project-card__icon"><Code2 :size="25" aria-hidden="true" /></span><span>{{ project.language ?? '文档' }}</span><ArrowUpRight :size="20" aria-hidden="true" /></header>
        <h2>{{ project.name }}</h2><p>{{ project.description || '此公开仓库尚未填写 GitHub 简介，可前往仓库阅读源码与文档。' }}</p>
        <div class="project-card__tags">
          <span v-if="project.fork">Fork</span><span v-if="project.archived">已归档</span>
          <span v-for="tag in project.topics.slice(0, 4)" :key="tag">{{ tag }}</span>
          <span><Star :size="12" aria-hidden="true" /> {{ project.stars }}</span>
          <span>更新 {{ project.updatedAt.slice(0, 10) }}</span>
        </div>
        <footer><Code2 :size="16" aria-hidden="true" /> 查看 GitHub 仓库 <ArrowUpRight :size="16" aria-hidden="true" /></footer>
      </a>
    </TransitionGroup>
    <section v-else class="listing-empty" aria-live="polite">
      <p>没有符合当前筛选条件的公开项目。</p>
      <button type="button" class="button button--secondary" @click="category = '全部'; query = ''">重置筛选</button>
    </section>
  </main>
</template>
