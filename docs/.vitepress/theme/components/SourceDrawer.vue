<script setup lang="ts">
import { ref, useId } from 'vue';
import { withBase } from 'vitepress';
import type { Citation } from '../assistant/prompt-builder';
defineProps<{ sources: Citation[] }>();
const dialog = ref<HTMLDialogElement>();
const trigger = ref<HTMLButtonElement>();
const version = ref('');
const titleId = useId();
async function open() {
  dialog.value?.showModal();
  try { version.value = (await import('../../data/knowledge-index.data')).data.contentVersion ?? ''; } catch { version.value = ''; }
}
</script>
<template>
  <button ref="trigger" class="chat-text-button" type="button" @click="open">查看 {{ sources.length }} 条来源</button>
  <dialog ref="dialog" class="source-drawer model-setup" :aria-labelledby="titleId" @close="trigger?.focus()" @click="(event) => { if (event.target === dialog) dialog?.close(); }">
    <header><h2 :id="titleId">回答来源</h2><button class="icon-button" aria-label="关闭来源" type="button" @click="dialog?.close()">×</button></header>
    <p>编号对应生成时提供的原文；引用存在不代表回答中的每个事实都正确。</p>
    <ul>
      <li v-for="source in sources" :key="source.id">
        <a class="chat-source-link" :href="withBase(source.href)">{{ source.id }} · {{ source.title }}<small>{{ source.sectionTitle }}</small></a>
        <p v-if="version && version !== source.contentVersion">文章已更新，此回答引用的是旧版本，请重新提问核对。</p>
      </li>
    </ul>
  </dialog>
</template>
