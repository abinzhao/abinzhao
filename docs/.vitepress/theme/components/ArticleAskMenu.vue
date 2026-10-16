<script setup lang="ts">
import {
  BookOpenCheck,
  ChevronDown,
  ListChecks,
  MessageCircleQuestion,
  TextQuote,
} from '@lucide/vue';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { withBase } from 'vitepress';
import {
  buildArticleChatHref,
  type ArticleChatAction,
} from '../composables/article-context';

const props = defineProps<{
  articleHref: string;
}>();

const open = ref(false);
const root = ref<HTMLElement>();

const items: Array<{
  action: ArticleChatAction;
  icon: typeof TextQuote;
  label: string;
}> = [
  { action: 'ask', icon: MessageCircleQuestion, label: '围绕本文问' },
  { action: 'summary', icon: TextQuote, label: '总结本文' },
  { action: 'key-points', icon: ListChecks, label: '提取要点' },
  { action: 'learning-path', icon: BookOpenCheck, label: '后续学习路线' },
];

function href(action: ArticleChatAction): string {
  return buildArticleChatHref(props.articleHref, action, withBase('/'));
}

function handleDocumentClick(event: MouseEvent): void {
  if (!root.value?.contains(event.target as Node)) open.value = false;
}

function handleEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') open.value = false;
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('keydown', handleEscape);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick);
  document.removeEventListener('keydown', handleEscape);
});
</script>

<template>
  <div ref="root" class="article-ask">
    <button
      class="article-ask__trigger"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="open"
      aria-label="问答本文"
      title="问答本文"
      @click.stop="open = !open"
    >
      <MessageCircleQuestion :size="16" aria-hidden="true" />
      <span>问答本文</span>
      <ChevronDown :size="14" aria-hidden="true" />
    </button>
    <nav v-if="open" class="article-ask__menu" aria-label="文章问答动作">
      <a
        v-for="item in items"
        :key="item.action"
        :href="href(item.action)"
        @click="open = false"
      >
        <component :is="item.icon" :size="16" aria-hidden="true" />
        {{ item.label }}
      </a>
    </nav>
  </div>
</template>
