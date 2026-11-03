<script setup lang="ts">
import { Download } from '@lucide/vue';
import { onBeforeUnmount, ref } from 'vue';
import { withBase } from 'vitepress';
import { vMagnetic } from '../composables/use-pointer-spring';
const props = defineProps<{ href: string; label: string }>();
const status = ref<'idle' | 'loading' | 'done' | 'error' | 'stopped'>('idle');
const received = ref(0);
const total = ref<number>();
let controller: AbortController | undefined;
let objectUrl: string | undefined;
function cancel() { controller?.abort(); status.value = 'stopped'; }
async function download(event: MouseEvent) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (status.value === 'loading') return;
  controller?.abort();
  const task = new AbortController();
  controller = task;
  status.value = 'loading';
  received.value = 0;
  total.value = undefined;
  try {
    const response = await fetch(withBase(props.href), { signal: task.signal });
    if (!response.ok || !response.body) throw new Error('download failed');
    const bytes = Number(response.headers.get('content-length'));
    if (bytes > 0 && !response.headers.get('content-encoding')) total.value = bytes;
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      task.signal.throwIfAborted();
      chunks.push(value);
      received.value += value.byteLength;
    }
    task.signal.throwIfAborted();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(new Blob(chunks, { type: 'application/zip' }));
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = props.href.split('/').pop() ?? 'source.zip';
    link.click();
    status.value = 'done';
  } catch {
    if (controller === task) status.value = task.signal.aborted ? 'stopped' : 'error';
  }
}
onBeforeUnmount(() => { controller?.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); });
</script>
<template>
  <span class="source-download">
    <a v-magnetic class="button button--secondary" :href="withBase(href)" download @click="download"><Download :size="17" aria-hidden="true" />{{ label }}</a>
    <span v-if="status !== 'idle'" class="source-download__status" :data-task="status" role="status">
      <i aria-hidden="true" />
      <template v-if="status === 'loading'">正在接收 {{ Math.round(received / 1024) }} KB<template v-if="total"> / {{ Math.round(total / 1024) }} KB</template><template v-else> · 总量未知</template></template>
      <template v-else-if="status === 'done'">源码已交给浏览器保存</template>
      <template v-else-if="status === 'stopped'">下载已取消，可重新下载</template>
      <template v-else>下载失败，请重试或使用原始链接</template>
    </span>
    <progress v-if="status === 'loading'" :value="total ? received : undefined" :max="total ?? 1" aria-label="源码下载进度" />
    <button v-if="status === 'loading'" type="button" class="button" @click="cancel">取消下载</button>
    <a v-if="status === 'error'" :href="withBase(href)" download>原始源码链接</a>
  </span>
</template>
<style>
.source-download { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; max-width: 100%; }
.source-download__status { display: inline-flex; gap: 6px; align-items: center; font-size: 13px; color: var(--site-text-muted); }
.source-download__status i { width: 6px; height: 6px; flex: none; border-radius: 50%; background: var(--site-accent); }
.source-download progress { width: 100px; accent-color: var(--site-accent); }
.source-download__status[data-task='loading'] i { animation: task-signal 1s ease-in-out infinite alternate; }
@keyframes task-signal { to { opacity: .35; transform: scale(.75); } }
</style>
