---
title: 交互特效演练场
description: 实时观察渐变、粒子、缓动、Grid 与帧预算，把视觉效果和实现机制连起来。
---

# 交互特效演练场

## 学习目标

先在真实画面中改变参数，再回到源码解释为什么变化。理解同一个视觉目标可以由 CSS、Canvas 或 WebGL 实现，以及选择时的成本。

## 渐变、粒子、缓动与布局

<VisualPlayground />

四个模式各自展示一种机制：

| 模式 | 改变什么 | 应观察什么 | 源码课程 |
| --- | --- | --- | --- |
| 渐变流光 | 动画速度 | 光斑位置变化，前景保持稳定 | [渐变与玻璃](./gradients) |
| 粒子网络 | 数量与速度 | 节点密度、连线数量与移动速度 | [Canvas 粒子](./particles) |
| 弹性缓动 | 点击运行 | 相同距离与时长，速度曲线不同 | [CSS 动画](../../frontend-basics/css/motion) |
| Grid 布局 | 列数 | 同样六个单元，空间关系重新排列 | [Flex 与 Grid](../../frontend-basics/css/layout) |

速度改变的是时间，不是帧率。更快的动画不代表需要更多次刷新；真正增加负载的是每帧处理更多节点、绘制更多连线或使用更大的像素缓冲区。

减少动态模式下粒子显示静态画面、渐变停在固定状态、缓动直接抵达结果。布局切换仍然可用，因为它是用户主动操作的即时反馈。

## WebGL 粒子光场

<div class="tutorial-particle-preview"><ClientOnly><ParticleField :density="600" :lazy="true" :response-strength="0.3" /></ClientOnly></div>

这是 WebGL 点云，不是静态图片。目标位置组成字形，当前位置逐步趋近目标，鼠标产生小幅偏移。渲染器不可用时回退到渐变光场。

本例的缓动是每帧乘固定比例，视觉会随刷新率略有变化。如果需要不同刷新率下相同的时间行为，应使用时间差计算系数，例如 `1 - Math.exp(-k * dt)`；这正是理解示例边界的一部分。

```js [时间一致的趋近公式]
const dt = 1 / 60;
const speed = 6;
const alpha = 1 - Math.exp(-speed * dt);
const current = 0;
const target = 100;
const next = current + (target - current) * alpha; // [!code highlight]
console.log(next.toFixed(2));
```

将代码保存为 `approach.mjs`，执行 `node approach.mjs`。输出约 `9.52`。把 `dt` 改为 `1 / 120`，单帧位移约减半，单位时间趋近速度保持一致。

图形课程继续解释[相机、材质与资源清理](../graphics/three)，以及[顶点、片元与着色器](../graphics/shaders)。

## 帧预算与性能取舍

<FrameBudget />

这个图表使用明确标记的示意数据，不代表某台设备的测量结果。在 60Hz 下，一帧约 16.67ms；120Hz 下约 8.33ms。图表保持工作耗时不变，切换刷新率即可看到同样工作是否超预算。

浏览器会合并部分任务，实际流水线并不总是严格串行。帧预算用于建立判断：如果 JS 连续执行 40ms，单靠给元素加 `will-change` 无法解决主线程阻塞。

### 选择 CSS、Canvas 或 WebGL

CSS 适合少量 DOM 元素的过渡、渐变与布局。Canvas 适合逐帧绘制很多简单图形。WebGL 适合大量图形并行计算、真实三维或自定义着色器，但需要管理相机、GPU 资源与兼容回退。

不要按“更高级”选技术。先定义画面对象数量、更新频率、交互要求、设备预算，再用最简单方案满足。静态信息图可以使用 SVG，保持文字可访问与缩放清晰。

## 运行与排查

演练场直接在静态站内运行，不请求业务服务器，不保存用户数据。独立示例的文件与启动命令在对应章节。首次进入 WebGL 场景才加载 Three.js，正文阅读不依赖 GPU。

如果粒子不显示，先看 Console 是否有 WebGL 上下文错误，再检查容器尺寸是否大于零。不要在零高度父容器上不断调整相机。

页面切换后仍有高负载，检查 RAF、Observer 和 WebGL 对象是否清理。暂停按钮必须停止计算或绘制，不能只改变标签。

## 效果验证

1. 四个模式可切换，参数变化能在画面中看到。
2. 粒子数变化后节点数量改变；暂停时保持位置。
3. 缓动对比按钮使三个圆点按不同节奏到达同一目标。
4. 列数从三变成一时，六个单元重新排列且无横向溢出。
5. 刷新率从 60 切到 120 后，图表预算线移到工作总量以内。
6. 系统减少动态模式下，正文、参数和图表仍可操作。

## 综合练习

为个人页面制作一个可关闭的创意背景。验收：装饰不覆盖正文和按钮，移动端降级粒子数量，高 DPI 限制缓冲区，离开视口暂停，切页释放资源；用 Performance 记录十秒动画和十秒静止，对比主线程耗时。

## 延伸阅读

- [MDN：Web 动画](https://developer.mozilla.org/zh-CN/docs/Web/API/Web_Animations_API)
- [Vue：动画技巧](https://cn.vuejs.org/guide/extras/animation)
- [Three.js 官方文档](https://threejs.org/docs/)
