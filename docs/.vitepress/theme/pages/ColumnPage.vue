<script setup lang="ts">
import {
  ArrowRight,
  CheckCircle2,
  Layers3,
} from '@lucide/vue';
import { computed, ref } from 'vue';
import { useRoute, withBase } from 'vitepress';
import { data as content } from '../../data/content.data';
import { normalizeContentHref } from '../composables/article-context';
import { groupCourseChapters } from '../composables/harness-navigation';
import { useReadingMemory } from '../composables/use-reading-memory';
import { resolveResume } from '../composables/reading-memory';
import SourceDownload from '../components/SourceDownload.vue';
import OfflineDownload from '../components/OfflineDownload.vue';
import '../styles/reading-effects.css';

const route = useRoute();
const contentHref = computed(() => normalizeContentHref(route.path));
const column = computed(() =>
  content.columns.find((item) => item.href === contentHref.value),
);
const memory = useReadingMemory(content.columns.flatMap((item) => item.articles));
const query = ref('');
const matchingChapters = computed(() => column.value?.articles.filter((article) =>
  `${article.title} ${article.description} ${article.tags.join(' ')}`.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())) ?? []);
const completionCount = computed(() => column.value?.articles.filter((article) => memory.records.value[article.id]?.completed).length ?? 0);
const lastChapter = computed(() => column.value?.articles.filter((article) => memory.records.value[article.id])
  .slice().sort((a, b) => memory.records.value[b.id].updatedAt - memory.records.value[a.id].updatedAt)[0]);
const resumeHref = computed(() => lastChapter.value
  ? resolveResume(lastChapter.value.href, memory.records.value[lastChapter.value.id]).href : '');
const chapterGroups = computed(() => {
  if (!column.value) return [];
  const groups = groupCourseChapters(column.value.slug, column.value.articles);
  return (groups.length ? groups
    : [{ id: 'all', title: '', from: 1, to: column.value.articles.length, articles: column.value.articles }])
    .map((group) => ({ ...group, articles: group.articles.filter((article) => matchingChapters.value.includes(article)) }))
    .filter((group) => group.articles.length);
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
          <span><CheckCircle2 :size="16" aria-hidden="true" /> {{ column.status === 'ongoing' ? '持续更新' : column.status === 'completed' ? '已完结' : column.status === 'archived' ? '已归档' : '系统教程' }}</span>
          <span><Layers3 :size="16" aria-hidden="true" /> {{ column.articles.length }} 篇章节</span>
        </div>
        <div v-if="firstChapter" class="column-reading-start">
          <p v-if="column.slug === 'agent-harness'">准备：JavaScript / TypeScript 基础 · Node.js 22+</p>
          <nav aria-label="教程快速入口">
            <a v-if="resumeHref" class="button button--primary" :href="withBase(resumeHref)">继续阅读</a>
            <a class="button button--primary" :href="withBase(firstChapter.href)">开始第一章 <ArrowRight :size="17" aria-hidden="true" /></a>
            <template v-if="column.slug === 'agent-harness'">
              <SourceDownload href="/downloads/agent-harness.zip" label="下载完整项目源码" />
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
            <div class="course-progress">
              <span>已完成 {{ completionCount }} / {{ column.articles.length }} 章</span>
              <progress :value="completionCount" :max="column.articles.length" aria-label="课程完成进度" />
            </div>
          </header>
          <label class="course-search"><span>搜索章节</span><input v-model="query" type="search" aria-label="搜索当前课程章节" placeholder="章节名称、主题或技术" /></label>
          <p v-if="!matchingChapters.length" role="status">没有匹配章节，换个关键词试试。</p>
          <p v-else-if="query" class="lab-status">找到 {{ matchingChapters.length }} 章</p>

          <nav v-if="chapterGroups.length > 1" class="harness-unit-nav" aria-label="学习单元">
            <a v-for="group in chapterGroups" :key="group.id" :href="`#unit-${group.id}`">
              {{ String(group.from).padStart(2, '0') }}–{{ group.to }} · {{ group.title }}
            </a>
          </nav>
          <section v-for="group in chapterGroups" :key="group.id" class="harness-unit">
            <h3 v-if="group.title" :id="`unit-${group.id}`" class="harness-unit__title">{{ group.title }}</h3>
            <ol :start="group.from">
              <li v-for="article in group.articles" :key="article.id" :class="{ 'chapter-completed': memory.records.value[article.id]?.completed, 'chapter-current': lastChapter?.id === article.id }">
                <span class="column-reading-chapters__order">
                  {{ memory.records.value[article.id]?.completed ? '✓' : String(article.seriesOrder ?? 0).padStart(2, '0') }}
                </span>
                <div>
                  <p>{{ article.category ?? '未分类' }} · {{ article.date }}</p>
                  <h3><a :href="withBase(article.href)">{{ article.title }}</a></h3>
                  <span>{{ article.description }}</span>
                </div>
                <span class="column-reading-chapters__link" aria-hidden="true">
                  {{ memory.records.value[article.id]?.completed ? '已完成' : lastChapter?.id === article.id ? '上次读到' : '开始阅读' }} <ArrowRight :size="17" />
                </span>
              </li>
            </ol>
          </section>
          <div class="course-progress">
            <details><summary>管理本地进度</summary><p>完成状态由你手动标记，只保存在此浏览器。</p><button type="button" class="button" @click="memory.clear()">清除本站阅读记录</button></details>
          </div>
          <OfflineDownload :group="`course:${column.slug}`" label="缓存本课程以离线阅读" />
          <a class="course-graph-link" :href="withBase(`/labs/knowledge-graph.html?node=${encodeURIComponent(`column:${column.slug}`)}`)">在知识图谱中探索本课程 ↗</a>
        </section>

        <article id="course-guide" class="reading-prose column-reading-prose vp-doc">
          <Content />
        </article>
      </div>
    </main>
  </div>
</template>
<style scoped>
.course-graph-link{display:inline-flex;align-items:center;min-height:44px;color:var(--site-accent);font-size:13px}
/* VitePress 将标题 padding 计入锚点偏移；课程说明使用外边距分隔章节。 */
.column-reading-prose :deep(h2){padding-top:0;border-top:0}
</style>
