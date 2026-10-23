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
import { groupCourseChapters } from '../composables/harness-navigation';

const route = useRoute();
const contentHref = computed(() => normalizeContentHref(route.path));
const column = computed(() =>
  content.columns.find((item) => item.href === contentHref.value),
);
const chapterGroups = computed(() => {
  if (!column.value) return [];
  const groups = groupCourseChapters(column.value.slug, column.value.articles);
  return groups.length ? groups
    : [{ id: 'all', title: '', from: 1, to: column.value.articles.length, articles: column.value.articles }];
});
const firstChapter = computed(() => column.value?.articles[0]);
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
        <div v-if="firstChapter" class="column-reading-start">
          <p v-if="column.slug === 'agent-harness'">准备：JavaScript / TypeScript 基础 · Node.js 22+</p>
          <nav aria-label="教程快速入口">
            <a class="button button--primary" :href="withBase(firstChapter.href)">开始第一章 <ArrowRight :size="17" aria-hidden="true" /></a>
            <template v-if="column.slug === 'agent-harness'">
              <a class="button button--secondary" :href="withBase('/downloads/agent-harness.zip')">下载完整项目源码</a>
              <a class="column-reading-start__guide" href="#从下载包开始">运行说明</a>
            </template>
            <a v-else class="button button--secondary" href="#course-guide">学习准备与实践说明</a>
          </nav>
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

          <nav v-if="chapterGroups.length > 1" class="harness-unit-nav" aria-label="学习单元">
            <a v-for="group in chapterGroups" :key="group.id" :href="`#unit-${group.id}`">
              {{ String(group.from).padStart(2, '0') }}–{{ group.to }} · {{ group.title }}
            </a>
          </nav>
          <section v-for="group in chapterGroups" :key="group.id" class="harness-unit">
            <h3 v-if="group.title" :id="`unit-${group.id}`" class="harness-unit__title">{{ group.title }}</h3>
            <ol :start="group.from">
              <li v-for="article in group.articles" :key="article.href">
                <span class="column-reading-chapters__order">
                  {{ String(article.seriesOrder ?? 0).padStart(2, '0') }}
                </span>
                <div>
                  <p>{{ article.category ?? '未分类' }} · {{ article.date }}</p>
                  <h3><a :href="withBase(article.href)">{{ article.title }}</a></h3>
                  <span>{{ article.description }}</span>
                </div>
                <span class="column-reading-chapters__link" aria-hidden="true">
                  开始阅读 <ArrowRight :size="17" />
                </span>
              </li>
            </ol>
          </section>
        </section>

        <article id="course-guide" class="reading-prose column-reading-prose vp-doc">
          <Content />
        </article>
      </div>
    </main>
  </div>
</template>
