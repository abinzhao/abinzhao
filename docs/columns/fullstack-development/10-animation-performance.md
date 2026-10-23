---
title: "第 10 章：动画性能"
description: "从 Layout、Paint、Composite 出发诊断卡顿并控制合成层成本。"
date: '2026-10-23'
category: 网页性能
tags: [性能, 渲染, 开发者工具]
series:
  order: 11
---
## 第 10 章 动画性能

### 10.1 渲染流程与动画的关系

```
JS → Style（计算样式）→ Layout（布局）→ Paint（绘制）→ Composite（合成）
```

60Hz 屏幕每帧约 16.7ms，120Hz 约 8.3ms；并非每帧都重新执行全部阶段，浏览器会按失效范围复用结果。哪个阶段被触发，决定了动画成本：

| 改动属性 | 触发阶段 | 代价 |
|---|---|---|
| `width` `height` `top` `left` `margin` `padding` `font-size` | Layout + Paint + Composite | **最贵** |
| `color` `background-color` `box-shadow` `border-radius` | Paint + Composite | 中等 |
| `transform` `opacity` | 满足合成条件时可只更新 Composite | 通常较低，仍有纹理与层成本 |
| `filter` / `backdrop-filter` | 依实现、滤镜、面积与内容可能重新栅格化或绘制 | 模糊与大面积效果可能昂贵 |

**优先让位移和淡入淡出使用 `transform`、`opacity`，再按实际行为测量。** 需要相邻内容跟随的展开仍可能使用布局动画，不能为减少阶段而改变产品语义。

### 10.2 合成层（Compositing Layer）

浏览器可以把某些元素提升到独立的合成层，由 GPU 单独处理。这类元素的动画即使主线程繁忙也能保持流畅。

**可能影响合成决策的提示**，不是强制提升方式：

```css
.layer {
  will-change: transform;          /* 提示未来变化，是否提升由浏览器决定 */
  /* 或 */
  transform: translateZ(0);        /* 仅用于解释合成决策，不作为默认优化 */
  /* 或 */
  backface-visibility: hidden;
  /* 或 */
  contain: paint;                  /* 绘制隔离，不保证建立 GPU 合成层 */
}
```

### 10.3 will-change 的正确用法

```css
/* 正确：在即将动画时添加 */
.button { transition: transform .2s; }
.button:hover { will-change: transform; }   /* hover 结束才撤销，动画结束不会自动释放 */

/* 更正确：用 JS 在交互前添加，结束后移除 */
```

```js
element.addEventListener('mouseenter', () => {
  element.style.willChange = 'transform';
});
element.addEventListener('transitionend', () => {
  element.style.willChange = 'auto';
});
```

**`will-change` 的滥用代价**：

- 每个合成层都要占用显存。给页面上几十个元素都加 `will-change`，显存爆掉反而更卡。
- 长期存在的合成层会让浏览器无法优化该区域，文本渲染可能变模糊。
- **绝不要**在全局选择器或大量元素上写 `will-change`。

**规则**：只在真正需要时加，用完就删。如果没有明显卡顿，就不加。

### 10.4 动画性能检查清单

```css
/* ✅ 1. 只动 transform / opacity */
.toast { transform: translateX(100%); transition: transform .3s; }
.toast.show { transform: translateX(0); }

/* ✅ 2. 用 transform 替代 top/left/width/height */
.box { transform: translate(10px, 10px); }

/* ✅ 3. 避免动画 box-shadow，用伪元素预渲染 + 透明度切换 */
.card { position: relative; }
.card::after {
  content: '';
  position: absolute; inset: 0;
  border-radius: inherit;
  box-shadow: 0 8px 24px rgba(0,0,0,.15);
  opacity: 0;
  transition: opacity .3s;
  pointer-events: none;
}
.card:hover::after { opacity: 1; }

/* ✅ 4. 大面积模糊/滤镜会拖慢合成，谨慎使用 */
.blur-bg { backdrop-filter: blur(20px); }   /* 移动端很贵 */

/* ✅ 5. 用 contain 限制重排范围 */
.card { contain: layout paint; }

/* ✅ 6. 大量列表项动画时限制并发数，或用 CSS 交错延迟 */
```

