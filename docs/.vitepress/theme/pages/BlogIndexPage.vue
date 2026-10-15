<script setup lang="ts">
import { ArrowRight, BookOpen, CalendarDays, Search, Tag } from '@lucide/vue';
import { computed, ref } from 'vue';
import { withBase } from 'vitepress';
import { data as content } from '../../data/content.data';
import AmbientField from '../components/AmbientField.vue';
import SiteHeader from '../components/SiteHeader.vue';
import { filterArticles } from '../composables/article-filter';

const category = ref('全部');
const query = ref('');
const categories = computed(() => ['全部', ...content.blogCategories]);
const articles = computed(() =>
  filterArticles(content.blogArticles, {
    category: category.value,
    query: query.value,
  }),
);

function formatIndex(index: number): string {
  return String(index + 1).padStart(2, '0');
}
</script>

<template>
  <div class="site-shell listing-page blog-listing-page">
    <AmbientField />
    <SiteHeader />

    <main class="site-container listing-page__main">
      <header class="listing-header listing-header--blog">
        <div>
          <p class="technical-label">INDEPENDENT NOTES / WRITING LOG</p>
          <h1>博客</h1>
          <p>独立成篇的开发记录、工程复盘与 AI Agent 实践。</p>
          <a class="listing-header__context-link" :href="withBase('/columns/')">
            <BookOpen :size="16" aria-hidden="true" />
            系统学习请前往专题教程
            <ArrowRight :size="15" aria-hidden="true" />
          </a>
        </div>
        <dl class="listing-header__stats">
          <div>
            <dt>文章</dt>
            <dd>{{ content.blogArticles.length }}</dd>
          </div>
          <div>
            <dt>分类</dt>
            <dd>{{ content.blogCategories.length }}</dd>
          </div>
        </dl>
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

      <p class="listing-count" aria-live="polite">
        {{ category === '全部' ? '全部分类' : category }} · {{ articles.length }} 篇文章
      </p>

      <section v-if="articles.length" class="article-list" aria-label="文章列表">
        <article
          v-for="(article, index) in articles"
          :key="article.href"
          class="article-list-item"
        >
          <span class="article-list-item__index" aria-hidden="true">
            {{ formatIndex(index) }}
          </span>

          <div class="article-list-item__content">
            <div class="article-list-item__meta">
              <span>{{ article.category ?? '未分类' }}</span>
              <time>
                <CalendarDays :size="14" aria-hidden="true" />
                {{ article.date }}
              </time>
            </div>

            <h2><a :href="withBase(article.href)">{{ article.title }}</a></h2>
            <p>{{ article.description }}</p>

            <footer>
              <span class="article-list-item__tags">
                <span v-for="item in article.tags" :key="item">
                  <Tag :size="12" aria-hidden="true" />
                  {{ item }}
                </span>
              </span>
            </footer>
          </div>

          <a
            class="article-list-item__link"
            :href="withBase(article.href)"
            :aria-label="`阅读《${article.title}》`"
          >
            阅读
            <ArrowRight :size="16" aria-hidden="true" />
          </a>
        </article>
      </section>

      <section v-else class="listing-empty" aria-live="polite">
        没有符合当前筛选条件的文章。
      </section>
    </main>
  </div>
</template>
