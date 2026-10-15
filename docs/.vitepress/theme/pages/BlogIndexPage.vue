<script setup lang="ts">
import { ArrowRight, CalendarDays, Search, Tag } from '@lucide/vue';
import { computed, ref } from 'vue';
import { withBase } from 'vitepress';
import { data as content } from '../../data/content.data';
import SiteHeader from '../components/SiteHeader.vue';
import { filterArticles } from '../composables/article-filter';

const category = ref('全部');
const query = ref('');
const categories = computed(() => ['全部', ...content.categories]);
const articles = computed(() =>
  filterArticles(content.articles, {
    category: category.value,
    query: query.value,
  }),
);
</script>

<template>
  <div class="site-shell listing-page">
    <SiteHeader />

    <main class="site-container listing-page__main">
      <header class="listing-header">
        <div>
          <p class="technical-label">WRITING LOG / MARKDOWN ARCHIVE</p>
          <h1>博客文章</h1>
          <p>记录 HarmonyOS、工程化与 AI Agent 工作流中的可复用实践。</p>
        </div>
        <span>{{ content.articles.length }} 篇已发布</span>
      </header>

      <section class="article-filters" aria-label="文章筛选">
        <div class="article-filters__categories" role="group" aria-label="分类">
          <button
            v-for="item in categories"
            :key="item"
            :class="{ 'filter-button--active': category === item }"
            class="filter-button"
            type="button"
            @click="category = item"
          >
            {{ item }}
          </button>
        </div>

        <label class="article-search">
          <Search :size="17" aria-hidden="true" />
          <span class="sr-only">搜索文章</span>
          <input v-model="query" type="search" placeholder="搜索标题、描述或标签" />
        </label>
      </section>

      <p class="listing-count">显示 {{ articles.length }} 篇文章</p>

      <section v-if="articles.length" class="article-list" aria-label="文章列表">
        <article v-for="article in articles" :key="article.href" class="article-list-item">
          <div class="article-list-item__meta">
            <span>{{ article.category ?? '未分类' }}</span>
            <time>
              <CalendarDays :size="14" aria-hidden="true" />
              {{ article.date }}
            </time>
            <span v-if="article.column" class="article-list-item__series">
              系列 / {{ article.column }}
            </span>
          </div>

          <h2><a :href="withBase(article.href)">{{ article.title }}</a></h2>
          <p>{{ article.description }}</p>

          <footer>
            <span v-for="item in article.tags" :key="item">
              <Tag :size="12" aria-hidden="true" />
              {{ item }}
            </span>
            <a :href="withBase(article.href)">阅读全文 <ArrowRight :size="16" /></a>
          </footer>
        </article>
      </section>

      <section v-else class="listing-empty" aria-live="polite">
        没有符合当前筛选条件的文章。
      </section>
    </main>
  </div>
</template>
