<script setup lang="ts">
import { computed, ref } from 'vue';
import ParticleField from './ParticleField.vue';

const density = ref(860);
const responseStrength = ref(0.18);
const paused = ref(false);
const effectiveDensity = computed(() => (paused.value ? 1 : density.value));
</script>

<template>
  <div class="experiment-demo">
    <div class="experiment-demo__canvas">
      <ParticleField
        :key="effectiveDensity"
        :density="effectiveDensity"
        :interactive="!paused"
        :response-strength="responseStrength"
      />
      <p v-if="paused" class="experiment-demo__paused">实验已暂停</p>
    </div>

    <div class="experiment-demo__controls">
      <label>
        <span>粒子密度</span>
        <input
          v-model.lazy.number="density"
          type="range"
          min="320"
          max="1400"
          step="80"
          :disabled="paused"
        />
        <output>{{ density }}</output>
      </label>
      <label>
        <span>指针响应</span>
        <input
          v-model.number="responseStrength"
          type="range"
          min="0.04"
          max="0.34"
          step="0.02"
          :disabled="paused"
        />
        <output>{{ Math.round(responseStrength * 100) }}</output>
      </label>
      <button type="button" @click="paused = !paused">
        {{ paused ? '继续实验' : '暂停实验' }}
      </button>
    </div>
  </div>
</template>
