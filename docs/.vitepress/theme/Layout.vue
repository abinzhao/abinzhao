<script setup lang="ts">
import DefaultTheme from "vitepress/theme-without-fonts";
import DocMeta from "./components/DocMeta.vue";
import GiscusComments from "./components/GiscusComments.vue";

const { Layout } = DefaultTheme;
</script>

<template>
  <Layout>
    <template #doc-before>
      <DocMeta />
    </template>
    <template #doc-after>
      <GiscusComments />
    </template>
  </Layout>
</template>
