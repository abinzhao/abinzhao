<script setup lang="ts">
import { Atom, Code2, Menu, X } from '@lucide/vue';
import { computed, nextTick, ref, watch } from 'vue';
import { useData, useRoute, withBase } from 'vitepress';
import ThemeToggle from './ThemeToggle.vue';

interface NavigationItem {
  link: string;
  text: string;
}

const { site } = useData();
const route = useRoute();
const mobileMenuOpen = ref(false);
const menuButton = ref<HTMLButtonElement>();
const navigation = computed(
  () => (site.value.themeConfig.nav ?? []) as NavigationItem[],
);

function isActive(link: string): boolean {
  const normalizedLink = link.replace(/\/$/, '') || '/';
  const base = site.value.base;
  const path = route.path.startsWith(base) ? `/${route.path.slice(base.length)}` : route.path;
  const normalizedPath = path.replace(/(?:\.html|\/index)?\/?$/, '') || '/';
  return normalizedLink === '/' ? normalizedPath === '/' : normalizedPath === normalizedLink || normalizedPath.startsWith(`${normalizedLink}/`);
}

function closeMobileMenu(restoreFocus = false): void {
  const wasOpen = mobileMenuOpen.value;
  mobileMenuOpen.value = false;

  if (restoreFocus && wasOpen) {
    void nextTick(() => menuButton.value?.focus());
  }
}

function handleHeaderEscape(): void {
  closeMobileMenu(true);
}

watch(() => route.path, () => closeMobileMenu());
</script>

<template>
  <header class="site-header" @keydown.esc="handleHeaderEscape">
    <div class="site-header__frame">
      <a class="site-brand" :href="withBase('/')">
        <span class="site-brand__mark" aria-hidden="true">
          <Atom :size="22" />
        </span>
        <span class="site-brand__name">阿斌实验室</span>
      </a>

      <nav class="site-nav" aria-label="主导航">
        <a
          v-for="item in navigation"
          :key="item.link"
          :class="{ 'site-nav__link--active': isActive(item.link) }"
          class="site-nav__link"
          :href="withBase(item.link)"
          :aria-current="isActive(item.link) ? 'page' : undefined"
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
        </a>
        <ThemeToggle />
        <button
          ref="menuButton"
          class="site-menu-button"
          type="button"
          :aria-expanded="mobileMenuOpen"
          aria-controls="site-mobile-nav"
          aria-label="切换导航菜单"
          @click="mobileMenuOpen = !mobileMenuOpen"
        >
          <X v-if="mobileMenuOpen" :size="20" aria-hidden="true" />
          <Menu v-else :size="20" aria-hidden="true" />
        </button>
      </div>
    </div>

    <Transition name="mobile-nav">
      <nav
        v-if="mobileMenuOpen"
        id="site-mobile-nav"
        class="site-mobile-nav"
        aria-label="移动端主导航"
      >
        <a
          v-for="item in navigation"
          :key="item.link"
          :class="{ 'site-mobile-nav__link--active': isActive(item.link) }"
          class="site-mobile-nav__link"
          :href="withBase(item.link)"
          :aria-current="isActive(item.link) ? 'page' : undefined"
          @click="closeMobileMenu()"
        >
          {{ item.text }}
        </a>
      </nav>
    </Transition>
  </header>
</template>
