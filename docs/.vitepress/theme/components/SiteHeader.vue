<script setup lang="ts">
import { Atom, Code2, Menu, X } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useData, useRoute, withBase } from 'vitepress';
import ThemeToggle from './ThemeToggle.vue';

interface NavigationItem {
  link: string;
  text: string;
}

const { site } = useData();
const route = useRoute();
const mobileMenuOpen = ref(false);
const navigation = computed(
  () => (site.value.themeConfig.nav ?? []) as NavigationItem[],
);

function isActive(link: string): boolean {
  const normalizedLink = link.replace(/\/$/, '') || '/';
  const normalizedPath = route.path.replace(/\/$/, '') || '/';

  return normalizedLink === normalizedPath;
}

function closeMobileMenu(): void {
  mobileMenuOpen.value = false;
}
</script>

<template>
  <header class="site-header">
    <div class="site-header__frame">
      <a class="site-brand" :href="withBase('/')">
        <span class="site-brand__mark" aria-hidden="true">
          <Atom :size="22" />
        </span>
        <span class="site-brand__name">ABIN Lab</span>
        <span class="site-brand__divider">/</span>
        <span class="site-brand__subtitle">ABIN Dev</span>
        <span class="site-brand__version">v2.4-stable</span>
      </a>

      <nav class="site-nav" aria-label="主导航">
        <a
          v-for="item in navigation"
          :key="item.link"
          :class="{ 'site-nav__link--active': isActive(item.link) }"
          class="site-nav__link"
          :href="withBase(item.link)"
        >
          {{ item.text }}
        </a>
      </nav>

      <div class="site-header__actions">
        <a
          class="github-link"
          href="https://github.com/abinzhao"
          target="_blank"
          rel="noreferrer"
        >
          <Code2 :size="16" aria-hidden="true" />
          <span>GitHub</span>
          <small>5 repos</small>
        </a>
        <ThemeToggle />
        <button
          class="site-menu-button"
          type="button"
          :aria-expanded="mobileMenuOpen"
          aria-label="切换导航菜单"
          @click="mobileMenuOpen = !mobileMenuOpen"
        >
          <X v-if="mobileMenuOpen" :size="20" aria-hidden="true" />
          <Menu v-else :size="20" aria-hidden="true" />
        </button>
      </div>
    </div>

    <nav v-if="mobileMenuOpen" class="site-mobile-nav" aria-label="移动端主导航">
      <a
        v-for="item in navigation"
        :key="item.link"
        :class="{ 'site-mobile-nav__link--active': isActive(item.link) }"
        class="site-mobile-nav__link"
        :href="withBase(item.link)"
        @click="closeMobileMenu"
      >
        {{ item.text }}
      </a>
    </nav>
  </header>
</template>
