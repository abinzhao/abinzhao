<script setup lang="ts">
import { Moon, Sun } from '@lucide/vue';
import { computed, onMounted, ref } from 'vue';
import {
  applyTheme,
  resolveTheme,
  saveTheme,
  THEME_STORAGE_KEY,
  toggleTheme,
  type Theme,
} from '../composables/theme-state';

const theme = ref<Theme>('dark');
const nextThemeLabel = computed(() =>
  theme.value === 'dark' ? '切换至浅色模式' : '切换至深色模式',
);

function applyStoredTheme(): void {
  const storedTheme = (() => {
    try {
      return window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      return null;
    }
  })();
  const initialTheme = resolveTheme(
    storedTheme,
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  theme.value = initialTheme;
  applyTheme(document.documentElement, initialTheme);
}

function switchTheme(): void {
  const nextTheme = toggleTheme(theme.value);

  theme.value = nextTheme;
  applyTheme(document.documentElement, nextTheme);

  try {
    saveTheme(window.localStorage, nextTheme);
  } catch {
    // Private browsing may deny persistent storage; the current session still updates.
  }
}

onMounted(applyStoredTheme);
</script>

<template>
  <button
    class="theme-toggle"
    type="button"
    :aria-label="nextThemeLabel"
    :title="nextThemeLabel"
    @click="switchTheme"
  >
    <Sun v-if="theme === 'dark'" :size="18" aria-hidden="true" />
    <Moon v-else :size="18" aria-hidden="true" />
  </button>
</template>
