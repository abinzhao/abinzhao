<script setup lang="ts">
import {
  ArrowRight,
  BookMarked,
  FileText,
  Layers3,
  ListOrdered,
} from '@lucide/vue';
import { computed } from 'vue';
import { withBase } from 'vitepress';
import { data as content } from '../../data/content.data';
import CompactPageHeader from '../components/CompactPageHeader.vue';

const columns = computed(() =>
  [...content.columns].sort(
    (left, right) =>
      right.articles.length - left.articles.length ||
      left.title.localeCompare(right.title),
  ),
);
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

      <section class="column-grid" aria-label="专栏列表">
        <article
          v-for="(column, index) in columns"
          :key="column.slug"
          :class="{ 'column-card--primary': index === 0 }"
          class="column-card"
        >
          <header>
            <span class="column-card__identity">
              <span class="column-card__icon" aria-hidden="true">
                <BookMarked :size="21" />
              </span>
              学习路径 {{ String(index + 1).padStart(2, '0') }}
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
            <li v-for="article in column.articles.slice(0, 4)" :key="article.href">
              <span>{{ String(article.seriesOrder ?? 0).padStart(2, '0') }}</span>
              <a :href="withBase(article.href)">{{ article.title }}</a>
            </li>
            <li v-if="column.articles.length > 4" class="column-card__chapters-more">
              <span>··</span>
              另有 {{ column.articles.length - 4 }} 篇章节
            </li>
          </ol>

          <span class="column-card__link" aria-hidden="true">
            查看完整学习路径 <ArrowRight :size="17" aria-hidden="true" />
          </span>
        </article>
      </section>
    </main>
  </div>
</template>
