---
title: 粒子银河
slug: particle-galaxy
description: 用 Three.js 粒子系统和触摸力场构建的可交互银河。
tech: [Three.js, WebGL, TypeScript]
date: 2026-08-11
featured: true
draft: false
---

## 实验目标

使用 GPU 点精灵绘制具有旋臂结构的粒子银河，并通过颜色、尺寸和旋转速度区分核心与外缘粒子。

## 交互方式

拖动指针旋转观察视角，滚轮或双指缩放画面。指针靠近粒子时会形成局部力场，使粒子短暂偏离轨道后逐渐回归。

## 性能与降级

根据设备像素比和帧率动态控制粒子数量，并限制渲染分辨率。WebGL 不可用或用户开启减少动态效果时，展示静态银河预览。
