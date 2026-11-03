<script setup lang="ts">
import { ArrowUpRight, ArrowUp, Atom } from '@lucide/vue';
import { withBase } from 'vitepress';
import { vMagnetic } from '../composables/use-pointer-spring';
function toTop(): void {
  window.scrollTo({ top: 0, behavior: document.documentElement.dataset.motion === 'static' ? 'instant' : 'smooth' });
  document.getElementById('page-content')?.focus({ preventScroll: true });
}
</script>

<template>
  <footer class="site-footer site-container">
    <div class="site-footer__identity">
      <a :href="withBase('/')" class="site-footer__brand"><Atom :size="19" aria-hidden="true" /> 阿斌实验室</a>
      <p>记录实践，分享方法，持续构建。</p>
    </div>
    <nav aria-label="页脚导航">
      <a :href="withBase('/blog/')">博客</a>
      <a :href="withBase('/columns/')">专题教程</a>
      <a :href="withBase('/feed.xml')" target="_blank" rel="noopener">RSS 订阅</a>
      <a :href="withBase('/projects/')">开源项目</a>
      <a :href="withBase('/chat/')">AI 助手</a>
      <a href="https://github.com/abinzhao" target="_blank" rel="noopener noreferrer">GitHub <ArrowUpRight :size="14" aria-hidden="true" /></a>
      <button v-magnetic class="button button--secondary" type="button" @click="toTop">回到顶部 <ArrowUp :size="16" aria-hidden="true" /></button>
    </nav>
    <p class="site-footer__note">© {{ new Date().getFullYear() }} 阿斌 · 用 VitePress 构建 · 会话保存在本机</p>
  </footer>
</template>
