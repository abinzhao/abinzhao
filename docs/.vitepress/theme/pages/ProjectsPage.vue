<script setup lang="ts">
import { withBase } from 'vitepress';
import CompactPageHeader from '../components/CompactPageHeader.vue';
import ProjectsExplorer from '../components/ProjectsExplorer.vue';
import { data as repositoryData } from '../../data/projects.data';
</script>

<template>
  <main class="site-container listing-page__main projects-page">
    <CompactPageHeader
      description="工具、课程、组件与智能体。全部公开仓库，一处检索。"
      eyebrow="公开构建 · 实践积累"
      title="开源项目"
      :stats="[
        { label: '公开仓库', value: repositoryData.projects.length, mobilePrimary: true },
      ]"
    />
    <ProjectsExplorer />
    <nav class="project-cases" aria-label="工程案例"><a :href="withBase('/labs/layers.html')" data-shared-id="layers">拆解本站：界面、状态、计算与存储 →</a><a :href="withBase('/labs/project-layout.html')" data-shared-id="project-layout">探索网格重排的实现 →</a></nav>
  </main>
</template>

<style scoped>
.project-cases{display:flex;flex-wrap:wrap;gap:1rem;margin-top:2rem;padding-top:1rem;border-top:1px solid var(--site-border);font-size:14px}
.project-cases a{min-height:44px;display:inline-flex;align-items:center;color:var(--site-accent)}
</style>
