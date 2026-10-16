<script setup lang="ts">
import { ArrowRight, BookOpen, CalendarDays, Search, Tag } from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { withBase } from 'vitepress';
import { data as content } from '../../data/content.data';
import { filterArticles } from '../composables/article-filter';
import CompactPageHeader from '../components/CompactPageHeader.vue';

const category = ref('全部');
const query = ref('');
const categories = computed(() => ['全部', ...content.blogCategories]);
const articles = computed(() =>
  filterArticles(content.blogArticles, {
    category: category.value,
    query: query.value,
  }),
);
let restoring = false;
let queryTimer: ReturnType<typeof setTimeout> | undefined;

function restoreFilters(): void {
  clearTimeout(queryTimer);
  const params = new URLSearchParams(window.location.search);
  restoring = true;
  category.value = categories.value.includes(params.get('category') ?? '') ? params.get('category')! : '全部';
  query.value = (params.get('q') ?? '').slice(0, 200);
  restoring = false;
}
function saveFilters(push: boolean): void {
  const url = new URL(window.location.href);
  if (category.value === '全部') url.searchParams.delete('category');
  else url.searchParams.set('category', category.value);
  if (query.value.trim()) url.searchParams.set('q', query.value.trim().slice(0, 200));
  else url.searchParams.delete('q');
  if (url.href !== window.location.href) {
    window.history[push ? 'pushState' : 'replaceState'](window.history.state, '', url);
  }
}
watch(category, () => {
  if (!restoring) { clearTimeout(queryTimer); saveFilters(true); }
}, { flush: 'sync' });
watch(query, () => {
  if (!restoring) { clearTimeout(queryTimer); queryTimer = setTimeout(() => saveFilters(false), 250); }
}, { flush: 'sync' });
onMounted(() => {
  restoreFilters();
  window.addEventListener('popstate', restoreFilters);
});
onBeforeUnmount(() => {
  clearTimeout(queryTimer);
  window.removeEventListener('popstate', restoreFilters);
});

</script>

<template>
  <div class="listing-page blog-listing-page">
    <main class="site-container listing-page__main">
      <CompactPageHeader
        description="独立成篇的开发记录、工程复盘与智能体实践。"
        eyebrow="开发记录 · 工程实践"
        title="博客"
        :stats="[
          { label: '文章', value: content.blogArticles.length, mobilePrimary: true },
          { label: '分类', value: content.blogCategories.length },
        ]"
      >
        <template #context>
          <a class="listing-header__context-link" :href="withBase('/columns/')">
            <BookOpen :size="16" aria-hidden="true" />
            系统学习请前往专题教程
            <ArrowRight :size="15" aria-hidden="true" />
          </a>
        </template>
      </CompactPageHeader>

      <section class="article-filters" aria-label="文章筛选">
        <div class="article-filters__categories" role="group" aria-label="分类">
          <button
            v-for="item in categories"
            :key="item"
            :class="{ 'filter-button--active': category === item }"
            class="filter-button"
            type="button"
            :aria-pressed="category === item"
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

      <TransitionGroup v-if="articles.length" name="cards" tag="section" class="article-list" aria-label="文章列表">
        <article
          v-for="article in articles"
          :key="article.href"
          class="article-list-item"
        >
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

          <span
            class="article-list-item__link"
            aria-hidden="true"
          >
            阅读
            <ArrowRight :size="16" aria-hidden="true" />
          </span>
        </article>
      </TransitionGroup>

      <section v-else class="listing-empty" aria-live="polite">
        <p>没有符合当前筛选条件的文章。</p>
        <button class="button button--secondary" @click="category = '全部'; query = ''">重置筛选</button>
      </section>
    </main>
  </div>
</template>
