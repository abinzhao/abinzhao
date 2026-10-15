<script setup lang="ts">
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronRight,
  List,
  Tag,
} from '@lucide/vue';
import { computed, nextTick, onMounted, ref } from 'vue';
import {
  Content,
  onContentUpdated,
  useData,
  useRoute,
  withBase,
} from 'vitepress';
import { data as content } from '../../data/content.data';
import SiteHeader from '../components/SiteHeader.vue';
import {
  getSeriesNavigation,
  normalizeContentHref,
  resolveArticlePagination,
} from '../composables/article-context';
import {
  createArticleOutline,
  type ArticleOutlineItem,
} from '../composables/article-outline';

const route = useRoute();
const { frontmatter } = useData();
const contentHref = computed(() => normalizeContentHref(route.path));
const tags = computed(() =>
  Array.isArray(frontmatter.value.tags)
    ? frontmatter.value.tags.filter((item): item is string => typeof item === 'string')
    : [],
);
const headings = ref<ArticleOutlineItem[]>([]);
const series = computed(() =>
  getSeriesNavigation(content.columns, contentHref.value),
);
const globalIndex = computed(() =>
  content.blogArticles.findIndex(
    (item) => normalizeContentHref(item.href) === contentHref.value,
  ),
);
const isSeriesArticle = computed(() => Boolean(series.value.column));
const adjacentArticles = computed(() => {
  if (globalIndex.value < 0) {
    return { next: undefined, previous: undefined };
  }

  return {
    next: content.blogArticles[globalIndex.value - 1],
    previous: content.blogArticles[globalIndex.value + 1],
  };
});
const pagination = computed(() =>
  resolveArticlePagination(series.value, adjacentArticles.value),
);

function refreshOutline(): void {
  headings.value = createArticleOutline(
    Array.from(document.querySelectorAll<HTMLElement>('.reading-prose h2, .reading-prose h3')).map(
      (heading) => ({
        id: heading.id,
        level: Number(heading.tagName.slice(1)),
        title: heading.textContent?.trim() ?? '',
      }),
    ),
  );
}

onMounted(() => {
  void nextTick(refreshOutline);
});

onContentUpdated(() => {
  void nextTick(refreshOutline);
});
</script>

<template>
  <div
    :class="{ 'reading-page--series': isSeriesArticle }"
    class="site-shell reading-page"
  >
    <SiteHeader />

    <main class="site-container reading-page__main">
      <nav class="reading-breadcrumb" aria-label="面包屑导航">
        <a :href="withBase(isSeriesArticle ? '/columns/' : '/blog/')">
          {{ isSeriesArticle ? '专题教程' : '博客' }}
        </a>
        <ChevronRight :size="14" aria-hidden="true" />
        <a v-if="series.column" :href="withBase(series.column.href)">{{ series.column.title }}</a>
        <template v-if="series.column">
          <ChevronRight :size="14" aria-hidden="true" />
        </template>
        <span>{{ frontmatter.title }}</span>
      </nav>

      <header class="reading-header">
        <div class="reading-header__meta">
          <span>{{ frontmatter.category ?? '未分类' }}</span>
          <time>
            <CalendarDays :size="14" aria-hidden="true" />
            {{ frontmatter.date }}
          </time>
          <span v-if="series.column"><BookOpen :size="14" aria-hidden="true" /> 系列文章</span>
        </div>
        <p class="technical-label">
          {{ isSeriesArticle ? 'COURSE CHAPTER / GUIDED LEARNING' : 'INDEPENDENT NOTE / READING MODE' }}
        </p>
        <h1>{{ frontmatter.title }}</h1>
        <p v-if="frontmatter.description" class="reading-header__description">
          {{ frontmatter.description }}
        </p>
        <div v-if="tags.length" class="reading-header__tags">
          <span v-for="item in tags" :key="item"><Tag :size="13" aria-hidden="true" /> {{ item }}</span>
        </div>
      </header>

      <div class="reading-layout">
        <article class="reading-prose vp-doc">
          <Content />
        </article>

        <aside class="reading-aside">
          <section v-if="headings.length" class="reading-aside__panel">
            <h2><List :size="16" aria-hidden="true" /> 本页目录</h2>
            <nav aria-label="本页目录">
              <a
                v-for="heading in headings"
                :key="heading.link"
                :class="{ 'reading-aside__subitem': heading.level > 2 }"
                :href="heading.link"
              >
                {{ heading.title }}
              </a>
            </nav>
          </section>

          <section v-if="series.column" class="reading-aside__panel">
            <h2><BookOpen :size="16" aria-hidden="true" /> {{ series.column.title }}</h2>
            <ol class="series-list">
              <li v-for="item in series.column.articles" :key="item.href">
                <a
                  :class="{
                    'series-list__current':
                      normalizeContentHref(item.href) === contentHref,
                  }"
                  :href="withBase(item.href)"
                >
                  <span>{{ String(item.seriesOrder ?? 0).padStart(2, '0') }}</span>
                  {{ item.title }}
                </a>
              </li>
            </ol>
          </section>
        </aside>
      </div>

      <nav class="reading-pagination" aria-label="文章导航">
        <a
          v-if="pagination.previous"
          :href="withBase(pagination.previous.href)"
        >
          <ArrowLeft :size="18" aria-hidden="true" />
          <span>
            <small>上一篇</small>
            {{ pagination.previous.title }}
          </span>
        </a>
        <span v-else />
        <a
          v-if="pagination.next"
          class="reading-pagination__next"
          :href="withBase(pagination.next.href)"
        >
          <span>
            <small>下一篇</small>
            {{ pagination.next.title }}
          </span>
          <ArrowRight :size="18" aria-hidden="true" />
        </a>
      </nav>
    </main>
  </div>
</template>
