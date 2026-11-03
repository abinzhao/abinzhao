<script setup lang="ts">
import { Moon, Sun, SlidersHorizontal, X } from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vitepress';
import {
  applyTheme,
  resolveTheme,
  resolveThemePreference,
  saveTheme,
  THEME_STORAGE_KEY,
  toggleTheme,
  type Theme,
  type ThemePreference,
} from '../composables/theme-state';
import { useMotionPolicy } from '../composables/use-motion-policy';
import { useSharedTransition } from '../composables/use-shared-transition';

const theme = ref<Theme>('dark');
const preference = ref<ThemePreference>('system');
const motion = useMotionPolicy();
const transitions = useSharedTransition();
const route = useRoute();
const settings = ref<HTMLDialogElement>();
const settingsTrigger = ref<HTMLButtonElement>();
let systemQuery: MediaQueryList | undefined;
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
  preference.value = resolveThemePreference(storedTheme);
  applyPreference();
}

function applyPreference(): void {
  theme.value = resolveTheme(preference.value, systemQuery?.matches ?? false);
  applyTheme(document.documentElement, theme.value);
}

function chooseTheme(value: ThemePreference): void {
  transitions.cancel();
  preference.value = value;
  applyPreference();
  try { saveTheme(window.localStorage, value); } catch { /* 隐私模式仅更新当前会话。 */ }
}

function switchTheme(event: MouseEvent): void {
  const value = toggleTheme(theme.value);
  // 意图先提交；被取消的揭幕只能应用最新偏好，不能覆盖后来的点击。
  preference.value = value;
  theme.value = value;
  try { saveTheme(window.localStorage, value); } catch { /* 当前会话仍可用。 */ }
  const commit = () => applyPreference();
  if (document.querySelector('.site-shell--reading') || !motion.policy.value.motion) {
    transitions.cancel();
    commit();
    return;
  }
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  void transitions.run(commit, 'theme', { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
}

function closeSettings(): void {
  settings.value?.close();
}

function systemChanged(): void {
  if (preference.value === 'system') { transitions.cancel(); applyPreference(); }
}
function storageChanged(event: StorageEvent): void {
  if (event.key === THEME_STORAGE_KEY || event.key === null) {
    transitions.cancel();
    applyStoredTheme();
  }
}
onMounted(() => {
  systemQuery = window.matchMedia('(prefers-color-scheme: dark)');
  applyStoredTheme();
  systemQuery.addEventListener('change', systemChanged);
  window.addEventListener('storage', storageChanged);
});
onBeforeUnmount(() => {
  systemQuery?.removeEventListener('change', systemChanged);
  window.removeEventListener('storage', storageChanged);
});
// 导航后设置弹窗的 top layer 不应覆盖新正文。
watch(() => route.path, closeSettings);
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
  <button ref="settingsTrigger" class="theme-toggle display-settings-trigger" type="button" aria-label="显示设置" @click="settings?.showModal()">
    <SlidersHorizontal :size="17" aria-hidden="true" />
  </button>
  <dialog ref="settings" class="display-settings" aria-labelledby="display-settings-title" @click="($event.target === settings) && closeSettings()" @close="settingsTrigger?.focus({ preventScroll: true })">
    <header><h2 id="display-settings-title">显示设置</h2><button type="button" class="theme-toggle" aria-label="关闭显示设置" @click="closeSettings"><X :size="18" /></button></header>
    <label>主题偏好
      <select :value="preference" @change="chooseTheme(($event.target as HTMLSelectElement).value as ThemePreference)">
        <option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option>
      </select>
    </label>
    <label>动态效果
      <select :value="motion.preference.value" @change="motion.setPreference(($event.target as HTMLSelectElement).value as 'auto' | 'minimal' | 'full')">
        <option value="auto">自动</option><option value="minimal">精简</option><option value="full">完整</option>
      </select>
    </label>
    <p>系统的“减少动态效果”设置始终优先。实验由你手动启动。</p>
  </dialog>
</template>
