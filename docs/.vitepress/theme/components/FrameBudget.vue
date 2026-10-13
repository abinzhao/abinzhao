<script setup lang="ts">
import { computed, ref } from 'vue';
const rate = ref(60);
const costs = [
  { name: 'JavaScript', value: 5, color: '#819fff' },
  { name: '布局', value: 3, color: '#61c9b5' },
  { name: '绘制', value: 4, color: '#dba765' },
  { name: '合成', value: 1, color: '#ab97e2' },
];
const budget = computed(() => 1000 / rate.value);
const total = costs.reduce((sum, item) => sum + item.value, 0);
</script>

<template>
  <figure class="frame-budget">
    <div class="frame-budget__head"><strong>一帧能做多少工作？</strong><label>刷新率 <select v-model.number="rate" aria-label="图表刷新率"><option :value="60">60 Hz</option><option :value="120">120 Hz</option><option :value="144">144 Hz</option></select></label></div>
    <svg viewBox="0 0 640 140" role="img" :aria-label="`示意工作耗时13毫秒，${rate}Hz的帧预算${budget.toFixed(2)}毫秒`">
      <g v-for="(item, index) in costs" :key="item.name">
        <rect :x="40 + costs.slice(0, index).reduce((sum, cost) => sum + cost.value, 0) * 27" y="35" :width="item.value * 27 - 3" height="38" rx="4" :fill="item.color" opacity=".8" />
        <text :x="40 + costs.slice(0, index).reduce((sum, cost) => sum + cost.value, 0) * 27 + 6" y="59" fill="#101827" font-size="11">{{ item.value }}ms</text>
      </g>
      <line :x1="40 + budget * 27" :x2="40 + budget * 27" y1="18" y2="93" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 4" />
      <text :x="40 + budget * 27" y="112" text-anchor="middle" fill="currentColor" font-size="11">预算 {{ budget.toFixed(2) }}ms</text>
      <text x="40" y="112" fill="currentColor" font-size="11">0</text>
    </svg>
    <div class="frame-budget__legend"><span v-for="item in costs" :key="item.name"><i :style="{ background: item.color }" />{{ item.name }}</span></div>
    <figcaption>示意数据，非本站测量值。总计 {{ total }}ms；{{ total > budget ? '超过单帧预算，需要减少工作或拆分任务。' : '留出余量处理输入与其他浏览器工作。' }}刷新率越高，每帧预算越少。</figcaption>
  </figure>
</template>

<style scoped>
.frame-budget { margin: 24px 0; border: 1px solid var(--site-line); border-radius: 12px; padding: 20px; background: var(--site-surface); }
.frame-budget__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; font-size: 13px; }
.frame-budget label { color: var(--site-text-muted); font-size: 11px; }
.frame-budget select { min-height: 44px; padding: 0 8px; margin-left: 6px; color: var(--site-text); background: var(--site-surface-muted); border: 1px solid var(--site-line); border-radius: 6px; }
svg { display: block; width: 100%; color: var(--site-text-muted); }
.frame-budget__legend { display: flex; flex-wrap: wrap; gap: 16px; font-size: 11px; color: var(--site-text-muted); }
.frame-budget__legend span { display: flex; align-items: center; gap: 6px; }
i { display: block; width: 8px; height: 8px; border-radius: 2px; }
figcaption { border-top: 1px solid var(--site-line); padding-top: 12px; margin-top: 16px; color: var(--site-text-muted); font-size: 11px; line-height: 1.8; }
</style>
