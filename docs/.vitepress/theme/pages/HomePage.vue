<script setup lang="ts">
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Code2,
  Copy,
  Fingerprint,
  GraduationCap,
  MapPin,
  Rocket,
} from '@lucide/vue';
import { withBase } from 'vitepress';
import { data as home } from '../../data/home.data';
import AmbientField from '../components/AmbientField.vue';
import SiteHeader from '../components/SiteHeader.vue';

const moduleIcons = {
  book: BookOpen,
  fingerprint: Fingerprint,
  graduation: GraduationCap,
  rocket: Rocket,
};
</script>

<template>
  <div class="site-shell home-page">
    <AmbientField />
    <SiteHeader />

    <main class="site-container">
      <section class="home-hero" aria-labelledby="home-title">
        <div class="home-hero__content">
          <p class="status-line">
            <span class="status-line__dot" aria-hidden="true" />
            状态：{{ home.profile.status }}
          </p>

          <div class="profile-intro">
            <div class="profile-intro__avatar">
              <span class="profile-avatar-art" aria-label="ABIN 代码身份头像">
                <Code2 :size="34" aria-hidden="true" />
              </span>
              <span class="profile-intro__online" aria-label="在线" />
            </div>
            <div>
              <p class="technical-label">ARCH · DEV · OPEN SOURCE</p>
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
            <a
              class="command-link"
              href="https://github.com/abinzhao"
              target="_blank"
              rel="noreferrer"
            >
              <span>$ pnpm create abin-lab</span>
              <Copy :size="15" aria-hidden="true" />
            </a>
          </div>

          <dl class="hero-metrics">
            <div v-for="metric in home.profile.metrics" :key="metric.label">
              <dt>{{ metric.label }}</dt>
              <dd>{{ metric.value }}</dd>
            </div>
          </dl>
        </div>

        <aside class="terminal-window" aria-label="开发终端">
          <div class="terminal-window__bar">
            <span class="terminal-window__dots" aria-hidden="true">
              <i /><i /><i />
            </span>
            <span>{{ home.terminal.label }}</span>
            <small>WASM ACTIVE</small>
          </div>
          <pre class="terminal-window__code"><code><span
            v-for="line in home.terminal.lines"
            :key="line"
            :class="{ 'terminal-window__comment': line.startsWith('//') }"
          >{{ line }}
</span></code></pre>
          <p class="terminal-window__ready">
            <CheckCircle2 :size="17" aria-hidden="true" />
            {{ home.terminal.footer }}
          </p>
          <div class="terminal-window__footer">
            <span>● Branch: main</span>
            <span>UTF-8 · LF</span>
          </div>
        </aside>
      </section>

      <section class="home-section home-section--modules" aria-labelledby="modules-title">
        <div class="section-heading section-heading--compact">
          <div>
            <p class="technical-label">MODULE INDEX</p>
            <h2 id="modules-title">模块索引</h2>
          </div>
          <span>FAST NAVIGATION / 01-04</span>
        </div>

        <div class="module-grid">
          <a
            v-for="module in home.modules"
            :key="module.title"
            class="module-card"
            :href="withBase(module.link)"
          >
            <component :is="moduleIcons[module.icon]" :size="23" aria-hidden="true" />
            <h3>{{ module.title }}</h3>
            <p>{{ module.description }}</p>
            <footer>
              <span>{{ module.meta }}</span>
              <ArrowRight :size="18" aria-hidden="true" />
            </footer>
          </a>
        </div>
      </section>

      <section class="home-section home-section--articles" aria-labelledby="articles-title">
        <div class="section-heading">
          <div>
            <p class="technical-label">WRITING LOG</p>
            <h2 id="articles-title">最新文章精选</h2>
          </div>
          <a :href="withBase('/blog/')">浏览全部文章 <ArrowRight :size="17" /></a>
        </div>

        <div class="article-grid">
          <article v-for="article in home.articles" :key="article.title" class="article-card">
            <header>
              <span>{{ article.category }}</span>
              <time>{{ article.readTime }}</time>
            </header>
            <h3><a :href="withBase(article.link)">{{ article.title }}</a></h3>
            <p>{{ article.description }}</p>
          </article>
        </div>
      </section>
    </main>
  </div>
</template>
