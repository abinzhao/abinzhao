<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { withBase } from 'vitepress';
import LabPreview from '../components/LabPreview.vue';
const supported = ref(false);
onMounted(() => { supported.value = typeof document.startViewTransition === 'function'; });
</script>
<template>
  <section class="transition-demo">
    <p class="technical-label">同文档 / 路由 / 共享身份</p>
    <h2>从这张卡片进入另一个实验</h2>
    <p>点击标题，观察预览和标题进入目标页；浏览器后退恢复当前位置。继续尝试快速导航、主题切换或减少动态效果。</p>
    <article class="transition-target">
      <div data-shared-preview="code-morph"><LabPreview id="code-morph" /></div>
      <a :href="withBase('/labs/code-morph.html')" data-shared-id="code-morph">代码演化时间轴</a>
    </article>
    <p role="status">{{ supported ? '当前浏览器支持 View Transitions。是否播放仍遵循动态效果偏好。' : '当前浏览器使用普通导航；链接、焦点与历史返回保持可用。' }}</p>
    <a :href="withBase('/labs/?category=交互')">返回已筛选的实验列表 →</a>
  </section>
</template>
<style scoped>
.transition-demo{padding:1.5rem}.transition-demo h2{font-size:1.5rem}.transition-demo p{font-size:14px;line-height:1.8;color:var(--site-text-muted);max-width:50rem}
.transition-target{max-width:400px;border:1px solid var(--site-border);border-radius:12px;overflow:hidden;margin:1.5rem 0}
.transition-target>div{height:180px;background:var(--site-bg)}.transition-demo a{display:inline-flex;align-items:center;min-height:44px;color:var(--site-accent)}.transition-target>a{padding:1rem;font-size:1.25rem}
</style>
