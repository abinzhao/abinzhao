<script setup lang="ts">
import KnowledgeMap from "./KnowledgeMap.vue";
import { withBase } from "../../site";
import { data as catalog } from "../../data/catalog.data";
import { tutorialGroups } from "../../data/tutorials";

const startingTopics = ["git", "javascript", "react", "modern-frontend", "node-fullstack"];
const recentPaths = startingTopics.flatMap((topic) =>
  catalog.filter((page) => page.topic === topic && page.order === 10),
).map((page, index) => ({
  index: String(index + 1).padStart(2, "0"),
  title: page.title, description: page.description,
  meta: "基础 · 实践 · 进阶", href: withBase(page.url),
}));
const topicCount = tutorialGroups.flatMap((group) => group.items).length;

const projects = [
  {
    name: "harmony-next-blog",
    description: "HarmonyOS Next、ArkTS 与 ArkUI 的学习记录和实践教程。",
    href: "https://github.com/abinzhao/harmony-next-blog",
  },
  {
    name: "cps",
    description: "围绕命令行图片处理建立可复用的 Node.js 工具。",
    href: "https://github.com/abinzhao/cps",
  },
  {
    name: "scio-design",
    description: "多包管理、工程规范与前端效能组件的实践仓库。",
    href: "https://github.com/abinzhao/scio-design",
  },
];
</script>

<template>
  <div class="home-page">
    <section class="home-hero" aria-labelledby="home-title">
      <div class="home-hero__art" aria-hidden="true"></div>
      <div class="home-hero__content">
        <p class="home-hero__eyebrow">阿斌的开发者知识库</p>
        <h1 id="home-title">abinzhao</h1>
        <p class="home-hero__title">让知识成体系。<br />让实践有回响。</p>
        <p class="home-hero__lead">
          从 Git 与 Shell 出发，走进浏览器、前端框架与 Node 全栈。
          在概念、代码与验证之间，建立自己的开发能力。
        </p>
        <div class="home-hero__actions">
          <a class="site-button site-button--primary" :href="withBase('/tutorials/')">
            开始学习
          </a>
          <a class="site-button" :href="withBase('/about.html')">认识阿斌</a>
        </div>
        <p class="home-hero__signature">{{ topicCount }} 条学习路径 · {{ catalog.length }} 篇教程 · 持续积累</p>
      </div>
    </section>

    <section class="home-band home-band--map" aria-labelledby="knowledge-title">
      <header class="home-section-heading">
        <span>01</span>
        <div>
          <h2 id="knowledge-title">知识地图</h2>
          <p>从共同基础出发，沿学习依赖进入框架、工程与智能应用。</p>
        </div>
      </header>
      <KnowledgeMap />
    </section>

    <section class="home-band" aria-labelledby="start-title">
      <header class="home-section-heading">
        <span>02</span>
        <div>
          <h2 id="start-title">从这里开始</h2>
          <p>先读路径，再进入具体工具和实现。</p>
        </div>
      </header>
      <div class="learning-list">
        <a
          v-for="item in recentPaths"
          :key="item.title"
          class="learning-list__item"
          :href="item.href"
        >
          <span>{{ item.index }}</span>
          <div>
            <h3>{{ item.title }}</h3>
            <p>{{ item.description }}</p>
          </div>
          <small>{{ item.meta }}</small>
        </a>
      </div>
    </section>

    <section class="home-band home-band--split" aria-labelledby="topics-title">
      <header class="home-section-heading">
        <span>03</span>
        <div>
          <h2 id="topics-title">专题路径</h2>
          <p>围绕一个完整目标，串联多项技术与工程判断。</p>
        </div>
      </header>
      <div class="home-feature-copy">
        <h3>从零建立现代前端工程</h3>
        <p>
          从仓库约束、类型系统、测试，到自动化发布，逐步建立可维护的开发环境。
        </p>
        <a :href="withBase('/topics/frontend-project.html')">进入专题 →</a>
      </div>
    </section>

    <section class="home-band" aria-labelledby="projects-title">
      <header class="home-section-heading">
        <span>04</span>
        <div>
          <h2 id="projects-title">项目证据</h2>
          <p>项目不是陈列，而是技术判断在真实约束中的结果。</p>
        </div>
      </header>
      <div class="project-lines">
        <a
          v-for="project in projects"
          :key="project.name"
          :href="project.href"
          class="project-lines__item"
          target="_blank"
          rel="noreferrer"
        >
          <strong>{{ project.name }}</strong>
          <span>{{ project.description }}</span>
          <small>GitHub</small>
        </a>
      </div>
    </section>

    <section class="home-band home-about" aria-labelledby="about-title">
      <header class="home-section-heading">
        <span>05</span>
        <div>
          <h2 id="about-title">阿斌 / 纯爱掌门人</h2>
          <p>认真对待技术，也认真对待长期关系、清晰表达和可验证结果。</p>
        </div>
      </header>
      <a class="site-button" :href="withBase('/about.html')">了解更多</a>
    </section>
  </div>
</template>
