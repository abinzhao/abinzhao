<script setup lang="ts">
import { ArrowRight } from '@lucide/vue';
import { withBase } from 'vitepress';
import { recentUpdates } from '../../data/updates';
</script>

<template>
  <section class="section updates-section">
    <div class="section-heading">
      <p class="section-index">04 / 更新</p>
      <h2>最近在写</h2>
    </div>

    <div class="updates-list">
      <a
        v-for="item in recentUpdates"
        :key="item.id"
        class="update-row"
        :href="withBase(item.href)"
      >
        <span class="update-row__type">{{ item.type }}</span>
        <span class="update-row__content">
          <strong>{{ item.title }}</strong>
          <span>{{ item.summary }}</span>
        </span>
        <time>{{ item.date }}</time>
        <ArrowRight
          class="update-row__arrow"
          :size="19"
          :stroke-width="1.8"
          aria-hidden="true"
        />
      </a>
    </div>

    <a class="section-more" :href="withBase('/notes/')">
      查看全部内容
      <ArrowRight :size="19" :stroke-width="1.8" />
    </a>
  </section>
</template>
