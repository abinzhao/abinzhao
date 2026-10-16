<script setup lang="ts">
import {
  BadgeCheck,
  CircleHelp,
  ExternalLink,
  Info,
} from '@lucide/vue';
import { computed } from 'vue';
import { withBase } from 'vitepress';
import type { StructuredReply } from '../composables/local-assistant';

const props = defineProps<{
  reply: StructuredReply;
}>();

const emit = defineEmits<{
  clarify: [question: string];
}>();

const confidence = computed(() => {
  if (props.reply.confidence.level === 'high') {
    return { icon: BadgeCheck, label: '高' };
  }
  if (props.reply.confidence.level === 'medium') {
    return { icon: Info, label: '中' };
  }
  return { icon: CircleHelp, label: '资料不足' };
});
</script>

<template>
  <section class="chat-answer">
    <p class="chat-answer__confidence" :data-level="reply.confidence.level">
      <component :is="confidence.icon" :size="15" aria-hidden="true" />
      可信度：{{ confidence.label }}
    </p>

    <section
      v-for="(block, blockIndex) in reply.blocks"
      :key="`${block.kind}-${blockIndex}`"
      class="chat-answer__block"
      :class="`chat-answer__block--${block.kind}`"
    >
      <h3 v-if="block.heading">{{ block.heading }}</h3>
      <p v-if="block.kind === 'paragraph' && block.items[0]">
        {{ block.items[0].text }}
      </p>
      <ol v-else-if="block.kind === 'steps'">
        <li v-for="item in block.items" :key="`${item.text}-${item.sourceIds.join('-')}`">
          {{ item.text }}
        </li>
      </ol>
      <ul v-else-if="block.items.length">
        <li v-for="item in block.items" :key="`${item.text}-${item.sourceIds.join('-')}`">
          {{ item.text }}
        </li>
      </ul>
    </section>

    <div v-if="reply.clarification?.length" class="chat-answer__clarifications">
      <button
        v-for="option in reply.clarification"
        :key="option"
        type="button"
        @click="emit('clarify', option)"
      >
        {{ option }}
      </button>
    </div>

    <nav v-if="reply.sources.length" class="chat-answer__sources" aria-label="参考资料">
      <a
        v-for="source in reply.sources"
        :key="source.id"
        class="chat-source-link"
        :href="withBase(source.href)"
      >
        <span>
          {{ source.title }}
          <small v-if="source.sectionTitle">{{ source.sectionTitle }}</small>
        </span>
        <ExternalLink :size="14" aria-hidden="true" />
      </a>
    </nav>
  </section>
</template>
