<script setup lang="ts">
import { computed } from "vue";
import { useData } from "vitepress";

const { frontmatter, page } = useData();

const visible = computed(
  () =>
    frontmatter.value.type === "tutorial" ||
    frontmatter.value.type === "topic",
);

const updatedText = computed(() => {
  if (!page.value.lastUpdated) {
    return "首次发布后生成";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(page.value.lastUpdated);
});

const levelText = computed(() => {
  const labels: Record<string, string> = {
    beginner: "入门",
    intermediate: "进阶",
    advanced: "高级",
  };
  return labels[String(frontmatter.value.level)] ?? "专题";
});
</script>

<template>
  <div v-if="visible" class="doc-meta" aria-label="教程元信息">
    <span>学习路径</span>
    <span>{{ levelText }}</span>
    <span>最后更新 {{ updatedText }}</span>
  </div>
</template>
