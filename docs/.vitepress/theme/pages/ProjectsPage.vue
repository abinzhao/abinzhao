<script setup lang="ts">
import { ArrowUpRight, Boxes, Code2, Command, Layers3, Smartphone } from '@lucide/vue';
import { computed, ref } from 'vue';
import CompactPageHeader from '../components/CompactPageHeader.vue';

// Canonical repository URLs are recorded in the README and verified against GitHub.
const projects = [
  { name: '鸿蒙学习笔记', repository: 'harmony-next-blog', category: '跨端开发', description: '鸿蒙应用开发的学习笔记与实践教程，记录 ArkTS 和原生页面的工程方法。', tags: ['HarmonyOS', 'ArkTS', 'ArkUI'], icon: Smartphone },
  { name: '命令行图片压缩', repository: 'cps', category: '开发工具', description: '基于 Node.js 的命令行图片压缩工具，把重复的资源处理工作收进一条命令。', tags: ['Node.js', 'TypeScript'], icon: Command },
  { name: '前端工程实践', repository: 'scio-design', category: '工程化', description: '多包管理、基础工程规范与效能组件实践，为前端项目建立清晰的工程约束。', tags: ['TypeScript', '多包管理'], icon: Layers3 },
  { name: '组件与工具库', repository: 'scioPro', category: '工程化', description: '包含 React 组件、自定义钩子与工具函数的多包仓库，探索可复用的组件边界。', tags: ['React', 'JavaScript'], icon: Boxes },
  { name: '代码分析工具', repository: 'code-cnalysis', category: '开发工具', description: '面向代码理解与分析场景的工具实践，让复杂代码的结构和关系更容易梳理。', tags: ['JavaScript', '代码分析'], icon: Code2 },
];
const category = ref('全部');
const categories = ['全部', '跨端开发', '开发工具', '工程化'];
const filtered = computed(() => projects.filter((project) => category.value === '全部' || project.category === category.value));
</script>

<template>
  <main class="site-container listing-page__main projects-page">
    <CompactPageHeader
      description="把想法做成工具，把经验留在代码里。"
      eyebrow="公开构建 · 实践积累"
      title="开源项目"
      :stats="[
        { label: '精选仓库', value: projects.length, mobilePrimary: true },
      ]"
    />
    <section class="article-filters" aria-label="项目筛选">
      <div class="article-filters__categories" role="group" aria-label="项目分类">
        <button v-for="item in categories" :key="item" class="filter-button" :class="{ 'filter-button--active': category === item }" :aria-pressed="category === item" @click="category = item">{{ item }}</button>
      </div>
      <span class="project-filter-note">点击项目，前往 GitHub 仓库 <ArrowUpRight :size="15" aria-hidden="true" /></span>
    </section>
    <p class="listing-count" aria-live="polite">{{ filtered.length }} 个项目</p>
    <TransitionGroup name="cards" tag="section" class="project-grid" aria-label="项目列表">
      <a v-for="project in filtered" :key="project.repository" class="project-card" :href="`https://github.com/abinzhao/${project.repository}`" target="_blank" rel="noopener noreferrer">
        <header><span class="project-card__icon"><component :is="project.icon" :size="25" aria-hidden="true" /></span><span>{{ project.category }}</span><ArrowUpRight :size="20" aria-hidden="true" /></header>
        <h2>{{ project.name }}</h2><p>{{ project.description }}</p>
        <div class="project-card__tags"><span v-for="tag in project.tags" :key="tag">{{ tag }}</span></div>
        <footer><Code2 :size="16" aria-hidden="true" /> 查看 GitHub 仓库 <ArrowUpRight :size="16" aria-hidden="true" /></footer>
      </a>
    </TransitionGroup>
  </main>
</template>
