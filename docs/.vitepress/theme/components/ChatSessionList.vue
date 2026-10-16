<script setup lang="ts">
import { MessageCircle, Plus, Trash2 } from '@lucide/vue';
import type { Conversation } from '../composables/chat';

defineProps<{
  activeId: string | null;
  disabled?: boolean;
  sessions: Conversation[];
}>();

const emit = defineEmits<{
  create: [];
  delete: [session: Conversation];
  select: [session: Conversation];
}>();
</script>

<template>
  <div class="chat-session-list">
    <button
      class="button button--primary chat-new"
      :disabled="disabled"
      type="button"
      @click="emit('create')"
    >
      <Plus :size="17" aria-hidden="true" />
      新会话
    </button>

    <div class="chat-session-list__heading">
      <h2>最近会话</h2>
      <span>{{ sessions.length }}/30</span>
    </div>

    <p v-if="!sessions.length" class="chat-session-list__empty">
      第一段对话，从一个问题开始。
    </p>

    <ul v-else>
      <li
        v-for="session in sessions"
        :key="session.id"
        :class="{ 'chat-session--active': session.id === activeId }"
      >
        <button
          :aria-current="session.id === activeId ? 'true' : undefined"
          class="chat-session"
          :disabled="disabled"
          type="button"
          @click="emit('select', session)"
        >
          <MessageCircle :size="15" aria-hidden="true" />
          <span>
            <strong>{{ session.title }}</strong>
            <small v-if="session.legacyRecord">旧版记录</small>
          </span>
        </button>
        <button
          class="icon-button"
          :disabled="disabled"
          :aria-label="`删除会话：${session.title}`"
          type="button"
          @click="emit('delete', session)"
        >
          <Trash2 :size="15" aria-hidden="true" />
        </button>
      </li>
    </ul>

    <p class="chat-session-list__note">
      会话只保存在当前浏览器，不会跨设备同步。
    </p>
  </div>
</template>
