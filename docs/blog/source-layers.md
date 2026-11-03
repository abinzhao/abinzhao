---
title: 把真实应用拆成可探索的空间剖面
description: 用 CSS 3D 展开本站的构建、状态、检索和存储职责，同时保留准确的源码映射与平面阅读路径。
date: '2026-11-03'
id: lab-source-layers
category: 前端实验
tags: [CSS 3D, 架构表达, Pointer Events]
level: advanced
demoIds: [layers]
source:
  path: docs/.vitepress/theme/labs/SourceLayers.vue
  ref: working-tree
  command: pnpm dev
runtime: Vue 3.5.44；CSS 3D，触屏使用原生滑块，减少动态时使用平面视图
verification:
  kind: browser
  evidence: data-labs.e2e.ts 验证视角、展开、平面降级与固定提交源码链接；390px 和桌面深浅主题检查过标签容纳。
---

## 空间图表达什么

一个分层剖面可以帮助读者理解应用，但必须先界定每层的含义。本站展示的是职责和运行阶段：Node.js 构建内容索引、浏览器主线程维护状态、Worker 计算检索结果、IndexedDB 持久化会话。它不是开发者工具实时读出的 DOM 树，也不是 GPU 合成层树。

这样的边界决定了图形如何组织。构建时的层不能画成浏览器每次输入都要实时经过的网络服务；检索 Worker 与模型推理 Worker 也不是同一个职责。每层解释都链接到真实文件，并固定在已核查的提交 `e9595400b7d5239cee3413dd6a0d695f6ac30ecc`，避免跟随分支漂移。

| 层 | 运行阶段 | 文件 |
| --- | --- | --- |
| 内容构建 | Node.js 构建时 | `data/knowledge-build.ts` |
| 页面状态 | 浏览器主线程 | `composables/use-assistant.ts` |
| 检索计算 | 浏览器 Worker | `assistant/knowledge.worker.ts` |
| 会话存储 | 浏览器 IndexedDB | `assistant/storage.ts` |

上述路径均位于 `docs/.vitepress/` 下；状态、计算和存储文件位于其 `theme/` 子目录。源码包包含当前展示组件，图内历史链接则明确表示已核查版本，两者不能混为同一提交。

## 两个参数足以控制空间关系

交互状态只需要展开程度和视角。展开程度映射为 `--spread`，每一层用自己的 `--layer` 计算 Z 位移；外层定义 perspective，中层保留三维变换，整个堆叠使用固定 X 倾角和有限 Z 旋转。

```css
.layer-space { perspective: 1000px; }
.layer-stack {
  transform-style: preserve-3d;
  transform: rotateX(48deg) rotateZ(var(--angle));
}
.layer-plane {
  transform: translateZ(calc((1.5 - var(--layer)) * var(--spread) * 100px));
}
```

这是 `SourceLayers.vue` 中的关键关系式。层数为四，所以用 1.5 居中分布。90px 的薄片配合有限间距，避免全部展开后标签互相遮挡；容器留出投影范围并裁剪装饰边界。

`transform-style` 并不自动穿透所有祖先；某些分组属性会导致扁平化。调试时先去掉多余滤镜、opacity 和嵌套 transform，确认哪一层建立 perspective、哪一层保留 3D，再添加视觉样式。空间深度和正文布局应分开，不能靠 Z 位移给正文腾位置。

## 拖动只是滑块的补充

鼠标按下时记录初始 clientX/clientY、angle 和 amount，并调用 `setPointerCapture`。移动距离映射成角度与展开程度，分别限制在 -25° 到 25°、0 到 100%。`pointerup`、`pointercancel` 和丢失 capture 都会结束拖动，避免指针离开后继续改变状态。

触屏保留纵向页面滚动，使用原生滑块完成等价操作。图层本身作为装饰对读屏隐藏，右侧四个普通按钮负责选层，解释区域提供真正可复制的路径和链接。这样不用把视觉命中顺序与三维深度排序强行绑定。

## 平面模式仍需完成同一个任务

精简效果或用户手动选择平面模式后，取消 perspective 影响和 Z 位移，四层按 DOM 顺序排列。详细解释变成原生 details/summary；每一层的来源仍然可以打开。

“收起剖面”把展开程度设回零，视角与选择回到初始值。它不关闭导航，也不销毁页面内容。整个效果没有持续 rAF 循环，只有输入改变 Vue 状态后才由浏览器更新变换。

## 用源码关系和几何同时验收

运行 `pnpm dev`，打开 `/abinzhao/labs/layers.html`，分别用拖动和键盘滑块展开，检查每一层的说明与来源。切换平面模式后，仍应能访问四个固定 SHA 链接。

`pnpm exec playwright test tests/e2e/data-labs.e2e.ts` 覆盖交互与降级；视觉检查需要额外观察 390px 下文字是否被前层挡住，而不仅是文档宽度是否超出视口。CSS 3D 没有引入图形库，但仍应实测合成和绘制成本。

参考：[CSS transform-style](https://developer.mozilla.org/en-US/docs/Web/CSS/transform-style)、[Pointer capture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture)。将这类图用于新项目时，先确认职责映射，再决定需要多少个可视层。
