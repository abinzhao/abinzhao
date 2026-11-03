---
title: 用程序化 Shader 构建双主题光谱材质
description: 通过有限 SDF 行进、Fresnel 与色散近似生成可交互材质，并处理主题、分辨率和上下文丢失。
date: '2026-11-03'
id: lab-spectral-shader
category: 前端实验
tags: [WebGL2, GLSL, Shader]
level: advanced
demoIds: [spectral]
source:
  path: examples/site-labs/spectral.frag
  ref: working-tree
  command: pnpm dev
runtime: Vue 3.5.44；WebGL2 / GLSL ES 3.00，不支持时静态预览
verification:
  kind: browser
  evidence: macOS Apple Metal WebGL2 实测拖光源、三种材质和双主题；gpu-labs.e2e.ts 验证参数、上下文丢失及降级。不是物理光学准确性或真实手机帧率验证。
---

## 用受限近似建立材质辨识度

首页的光谱形体由程序生成，没有下载环境贴图。几何使用带小幅波动的环形距离函数，光照用程序环境条带，材质在玻璃、薄膜和金属三条视觉路径间切换。

它没有求解真实内部光路、厚度、多次全反射或光谱积分。因此应称为光学视觉近似，不能把一个看起来像玻璃的 RGB shader 描述成物理准确的折射模拟。明确边界反而更容易理解每个参数控制的是什么。

## 一个全屏三角形如何画出空间形体

顶点着色器根据 `gl_VertexID` 生成覆盖画布的三角形。每个 fragment 从屏幕坐标得到一条观察射线，沿距离场最多行进 64 次；小于阈值视为命中，超过最大距离停止。没命中时返回透明像素，保留页面原有背景。

命中点的法线由距离函数在三个方向的有限差分计算。函数带形变，步长和阈值是一组受限的工程选择，并非对任意几何都可靠。越复杂的场景越需要检查距离估计是否保守，否则会穿过表面。

下面就是运行中导入的 fragment shader。

<<< @/../examples/site-labs/spectral.frag{glsl}

## 三种材质的差别

玻璃用三个不同折射率分别采样环境的 R/G/B 通道，再根据 Fresnel 权重混合反射。这只有三次环境采样，能够形成色散线索，但不能表达完整光谱。

薄膜用视线与法线夹角驱动余弦色带，并乘以简化漫反射项。金属主要使用反射环境和主题强调色。粗糙度改变高光指数与混合强度；它没有真实的微表面分布和多次散射积分。

这些控制彼此保持有限范围，避免用户把参数调到完全黑屏或溢出。重置会恢复材质、粗糙度、时间和光源位置，而不只是改变面板里的数字。

## 双主题要进入 shader 数据

不能用整页 CSS 反相来切换图形主题，那会同时改变文字、阴影和强调色含义。`GpuExperiment.vue` 从根元素读取主题与 `--site-accent`，通过 uniform 传入 shader。浅色路径使用较亮环境基底，深色路径保留高光对比。

输入色与程序环境采用艺术化参数，输出使用近似 gamma 变换；这不等同于完整的线性色彩管理。若未来引入外部纹理，需要明确纹理编码、采样空间与显示转换，再重新检查混合公式。

## 像素预算比几何数量更关键

这个实验每个像素都执行多次距离场计算。即使只有一个三角形，4K 高 DPR 画布也可能很重。默认 DPR 最高 1.5，移动和较低质量档位从 1 开始。每两秒检查原始 rAF 时间戳的平均帧率，低于 50fps 时把 DPR 降低 0.25；最低 0.75 仍不足时销毁画布并回到静态预览。暂停会重置采样窗口，后台停留时间不计入帧率；这不是 GPU 执行耗时测量。

Canvas 的 CSS 尺寸与实际像素尺寸分开；resize 时同时更新 viewport。指针坐标相对画布中心转换为光源位置，并用指数平滑避免尖锐跳变。触摸点击与键盘滑块提供等价控制，不拦截整页纵向滚动。

## 生命周期与验证

首次访问只显示静态预览，点击探索以后才导入 renderer 和 GLSL。离屏或后台暂停；从光谱切到粒子先释放旧 renderer；关闭后删除 program/shader 并释放 WebGL 上下文。收到 `webglcontextlost` 时进入可重试状态，不继续提交绘制。

运行 `pnpm dev` 后打开 `/abinzhao/labs/spectral.html`，在两种主题下切材质、移动光源、重置，再切换精简效果。`pnpm exec playwright test tests/e2e/gpu-labs.e2e.ts` 覆盖状态路径。实际流畅性还应在目标设备上按固定分辨率和操作时长记录帧间隔；桌面截图不能推导手机 60fps。

参考：[WebGL2](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext)、[webglcontextlost](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event)。复杂材质的下一步应由视觉目标和测量预算驱动，而不是先增加采样次数。
