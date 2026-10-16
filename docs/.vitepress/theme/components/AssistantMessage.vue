<script setup lang="ts">
import { Check, Copy } from '@lucide/vue';
import { computed } from 'vue';
import { useData, withBase } from 'vitepress';
import type { ChatMessage } from '../composables/chat';
import { renderAnswerMarkdown } from '../assistant/citations';
import ChatAnswer from './ChatAnswer.vue';
import SourceDrawer from './SourceDrawer.vue';
const props = defineProps<{ message: ChatMessage; copied: boolean }>();
const emit = defineEmits<{ copy: []; clarify: [question: string] }>();
const { site } = useData();
const html = computed(() => props.message.provenance === 'webllm' && props.message.status !== 'streaming'
  ? renderAnswerMarkdown(props.message.content, props.message.citations ?? [], site.value.base) : '');
</script>
<template>
  <article class="chat-message" :class="`chat-message--${message.role}`">
    <header>
      <span>{{ message.role === 'user' ? '我' : message.provenance === 'webllm' ? '本地 AI 助手' : '站内资料助手' }}</span>
      <small v-if="message.legacyRecord || message.provenance === 'legacy'">旧版记录</small>
      <small v-else-if="message.status === 'streaming'">正在生成</small>
      <small v-else-if="message.status === 'error'">未完成</small>
      <small v-else-if="message.status === 'stopped'">已停止</small>
    </header>
    <div v-if="html" class="chat-message__markdown" v-html="html" />
    <p v-else-if="message.role === 'user' || !message.reply" class="chat-message__text">{{ message.content || (message.status === 'streaming' ? '正在读取资料…' : '回答已中断，尚未生成内容。') }}</p>
    <ChatAnswer v-if="message.reply && message.provenance !== 'webllm'" :reply="message.reply" @clarify="emit('clarify', $event)" />
    <nav v-else-if="message.sources?.length" class="chat-answer__sources" aria-label="旧版参考资料">
      <a v-for="source in message.sources" :key="source.href" class="chat-source-link" :href="withBase(source.href)">{{ source.title }}</a>
    </nav>
    <p v-if="message.citationWarning" class="chat-notice">{{ message.citationWarning }}</p>
    <footer v-if="message.role === 'assistant' && message.status !== 'streaming'">
      <button class="chat-text-button" type="button" @click="emit('copy')"><Check v-if="copied" :size="14" aria-hidden="true" /><Copy v-else :size="14" aria-hidden="true" />{{ copied ? '已复制' : '复制回答' }}</button>
      <SourceDrawer v-if="message.citations?.length" :sources="message.citations" />
    </footer>
  </article>
</template>
