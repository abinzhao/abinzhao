<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { GitBranch, Menu, Search, X } from '@lucide/vue';
import { useRoute, withBase } from 'vitepress';
import { siteConfig } from '../../../../site.config';
import SearchModal from './SearchModal.vue';
import ThemeToggle from './ThemeToggle.vue';

const route = useRoute();
const searchOpen = ref(false);
const menuOpen = ref(false);
const github = computed(() =>
  siteConfig.socials.find((social) => social.platform === 'github'),
);

function isActive(href: string) {
  return route.path.startsWith(href);
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    searchOpen.value = true;
  }
  if (event.key === 'Escape') {
    menuOpen.value = false;
  }
}

function closeMenu() {
  menuOpen.value = false;
}

onMounted(() => window.addEventListener('keydown', handleGlobalKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleGlobalKeydown));
</script>

<template>
  <header class="home-header">
    <a class="home-header__brand" :href="withBase('/')" aria-label="返回首页">
      <strong>{{ siteConfig.owner.name }}</strong>
      <span>/ {{ siteConfig.owner.nickname }}</span>
    </a>

    <nav class="home-header__nav" aria-label="主导航">
      <a
        v-for="item in siteConfig.navigation"
        :key="item.href"
        :href="withBase(item.href)"
        :class="{ active: isActive(item.href) }"
      >
        {{ item.label }}
      </a>
    </nav>

    <div class="home-header__actions">
      <button
        class="header-search"
        type="button"
        aria-label="搜索站点内容"
        @click="searchOpen = true"
      >
        <Search :size="19" :stroke-width="1.8" />
        <span>搜索</span>
        <kbd>⌘K</kbd>
      </button>

      <ThemeToggle />

      <a
        v-if="github?.url"
        class="icon-button header-github"
        :href="github.url"
        target="_blank"
        rel="noreferrer"
        aria-label="访问 GitHub"
        title="访问 GitHub"
      >
        <GitBranch :size="20" :stroke-width="1.75" />
      </a>

      <button
        class="icon-button mobile-menu-button"
        type="button"
        :aria-expanded="menuOpen"
        aria-controls="mobile-navigation"
        :aria-label="menuOpen ? '关闭菜单' : '打开菜单'"
        @click="menuOpen = !menuOpen"
      >
        <X v-if="menuOpen" :size="22" :stroke-width="1.8" />
        <Menu v-else :size="22" :stroke-width="1.8" />
      </button>
    </div>

    <Transition name="mobile-nav">
      <nav
        v-if="menuOpen"
        id="mobile-navigation"
        class="mobile-navigation"
        aria-label="移动端导航"
      >
        <a
          v-for="item in siteConfig.navigation"
          :key="item.href"
          :href="withBase(item.href)"
          :class="{ active: isActive(item.href) }"
          @click="closeMenu"
        >
          {{ item.label }}
        </a>
        <a
          v-if="github?.url"
          :href="github.url"
          target="_blank"
          rel="noreferrer"
          @click="closeMenu"
        >
          GitHub
        </a>
      </nav>
    </Transition>
  </header>

  <SearchModal :open="searchOpen" @close="searchOpen = false" />
</template>
