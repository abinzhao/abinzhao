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
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  onContentUpdated,
  useData,
  useRoute,
  withBase,
} from 'vitepress';
import { data as content } from '../../data/content.data';
import {
  getSeriesNavigation,
  normalizeContentHref,
  resolveArticlePagination,
} from '../composables/article-context';
import {
  createArticleOutline,
  type ArticleOutlineItem,
} from '../composables/article-outline';
import {
  calculateReadingProgress,
  selectActiveHeading,
} from '../composables/visual-effects';
import ArticleAskMenu from '../components/ArticleAskMenu.vue';
import { groupCourseChapters } from '../composables/harness-navigation';
import { useReadingMemory } from '../composables/use-reading-memory';
import { resolveResume } from '../composables/reading-memory';
import ArticleTerms from '../components/ArticleTerms.vue';
import ArticlePractice from '../components/ArticlePractice.vue';
import { experiments, experimentHref } from '../../data/labs';
import '../styles/reading-effects.css';

const route = useRoute();
const { frontmatter } = useData();
const contentHref = computed(() => normalizeContentHref(route.path));
const allArticles = [
  ...content.blogArticles,
  ...content.columns.flatMap((column) => column.articles),
];
const currentArticle = computed(() =>
  allArticles.find(
    (article) => normalizeContentHref(article.href) === contentHref.value,
  ),
);
const relatedDemos = computed(() => experiments.filter((demo) => currentArticle.value?.demoIds?.includes(demo.id)));
const memory = useReadingMemory(allArticles);
const articleId = currentArticle.value?.id ?? '';
const completed = computed(() => memory.records.value[articleId]?.completed ?? false);
const completionPulse = ref(false);
function toggleCompletion() {
  completionPulse.value = !completed.value;
  memory.complete(articleId, !completed.value);
}
const resumeHeading = ref('');
const resumeMissing = ref(false);
const tags = computed(() =>
  Array.isArray(frontmatter.value.tags)
    ? frontmatter.value.tags.filter((item): item is string => typeof item === 'string')
    : [],
);
const headings = ref<ArticleOutlineItem[]>([]);
const readingProse = ref<HTMLElement>();
const readingProgress = ref(0);
const activeHeading = ref('');
const outlineDialog = ref<HTMLDialogElement>();
const outlineTrigger = ref<HTMLButtonElement>();
let navigatingOutline = false;
let readingFrame = 0;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let resizeObserver: ResizeObserver | undefined;
let articleTop = 0;
let articleHeight = 0;
let headingPositions: Array<{ id: string; top: number }> = [];
let outlineGeometryDirty = true;
let scrolled = false;
const outlineNav = ref<HTMLElement>();
const outlineMarker = ref({ top: 0, height: 0 });
const series = computed(() =>
  getSeriesNavigation(content.columns, contentHref.value),
);
const seriesGroups = computed(() => series.value.column
  ? groupCourseChapters(series.value.column.slug, series.value.column.articles)
  : []);
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
  measureReadingGeometry();
}

/** 几何只在正文/窗口改变时读取，滚动帧只比较缓存坐标。 */
function measureReadingGeometry(): void {
  if (!readingProse.value) return;
  articleTop = readingProse.value.getBoundingClientRect().top + window.scrollY;
  articleHeight = readingProse.value.offsetHeight;
  headingPositions = Array.from(readingProse.value.querySelectorAll<HTMLElement>('h2[id], h3[id]'))
    .map((heading) => ({ id: heading.id, top: heading.getBoundingClientRect().top + window.scrollY }));
  outlineGeometryDirty = true;
  scheduleReadingStateUpdate();
}
function savePosition(): void {
  clearTimeout(saveTimer);
  if (articleId && scrolled) memory.visit(articleId, activeHeading.value);
}
function updateReadingState(): void {
  readingFrame = 0;
  readingProgress.value = calculateReadingProgress(
    window.scrollY,
    articleTop,
    articleHeight,
    window.innerHeight,
  );
  const next = selectActiveHeading(
    headingPositions.map((heading) => ({ id: heading.id, top: heading.top - window.scrollY })),
    88,
  );
  const changed = next !== activeHeading.value;
  if (!changed && !outlineGeometryDirty) return;
  activeHeading.value = next;
  const active = Array.from(outlineNav.value?.querySelectorAll<HTMLAnchorElement>('a') ?? [])
    .find((link) => link.getAttribute('href') === `#${next}`);
  outlineMarker.value = { top: active?.offsetTop ?? 0, height: active?.offsetHeight ?? 0 };
  outlineGeometryDirty = false;
  if (!changed) return;
  clearTimeout(saveTimer);
  if (scrolled) saveTimer = setTimeout(savePosition, 250);
}

