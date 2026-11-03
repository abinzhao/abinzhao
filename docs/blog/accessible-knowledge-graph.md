---
title: 用 Worker 和 Canvas 构建可访问的知识图谱
description: 由真实文章关系构建有限图，确定性布局在 Worker 完成，普通链接保留全部可访问语义。
date: '2026-11-03'
id: lab-accessible-knowledge-graph
category: 前端实验
tags: [Web Worker, Canvas, 内容工程]
level: advanced
demoIds: [knowledge-graph]
source:
  path: examples/site-labs/knowledge-graph.ts
  ref: working-tree
  command: pnpm dev
runtime: Vue 3.5.44；Canvas2D 与 module Worker，失败时保留关系链接
verification:
  kind: browser
  evidence: knowledge-graph.test.ts 核对真实发布边界、邻域数量和确定性布局；data-labs.e2e.ts 验证全局/局部切换、键盘焦点、链接与视口容纳。
---

## 先决定一条连线到底表示什么

知识图谱最容易犯的错误，是把“看起来相关”画成“需要先学”。本站的节点来自已发布内容索引，边只有三类：专题包含文章、文章声明的先修关系、文章关联实验。相同标签不自动产生先修边；草稿也不能因为存在于文件系统就进入图谱。

`content-contract.ts` 在全集加载后检查稳定 ID 唯一性、关系目标存在性和先修有向图无环。随后 `graph-build.ts` 生成图数据。课程、搜索、教程入口和图谱使用同一份发布索引，因此“画布上能点开，但链接是 404”的错误可以在构建时发现。

## 默认只展示可解释的邻域

全局图并不是更好的默认视图。节点增多以后标签遮挡、力导向计算和键盘遍历成本一起上升。这里默认从一个节点做广度优先遍历，最多显示 30 个节点；先保留先修与实验关系，再展开专题关系。

算法截断节点时，仅保留端点都在集合内的边，不将被截断的关系改写为其它语义。用户可以显式请求全局图；普通文章链接始终可用。新增内容导致体积超预算时应分片，而不是悄悄提高全局限制。

## 可重复的有限布局

以下代码由浏览器 Worker 直接调用，单测也调用同一实现。

<<< @/../examples/site-labs/knowledge-graph.ts

节点先按稳定 ID 排序，初始角度由 ID 哈希和黄金角分布决定，再做固定 100 次迭代。斥力在每对节点之间计算，边上的弹簧力靠近目标距离，中心节点固定，位移也受限。

固定 seed、排序、迭代次数使相同输入获得稳定布局，便于测试和回到已读节点。但这是 O(n²) 的小图算法。Worker 把计算移开主线程，没有改变算法复杂度；几千节点仍需要空间索引、近似斥力或更适合的布局算法。

Worker 每次只执行一个有限任务，返回结果后终止。新选择出现时终止旧 worker，用任务序号拒绝迟到结果；不能让多个布局线程同时更新同一画布。

## 画布坐标和输入坐标必须同源

视图的缩放和平移保存在单独的变换状态里。Canvas 像素尺寸按容器大小和 DPR 设置，图布局仍使用逻辑坐标。指针命中先把 client 坐标转换成容器局部坐标，再逆变换为布局坐标，最后按半径寻找最近节点。

如果只给 canvas 增大像素尺寸，却忘记命中过程里的缩放，高清屏幕上会出现“看着点中、实际选错”的偏移。窗口变化时需要重算尺寸和绘制，不必每次重新布局整张图。

本实验通过明确按钮缩放和平移，不拦截页面滚轮。触屏仍可滚动页面，避免一进入画布就被二维拖动困住。

## 可访问列表不是备用数据

画布旁的普通链接列表直接消费同一节点集合。键盘选择会更新画布焦点，图形选择也同步当前条目的解释。即使 Worker 启动失败、用户选择精简效果，列表仍能完成学习导航。

不要把全部信息塞入一张带长 aria-label 的 canvas。标题、关系类型和链接都应由 DOM 表达；Canvas 负责空间组织，不能成为唯一信息通道。

## 如何验证

运行 `pnpm exec vitest run tests/knowledge-graph.test.ts`，核对发布节点、关系类型、30 节点上限与布局确定性。浏览器中运行 `/abinzhao/labs/knowledge-graph.html`，搜索一个实际教程，切换局部/全局、用方向键移动焦点，然后访问对应普通链接。

阻断 worker 文件后应出现可理解的失败状态，列表仍能导航；关闭实验后 worker 应终止。数据真实性可以靠构建校验，但“节点语义是否合理”仍需要内容作者维护显式先修关系。

参考：[Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)、[Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)。这套布局适合本站规模的知识导航，不是任意规模图数据库的可视化方案。
