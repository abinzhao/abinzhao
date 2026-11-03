---
title: 可打断的 FLIP 网格：排序、焦点与透视层的协作
description: 让项目列表快速重排时保持真实 DOM 顺序，分离布局位移与指针透视，取消过期动画。
date: '2026-11-03'
id: lab-interruptible-flip
category: 前端实验
tags: [FLIP, WAAPI, 焦点管理]
level: advanced
demoIds: [project-layout]
source:
  path: docs/.vitepress/theme/composables/use-flip.ts
  ref: working-tree
  command: pnpm dev
runtime: Vue 3.5.44；Web Animations API，触屏和减少动态时即时筛选
verification:
  kind: browser
  evidence: labs-interactions.e2e.ts 检查连续筛选、名称排序、密度切换、DOM 顺序和动画停止；真实项目数据来自已保存的 GitHub 项目快照。
glossary:
  - term: FLIP
    definition: First、Last、Invert、Play。先测量变化前后的位置，再用视觉变换解释真实布局已经发生的变化。
---

## 列表正确性先于位移动画

筛选项目时，屏幕显示顺序、DOM 顺序和键盘访问顺序应当一致。只通过 CSS transform 把卡片挪到另一个位置，却保留旧 DOM 排序，会让读屏和 Tab 路径与视觉产生分歧。

本站先依据真实项目快照更新筛选和排序，再通过 FLIP 解释位置变化。排序只有最近更新和名称两种，密度只有标准与紧凑两种；紧凑模式仍保留完整标题和 44px 控件。外链继续使用新标签语义，不因为动画接管所有点击。

## 把四步落实到 Vue 提交时序

First 在 Vue 提交前读取当前边界，Last 在 nextTick 后读取新边界。Invert 计算坐标差值，Play 让差值归零。下面是项目网格与代码时间轴共同使用的实现。

<<< @/.vitepress/theme/composables/use-flip.ts

稳定 `data-flip` 来自项目身份，不是数组下标。删掉第一个项目以后，其余项目仍然能与变化前的同一个元素匹配。新进入的元素没有旧位置，使用一次淡入；离开的元素已经离开 DOM，不保留一个会误接收点击的幽灵节点。

First 读取的是当前视觉位置，包括尚未结束的旧动画。随后取消旧动画，再采样新布局，从用户此刻看到的位置衔接。若把旧动画先归零，快速切换就会产生跳动。

## 异步测量也需要任务身份

watch 回调中的 nextTick 是异步边界。用户可能在它完成前再次筛选；旧测量如果继续启动动画，就会把新列表拉向上一轮位置。实现用递增 `generation` 为每轮变化编号，nextTick 后和结束回调里都检查当前编号。

取消动画会使 `animation.finished` 拒绝，这是预期生命周期，不应产生未处理 Promise。捕获取消后仍要从集合移除对应实例；但旧动画的 finally 不能把新一轮 `moving` 状态清空。

窗口尺寸改变会让旧坐标失效，所以 resize 直接取消过渡，交给原生布局立即响应。减少动态或进入后台也取消动画，不等待过渡自然结束。

## transform 必须分层使用

FLIP 的平移和卡片透视若写在同一个元素上，后设置的 transform 会覆盖前一个。项目卡片外层负责重排，内层负责有限透视与位移，伪元素负责边光。

重排期间冻结复杂透视，结束后恢复当前输入。精细指针才启用跟随，触屏保留按压反馈；键盘焦点使用固定边光。视觉内层移动，链接命中区域和焦点框保持稳定，否则按钮会在指针接近时逃走。

磁吸与透视都有位移上限。它们解释当前交互，不应把同一张卡片同时变成摇摆、缩放和跑马边框的叠加效果。

## 筛选后的焦点放在哪里

watch 触发时记录焦点是否位于网格；提交后如果原焦点元素不再连接到文档，调用显式替代焦点逻辑，回到可见筛选入口。只判断 `document.activeElement` 是否为 body 不足以知道用户此前在哪里。

保留的项目使用稳定 key，因此排序通常不会丢失焦点。列表空结果仍有重置入口；不能让“零个项目”成为没有后续操作的死路。

## 验证中断而不只是终态截图

运行 `/abinzhao/projects/` 或 `/abinzhao/labs/project-layout.html`，在动画结束前来回切换语言、排序和密度。静止后 `getAnimations({ subtree: true })` 不应留下正在运行的列表动画。

运行 `pnpm exec playwright test tests/e2e/labs-interactions.e2e.ts` 核对十次连续筛选后的真实 DOM 顺序、焦点和外链语义。再缩到 390px，检查长标题没有被裁切。截图只能证明一帧的布局，不能证明中断和清理正确。

参考：[Element.animate](https://developer.mozilla.org/en-US/docs/Web/API/Element/animate)、[Vue nextTick](https://vuejs.org/api/general.html#nexttick)。FLIP 的成本包括两次几何采样，应在明确输入发生时执行，避免移到每帧循环里。
