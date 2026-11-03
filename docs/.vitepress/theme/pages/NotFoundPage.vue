<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, withBase } from 'vitepress';
import { ArrowRight, Search } from '@lucide/vue';
import { data as content } from '../../data/content.data';
const route = useRoute();
const candidates = computed(() => {
  const terms = route.path.toLowerCase().split(/[/_.-]+/).filter((term) => term.length > 3 && !['html', 'abinzhao'].includes(term));
  return [...content.blogArticles, ...content.columns.flatMap((column) => column.articles)]
    .map((article) => ({ article, score: terms.filter((term) => `${article.href} ${article.title}`.toLowerCase().includes(term)).length }))
    .filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map(({ article }) => article);
});
function search(): void { window.dispatchEvent(new Event('site-search-open')); }
</script>
<template>
  <main class="site-container not-found">
    <div class="not-found__signal" aria-hidden="true"><span>4</span><span>0</span><span>4</span></div>
    <p class="technical-label">路径未找到</p><h1>这里还没有内容</h1>
    <p>链接可能已更新，从搜索或首页继续探索。</p>
    <div class="not-found__actions">
      <a class="button button--primary" :href="withBase('/')">返回首页 <ArrowRight :size="17" /></a>
      <button class="button button--secondary" type="button" @click="search"><Search :size="17" /> 搜索内容</button>
    </div>
    <ul v-if="candidates.length" class="not-found__candidates" aria-label="相关内容">
      <li v-for="article in candidates" :key="article.href"><a :href="withBase(article.href)">{{ article.title }}</a></li>
    </ul>
  </main>
</template>
