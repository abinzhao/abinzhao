<script setup lang="ts">
import { ArrowUp, ArrowUpRight } from '@lucide/vue';
import { withBase } from 'vitepress';
import { siteConfig } from '../../../../site.config';

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
</script>

<template>
  <footer class="site-footer">
    <div class="site-footer__main">
      <div class="site-footer__heading">
        <p class="section-index">05 / 关于</p>
        <h2>持续构建，也持续公开过程</h2>
      </div>

      <div class="site-footer__bio">
        <p>
          我是赵建斌，也可以叫我纯爱掌门人。我是一名独立开发者，正在把自己的学习、构建和验证过程公开出来。
        </p>
        <a class="text-link" :href="withBase('/about/')">
          认识我
          <ArrowUpRight :size="17" :stroke-width="1.8" />
        </a>
      </div>

      <div class="site-footer__socials">
        <template
          v-for="social in siteConfig.socials.filter(
            (item) => item.showInFooter,
          )"
          :key="social.platform"
        >
          <a
            v-if="social.url"
            :href="social.url"
            target="_blank"
            rel="noreferrer"
          >
            {{ social.label }}
            <ArrowUpRight :size="16" :stroke-width="1.8" />
          </a>
          <span v-else>
            {{ social.label }}
            <small>待配置</small>
          </span>
        </template>
      </div>
    </div>

    <div class="site-footer__bottom">
      <span>赵建斌 / 纯爱掌门人</span>
      <span>使用 VitePress 构建</span>
      <button type="button" @click="scrollToTop">
        返回顶部
        <ArrowUp :size="17" :stroke-width="1.8" />
      </button>
    </div>
  </footer>
</template>
