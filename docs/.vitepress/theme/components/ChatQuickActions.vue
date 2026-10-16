<script setup lang="ts">
import {
  BookOpenCheck,
  Compass,
  GitCompareArrows,
  ListChecks,
  Search,
  Shuffle,
  Sparkles,
  TextQuote,
} from '@lucide/vue';
import type {
  KnowledgeScope,
  QuickAction,
} from '../composables/local-assistant';

defineProps<{
  action: QuickAction;
  disabled?: boolean;
  hasArticle: boolean;
  scope: KnowledgeScope;
}>();

const emit = defineEmits<{
  'update:action': [action: QuickAction];
  'update:scope': [scope: KnowledgeScope];
  special: [action: 'random-topic' | 'study-task'];
}>();

const actions = [
  { icon: Search, label: '找资料', value: 'lookup' },
  { icon: TextQuote, label: '总结', value: 'summarize' },
  { icon: GitCompareArrows, label: '对比', value: 'compare' },
  { icon: Compass, label: '学习路线', value: 'learning-path' },
  { icon: ListChecks, label: '排查清单', value: 'troubleshoot' },
] as const;

const scopes = [
  { label: '全站', value: 'site' },
  { label: '博客', value: 'blog' },
  { label: '专题', value: 'columns' },
] as const;
</script>

<template>
  <div class="chat-tools">
    <div class="chat-scope" role="group" aria-label="来源范围">
      <button
        v-for="item in scopes"
        :key="item.value"
        :aria-pressed="scope === item.value"
        :disabled="disabled"
        :class="{ active: scope === item.value }"
        type="button"
        @click="emit('update:scope', item.value)"
      >
        {{ item.label }}
      </button>
      <button
        v-if="hasArticle"
        :aria-pressed="scope === 'article'"
        :disabled="disabled"
        :class="{ active: scope === 'article' }"
        type="button"
        @click="emit('update:scope', 'article')"
      >
        当前文章
      </button>
    </div>

    <details class="chat-advanced">
      <summary>更多动作</summary>
      <div class="chat-actions" role="group" aria-label="问答动作">
      <button
        v-for="item in actions"
        :key="item.value"
        :aria-pressed="action === item.value"
        :disabled="disabled"
        :class="{ active: action === item.value }"
        :title="item.label"
        type="button"
        @click="emit('update:action', item.value)"
      >
        <component :is="item.icon" :size="16" aria-hidden="true" />
        <span>{{ item.label }}</span>
      </button>
      <button
        title="随机探索"
        :disabled="disabled"
        type="button"
        @click="emit('special', 'random-topic')"
      >
        <Shuffle :size="16" aria-hidden="true" />
        <span>随机探索</span>
      </button>
      <button
        title="15 分钟学习任务"
        :disabled="disabled"
        type="button"
        @click="emit('special', 'study-task')"
      >
        <BookOpenCheck :size="16" aria-hidden="true" />
        <span>15 分钟</span>
        <Sparkles class="chat-actions__spark" :size="10" aria-hidden="true" />
      </button>
      </div>
    </details>
  </div>
</template>
