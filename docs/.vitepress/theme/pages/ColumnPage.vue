<script setup lang="ts">
import {
  ArrowRight,
  CheckCircle2,
  Layers3,
  ListOrdered,
} from '@lucide/vue';
import { computed } from 'vue';
import { Content, useRoute, withBase } from 'vitepress';
import { data as content } from '../../data/content.data';
import { normalizeContentHref } from '../composables/article-context';

const route = useRoute();
const contentHref = computed(() => normalizeContentHref(route.path));
const column = computed(() =>
  content.columns.find((item) => item.href === contentHref.value),
);
</script>

<template>
  <div class="column-reading-page">
    <main v-if="column" class="site-container column-reading-page__main">
      <header class="column-reading-hero">
        <p class="technical-label">专题教程 · 完整学习路径</p>
        <h1>{{ column.title }}</h1>
        <p>{{ column.description }}</p>
        <div class="column-reading-hero__stats">
          <span><CheckCircle2 :size="16" aria-hidden="true" /> {{ column.status === 'ongoing' ? '持续更新' : column.status === 'completed' ? '已完结' : column.status === 'archived' ? '已归档' : column.status ?? '持续更新' }}</span>
          <span><Layers3 :size="16" aria-hidden="true" /> {{ column.articles.length }} 篇章节</span>
          <span><ListOrdered :size="16" aria-hidden="true" /> 按阅读顺序编排</span>
        </div>
      </header>

      <div class="column-reading-layout">
        <section class="column-reading-chapters" aria-labelledby="chapters-title">
          <header>
            <div>
              <p class="technical-label">按顺序学习</p>
              <h2 id="chapters-title">章节目录</h2>
            </div>
            <span>{{ column.articles.length }} / {{ column.articles.length }}</span>
          </header>

          <ol>
            <li v-for="article in column.articles" :key="article.href">
              <span class="column-reading-chapters__order">
                {{ String(article.seriesOrder ?? 0).padStart(2, '0') }}
              </span>
              <div>
                <p>{{ article.category ?? '未分类' }} · {{ article.date }}</p>
                <h3><a :href="withBase(article.href)">{{ article.title }}</a></h3>
                <span>{{ article.description }}</span>
              </div>
              <a class="column-reading-chapters__link" :href="withBase(article.href)">
                开始阅读 <ArrowRight :size="17" />
              </a>
            </li>
          </ol>
        </section>

        <article class="reading-prose column-reading-prose vp-doc">
          <Content />
        </article>
      </div>
    </main>
  </div>
</template>
