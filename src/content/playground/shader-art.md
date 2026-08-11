---
title: 着色器艺术
slug: shader-art
description: 用 GLSL 片元着色器探索颜色、噪声与时间驱动的生成图形。
tech: [GLSL, WebGL, TypeScript]
date: 2026-08-11
featured: false
draft: false
---

## 实验目标

组合距离场、分形噪声和调色函数，在单个全屏片元着色器中生成连续变化的抽象图案。

## 交互方式

移动指针改变图案中心和噪声尺度，点击切换调色方案，键盘空格键用于暂停或继续时间动画。

## 性能与降级

渲染循环仅更新必要的 uniform，并根据设备性能降低迭代次数和画布分辨率。WebGL 不可用或用户开启减少动态效果时，展示预生成静态画面。
