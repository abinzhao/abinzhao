<script setup lang="ts">
import DefaultTheme from 'vitepress/theme';
import { computed } from 'vue';
import { useData, useRoute } from 'vitepress';
import AboutPage from './pages/AboutPage.vue';
import ArticlePage from './pages/ArticlePage.vue';
import BlogIndexPage from './pages/BlogIndexPage.vue';
import ColumnPage from './pages/ColumnPage.vue';
import ColumnsIndexPage from './pages/ColumnsIndexPage.vue';
import HomePage from './pages/HomePage.vue';
import ThemeToggle from './components/ThemeToggle.vue';
import { getCustomPageKind } from './composables/page-kind';

const DefaultLayout = DefaultTheme.Layout;
const route = useRoute();
const { frontmatter } = useData();
const pageKind = computed(() =>
  getCustomPageKind(route.path, frontmatter.value.layout, frontmatter.value),
);
</script>

<template>
  <HomePage v-if="pageKind === 'home'" />
  <AboutPage v-else-if="pageKind === 'about'" />
  <ArticlePage v-else-if="pageKind === 'article'" />
  <BlogIndexPage v-else-if="pageKind === 'blog'" />
  <ColumnPage v-else-if="pageKind === 'column'" />
  <ColumnsIndexPage v-else-if="pageKind === 'columns'" />
  <DefaultLayout v-else>
    <template #nav-bar-content-after>
      <ThemeToggle />
    </template>
  </DefaultLayout>
</template>
