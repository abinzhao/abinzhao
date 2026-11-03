<script setup lang="ts">
import { computed } from 'vue';
import { withBase } from 'vitepress';
import type { Article } from '../../data/content';
import { experiments, experimentHref } from '../../data/labs';
import ExperimentHost from './ExperimentHost.vue';
import SourceDownload from './SourceDownload.vue';
const props = defineProps<{ article: Article }>();
const demos = computed(() => experiments.filter((demo) => props.article.demoIds?.includes(demo.id)));
</script>

<template>
  <section id="article-practice" class="article-practice" aria-label="实践与源码">
    <h2>实践与源码</h2>
    <p v-if="article.runtime">运行条件：{{ article.runtime }}</p>
    <template v-if="article.source">
      <SourceDownload href="/downloads/site-labs.zip" label="下载同版本站点源码" />
      <p>源码位置：<code>{{ article.source.path }}</code></p>
      <p>解压后进入 abinzhao，使用 Node.js 22 与 pnpm 10.20.0 执行：</p>
      <pre tabindex="0"><code>pnpm install --frozen-lockfile
{{ article.source.command }}</code></pre>
      <p class="article-practice__note">下载包由当前站点源码构建，含锁文件、教程和测试。包内 SOURCE-MANIFEST.json 记录版本与每个文件的 SHA256，可与<a :href="withBase('/downloads/site-labs-manifest.json')">校验清单</a>核对。</p>
    </template>
    <details v-if="article.verification"><summary>验证记录与边界</summary><p>{{ article.verification.evidence }}</p></details>
    <div v-for="demo in demos" :key="demo.id" class="article-practice__demo">
      <a :href="withBase(experimentHref(demo.id))" :data-shared-id="demo.id">打开完整实验：{{ demo.title }} →</a>
      <ExperimentHost :id="demo.id" :title="demo.title" compact />
    </div>
  </section>
</template>

<style scoped>
.article-practice{margin-top:2.5rem;padding-top:1.5rem;border-top:1px solid var(--site-border);scroll-margin-top:100px;min-width:0}
.article-practice h2{font-size:1.5rem}
.article-practice p{font-size:14px;line-height:1.8;overflow-wrap:anywhere}
.article-practice pre{padding:1rem;background:var(--site-code-bg);overflow:auto;border-radius:8px;font:13px/1.7 var(--vp-font-family-mono)}
.article-practice a{color:var(--site-accent);display:inline-flex;align-items:center;min-height:44px}
.article-practice summary{cursor:pointer;min-height:44px;align-content:center;font-size:14px}
.article-practice__note{color:var(--site-text-muted)}
.article-practice__demo{margin-top:1rem;border:1px solid var(--site-border);border-radius:12px;overflow:hidden}
.article-practice__demo>a{padding:.5rem 1rem;font-size:14px}
@media print{.article-practice__demo :deep(.experiment-host){display:none}}
</style>
