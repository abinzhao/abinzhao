<script setup lang="ts">
import { ArrowRight, ArrowUpRight, Code2, Star } from '@lucide/vue';
import { computed } from 'vue';
import { withBase } from 'vitepress';
import { featuredProjects } from '../../data/projects';

const primaryProject = computed(() => featuredProjects[0]);
const secondaryProjects = computed(() => featuredProjects.slice(1, 3));

function updateSpotlight(event: PointerEvent) {
  const element = event.currentTarget as HTMLElement;
  const rect = element.getBoundingClientRect();
  element.style.setProperty('--spotlight-x', `${event.clientX - rect.left}px`);
  element.style.setProperty('--spotlight-y', `${event.clientY - rect.top}px`);
}
</script>

<template>
  <section class="section projects-section">
    <div class="section-heading">
      <p class="section-index">02 / 项目</p>
      <h2>教程之外，我也在持续把产品做出来</h2>
      <p>真实项目会说明问题、关键选择、实现过程与最终结果。</p>
    </div>

    <article
      v-if="primaryProject"
      :id="primaryProject.repo"
      class="featured-project spotlight-surface"
      @pointermove="updateSpotlight"
    >
      <div class="project-window" aria-hidden="true">
        <div class="project-window__bar">
          <span />
          <span />
          <span />
          <strong>{{ primaryProject.repo }}</strong>
        </div>
        <div class="project-window__body">
          <aside>
            <span class="active">学习路线</span>
            <span>ArkTS</span>
            <span>ArkUI</span>
            <span>项目实践</span>
          </aside>
          <div class="project-window__editor">
            <span class="project-window__label">HarmonyOS / GUIDE</span>
            <strong>从一条可运行的路径开始</strong>
            <p>环境准备 → 页面结构 → 状态管理 → 项目实战</p>
            <div class="project-window__code">
              <span>01</span>
              <code>@Entry</code>
              <span>02</span>
              <code>@Component</code>
              <span>03</span>
              <code>struct TutorialPage</code>
            </div>
          </div>
        </div>
      </div>

      <div class="featured-project__copy">
        <span class="project-category">{{ primaryProject.category }}</span>
        <h3>{{ primaryProject.title }}</h3>
        <p>{{ primaryProject.description }}</p>
        <div class="project-meta">
          <span>{{ primaryProject.language || 'HarmonyOS' }}</span>
          <span v-if="primaryProject.stars">
            <Star :size="15" :stroke-width="1.8" />
            {{ primaryProject.stars }}
          </span>
        </div>
        <div class="project-actions">
          <a :href="withBase(`/projects/#${primaryProject.repo}`)" class="text-link">
            查看项目
            <ArrowRight :size="18" :stroke-width="1.8" />
          </a>
          <a
            :href="primaryProject.htmlUrl"
            class="text-link text-link--muted"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
            <ArrowUpRight :size="17" :stroke-width="1.8" />
          </a>
        </div>
      </div>
    </article>

    <div class="project-rows">
      <article
        v-for="project in secondaryProjects"
        :id="project.repo"
        :key="project.repo"
        class="project-row spotlight-surface"
        @pointermove="updateSpotlight"
      >
        <div class="project-row__visual" aria-hidden="true">
          <Code2 :size="25" :stroke-width="1.6" />
          <span>{{ project.repo }}</span>
          <span class="project-row__line" />
        </div>
        <div class="project-row__copy">
          <span>{{ project.category }}</span>
          <h3>{{ project.title }}</h3>
          <p>{{ project.description }}</p>
        </div>
        <a
          :href="project.htmlUrl"
          target="_blank"
          rel="noreferrer"
          :aria-label="`在 GitHub 查看 ${project.title}`"
        >
          <ArrowUpRight :size="20" :stroke-width="1.8" />
        </a>
      </article>
    </div>

    <a class="section-more" :href="withBase('/projects/')">
      查看全部项目
      <ArrowRight :size="19" :stroke-width="1.8" />
    </a>
  </section>
</template>