function scheduleReadingStateUpdate(): void {
  if (!readingFrame) readingFrame = window.requestAnimationFrame(updateReadingState);
}
function onScroll(): void { scrolled = true; scheduleReadingStateUpdate(); }

function closeOutline(event?: MouseEvent): void {
  if (!event || event.target === outlineDialog.value) outlineDialog.value?.close();
}

function jumpToHeading(id: string): void {
  navigatingOutline = true;
  outlineDialog.value?.close();
  void nextTick(() => {
    const heading = document.getElementById(id);
    if (!heading) return;
    const url = new URL(window.location.href);
    url.hash = id;
    if (url.href !== window.location.href) window.history.pushState(window.history.state, '', url);
    heading.scrollIntoView({ block: 'start' });
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  });
}
function restoreOutlineFocus(): void {
  if (!navigatingOutline) outlineTrigger.value?.focus();
  navigatingOutline = false;
}

onMounted(() => {
  void nextTick(() => {
    refreshOutline();
    const saved = memory.records.value[articleId];
    resumeHeading.value = saved?.headingId ?? '';
    resumeMissing.value = resolveResume('', saved, headingPositions.map((item) => item.id)).missing;
    if (resumeMissing.value) resumeHeading.value = '';
    if (!saved && articleId) memory.visit(articleId, '');
    resizeObserver = new ResizeObserver(measureReadingGeometry);
    if (readingProse.value) resizeObserver.observe(readingProse.value);
    const header = document.querySelector('.reading-header');
    if (header) resizeObserver.observe(header);
  });
  document.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', measureReadingGeometry, { passive: true });
  window.addEventListener('pagehide', savePosition);
});

onContentUpdated(() => {
  void nextTick(() => {
    refreshOutline();
    scheduleReadingStateUpdate();
  });
});

onBeforeUnmount(() => {
  savePosition();
  resizeObserver?.disconnect();
  window.cancelAnimationFrame(readingFrame);
  document.removeEventListener('scroll', onScroll);
  window.removeEventListener('resize', measureReadingGeometry);
  window.removeEventListener('pagehide', savePosition);
});
</script>

