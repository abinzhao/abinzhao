<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, provide, ref, watch } from 'vue';
import { Content, useData, useRoute, withBase } from 'vitepress';
import AboutPage from './pages/AboutPage.vue';
import ArticlePage from './pages/ArticlePage.vue';
import BlogIndexPage from './pages/BlogIndexPage.vue';
import ColumnPage from './pages/ColumnPage.vue';
import ColumnsIndexPage from './pages/ColumnsIndexPage.vue';
import HomePage from './pages/HomePage.vue';
import ProjectsPage from './pages/ProjectsPage.vue';
import SiteHeader from './components/SiteHeader.vue';
import SiteFooter from './components/SiteFooter.vue';
import AiLauncher from './components/AiLauncher.vue';
import AmbientField from './components/AmbientField.vue';
import { getCustomPageKind } from './composables/page-kind';
import { ASSISTANT_RUNTIME_KEY } from './assistant/runtime-context';
import { createWebLLMRuntime, type WebLLMRuntime } from './assistant/webllm-runtime';

const ChatPage = defineAsyncComponent(() => import('./pages/ChatPage.vue'));
const route = useRoute();
const { frontmatter, page } = useData();
const pageKind = computed(() =>
  getCustomPageKind(route.path, frontmatter.value.layout, frontmatter.value),
);
const inferenceBusy = ref(false);
let navigationPending = false;
watch(() => route.path, () => { navigationPending = true; });
function focusDestination(): void {
  if (!navigationPending) return;
  navigationPending = false;
  // 深链接保留浏览器对章节的滚动；仅改变可访问焦点。
  document.getElementById('page-content')?.focus({ preventScroll: true });
}
let runtime: WebLLMRuntime | undefined;
let unsubscribe: (() => void) | undefined;
provide(ASSISTANT_RUNTIME_KEY, () => {
  if (!runtime) {
    runtime = createWebLLMRuntime();
    unsubscribe = runtime.subscribe((state) => { inferenceBusy.value = state.busy; });
  }
  return runtime;
});
onBeforeUnmount(() => {
  runtime?.cancelInitialization();
  runtime?.stop();
  unsubscribe?.();
});
</script>

<template>
  <div
    class="site-shell"
    :class="{
      'site-shell--chat': pageKind === 'chat',
      'site-shell--reading': pageKind === 'article',
      'site-shell--inference': inferenceBusy,
    }"
  >
    <a class="skip-link" href="#page-content">跳到主要内容</a>
    <AmbientField :paused="inferenceBusy" />
    <SiteHeader />
    <div id="page-content" class="page-stage" tabindex="-1">
      <Transition name="page" mode="out-in" @after-enter="focusDestination">
        <div :key="route.path" class="page-view">
          <HomePage v-if="pageKind === 'home'" />
          <AboutPage v-else-if="pageKind === 'about'" />
          <ArticlePage v-else-if="pageKind === 'article'" />
          <BlogIndexPage v-else-if="pageKind === 'blog'" />
          <ColumnPage v-else-if="pageKind === 'column'" />
          <ColumnsIndexPage v-else-if="pageKind === 'columns'" />
          <ProjectsPage v-else-if="pageKind === 'projects'" />
          <ChatPage v-else-if="pageKind === 'chat'" />
          <main v-else-if="page.isNotFound" class="site-container not-found">
            <p class="technical-label">页面未找到</p><h1>这里还没有内容</h1>
            <p>链接可能已失效，回到首页继续探索。</p>
            <a class="button button--primary" :href="withBase('/')">返回首页</a>
          </main>
          <main v-else class="site-container reading-prose vp-doc"><Content /></main>
        </div>
      </Transition>
    </div>
    <SiteFooter v-if="pageKind !== 'chat'" />
    <AiLauncher v-if="pageKind !== 'chat'" />
  </div>
</template>
