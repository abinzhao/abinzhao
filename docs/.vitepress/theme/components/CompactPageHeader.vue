<script setup lang="ts">
export interface CompactPageHeaderStat {
  label: string;
  mobilePrimary?: boolean;
  value: number | string;
}

withDefaults(
  defineProps<{
    description?: string;
    eyebrow: string;
    stats?: CompactPageHeaderStat[];
    title: string;
  }>(),
  {
    description: '',
    stats: () => [],
  },
);
</script>

<template>
  <header class="compact-page-header">
    <div class="compact-page-header__copy">
      <p class="technical-label">{{ eyebrow }}</p>
      <div class="compact-page-header__main">
        <h1>{{ title }}</h1>
        <p v-if="description" class="compact-page-header__description">
          {{ description }}
        </p>
        <div v-if="$slots.context" class="compact-page-header__context">
          <slot name="context" />
        </div>
      </div>
    </div>

    <dl v-if="stats.length" class="compact-page-header__stats">
      <div
        v-for="stat in stats"
        :key="stat.label"
        :class="{ 'compact-page-header__stat--mobile': stat.mobilePrimary }"
      >
        <dt>{{ stat.label }}</dt>
        <dd>{{ stat.value }}</dd>
      </div>
    </dl>
  </header>
</template>