<template>
  <div
    :class="{ 'reading-page--series': isSeriesArticle }"
    class="reading-page"
  >
    <div class="reading-progress" aria-hidden="true">
      <span :style="{ transform: `scaleX(${readingProgress})` }" />
      <i v-for="tick in 19" :key="tick" :style="{ left: `${tick * 5}%` }" />
    </div>

    <main class="site-container reading-page__main">
      <nav class="reading-breadcrumb" aria-label="面包屑导航">
        <a :href="withBase(isSeriesArticle ? '/columns/' : '/blog/')">
          {{ isSeriesArticle ? '专题教程' : '博客' }}
        </a>
        <ChevronRight :size="14" aria-hidden="true" />
        <a v-if="series.column" :href="withBase(series.column.href)">{{ series.column.title }}</a>
        <template v-if="series.column">
          <ChevronRight
            class="reading-breadcrumb__current-separator"
            :size="14"
            aria-hidden="true"
          />
        </template>
        <span class="reading-breadcrumb__current">{{ frontmatter.title }}</span>
      </nav>

      <header class="reading-header">
        <div class="reading-header__meta">
          <span>{{ frontmatter.category ?? '未分类' }}</span>
          <time>
            <CalendarDays :size="14" aria-hidden="true" />
            {{ currentArticle?.updatedAt ? `更新于 ${currentArticle.updatedAt}` : frontmatter.date }}
          </time>
          <span v-if="currentArticle">估算 {{ currentArticle.readingTime }} 分钟 + 实践</span>
          <span v-if="series.column"><BookOpen :size="14" aria-hidden="true" /> 系列文章</span>
          <span v-for="item in tags" :key="item" class="reading-header__tag">
            <Tag :size="13" aria-hidden="true" />
            {{ item }}
          </span>
        </div>
        <div class="reading-header__title-row">
          <h1 :data-shared-id="currentArticle?.id">{{ frontmatter.title }}</h1>
          <ArticleAskMenu
            v-if="currentArticle"
            :article-href="currentArticle.href"
          />
        </div>
        <p v-if="frontmatter.description" class="reading-header__description">
          {{ frontmatter.description }}
        </p>
        <div v-if="articleId && (resumeHeading || resumeMissing || !memory.persistent.value)" class="reading-actions">
          <a v-if="resumeHeading" :href="`#${encodeURIComponent(resumeHeading)}`" @click.prevent="jumpToHeading(resumeHeading)">回到上次阅读位置</a>
          <span v-if="resumeMissing" role="status">原阅读锚点已更新，可从正文开头继续。</span>
          <span v-if="!memory.persistent.value" role="status">浏览器未允许存储，进度仅在当前页面保留。</span>
        </div>
        <ArticleTerms v-if="Array.isArray(frontmatter.glossary)" :terms="frontmatter.glossary" />
        <nav v-if="relatedDemos.length" class="reading-actions" aria-label="文章实践入口">
          <a href="#article-practice">本文源码</a>
          <a v-for="demo in relatedDemos" :key="demo.id" :href="withBase(experimentHref(demo.id))" :data-shared-id="demo.id">对应实验：{{ demo.title }}</a>
        </nav>
      </header>

      <div v-if="headings.length" class="reading-mobile-toolbar">
        <button
          ref="outlineTrigger"
          class="reading-outline-trigger"
          type="button"
          aria-label="打开本页目录"
          aria-haspopup="dialog"
          @click="outlineDialog?.showModal()"
        ><List :size="18" aria-hidden="true" /> 本页目录 <span>{{ headings.length }} 节</span></button>
        <span>{{ Math.round(readingProgress * 100) }}%</span>
        <a v-if="series.column" :href="withBase(series.column.href)" class="reading-course-return">课程目录</a>
      </div>

      <div class="reading-layout">
        <article ref="readingProse" class="reading-prose vp-doc">
          <Content />
          <ArticlePractice v-if="currentArticle?.demoIds?.length" :article="currentArticle" />
        </article>

        <aside class="reading-aside">
          <section v-if="headings.length" class="reading-aside__panel reading-desktop-outline">
            <h2><List :size="16" aria-hidden="true" /> 本页目录</h2>
            <nav ref="outlineNav" class="reading-outline-nav" aria-label="本页目录">
              <i class="reading-outline-marker" aria-hidden="true" :style="{ transform: `translateY(${outlineMarker.top}px)`, height: `${outlineMarker.height}px` }" />
              <a
                v-for="heading in headings"
                :key="heading.link"
                :class="{
                  'reading-aside__active': activeHeading === heading.link.slice(1),
                  'reading-aside__subitem': heading.level > 2,
                }"
                :href="heading.link"
                :aria-current="activeHeading === heading.link.slice(1) ? 'location' : undefined"
              >
                {{ heading.title }}
              </a>
            </nav>
          </section>

          <section v-if="series.column" class="reading-aside__panel">
            <h2><BookOpen :size="16" aria-hidden="true" /> {{ series.column.title }}</h2>
            <template v-if="seriesGroups.length">
              <details v-for="group in seriesGroups" :key="group.id" class="series-unit"
                :open="group.articles.some((item) => normalizeContentHref(item.href) === contentHref)">
                <summary>{{ String(group.from).padStart(2, '0') }}–{{ group.to }} · {{ group.title }}</summary>
                <ol class="series-list" :start="group.from">
                  <li v-for="item in group.articles" :key="item.href">
                    <a :href="withBase(item.href)"
                      :aria-current="normalizeContentHref(item.href) === contentHref ? 'page' : undefined"
                      :class="{ 'series-list__current': normalizeContentHref(item.href) === contentHref }">
                      <span>{{ memory.records.value[item.id]?.completed ? '✓' : String(item.seriesOrder ?? 0).padStart(2, '0') }}</span>{{ item.title }}
                    </a>
                  </li>
                </ol>
              </details>
            </template>
            <ol v-else class="series-list">
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

      <div v-if="articleId" class="reading-actions" :class="{ 'reading-actions--completed': completionPulse }">
        <button type="button" :aria-pressed="completed" @click="toggleCompletion">
          {{ completed ? '已完成 · 撤销标记' : isSeriesArticle ? '标记本章完成' : '标记本文完成' }}
        </button>
        <span>完成状态只保存在此浏览器，随时可撤销。</span>
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

    <dialog
      ref="outlineDialog"
      class="reading-outline-dialog"
      aria-labelledby="reading-outline-title"
      @click="closeOutline"
      @close="restoreOutlineFocus"
    >
      <header><h2 id="reading-outline-title">本页目录</h2><button class="icon-button" type="button" aria-label="关闭本页目录" @click="closeOutline()">×</button></header>
      <nav aria-label="文章章节">
        <a
          v-for="heading in headings"
          :key="heading.link"
          :href="heading.link"
          :aria-current="activeHeading === heading.link.slice(1) ? 'location' : undefined"
          :class="{ 'reading-aside__subitem': heading.level > 2 }"
          @click.prevent="jumpToHeading(heading.link.slice(1))"
        >{{ heading.title }}</a>
      </nav>
    </dialog>
  </div>
</template>
