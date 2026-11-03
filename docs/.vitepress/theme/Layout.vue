<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, provide, watch, type Component } from 'vue';
import { useData, useRoute } from 'vitepress';
import SiteHeader from './components/SiteHeader.vue';
import SiteFooter from './components/SiteFooter.vue';
import AmbientField from './components/AmbientField.vue';
import PageLoadError from './components/PageLoadError.vue';
import { getCustomPageKind } from './composables/page-kind';
import { ASSISTANT_RUNTIME_KEY } from './assistant/runtime-context';
import { createWebLLMRuntime, type WebLLMRuntime } from './assistant/webllm-runtime';
import { provideMotionPolicy } from './composables/use-motion-policy';
import { provideSharedTransition } from './composables/use-shared-transition';
import { usePageTransition } from './composables/use-page-transition';

const motion = provideMotionPolicy();
const transitions = provideSharedTransition();
const { viewReady } = usePageTransition(motion, transitions);
watch([motion.policy, motion.visible], ([policy, visible]) => {
  if (!policy.motion || !visible) transitions.cancel();
});
const lazyPage = (loader: () => Promise<{ default: Component }>) => defineAsyncComponent(() => loader().catch(() => PageLoadError));
const HomePage = lazyPage(() => import('./pages/HomePage.vue'));
const LabsIndexPage = lazyPage(() => import('./pages/LabsIndexPage.vue'));
const LabPage = lazyPage(() => import('./pages/LabPage.vue'));
const AboutPage = lazyPage(() => import('./pages/AboutPage.vue'));
const ArticlePage = lazyPage(() => import('./pages/ArticlePage.vue'));
const BlogIndexPage = lazyPage(() => import('./pages/BlogIndexPage.vue'));
const ColumnPage = lazyPage(() => import('./pages/ColumnPage.vue'));
const ColumnsIndexPage = lazyPage(() => import('./pages/ColumnsIndexPage.vue'));
const ProjectsPage = lazyPage(() => import('./pages/ProjectsPage.vue'));
const NotFoundPage = lazyPage(() => import('./pages/NotFoundPage.vue'));
const ChatPage = lazyPage(() => import('./pages/ChatPage.vue'));
const route = useRoute();
const { frontmatter, page } = useData();
const pageKind = computed(() =>
  getCustomPageKind(route.path, frontmatter.value.layout, frontmatter.value),
);
let runtime: WebLLMRuntime | undefined;
let unsubscribeRuntime: (() => void) | undefined;
provide(ASSISTANT_RUNTIME_KEY, () => {
  if (!runtime) {
    runtime = createWebLLMRuntime();
    unsubscribeRuntime = runtime.subscribe((state) => motion.gate.block(state.busy));
  }
  return runtime;
});
onBeforeUnmount(() => {
  unsubscribeRuntime?.();
  runtime?.cancelInitialization();
  runtime?.stop();
});
</script>

<template>
  <div
    class="site-shell"
    :class="{
      'site-shell--chat': pageKind === 'chat',
      'site-shell--reading': pageKind === 'article',
    }"
  >
    <a class="skip-link" href="#page-content">跳到主要内容</a>
    <AmbientField v-if="pageKind === 'home'" />
    <SiteHeader />
    <div id="page-content" class="page-stage" tabindex="-1">
        <div :key="route.path" class="page-view">
          <HomePage v-if="pageKind === 'home'" @vue:mounted="viewReady" />
          <LabsIndexPage v-else-if="pageKind === 'labs'" @vue:mounted="viewReady" />
          <LabPage v-else-if="pageKind === 'lab'" @vue:mounted="viewReady" />
          <AboutPage v-else-if="pageKind === 'about'" @vue:mounted="viewReady" />
          <ArticlePage v-else-if="pageKind === 'article'" @vue:mounted="viewReady" />
          <BlogIndexPage v-else-if="pageKind === 'blog'" @vue:mounted="viewReady" />
          <ColumnPage v-else-if="pageKind === 'column'" @vue:mounted="viewReady" />
          <ColumnsIndexPage v-else-if="pageKind === 'columns'" @vue:mounted="viewReady" />
          <ProjectsPage v-else-if="pageKind === 'projects'" @vue:mounted="viewReady" />
          <ChatPage v-else-if="pageKind === 'chat'" @vue:mounted="viewReady" />
          <NotFoundPage v-else-if="page.isNotFound" @vue:mounted="viewReady" />
          <main v-else class="site-container reading-prose vp-doc" @vue:mounted="viewReady"><Content /></main>
        </div>
    </div>
    <SiteFooter v-if="pageKind !== 'chat'" />
  </div>
</template>
