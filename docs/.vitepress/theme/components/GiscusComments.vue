<script setup lang="ts">
import Giscus from "@giscus/vue";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useData } from "vitepress";

const { frontmatter, isDark, page } = useData();
const root = ref<HTMLElement>();
const nearViewport = ref(false);
let observer: IntersectionObserver | undefined;

const repoId = import.meta.env.VITE_GISCUS_REPO_ID;
const categoryId = import.meta.env.VITE_GISCUS_CATEGORY_ID;
const configured = Boolean(repoId && categoryId);
const visible = computed(
  () =>
    frontmatter.value.comments === true &&
    (frontmatter.value.type === "tutorial" ||
      frontmatter.value.type === "topic"),
);
const term = computed(() =>
  page.value.relativePath.replace(/(?:index)?\.md$/, "").replace(/\/$/, ""),
);

watch([root, () => page.value.relativePath], () => {
  observer?.disconnect();
  nearViewport.value = false;
  if (!root.value || !configured) {
    return;
  }
  observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        nearViewport.value = true;
        observer?.disconnect();
      }
    },
    { rootMargin: "360px" },
  );
  observer.observe(root.value);
}, { flush: "post" });

onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <section v-if="visible" ref="root" class="doc-comments" aria-labelledby="comments-title">
    <h2 id="comments-title">讨论</h2>
    <ClientOnly>
      <Giscus
        v-if="configured && nearViewport"
        :key="term"
        repo="abinzhao/abinzhao"
        :repo-id="repoId"
        category="Announcements"
        :category-id="categoryId"
        mapping="specific"
        :term="term"
        strict="1"
        reactions-enabled="1"
        emit-metadata="0"
        input-position="top"
        :theme="isDark ? 'dark_dimmed' : 'light'"
        lang="zh-CN"
        loading="lazy"
      />
      <p v-if="configured" class="doc-comments__pending">
        评论使用 GitHub Discussions，加载时会连接 Giscus，发表评论需要登录 GitHub。
      </p>
      <p v-else class="doc-comments__pending">
        有问题或补充，可以到
        <a href="https://github.com/abinzhao/abinzhao/discussions" target="_blank" rel="noreferrer">GitHub Discussions</a>
        交流。
      </p>
    </ClientOnly>
  </section>
</template>
