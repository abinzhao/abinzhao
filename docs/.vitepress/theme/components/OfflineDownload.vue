<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { useData } from 'vitepress';
import { prepareOfflineGroup, type OfflineGroup } from '../assistant/offline-client';
const props = defineProps<{ group: OfflineGroup; label: string }>();
const { site } = useData();
const state = ref<'idle' | 'inspecting' | 'ready' | 'loading' | 'done' | 'error'>('idle');
const notice = ref('');
const bytes = ref(0);
const version = ref('');
const abort = new AbortController();
async function inspect() {
  state.value = 'inspecting';
  notice.value = '';
  try {
    if (import.meta.env.DEV) throw new Error('开发预览不提供离线资源，请使用生产构建。');
    const response = await fetch(`${site.value.base}assistant-assets.json`, { signal: abort.signal, cache: 'no-cache' });
    if (!response.ok) throw new Error('无法读取缓存清单，请重试。');
    const manifest = await response.json();
    if (!Array.isArray(manifest.groups?.[props.group]) || !Number.isFinite(manifest.sizes?.[props.group])) throw new Error('此版本暂无对应离线包。');
    bytes.value = manifest.sizes[props.group] + (props.group === 'site' ? 0 : manifest.sizes.site ?? 0);
    version.value = manifest.version;
    state.value = 'ready';
  } catch (error) {
    if (abort.signal.aborted) return;
    notice.value = error instanceof Error ? error.message : '读取失败，请重试。';
    state.value = 'error';
  }
}
async function download() {
  state.value = 'loading';
  notice.value = '正在缓存，完成前请保持此页面打开…';
  try {
    const report = await prepareOfflineGroup(site.value.base, props.group, true);
    if (abort.signal.aborted) return;
    if (!report.complete) throw new Error('缓存不完整，检查网络或存储空间后可重试。');
    version.value = report.version;
    notice.value = report.waiting ? '新版已缓存，关闭本站所有标签页后重新打开以启用。' : '离线包已缓存。浏览器仍可能回收存储。';
    state.value = 'done';
  } catch (error) {
    if (abort.signal.aborted) return;
    notice.value = error instanceof Error ? error.message : '缓存失败，请重试。';
    state.value = 'error';
  }
}
onBeforeUnmount(() => abort.abort());
</script>

<template>
  <details class="offline-download">
    <summary>{{ label }}</summary>
    <p>仅在确认后缓存本组资源与基础页面，不包含模型权重。</p>
    <p v-if="bytes">预计占用 {{ (bytes / 1024 / 1024).toFixed(2) }} MiB（未压缩资源），版本 {{ version.slice(0, 8) }}。</p>
    <button v-if="state === 'idle' || state === 'error'" type="button" class="button" @click="inspect">查看缓存大小</button>
    <button v-if="state === 'ready'" type="button" class="button" @click="download">确认缓存</button>
    <p v-if="state === 'inspecting'" role="status">正在读取资源清单…</p>
    <p v-if="notice" role="status">{{ notice }}</p>
  </details>
</template>

<style scoped>
.offline-download { margin-block: 1rem; font-size: .8125rem; color: var(--site-text-muted); }
summary { min-height: 44px; display: flex; align-items: center; cursor: pointer; font-weight: 600; color: var(--site-accent); }
summary::before { content: "+"; margin-right: .5rem; }
details[open] summary::before { content: "−"; }
p { margin: .4rem 0 .7rem; overflow-wrap: anywhere; }
</style>