**用 `content-visibility` 跳过屏幕外元素的渲染**：

```css
.below-fold {
  content-visibility: auto;
  contain-intrinsic-size: 0 500px;   /* 占位尺寸，防止滚动条跳动 */
}
```

适合部分长列表，但要测试占位尺寸、锚点、查找和辅助技术行为；并非所有长页面都必须使用，也不能承诺固定收益。

### 10.5 实测动画性能

Chrome DevTools → Performance 面板：

1. 点击录制，操作页面，停止录制
2. 看 **Frames** 轨道：绿色竖条是流畅帧，红色是掉帧
3. 看 **Main** 轨道：长条的黄色块是 JS 执行，紫色是 Layout，绿色是 Paint
4. 如果 Layout 或 Paint 占了大头，说明动画属性选错了

**Rendering 面板（DevTools → 更多工具 → 渲染）**：

- 勾选 **Paint flashing**：重绘区域会闪绿，能直观看到动画是否触发了重绘
- 勾选 **Layer borders**：合成层显示为橙色边框，可以看到哪些元素被提升
- 勾选 **Frame Rendering Stats**：实时显示 FPS

**理想的动画**：Paint flashing 完全看不到绿色（没有重绘），Layer borders 只看到目标元素有橙框。

### 证据与官方参考

初次建立层可能有绘制，不能因为出现一次绿色闪烁就判定失败。应比较相同视口、刷新率、CPU 条件下持续帧的 Main 工作、Paint 区域和内存变化；优先改善影响交互的长任务。`transitioncancel`、元素卸载和反向动画也需要清理 will-change。

### 10.6 建立可以复现的性能实验

先固定页面内容、视口、设备、刷新率和操作，再记录基线。冷启动包含资源下载、字体替换和首轮绘制，暖启动更适合比较持续动画；两者都需要但不能混在同一组数据里。CPU 降速是诊断工具，不是某款手机的精确模拟。连续记录多次，报告明显的长帧和可观察卡顿，不能用一次 FPS 数字承诺生产收益。

选择两种实现做对照，例如同一提示条分别动画 `left` 与 `transform`。保持相同距离、时长和内容，观察 Main 中的布局与绘制、合成层变化及实际输入响应。若换成 transform 后仍卡，继续检查同步 JavaScript、巨大纹理、图片解码和滤镜区域；属性表只能提供候选原因，不能代替 trace。

图层有空间成本。屏幕像素数会受设备像素比影响，大面积高分辨率表面的基础像素存储就可能明显增大，实际实现还可能使用分块与额外缓冲。不能从元素数直接推导显存，也不要为所有卡片强制造层。`contain` 会改变布局和裁剪边界，必须先确认溢出阴影、定位后代与内容尺寸仍符合需求。

### 10.7 生命周期与降级验收

预先设置 `will-change` 只对浏览器有准备时间的场景有意义；在开始动画的同一瞬间增加提示不保证获益。交互结束、取消和页面离开后都应清理，零时长或减少动画时也不能依赖结束事件。对于没有性能问题的控件，保持默认合成策略通常更易维护。

练习给包含二十张卡片的页面录制进入、悬停、滚动和后台恢复四个阶段，然后仅对最重的一项做修改。保留修改前后 trace、关键帧位置和测试条件；确认减少动画时正文可见，后台暂停不会使业务计时失真，图片慢加载也不会让进度条跳成异常值。完成标准是解释一次真实瓶颈并证明交互改善，同时没有布局、焦点或资源清理回归，而不是让所有 Performance 轨道都变成空白。

- [web.dev 动画性能](https://web.dev/articles/animations-guide)
- [Chrome Rendering 工具](https://developer.chrome.com/docs/devtools/rendering/)
- [CSS Will Change](https://drafts.csswg.org/css-will-change/)

---
