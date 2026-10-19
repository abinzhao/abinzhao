<script setup lang="ts">
import {
  ArrowRight,
  CheckCircle2,
  Code2,
  GitBranch,
} from '@lucide/vue';
import { withBase } from 'vitepress';
import { computed, ref } from 'vue';
import { data as home } from '../../data/home.data';
import { data as content } from '../../data/content.data';
import { data as repositories } from '../../data/projects.data';

const articles = computed(() => content.blogArticles.slice(0, 3));
const terminalExpanded = ref(false);
const activeFile = ref<'developer.ts' | 'harness.config.ts'>('developer.ts');
const metrics = computed(() => [
  { label: '系统专题', value: content.columns.length, href: '/columns/' },
  { label: '公开仓库', value: repositories.projects.length, href: '/projects/' },
  { label: '技术博客', value: content.blogArticles.length, href: '/blog/' },
]);
const codeLines = computed(() => activeFile.value === 'developer.ts' ? home.terminal.lines : [
  '// harness.config.ts · 默认本地，明确边界',
  'export const harness = {',
  "  provider: 'ollama',",
  "  endpoint: 'http://127.0.0.1:11434/v1',",
  "  tools: ['list_files', 'read_file'],",
  '  maxSteps: 8,',
  "  persistence: 'append-only',",
  "  permissions: 'read-only',",
  '} as const;',
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
            <a class="button button--primary" :href="withBase(home.actions.primary.link)">
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
        </div>

        <aside class="terminal-window" :class="{ 'terminal-window--collapsed': !terminalExpanded }" aria-label="开发终端">
          <div class="terminal-window__bar">
            <span class="terminal-window__dots" aria-hidden="true">
              <i /><i /><i />
            </span>
            <span>{{ home.terminal.label }}</span>
            <small>持续构建</small>
            <button
              class="terminal-window__toggle"
              type="button"
              aria-controls="home-terminal-body"
              :aria-expanded="terminalExpanded"
              :aria-label="terminalExpanded ? '折叠开发终端' : '展开开发终端'"
              @click="terminalExpanded = !terminalExpanded"
            >{{ terminalExpanded ? '收起' : '展开' }}</button>
          </div>
          <div id="home-terminal-body" class="terminal-window__body">
          <div class="terminal-tabs" role="group" aria-label="工作台代码文件">
            <button v-for="file in (['developer.ts', 'harness.config.ts'] as const)" :key="file" type="button" :aria-pressed="activeFile === file" @click="activeFile = file">
              <Code2 :size="14" aria-hidden="true" />{{ file }}
            </button>
          </div>
          <pre class="terminal-window__code" :aria-label="activeFile"><code><span
            v-for="(line, index) in codeLines" :key="index" class="terminal-code-line"
          ><span class="terminal-line-number" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span><span>{{ line }}</span></span></code></pre>
          <p class="terminal-window__ready">
            <CheckCircle2 :size="17" aria-hidden="true" />
            {{ home.terminal.footer }}
          </p>
          <div class="terminal-window__footer">
            <span><GitBranch :size="13" aria-hidden="true" /> local-first</span>
            <a :href="withBase('/columns/agent-harness/')">探索 Harness 教程 <ArrowRight :size="13" aria-hidden="true" /></a>
          </div>
          </div>
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
          </article>
        </div>
      </section>
    </main>
  </div>
</template>
