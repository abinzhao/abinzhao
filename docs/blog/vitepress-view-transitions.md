---
title: 让 VitePress 页面过渡同时满足路由、焦点与性能约束
description: 在路由提交和懒加载页面之间协调快照，用取消机制应对连续点击、历史返回和主题切换。
date: '2026-11-03'
id: lab-vitepress-view-transitions
category: 前端实验
tags: [View Transitions, VitePress, 无障碍]
level: advanced
demoIds: [page-transition]
source:
  path: docs/.vitepress/theme/composables/use-page-transition.ts
  ref: working-tree
  command: pnpm dev
runtime: VitePress 1.6.4 / Vue 3.5.44；同文档 View Transitions，缺失时普通导航
verification:
  kind: browser
  evidence: labs-interactions.e2e.ts 检查真实共享快照、连续导航、主题中断、返回滚动、hash 与资源失败；不依赖 GPU 初始化。
---

## 为什么不能只添加一条 CSS 规则

VitePress 的常规站内链接通过客户端路由更新当前文档。跨文档的 `@view-transition` 配置不能代替这里的提交时序。我们需要让旧页面先完成快照，再提交目标路由，并在目标组件真正可见后让浏览器捕获新页面。

本站的 `Layout.vue` 还会懒加载具体页面组件。因此 `router.go()` 完成不总等于自定义页面已经挂载。如果只等待一次 nextTick，可能捕获到临时空壳，导致标题消失或共享对象不连续。

## 路由器继续拥有 URL 与历史

实现包装 `onBeforeRouteChange`、`onBeforePageLoad` 和 `onAfterRouteChange`，保留原钩子。跳转时进入共享过渡回调，再调用路由器原来的 `go()`；用一次性 bypass 避免递归触发自己的导航包装。

```ts
const transition = document.startViewTransition(async () => {
  await router.go(href);
  await nextTick();
  // 自定义懒加载页面挂载后，再由 viewReady 解除等待。
  if (mountedPath !== router.route.path) await viewPromise;
});
```

上面是时序摘录；实际代码在 `use-page-transition.ts`，还包含事务序号、取消和历史状态处理。不要把所有链接 click 都 preventDefault：跨域、新标签、下载和浏览器默认行为应继续由正常链接语义决定。

在导航开始时暂停活动重实验。目标文章的显示不等待 WebGPU adapter、shader 或模型，避免一个展示效果拖住全文阅读。

## 为共享对象分配唯一名称

列表标题、详情标题、预览区域使用稳定 `data-shared-id` 关联。快照前只选择一个匹配且有尺寸的元素，把它命名为 `lab-title` 或 `lab-preview`；过渡结束清除名称。

同一文档中的重复 `view-transition-name` 会导致快照失败。一个文章可能有两处指向同一实验的链接，所以不能简单给全部匹配节点赋同名。也不能把整篇文章都塞进共享快照，正文应立即可读。

## 取消机制决定快速操作是否可靠

新输入递增意图序号，旧异步回调检查序号后再写入状态。主题揭幕和页面过渡共用同一个取消入口，第二个操作到来时跳过旧过渡，不排队播放长动画。

`skipTransition()` 跳过的是视觉过程，并不撤销已经发出的路由意图。所以不能仅取消动画就认为旧任务不会再修改 UI。代码仍需要保护最终 href、挂载通知和清理逻辑，过期的 finally 也不能清除新页面正在使用的名称。

后台、减少动态或 API 缺失时，同样执行路由提交回调，直接更新页面。过渡失败应降级到普通导航，而不是把失败转化成页面不可访问。

## 焦点、hash 和后退各有职责

目标页面准备好后，将焦点放到 `#page-content` 并使用 `preventScroll`。之后再按导航类型决定滚动：历史返回恢复保存位置，hash 直达定位标题，普通进入使用路由默认策略。

恢复焦点时不能顺便滚到页面顶部，否则读者点击后退会丢失原列表位置。锚点偏移还要计入固定导航以及标题本身的 padding。hash 解码失败只忽略定位，不影响正文显示。

## 验证真实快照与正常降级

启动站点，进入 `/abinzhao/labs/page-transition.html`，通过卡片进入与后退完成一次完整路径。接着快速点击两个目的地，在切换途中改主题，确认最终路由与最后输入一致。

运行 `pnpm exec playwright test tests/e2e/labs-interactions.e2e.ts`。测试既检查 `transition.ready` 后真实存在的共享名称，也覆盖 API 不可用、目标资源失败和返回位置。只看到淡入动画不能证明共享元素工作，只有 URL 正确也不能证明焦点与阅读位置正确。

参考：[View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)、[VitePress runtime API](https://vitepress.dev/reference/runtime-api)。适配依赖 VitePress 的实际公开钩子，升级版本后应重新跑竞态与历史测试。
