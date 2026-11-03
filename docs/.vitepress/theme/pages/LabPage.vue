<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, withBase } from 'vitepress';
import { experiments } from '../../data/labs';
import ExperimentHost from '../components/ExperimentHost.vue';
import { data as content } from '../../data/content.data';
import SourceDownload from '../components/SourceDownload.vue';
import '../styles/labs.css';
const route = useRoute();
const experiment = computed(() => experiments.find((item) => route.path.endsWith(`/labs/${item.id}.html`)));
const tutorials = computed(() => [...content.blogArticles, ...content.columns.flatMap((column) => column.articles)]
  .filter((article) => experiment.value && article.demoIds?.includes(experiment.value.id)));
</script>

<template>
  <main v-if="experiment" class="site-container listing-page__main lab-page">
    <nav class="lab-breadcrumb" aria-label="面包屑"><a :href="withBase('/labs/')">实验室</a><span aria-hidden="true">/</span><span>{{ experiment.effect }}</span></nav>
    <header class="lab-heading"><p class="technical-label">{{ experiment.technologies.join(' / ') }}</p><h1 :data-shared-id="experiment.id">{{ experiment.title }}</h1><p>{{ experiment.description }}</p></header>
    <section class="lab-stage" :aria-label="`${experiment.title}演示`">
      <ExperimentHost :key="experiment.id" :id="experiment.id" />
    </section>
    <article class="reading-prose vp-doc"><Content /></article>
    <section class="lab-tutorials" aria-label="实现教程与源码">
      <h2>理解实现</h2>
      <p>从运行条件、关键算法到失败处理，沿同一份源码复现。</p>
      <ul><li v-for="article in tutorials" :key="article.id"><a :href="withBase(article.href)" :data-shared-id="article.id">{{ article.title }}</a></li></ul>
      <SourceDownload href="/downloads/site-labs.zip" label="下载同版本站点源码" />
    </section>
    <nav class="lab-next" aria-label="继续探索"><a :href="withBase('/labs/')">查看全部实验 →</a><a :href="withBase('/columns/')">系统学习教程 →</a></nav>
  </main>
</template>

<style scoped>
.lab-tutorials{padding:1.5rem 0;border-top:1px solid var(--site-border)}
.lab-tutorials h2{font-size:1.5rem}.lab-tutorials p{font-size:14px;color:var(--site-text-muted)}
.lab-tutorials ul{padding:0;list-style:none;margin:1rem 0}.lab-tutorials li>a{display:inline-flex;align-items:center;min-height:44px;color:var(--site-accent)}
</style>
