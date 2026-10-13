<script setup lang="ts">
import { computed, ref } from 'vue';
import { withBase } from 'vitepress';
import { ArrowRight, CheckCircle2 } from '@lucide/vue';
import { tutorialStages } from '../../data/tutorials';
import { data as lessonCode } from '../../data/lesson-code.data';

const activeId = ref(tutorialStages[0].id);
const activeStage = computed(
  () =>
    tutorialStages.find((stage) => stage.id === activeId.value) ??
    tutorialStages[0],
);
</script>

<template>
  <section id="roadmap" class="section roadmap-section">
    <div class="section-heading">
      <p class="section-index">01 / 教程</p>
      <h2>从零基础，到能独立交付全栈产品</h2>
      <p>不是零散技巧合集，而是一条可以持续推进的学习路径。</p>
    </div>

    <div class="roadmap-layout">
      <div class="roadmap-list" role="list" aria-label="全栈学习路线">
        <a
          v-for="stage in tutorialStages"
          :key="stage.id"
          :href="withBase(stage.href)"
          class="roadmap-item"
          :class="{ active: stage.id === activeId }"
          :aria-current="stage.id === activeId ? 'step' : undefined"
          @mouseenter="activeId = stage.id"
          @focus="activeId = stage.id"
        >
          <span class="roadmap-item__node">{{ stage.number }}</span>
          <span class="roadmap-item__copy">
            <strong>{{ stage.title }}</strong>
            <span>{{ stage.description }}</span>
          </span>
          <span class="roadmap-item__tech">
            {{ stage.technologies.join(' / ') }}
          </span>
        </a>
      </div>

      <div class="lesson-preview">
        <div class="lesson-preview__topbar">
          <span>tutorial.md</span>
          <span>{{ activeStage.number }}</span>
        </div>
        <div class="lesson-preview__content">
          <p class="lesson-preview__stage">{{ activeStage.title }}</p>
          <h3>{{ activeStage.lessonTitle }}</h3>
          <p>{{ activeStage.lessonSummary }}</p>

          <div class="lesson-preview__steps">
            <span><CheckCircle2 :size="16" /> 本章目标</span>
            <span><CheckCircle2 :size="16" /> 操作步骤</span>
            <span><CheckCircle2 :size="16" /> 完整代码</span>
            <span><CheckCircle2 :size="16" /> 效果验证</span>
          </div>

          <div class="vp-doc lesson-preview__code" v-html="lessonCode[activeStage.id]" />

          <a class="text-link" :href="withBase(activeStage.href)">
            开始这个阶段
            <ArrowRight :size="18" :stroke-width="1.8" />
          </a>
        </div>
      </div>
    </div>

    <a class="section-more" :href="withBase('/tutorials/')">
      查看完整教程路线
      <ArrowRight :size="19" :stroke-width="1.8" />
    </a>
  </section>
</template>
