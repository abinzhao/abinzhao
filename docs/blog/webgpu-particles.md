---
title: 从静态图形到 WebGPU 粒子场：计算、绘制与降级
description: 用同一份确定性粒子数据连接 CPU 与 GPU，区分初始化、暂停、重置和资源销毁。
date: '2026-11-03'
id: lab-webgpu-particles
category: 前端实验
tags: [WebGPU, WGSL, 生命周期]
level: advanced
demoIds: [particles]
source:
  path: examples/site-labs/particle-model.ts
  ref: working-tree
  command: pnpm dev
runtime: Vue 3.5.44；支持 WebGPU 的安全上下文，缺失时降级 Canvas2D
verification:
  kind: browser
  evidence: particle-model.test.ts 核对确定性与固定步长；gpu-labs.e2e.ts 覆盖参数、降级和关闭。另在 macOS 的 Apple Metal 后端验证过 compute/render；不代表真实手机帧率。
---

## 先定义可检查的粒子状态

粒子场的难点不只是着色器。你需要能够回答：重置以后是否回到同一个初态，后台停留一分钟后是否出现积分爆炸，以及退出路由以后显卡是否仍在提交任务。

本站把每个粒子的状态压成八个 `float32`：位置两项、速度两项、目标两项、色相一项和对齐预留一项。每粒子占 32 字节，8192 粒子占 262144 字节。这个布局由 CPU 初始化，计算着色器更新位置与速度，绘制着色器读取同一 storage buffer。渲染每粒子六个顶点的方片，没有每帧把全部位置回读到 JavaScript。

目标位置沿代码符号的五条线段生成。伪随机数使用固定种子 7301，因此“重置”是可核查的状态操作。它并不保证不同 GPU 的浮点迭代逐位相等；需要逐位对照的部分是初始数组。

## 让模拟时间与屏幕刷新分开

把 rAF 的间隔直接作为任意大的积分步长，在丢帧和后台恢复时很容易失稳。这里采用 1/120 秒固定模拟步长，每帧最多接受 0.05 秒的新时间。60Hz 下通常每画面执行两次更新，120Hz 下通常一次；暂停期间不积累离线时间。

下面是实验和 Canvas2D 降级共同引用的完整模型。`stepParticles` 是 CPU 对照路径；WGSL 使用对应公式。

<<< @/../examples/site-labs/particle-model.ts

“聚合”用弹簧力接近目标；“流动”用旋转场和正弦扰动；“回归”提高回复力。阻尼写成 `exp(-k * dt)`，使阻尼随时间而非帧数变化。指针排斥的距离分母添加常量，避免粒子与指针重合时出现除零。

## 一次 GPU 更新怎样发生

在 `theme/labs/particle-gpu.ts` 中，`requestAdapter`、`requestDevice`、异步 pipeline 创建完成后才开始绘制。每个 workgroup 有 64 个调用，派发数量向上取整；着色器还必须检查索引是否超过粒子数量。

<<< @/../examples/site-labs/particle.wgsl

每帧先提交必要的 compute pass，再执行 render pass。同一 device queue 上的提交维持依赖顺序。uniform 包含时间、模式、数量、指针、纵横比和主题颜色；无需为移动指针重新编译 shader。改变数量会销毁旧粒子 buffer 并按相同种子重新分配，不能只改变绘制实例数而继续访问旧容量。

## 初始化取消与运行暂停是两件事

加载时的 AbortController 负责拒绝过期启动结果。用户在 `requestDevice()` 尚未完成时关闭实验，完成后的 device 必须立即销毁。就绪后的暂停只停止调度，保留上下文供用户显式继续；退出组件才释放 buffer、解除 canvas 配置并销毁 device。

`GpuExperiment.vue` 通过可见性、IntersectionObserver 和全站计算租约协调运行。启动另一个重实验或本地模型任务会暂停当前实验。减少动态效果时释放 renderer，保留静态图形、说明和参数入口。`device.lost` 进入可重试的错误状态，不能假装继续运行。

WebGPU 不可用时使用 Canvas2D，限制最高密度为 1024。Canvas2D 复用初始数据和积分公式；它是功能降级，不是 WebGPU 性能证明。浏览器支持、驱动和电源模式都可能影响实际路径，界面因此显示真正使用的 backend。

## 复现与验证

下载本文源码包，安装锁定依赖后运行 `pnpm dev`，打开 `/abinzhao/labs/particles.html`，点击运行。依次调整数量、流动/回归模式，暂停后重置，观察初态恢复。

运行 `pnpm exec vitest run tests/particle-model.test.ts` 核对确定性和步长；`pnpm exec playwright test tests/e2e/gpu-labs.e2e.ts` 覆盖浏览器状态。硬件验证还需在支持 WebGPU 的真实浏览器中检查 backend、错误 scope 和重复开关后的提交活动。rAF 间隔只反映画面调度，不等于 GPU 执行时间。

进一步阅读：[WebGPU 规范](https://www.w3.org/TR/webgpu/)、[MDN GPUDevice.lost](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost)。本实现是受限粒子模拟；碰撞、邻域搜索和大规模排序需要新的数据结构与独立预算。
