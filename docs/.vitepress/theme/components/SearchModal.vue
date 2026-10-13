<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { withBase } from 'vitepress';
import { ArrowRight, Search, X } from '@lucide/vue';
import { searchContentItems } from '../../data/search-content';
import { searchContent } from '../utils/search';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const query = ref('');
const input = ref<HTMLInputElement>();
const results = computed(() =>
  searchContent(searchContentItems, query.value).slice(0, 9),
);

function close() {
  emit('close');
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open) {
    close();
  }
}

watch(
  () => props.open,
  async (open) => {
    document.documentElement.classList.toggle('search-open', open);
    if (open) {
      await nextTick();
      input.value?.focus();
    } else {
      query.value = '';
    }
  },
);

onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  document.documentElement.classList.remove('search-open');
});
</script>

<template>
  <Teleport to="body">
    <Transition name="search-modal">
      <div
        v-if="open"
        class="search-modal"
        role="dialog"
        aria-modal="true"
        aria-label="搜索站点内容"
        @click.self="close"
      >
        <div class="search-modal__panel">
          <div class="search-modal__input-row">
            <Search :size="21" :stroke-width="1.8" aria-hidden="true" />
            <input
              ref="input"
              v-model="query"
              type="search"
              placeholder="搜索 Git、HTML、CSS、JavaScript、React、Node.js、AI…"
              aria-label="搜索教程、项目、实验和笔记"
            />
            <button
              class="icon-button"
              type="button"
              aria-label="关闭搜索"
              @click="close"
            >
              <X :size="20" :stroke-width="1.8" />
            </button>
          </div>

          <div class="search-modal__body">
            <p class="search-modal__hint">
              {{ query ? `找到 ${results.length} 条相关内容` : '从这里开始探索' }}
            </p>

            <div v-if="results.length" class="search-results">
              <a
                v-for="result in results"
                :key="result.id"
                class="search-result"
                :href="withBase(result.href)"
                @click="close"
              >
                <span class="search-result__type">{{ result.type }}</span>
                <span class="search-result__content">
                  <strong>{{ result.title }}</strong>
                  <span>{{ result.summary }}</span>
                </span>
                <ArrowRight
                  class="search-result__arrow"
                  :size="18"
                  :stroke-width="1.8"
                  aria-hidden="true"
                />
              </a>
            </div>

            <div v-else class="search-empty">
              <strong>没有找到相关内容</strong>
              <p>换一个关键词，或从全栈学习路线开始。</p>
              <a :href="withBase('/tutorials/')" @click="close">查看教程路线</a>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
