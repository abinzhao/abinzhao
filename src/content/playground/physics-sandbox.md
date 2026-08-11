---
title: 物理沙盒
slug: physics-sandbox
description: 用 Canvas 和 Verlet 积分构建可拖拽、可连接的二维粒子物理实验。
tech: [Canvas, Verlet, TypeScript]
date: 2026-08-11
featured: false
draft: false
---

## 实验目标

用 Verlet 积分模拟粒子运动、距离约束和边界碰撞，验证简单约束系统在二维 Canvas 中的稳定性。

## 交互方式

点击空白区域创建粒子，拖动粒子施加位移，依次选择两个粒子建立连接。清空操作可随时重置实验状态。

## 性能与降级

通过固定时间步长和约束迭代上限控制计算成本，粒子达到数量上限后停止创建。低性能设备会减少约束迭代次数，禁用动画时保留逐步模拟操作。
