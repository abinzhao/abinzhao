<script setup lang="ts">
import {
  ArrowUpRight,
  Code2,
  MapPin,
  Rocket,
  ShieldCheck,
  Sparkles,
} from '@lucide/vue';
import { withBase } from 'vitepress';
import { computed } from 'vue';
import { data as about } from '../../data/about.data';
import { data as content } from '../../data/content.data';
import { data as repositories } from '../../data/projects.data';

const stats = computed(() => about.stats.map((stat) => ({
  ...stat,
  value: stat.label === '开源仓库' ? repositories.projects.length
    : stat.label === '学习专题' ? content.columns.length : stat.value,
})));

const actionIcons = {
  assistant: Sparkles,
  github: Code2,
  project: Rocket,
};
</script>

<template>
  <div class="about-page">
    <main class="site-container">
      <section class="about-profile" aria-labelledby="about-title">
        <div class="about-profile__identity">
          <div class="about-profile__avatar">
            <span class="profile-avatar-art profile-avatar-art--large" aria-label="阿斌代码身份头像">
              <Code2 :size="42" aria-hidden="true" />
            </span>
            <span aria-label="在线" />
          </div>
          <div>
            <p class="technical-label">关于我 · 公开构建</p>
            <h1 id="about-title">
              {{ about.identity.name }} <span>{{ about.identity.handle }}</span>
            </h1>
            <p class="about-profile__role">{{ about.identity.role }}</p>
            <p class="about-profile__location">
              <MapPin :size="16" aria-hidden="true" />
              {{ about.identity.location }}
            </p>
            <p class="about-profile__status">
              <span aria-hidden="true" />
              {{ about.identity.status }}
            </p>
          </div>
        </div>

        <div class="about-profile__actions">
          <a
            v-for="action in about.actions"
            :key="action.label"
            :class="{ 'about-action--primary': action.kind === 'github' }"
            class="about-action"
            :href="action.link.startsWith('/') ? withBase(action.link) : action.link"
            :target="action.link.startsWith('/') ? undefined : '_blank'"
            :rel="action.link.startsWith('/') ? undefined : 'noreferrer'"
          >
            <component :is="actionIcons[action.kind]" :size="17" aria-hidden="true" />
            {{ action.label }}
            <ArrowUpRight :size="16" aria-hidden="true" />
          </a>
        </div>

        <p class="about-profile__bio">“{{ about.identity.bio }}”</p>

        <dl class="about-stats">
          <div v-for="stat in stats" :key="stat.label">
            <dt>{{ stat.label }}</dt>
            <dd>{{ stat.value }}</dd>
            <p>{{ stat.detail }}</p>
          </div>
        </dl>
      </section>

      <section class="about-section" aria-labelledby="principles-title">
        <div class="section-heading">
          <div>
            <p class="technical-label">做事的方法</p>
            <h2 id="principles-title">工程准则与数字哲学</h2>
          </div>
          <p class="section-heading__copy">用更少的依赖建立更长久的工程能力。</p>
        </div>

        <div class="principle-grid">
          <article v-for="principle in about.principles" :key="principle.index" class="principle-card">
            <header>
              <span>{{ principle.index }} / {{ principle.subtitle }}</span>
              <ShieldCheck :size="21" aria-hidden="true" />
            </header>
            <h3>{{ principle.title }}</h3>
            <p>{{ principle.description }}</p>
            <footer>
              <span v-for="tag in principle.tags" :key="tag">{{ tag }}</span>
            </footer>
          </article>
        </div>
      </section>

      <section class="about-section about-section--skills" aria-labelledby="skills-title">
        <div class="section-heading">
          <div>
            <p class="technical-label">技术能力与实践方向</p>
            <h2 id="skills-title">技术实践</h2>
          </div>
          <p class="section-heading__copy">持续打磨底层能力，把技术选择落到真实产品体验。</p>
        </div>

        <div class="skill-grid">
          <section v-for="group in about.skills" :key="group.label" class="skill-card">
            <header>
              <h3>{{ group.group }}</h3>
              <span>{{ group.label }}</span>
            </header>
            <div v-for="skill in group.items" :key="skill.name" class="skill-row">
              <div class="skill-row__title">
                <strong>{{ skill.name }}</strong>
              </div>
              <p>{{ skill.detail }}</p>
            </div>
          </section>
        </div>
      </section>
    </main>
  </div>
</template>
