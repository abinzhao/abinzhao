<script setup lang="ts">
import { useId } from 'vue';
defineProps<{ id: string }>();
const uid = useId();
const points = Array.from({ length: 96 }, (_, index) => {
  const angle = index * 2.399963;
  const radius = Math.sqrt(index) * 8;
  return { x: 180 + Math.cos(angle) * radius * 1.6, y: 100 + Math.sin(angle) * radius * .85, r: index % 5 === 0 ? 2.4 : 1.3 };
});
</script>

<template>
  <svg class="lab-preview" viewBox="0 0 360 200" fill="none" aria-hidden="true">
    <defs>
      <linearGradient :id="`${uid}-spectrum`" x1="0" y1="0" x2="1" y2="1"><stop stop-color="var(--site-accent)" /><stop offset=".45" stop-color="#718fc8" /><stop offset=".7" stop-color="#d9989b" /><stop offset="1" stop-color="var(--site-accent)" /></linearGradient>
    </defs>
    <path d="M20 100H340 M180 20V180" stroke="currentColor" opacity=".12" stroke-dasharray="2 6" />
    <g v-if="id === 'particles'" fill="currentColor">
      <circle v-for="(point, index) in points" :key="index" :cx="point.x" :cy="point.y" :r="point.r" :opacity=".35 + (index % 5) * .15" />
      <path d="M144 80L126 100L144 120 M216 80L234 100L216 120 M193 72L167 128" stroke="currentColor" stroke-width="3" fill="none" />
    </g>
    <g v-else-if="id === 'spectral'" :stroke="`url(#${uid}-spectrum)`">
      <ellipse v-for="n in 18" :key="n" cx="180" cy="100" :rx="90 - n * 2.1" :ry="65 - n * 1.5" :transform="`rotate(${n * 7} 180 100)`" :opacity=".3 + n / 26" stroke-width="1.6" />
      <circle cx="238" cy="45" r="4" fill="currentColor" stroke="none" />
      <path d="M238 45L200 82" stroke-dasharray="3 5" />
    </g>
    <g v-else-if="id === 'knowledge-graph' || id === 'execution'" stroke="currentColor">
      <path d="M90 65L180 100L270 50 M180 100L250 145 M180 100L95 145 M90 65L95 145 M270 50L250 145" opacity=".4" />
      <circle v-for="(point, i) in [[90,65],[180,100],[270,50],[250,145],[95,145]]" :key="i" :cx="point[0]" :cy="point[1]" :r="i === 1 ? 18 : 9" :fill="i === 1 ? 'var(--site-accent)' : 'var(--site-surface)'" />
      <circle cx="180" cy="100" r="4" fill="var(--site-bg)" stroke="none" />
    </g>
    <g v-else-if="id === 'layers' || id === 'rendering'" stroke="currentColor" stroke-linejoin="round">
      <path v-for="n in 4" :key="n" :d="`M80 ${55 + n * 20}L170 ${20 + n * 20}L280 ${55 + n * 20}L190 ${90 + n * 20}Z`" fill="var(--site-surface)" :opacity=".3 + n * .17" />
      <path d="M190 70V180" opacity=".5" stroke-dasharray="3 5" />
    </g>
    <g v-else-if="id === 'timeline'" stroke="currentColor">
      <path d="M65 142C110 142 100 80 152 80S220 50 295 50" opacity=".65" stroke-width="2" />
      <g v-for="(point, i) in [[65,142],[152,80],[250,53]]" :key="i">
        <circle :cx="point[0]" :cy="point[1]" r="7" fill="var(--site-surface)" stroke-width="2" />
        <path :d="`M${point[0]} ${point[1]+17}v18h32`" opacity=".4" />
      </g>
    </g>
    <g v-else stroke="currentColor">
      <rect v-for="n in 3" :key="n" :x="42 + (n-1) * 94" :y="50 + (n % 2) * 16" width="80" height="84" rx="6" :opacity=".45 + n * .17" fill="var(--site-surface)" />
      <path v-for="n in 3" :key="`line-${n}`" :d="`M${54+(n-1)*94} ${80+(n%2)*16}h32m-32 12h54m-54 12h42`" stroke-linecap="round" />
      <path d="M122 100h14m80 0h14" opacity=".4" />
    </g>
  </svg>
</template>
