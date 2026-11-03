<script setup lang="ts">
function reload() { window.location.reload(); }
</script>
<template>
  <main class="site-container listing-page__main">
    <h1>页面加载失败</h1>
    <p>网络中断或站点版本更新可能导致资源暂时不可用。可重新加载，或通过导航继续浏览。</p>
    <button type="button" class="button button--primary" @click="reload">重新加载页面</button>
  </main>
</template>
