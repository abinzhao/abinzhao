<script setup lang="ts">
import { tutorialGroups } from "../../data/tutorials";
import { withBase } from "../../site";
</script>

<template>
  <div class="knowledge-map">
    <a
      v-for="group in tutorialGroups"
      :key="group.id"
      class="knowledge-map__row"
      :class="`knowledge-map__row--${group.accent}`"
      :href="withBase(`/tutorials/#${group.id}`)"
    >
      <span class="knowledge-map__index">{{ group.index }}</span>
      <span class="knowledge-map__name">{{ group.name }}</span>
      <span class="knowledge-map__topics">
        {{ group.items.map((item) => item.name).join(" / ") }}
      </span>
      <span class="knowledge-map__action">进入路径</span>
    </a>
  </div>
</template>
