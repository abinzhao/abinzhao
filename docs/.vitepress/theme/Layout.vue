<script setup lang="ts">
import { computed } from 'vue';
import { useData } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import HomePage from './components/HomePage.vue';
import DocEffects from './components/DocEffects.vue';

const { frontmatter } = useData();
const isCustomHome = computed(
  () => frontmatter.value.layout === 'custom-home',
);
</script>

<template>
  <HomePage v-if="isCustomHome" />
  <DefaultTheme.Layout v-else />
  <DocEffects />
</template>
