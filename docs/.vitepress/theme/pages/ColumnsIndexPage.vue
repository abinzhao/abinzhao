<script setup lang="ts">
import {
  ArrowRight,
  BookMarked,
  FileText,
  Layers3,
  ListOrdered,
  Search,
} from '@lucide/vue';
import { computed, ref } from 'vue';
import { withBase } from 'vitepress';
import { data as content } from '../../data/content.data';
import CompactPageHeader from '../components/CompactPageHeader.vue';

const category = ref('全部');
const query = ref('');
const subjects: Record<string, string> = {
  'fullstack-development': '全栈工程',
  'agent-harness': '智能体工程',
  'wechat-mini-program': '跨端应用',
  'uni-app': '跨端应用',
  'agent-product-manager': '产品设计',
  godot: '游戏开发',
};
const categories = computed(() => ['全部', ...new Set(content.columns.map((column) => subjects[column.slug] ?? '其他'))]);
const columns = computed(() => [...content.columns]
  .filter((column) => (category.value === '全部' || subjects[column.slug] === category.value) &&
    [column.title, column.description, ...column.articles.map((article) => `${article.title} ${article.tags.join(' ')}`)]
      .join(' ').toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase()))
  .sort((left, right) => Number(right.slug === 'fullstack-development') - Number(left.slug === 'fullstack-development')
    || left.title.localeCompare(right.title)));
const totalChapters = computed(() =>
  content.columns.reduce((total, column) => total + column.articles.length, 0),
);
</script>

<template>
  <div class="listing-page columns-page">
    <main class="site-container listing-page__main">
      <CompactPageHeader
        description="按章节推进的系统学习路径，从基础概念走到完整项目。"
        eyebrow="系统学习 · 逐章实践"
        title="专题教程"
        :stats="[
          { label: '专题', value: content.columns.length, mobilePrimary: true },
          { label: '章节', value: totalChapters },
        ]"
      >
        <template #context>
          <a class="listing-header__context-link" :href="withBase('/blog/')">
            <FileText :size="16" aria-hidden="true" />
            随笔与实践复盘请前往博客
            <ArrowRight :size="15" aria-hidden="true" />
          </a>
        </template>
      </CompactPageHeader>

      <section class="article-filters" aria-label="专题筛选">
        <div class="article-filters__categories" role="group" aria-label="专题方向">
          <button v-for="item in categories" :key="item" type="button" class="filter-button"
            :class="{ 'filter-button--active': category === item }" :aria-pressed="category === item"
            @click="category = item">{{ item }}</button>
        </div>
        <label class="article-search">
          <Search :size="17" aria-hidden="true" />
          <span class="sr-only">搜索专题教程</span>
          <input v-model="query" type="search" maxlength="200" placeholder="搜索专题、章节或技术" />
        </label>
      </section>
      <p class="listing-count" aria-live="polite">{{ columns.length }} 个专题 · 选择方向，按章节实践</p>

      <section v-if="columns.length" class="column-grid" aria-label="专栏列表">
        <article
          v-for="(column, index) in columns"
          :key="column.slug"
          class="column-card"
        >
          <header>
            <span class="column-card__identity">
              <span class="column-card__icon" aria-hidden="true">
                <BookMarked :size="21" />
              </span>
              {{ subjects[column.slug] ?? `学习路径 ${String(index + 1).padStart(2, '0')}` }}
            </span>
            <span class="column-card__status">{{ column.status === 'ongoing' ? '持续更新' : column.status === 'completed' ? '已完结' : column.status === 'archived' ? '已归档' : column.status ?? '已归档' }}</span>
          </header>

          <h2><a :href="withBase(column.href)">{{ column.title }}</a></h2>
          <p>{{ column.description }}</p>

          <div class="column-card__summary">
            <span><Layers3 :size="15" aria-hidden="true" /> {{ column.articles.length }} 篇章节</span>
            <span><ListOrdered :size="15" aria-hidden="true" /> 按阅读顺序编排</span>
          </div>

          <p class="column-card__chapters-label">从这里开始</p>
          <ol class="column-card__chapters">
            <li v-for="article in column.articles.slice(0, 2)" :key="article.href">
              <span>{{ String(article.seriesOrder ?? 0).padStart(2, '0') }}</span>
              <a :href="withBase(article.href)">{{ article.title }}</a>
            </li>
            <li v-if="column.articles.length > 2" class="column-card__chapters-more">
              <span>··</span>
              另有 {{ column.articles.length - 2 }} 篇章节
            </li>
          </ol>

          <span class="column-card__link" aria-hidden="true">
            查看完整学习路径 <ArrowRight :size="17" aria-hidden="true" />
          </span>
        </article>
      </section>
      <section v-else class="listing-empty" aria-live="polite">
        <p>没有符合当前筛选条件的专题。</p>
        <button type="button" class="button button--secondary" @click="category = '全部'; query = ''">重置筛选</button>
      </section>
    </main>
  </div>
</template>
