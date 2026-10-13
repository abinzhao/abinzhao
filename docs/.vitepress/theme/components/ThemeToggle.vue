<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Monitor, Moon, Sun } from '@lucide/vue';
import { useData } from 'vitepress';
import {
  normalizeThemePreference,
  resolveThemePreference,
  type ThemePreference,
} from '../utils/theme';

const STORAGE_KEY = 'vitepress-theme-appearance';
const { isDark } = useData();
const preference = ref<ThemePreference>('system');
let mediaQuery: MediaQueryList | undefined;

const icon = computed(() => {
  if (preference.value === 'system') return Monitor;
  return preference.value === 'dark' ? Moon : Sun;
});

const label = computed(() => {
  if (preference.value === 'system') return '主题：跟随系统';
  return preference.value === 'dark' ? '主题：深色' : '主题：浅色';
});

function applyTheme(nextPreference: ThemePreference) {
  preference.value = nextPreference;
  const systemPrefersDark = mediaQuery?.matches ?? false;
  isDark.value =
    resolveThemePreference(nextPreference, systemPrefersDark) === 'dark';
  localStorage.setItem(
    STORAGE_KEY,
    nextPreference === 'system' ? 'auto' : nextPreference,
  );
}

function cycleTheme() {
  const next: Record<ThemePreference, ThemePreference> = {
    system: 'light',
    light: 'dark',
    dark: 'system',
  };
  applyTheme(next[preference.value]);
}

function handleSystemThemeChange() {
  if (preference.value === 'system') {
    applyTheme('system');
  }
}

onMounted(() => {
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const stored = localStorage.getItem(STORAGE_KEY);
  preference.value = normalizeThemePreference(
    stored === 'auto' ? 'system' : stored,
  );
  applyTheme(preference.value);
  mediaQuery.addEventListener('change', handleSystemThemeChange);
});

onUnmounted(() => {
  mediaQuery?.removeEventListener('change', handleSystemThemeChange);
});
</script>

<template>
  <button
    class="icon-button"
    type="button"
    :title="label"
    :aria-label="label"
    @click="cycleTheme"
  >
    <component :is="icon" :size="20" :stroke-width="1.75" />
  </button>
</template>
