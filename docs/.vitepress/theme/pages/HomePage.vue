<script setup lang="ts">
import {
  ArrowRight,
  Code2,
} from '@lucide/vue';
import { withBase } from 'vitepress';
import { computed, ref } from 'vue';
import { data as home } from '../../data/home.data';
import { data as content } from '../../data/content.data';
import { data as repositories } from '../../data/projects.data';
import ArticlePreview from '../components/ArticlePreview.vue';
import ExperimentHost from '../components/ExperimentHost.vue';
import { vMagnetic } from '../composables/use-pointer-spring';
import '../styles/labs.css';

const articles = computed(() => content.blogArticles.slice(0, 3));
const courseLabels: Record<string, string> = {
  'fullstack-development': '全栈开发',
  'agent-harness': 'Agent Harness',
  'wechat-mini-program': '小程序开发',
  'agent-product-manager': 'Agent 产品经理',
  'uni-app': 'uni-app 跨端开发',
  godot: 'Godot 游戏开发',
};
const activeExperiment = ref<'spectral' | 'particles'>('spectral');
const metrics = computed(() => [
  { label: '系统专题', value: content.columns.length, href: '/columns/' },
  { label: '公开仓库', value: repositories.projects.length, href: '/projects/' },
  { label: '技术博客', value: content.blogArticles.length, href: '/blog/' },
]);
</script>

<template>
  <div class="home-page">
    <main class="site-container">
      <section class="home-hero" aria-labelledby="home-title">
        <div class="home-hero__content">
          <p class="status-line">
            <span class="status-line__dot" aria-hidden="true" />
            {{ home.profile.status }}
          </p>

          <div class="profile-intro">
            <div class="profile-intro__avatar">
              <span class="profile-avatar-art" aria-label="阿斌代码身份头像">
                <Code2 :size="34" aria-hidden="true" />
              </span>
              <span class="profile-intro__online" aria-label="在线" />
            </div>
            <div>
              <p class="technical-label">FULL STACK / OPEN SOURCE</p>
              <h1 id="home-title">你好，我是 <span>{{ home.profile.name }}</span></h1>
              <p class="profile-intro__meta">
                {{ home.profile.handle }} · {{ home.profile.location }}
              </p>
            </div>
          </div>

          <h2>{{ home.profile.intro }}</h2>
          <p class="home-hero__description">{{ home.profile.description }}</p>

          <div class="home-hero__actions">
            <a v-magnetic class="button button--primary" :href="withBase(home.actions.primary.link)">
              {{ home.actions.primary.label }}
              <ArrowRight :size="18" aria-hidden="true" />
            </a>
            <a class="button button--secondary" :href="withBase(home.actions.secondary.link)">
              {{ home.actions.secondary.label }}
            </a>
          </div>

          <dl class="hero-metrics">
            <div v-for="metric in metrics" :key="metric.label">
              <dt><a :href="withBase(metric.href)">{{ metric.label }} <ArrowRight :size="12" aria-hidden="true" /></a></dt>
              <dd>{{ metric.value }}</dd>
            </div>
          </dl>
          <nav class="home-course-links" aria-label="专题快捷入口">
            <a v-for="column in content.columns" :key="column.slug" :href="withBase(column.href)">
              {{ courseLabels[column.slug] ?? column.title }}
              <ArrowRight :size="14" aria-hidden="true" />
            </a>
          </nav>
        </div>

        <aside class="home-experiment" aria-label="交互实验台">
          <div class="home-experiment__tabs" role="group" aria-label="代表实验">
            <button :aria-pressed="activeExperiment === 'spectral'" @click="activeExperiment = 'spectral'">光谱材质</button>
            <button :aria-pressed="activeExperiment === 'particles'" @click="activeExperiment = 'particles'">代码粒子</button>
            <a :href="withBase(`/labs/${activeExperiment}.html`)">原理与源码 ↗</a>
          </div>
          <ExperimentHost :key="activeExperiment" :id="activeExperiment" />
        </aside>
      </section>

      <section class="home-section home-section--articles" aria-labelledby="articles-title">
        <div class="section-heading">
          <div>
            <p class="technical-label">最近更新</p>
            <h2 id="articles-title">最新文章精选</h2>
          </div>
          <a :href="withBase('/blog/')">浏览全部文章 <ArrowRight :size="17" /></a>
        </div>

        <div class="article-grid">
          <article v-for="article in articles" :key="article.title" class="article-card">
            <header>
              <span>{{ article.category }}</span>
              <time>{{ article.date }}</time>
            </header>
            <h3><a :href="withBase(article.href)">{{ article.title }}</a></h3>
            <p>{{ article.description }}</p>
            <ArticlePreview v-if="article.preview" :preview="article.preview" />
          </article>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.home-experiment{min-width:0;overflow:hidden;border:1px solid var(--site-border);border-radius:var(--radius-panel);background:var(--site-surface);box-shadow:var(--site-shadow)}
.home-experiment__tabs{display:flex;gap:4px;align-items:center;padding:6px 10px;border-bottom:1px solid var(--site-border)}
.home-experiment__tabs button,.home-experiment__tabs a{display:inline-flex;align-items:center;min-height:44px;font-size:13px;color:var(--site-text-muted);padding:0 12px;border:0;border-radius:8px}
.home-experiment__tabs button[aria-pressed=true]{color:var(--site-accent);background:var(--vp-c-brand-soft)}
.home-experiment__tabs a{margin-left:auto;color:var(--site-accent);padding:0 4px;white-space:nowrap}
.home-experiment :deep(.experiment-preview){height:290px;background:radial-gradient(ellipse,var(--vp-c-brand-soft),transparent 70%)}
.home-experiment :deep(.gpu-surface){height:300px}
.home-experiment :deep(.lab-controls>span){display:none}
.home-hero .status-line,.home-hero .profile-intro__meta,.hero-metrics dt{font-size:13px}
@media(max-width:768px){.home-experiment :deep(.experiment-preview){height:86px}.home-experiment :deep(.experiment-preview .lab-preview){width:auto;max-width:100%;margin:auto}.home-experiment :deep(.lab-controls){padding:8px 12px}.home-experiment__tabs{padding-block:0}.home-experiment :deep(.gpu-surface){height:240px}}
@media(max-width:768px){.home-experiment :deep(.experiment-host:has(.experiment-preview)){display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center}.home-experiment :deep(.experiment-preview+.lab-controls){border:0}.home-experiment :deep(.experiment-host>.lab-status){grid-column:1/-1}}
</style>
