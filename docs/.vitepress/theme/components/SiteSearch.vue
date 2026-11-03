<script setup lang="ts">
import { Search, X, ArrowUpRight } from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useRoute, withBase } from 'vitepress';
import type { SearchEntry } from '../../data/search.data';

const route = useRoute();
const trigger = ref<HTMLButtonElement>();
const dialog = ref<HTMLDialogElement>();
const input = ref<HTMLInputElement>();
const query = ref('');
const entries = shallowRef<SearchEntry[]>([]);
const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
let epoch = 0;
let navigating = false;
const terms = computed(() => query.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).slice(0, 8));
const results = computed(() => {
  if (!terms.value.length) return entries.value.filter((entry) => entry.section === '专题').slice(0, 6);
  return entries.value.map((entry) => {
    const text = `${entry.title} ${entry.description} ${entry.tags.join(' ')}`.toLocaleLowerCase();
    const score = terms.value.every((term) => text.includes(term))
      ? terms.value.reduce((sum, term) => sum + (entry.title.toLocaleLowerCase().includes(term) ? 5 : 1), 0) : 0;
    return { entry, score };
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || a.entry.href.localeCompare(b.entry.href)).slice(0, 20).map(({ entry }) => entry);
});

function highlight(text: string): Array<{ text: string; match: boolean }> {
  const pattern = terms.value.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  if (!pattern) return [{ text, match: false }];
  return text.split(new RegExp(`(${pattern})`, 'gi')).map((part) => ({
    text: part, match: terms.value.includes(part.toLocaleLowerCase()),
  }));
}

async function load(): Promise<void> {
  const ticket = ++epoch;
  status.value = 'loading';
  try {
    const { data } = await import('../../data/search.data');
    if (ticket !== epoch) return;
    entries.value = data;
    status.value = 'ready';
  } catch {
    if (ticket === epoch) status.value = 'error';
  }
}
function open(): void {
  if (dialog.value?.open || document.querySelector('dialog[open]')) return;
  navigating = false;
  dialog.value?.showModal();
  void nextTick(() => input.value?.focus());
  if (status.value !== 'ready') void load();
}
function close(): void { dialog.value?.close(); }
function afterClose(): void {
  epoch++;
  if (status.value === 'loading') status.value = 'idle';
  if (!navigating) trigger.value?.focus({ preventScroll: true });
}
function keyboard(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !event.isComposing) {
    event.preventDefault();
    if (dialog.value?.open) close(); else open();
  }
}
function moveToResult(event: KeyboardEvent): void {
  if (event.key !== 'ArrowDown' || event.isComposing) return;
  const first = dialog.value?.querySelector<HTMLAnchorElement>('.site-search-results a');
  if (first) { event.preventDefault(); first.focus(); }
}
function resultKey(event: KeyboardEvent): void {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const links = Array.from(dialog.value?.querySelectorAll<HTMLAnchorElement>('.site-search-results a') ?? []);
  const index = links.indexOf(document.activeElement as HTMLAnchorElement);
  if (index < 0) return;
  event.preventDefault();
  const target = links[index + (event.key === 'ArrowDown' ? 1 : -1)];
  if (target) target.focus();
  else if (event.key === 'ArrowUp') input.value?.focus();
}
watch(() => route.path, () => { navigating = true; close(); });
onMounted(() => {
  window.addEventListener('keydown', keyboard);
  window.addEventListener('site-search-open', open);
});
onBeforeUnmount(() => {
  epoch++;
  window.removeEventListener('keydown', keyboard);
  window.removeEventListener('site-search-open', open);
});
</script>

<template>
  <button ref="trigger" class="theme-toggle search-trigger" type="button" aria-label="搜索站点" aria-keyshortcuts="Control+K Meta+K" title="搜索站点 ⌘ / Ctrl K" @click="open">
    <Search :size="18" aria-hidden="true" />
  </button>
  <dialog ref="dialog" class="site-search-dialog" aria-labelledby="site-search-title" @close="afterClose" @keydown.esc.capture.prevent.stop="close" @keydown="resultKey" @click="($event.target === dialog) && close()">
    <header>
      <h2 id="site-search-title">搜索站点</h2>
      <button class="theme-toggle" type="button" aria-label="关闭搜索" @click="close"><X :size="18" aria-hidden="true" /></button>
    </header>
    <label class="site-search-field"><Search :size="20" aria-hidden="true" />
      <span class="sr-only">搜索教程与文章</span>
      <input ref="input" v-model="query" type="search" maxlength="200" placeholder="查找教程、技术或文章…" autocomplete="off" @keydown="moveToResult" />
      <kbd>ESC</kbd>
    </label>
    <p class="site-search-status" role="status">
      {{ status === 'loading' ? '正在载入站点目录…' : status === 'error' ? '目录载入失败。' : terms.length ? `找到 ${results.length} 条结果` : '从一个学习路径开始' }}
    </p>
    <button v-if="status === 'error'" class="button button--secondary" type="button" @click="load">重试</button>
    <ul v-else class="site-search-results">
      <li v-for="entry in results" :key="entry.href">
        <a :href="withBase(entry.href)" @click="navigating = true; close()">
          <small>{{ entry.section }}</small>
          <strong><template v-for="(part, index) in highlight(entry.title)" :key="index"><mark v-if="part.match">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template><ArrowUpRight :size="17" aria-hidden="true" /></strong>
          <span><template v-for="(part, index) in highlight(entry.description)" :key="index"><mark v-if="part.match">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span>
        </a>
      </li>
    </ul>
    <p v-if="status === 'ready' && !results.length" class="site-search-status">没有匹配的内容，试试其他关键词。</p>
    <footer>目录搜索在本机完成 · ↑↓ 或 Tab 浏览结果</footer>
  </dialog>
</template>
