<script setup lang="ts">
import { ArrowRight, BookMarked, Layers3, ListOrdered } from '@lucide/vue';
import { withBase } from 'vitepress';
import { data as content } from '../../data/content.data';
import SiteHeader from '../components/SiteHeader.vue';
</script>

<template>
  <div class="site-shell listing-page columns-page">
    <SiteHeader />

    <main class="site-container listing-page__main">
      <header class="listing-header">
        <div>
          <p class="technical-label">LONG-FORM SERIES / LEARNING PATH</p>
          <h1>技术专栏</h1>
          <p>以连续章节整理一个问题域，从概念、实践到可复用的工程判断。</p>
        </div>
        <span>{{ content.columns.length }} 个持续更新</span>
      </header>

      <section class="column-grid" aria-label="专栏列表">
        <article v-for="column in content.columns" :key="column.slug" class="column-card">
          <header>
            <span class="column-card__icon" aria-hidden="true">
              <BookMarked :size="21" />
            </span>
            <span class="column-card__status">{{ column.status ?? 'ARCHIVED' }}</span>
          </header>

          <h2><a :href="withBase(column.href)">{{ column.title }}</a></h2>
          <p>{{ column.description }}</p>

          <div class="column-card__summary">
            <span><Layers3 :size="15" aria-hidden="true" /> {{ column.articles.length }} 篇章节</span>
            <span><ListOrdered :size="15" aria-hidden="true" /> 按阅读顺序编排</span>
          </div>

          <ol class="column-card__chapters">
            <li v-for="article in column.articles" :key="article.href">
              <span>{{ String(article.seriesOrder ?? 0).padStart(2, '0') }}</span>
              <a :href="withBase(article.href)">{{ article.title }}</a>
            </li>
          </ol>

          <a class="column-card__link" :href="withBase(column.href)">
            阅读专栏 <ArrowRight :size="17" />
          </a>
        </article>
      </section>
    </main>
  </div>
</template>
