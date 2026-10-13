<script setup lang="ts">
import { ArrowUpRight, Star } from '@lucide/vue';
import { projects } from '../../data/projects';
</script>

<template>
  <div class="project-index">
    <article v-for="project in projects" :id="project.repo" :key="project.repo">
      <div>
        <h3>{{ project.title }}</h3>
        <p>{{ project.description }}</p>
        <div class="meta">
          <span>{{ project.category }}</span>
          <span v-if="project.language">{{ project.language }}</span>
          <span v-if="project.stars">
            <Star :size="14" :stroke-width="1.8" />
            {{ project.stars }}
          </span>
          <span v-if="project.archived">已归档</span>
        </div>
      </div>
      <div class="commands">
        <a
          v-if="project.homepage"
          :href="project.homepage"
          target="_blank"
          rel="noreferrer"
        >
          在线体验
          <ArrowUpRight :size="16" :stroke-width="1.8" />
        </a>
        <a :href="project.htmlUrl" target="_blank" rel="noreferrer">
          GitHub
          <ArrowUpRight :size="16" :stroke-width="1.8" />
        </a>
      </div>
    </article>
  </div>
</template>
