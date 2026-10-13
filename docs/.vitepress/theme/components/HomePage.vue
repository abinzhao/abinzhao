<script setup lang="ts">
import { ref } from 'vue';
import { withBase } from 'vitepress';
import { ArrowRight, Search } from '@lucide/vue';
import { siteConfig } from '../../../../site.config';
import AppHeader from './AppHeader.vue';
import LabShowcase from './LabShowcase.vue';
import LearningRoadmap from './LearningRoadmap.vue';
import ParticleField from './ParticleField.vue';
import ProjectShowcase from './ProjectShowcase.vue';
import RecentUpdates from './RecentUpdates.vue';
import SearchModal from './SearchModal.vue';
import SiteFooter from './SiteFooter.vue';

const searchOpen = ref(false);
</script>

<template>
  <div class="home-page">
    <AppHeader />

    <main>
      <section class="hero">
        <div class="hero__visual" aria-hidden="true">
          <ParticleField :density="1180" :response-strength="0.22" />
        </div>
        <div class="hero__grid" aria-hidden="true" />

        <div class="hero__content">
          <h1>{{ siteConfig.owner.name }}</h1>
          <p class="hero__nickname">
            大家也叫我「{{ siteConfig.owner.nickname }}」
          </p>
          <p class="hero__role">{{ siteConfig.owner.role }}</p>
          <p class="hero__headline">
            从第一条 Git 命令，<br />
            到独立上线一个完整产品。
          </p>
          <p class="hero__description">{{ siteConfig.owner.description }}</p>

          <div class="hero__actions">
            <a class="button button--primary" :href="withBase('/tutorials/')">
              从零开始学习
              <ArrowRight :size="19" :stroke-width="1.8" />
            </a>
            <a class="text-link" :href="withBase('/projects/')">
              查看我的项目
              <ArrowRight :size="18" :stroke-width="1.8" />
            </a>
          </div>

          <button
            class="hero-search"
            type="button"
            aria-label="搜索教程、项目、实验和笔记"
            @click="searchOpen = true"
          >
            <span class="hero-search__copy">
              <strong>今天想学什么？</strong>
              <span>
                搜索 Git、HTML、CSS、JavaScript、React、Node.js、AI…
              </span>
            </span>
            <Search :size="25" :stroke-width="1.7" />
          </button>
        </div>

        <a class="hero__next" href="#roadmap">
          从零基础，到能独立交付全栈产品
          <ArrowRight :size="18" :stroke-width="1.8" />
        </a>
      </section>

      <div class="reveal">
        <LearningRoadmap />
      </div>
      <div class="reveal">
        <ProjectShowcase />
      </div>
      <div class="reveal">
        <LabShowcase />
      </div>
      <div class="reveal">
        <RecentUpdates />
      </div>
    </main>

    <div class="reveal">
      <SiteFooter />
    </div>
    <SearchModal :open="searchOpen" @close="searchOpen = false" />
  </div>
</template>
