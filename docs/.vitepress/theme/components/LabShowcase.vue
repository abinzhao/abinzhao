<script setup lang="ts">
import { computed, ref } from 'vue';
import { withBase } from 'vitepress';
import { ArrowRight, ArrowUpRight, BrainCircuit, Gauge } from '@lucide/vue';
import { labCategories, labExperiments } from '../../data/labs';
import ParticleField from './ParticleField.vue';

const activeCategory = ref<(typeof labCategories)[number]>('粒子');
const density = ref(920);
const responseStrength = ref(0.16);
const lowQuality = ref(false);

const activeExperiment = computed(
  () =>
    labExperiments.find(
      (experiment) => experiment.category === activeCategory.value,
    ) ?? labExperiments[0],
);
const effectiveDensity = computed(() =>
  lowQuality.value ? 340 : density.value,
);
</script>

<template>
  <section class="section lab-section">
    <div class="section-heading section-heading--lab">
      <p class="section-index">03 / 实验室</p>
      <h2>LAB / 让代码变成可以触摸的效果</h2>
      <p>从粒子与 AI 开始，把技术原理变成可以操作的现场。</p>
    </div>

    <div class="lab-stage">
      <div class="lab-stage__canvas">
        <ParticleField
          :key="effectiveDensity"
          :density="effectiveDensity"
          :response-strength="responseStrength"
          lazy
        />
        <div class="lab-stage__caption">
          <BrainCircuit :size="18" :stroke-width="1.7" />
          <span>粒子正在响应你的指针</span>
        </div>
      </div>

      <aside class="lab-console" aria-label="实验控制台">
        <div class="lab-tabs" role="tablist" aria-label="实验分类">
          <button
            v-for="category in labCategories"
            :key="category"
            type="button"
            role="tab"
            :aria-selected="activeCategory === category"
            :class="{ active: activeCategory === category }"
            @click="activeCategory = category"
          >
            {{ category }}
          </button>
        </div>

        <div class="lab-console__content">
          <span class="lab-status">{{ activeExperiment.status }}</span>
          <h3>{{ activeExperiment.title }}</h3>
          <p>{{ activeExperiment.summary }}</p>

          <div class="lab-control">
            <label for="particle-density">
              <span>粒子密度</span>
              <output>{{ effectiveDensity }}</output>
            </label>
            <input
              id="particle-density"
              v-model.lazy.number="density"
              type="range"
              min="420"
              max="1400"
              step="80"
              :disabled="lowQuality"
            />
          </div>

          <div class="lab-control">
            <label for="response-strength">
              <span>响应强度</span>
              <output>{{ Math.round(responseStrength * 100) }}</output>
            </label>
            <input
              id="response-strength"
              v-model.number="responseStrength"
              type="range"
              min="0.04"
              max="0.34"
              step="0.02"
            />
          </div>

          <label class="quality-toggle">
            <span>
              <Gauge :size="17" :stroke-width="1.7" />
              低质量模式
            </span>
            <input v-model="lowQuality" type="checkbox" />
          </label>

          <div class="lab-actions">
            <a class="button button--primary" :href="withBase(activeExperiment.href)">
              进入实验室
              <ArrowRight :size="18" :stroke-width="1.8" />
            </a>
            <a
              v-if="activeExperiment.sourceUrl"
              class="text-link"
              :href="activeExperiment.sourceUrl"
              target="_blank"
              rel="noreferrer"
            >
              查看实现代码
              <ArrowUpRight :size="17" :stroke-width="1.8" />
            </a>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>
