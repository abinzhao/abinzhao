<script setup lang="ts">
import { computed, ref } from "vue";
import { tutorialGroups } from "../../data/tutorials";
import { withBase } from "../../site";

const selected = ref("all");
const visibleGroups = computed(() =>
  tutorialGroups.filter((group) => selected.value === "all" || selected.value === group.id),
);
const topics = tutorialGroups.flatMap((group) => group.items);
const chapterCount = topics.reduce((total, topic) => total + topic.chapters.length, 0);
</script>

<template>
  <div class="tutorial-index">
    <header class="compact-page-heading">
      <div>
        <h1>教程</h1>
        <p>从第一条终端命令，到前端工程与全栈应用。</p>
      </div>
      <span>{{ topics.length }} 条路径 / {{ chapterCount }} 篇教程</span>
    </header>

    <nav class="tutorial-index__jump" aria-label="教程分类">
      <button :aria-pressed="selected === 'all'" @click="selected = 'all'">全部</button>
      <button v-for="group in tutorialGroups" :key="group.id"
        :aria-pressed="selected === group.id" @click="selected = group.id">
        {{ group.name }}
      </button>
    </nav>

    <div class="tutorial-groups">
      <section
        v-for="group in visibleGroups"
        :id="group.id"
        :key="group.id"
        class="tutorial-group"
        :class="`tutorial-group--${group.accent}`"
      >
        <div class="tutorial-group__identity">
          <span>{{ group.index }}</span>
          <div>
            <h2>{{ group.name }}</h2>
            <p>{{ group.description }}</p>
          </div>
        </div>
        <div class="tutorial-group__topics">
          <a
            v-for="topic in group.items"
            :id="topic.id"
            :key="topic.id"
            :href="withBase(topic.link)"
            :aria-label="topic.name"
          >
            <strong>{{ topic.name }}</strong>
            <span>{{ topic.description }}</span>
            <small>{{ topic.chapters.length }} 篇 · 开始阅读 ↗</small>
          </a>
        </div>
      </section>
    </div>
  </div>
</template>
