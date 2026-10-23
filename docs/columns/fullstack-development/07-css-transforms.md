---
title: "第 7 章：CSS 变换"
description: "理解二维与三维变换、透视、变换原点和合成层动画。"
date: '2026-10-23'
category: CSS
tags: [CSS3, 变换, 三维]
series:
  order: 8
---
## 第 7 章 transform 变换

### 7.1 2D 变换

```css
.t {
  /* 位移 */
  transform: translate(20px, 10px);
  transform: translateX(20px);
  transform: translateY(50%);        /* 百分比相对自身尺寸 */
  transform: translate(50%, 50%);

  /* 缩放 */
  transform: scale(1.2);
  transform: scale(1.2, 0.8);        /* 横向 纵向 */
  transform: scaleX(-1);             /* 水平翻转 */

  /* 旋转（顺时针为正） */
  transform: rotate(45deg);
  transform: rotate(-90deg);

  /* 倾斜 */
  transform: skew(10deg, 5deg);
  transform: skewX(10deg);

  /* 矩阵（很少手写，工具生成） */
  transform: matrix(a, b, c, d, e, f);

  /* 从左到右建立局部坐标系；固定原坐标系看点变换时，等价于从右向左作用 */
  transform: translate(50px, 0) rotate(45deg);   /* 原坐标系中先旋转，再沿原 X 轴平移 */
  transform: rotate(45deg) translate(50px, 0);   /* 平移方向随旋转后的 X 轴改变 */

  /* 变换原点，默认元素中心 */
  transform-origin: top left;
  transform-origin: 50% 100%;
}
```

### 7.2 3D 变换

```css
.t3d {
  /* 沿 Z 轴平移 */
  transform: translateZ(50px);
  transform: translate3d(10px, 20px, 30px);

  /* 3D 旋转 */
  transform: rotateX(45deg);      /* 绕水平轴翻 */
  transform: rotateY(45deg);      /* 绕垂直轴翻（卡片翻转效果） */
  transform: rotateZ(45deg);      /* 等价于 rotate(45deg) */
  transform: rotate3d(1, 1, 0, 60deg);   /* 绕任意轴 */

  /* 缩放 */
  transform: scale3d(1, 1.2, 1);
  transform: scaleZ(2);
}

/* 父元素：让子元素的 3D 空间共享 */
.parent {
  perspective: 1000px;             /* 透视距离，越小越夸张 */
  perspective-origin: 50% 50%;     /* 视点位置 */
  transform-style: preserve-3d;    /* 关键：子元素保留 3D 空间 */
}

/* 子元素 */
.child {
  transform: rotateY(180deg);
  backface-visibility: hidden;     /* 背面不可见，卡片翻转必备 */
}
```

### 7.3 卡片翻转完整例子

```html
<div class="flip-card">
  <div class="flip-inner">
    <div class="flip-front">正面</div>
    <div class="flip-back">背面</div>
  </div>
</div>
```

```css
.flip-card {
  width: 240px;
  height: 320px;
  perspective: 1200px;
  cursor: pointer;
}

.flip-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.flip-card:hover .flip-inner,
.flip-card:focus-within .flip-inner {
  transform: rotateY(180deg);
}

.flip-front,
.flip-back {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  display: grid;
  place-items: center;
  border-radius: 12px;
  font-size: 1.5rem;
}

.flip-front { background: #3b82f6; color: white; }
.flip-back  { background: #1f2937; color: white; transform: rotateY(180deg); }

/* 尊重减少动画偏好 */
@media (prefers-reduced-motion: reduce) {
  .flip-inner { transition: none; }
}
```

### 7.4 perspective 的两种用法

```css
/* 用法 1：父元素上设置，作用于所有子元素 */
.parent {
  perspective: 1000px;
}

/* 用法 2：作为 transform 的一部分，只作用于当前元素 */
.child {
  transform: perspective(1000px) rotateY(30deg);
}
```

**`perspective` 数值的意义**：相当于观察者与元素的距离（像素）。1000px 是自然值，500px 透视更强烈，2000px 接近平面。

### 7.5 用 transform 替代布局属性

```css
/* 差：触发 Layout */
.toast { right: -300px; transition: right .3s; }
.toast.show { right: 20px; }

/* 位移不改变文档流，满足合成条件时可减少持续绘制 */
.toast {
  right: 20px;
  transform: translateX(calc(100% + 40px));
  transition: transform .3s var(--ease-out-quart);
}
.toast.show { transform: translateX(0); }

/* 差：改变 width/height 做放大 */
.zoom:hover { width: 110%; height: 110%; }

/* 好 */
.zoom { transition: transform .3s; }
.zoom:hover { transform: scale(1.1); }

/* 差：用 margin 做位移 */
.slide:hover { margin-left: 10px; }

/* 好 */
.slide { transition: transform .3s; }
.slide:hover { transform: translateX(10px); }
```

**注意**：`transform` 不会改变元素在文档流中占据的空间。做居中、悬浮效果时是优点；但如果需要其他元素跟随移动，`transform` 就不合适，得用布局属性或 `FLIP` 技术。

### 7.6 坐标、布局与可操作区域

先区分布局位置、变换后的可视位置和指针命中区域。布局系统仍为元素保留原来的空间，`getBoundingClientRect()` 返回的矩形却会反映变换；相邻卡片不会因为其中一张放大就自动让开。拖动、碰撞和弹层定位若混用这两套坐标，会出现鼠标已经落在图形上而程序仍判定越界的问题。读取几何后统一计算，再集中写入，避免每个元素写完立即读取下一项。

百分比位移的参考盒也需要明确。普通 HTML 盒子的 `translateX(50%)` 通常按自身参考盒宽度计算，而 `left: 50%` 按定位包含块计算；居中技巧依赖二者组合，不能把两个百分比当作同一个距离。SVG 还受 `transform-box` 影响。改变 `transform-origin` 相当于先移动坐标原点、进行变换、再移回，不是把元素在布局中换了一个位置。

同一条规则里连续写多个 `transform`，后面的声明会覆盖前面的声明，速查示例不能原样当成同时叠加的效果。需要组合时使用一个变换列表，或用外层负责位移、内层负责旋转。独立的 `translate`、`rotate`、`scale` 属性有自己的组合顺序，也不能仅按样式表书写顺序理解。

### 7.7 翻转效果的故障实验

先做一个没有动画的按钮切换：按钮维护 `aria-expanded`，内容区根据状态显示；确认 Tab、Enter、触屏点击都能使用，再把翻转作为视觉增强。`backface-visibility: hidden` 只控制绘制，不会自动取消背面链接的聚焦或辅助技术可达性。隐藏的那一面需要同步 `inert` 或实际隐藏，焦点若已在其中，应先移回触发按钮。

用开发者工具分别禁用透视、改成 90 度旋转、给祖先增加裁剪，观察“看不到背面”的原因。再在变换祖先中放一个 fixed 元素，核对其包含块；这能解释弹层为何不再固定到视口。完成标准是能够预测相邻布局、解释两种变换顺序的差异，并在减少动画时保留相同的操作结果；截图中卡片翻转不能替代键盘和读屏验收。

### 交互边界与官方参考

翻转卡片中的 `focus-within` 只有后代存在可聚焦控件时才有作用；普通 div 不会自动进入键盘顺序。需要展示额外信息时，用真实按钮切换状态，并避免背面仍被辅助技术读取。transform 还会建立层叠上下文和后代 absolute/fixed 的包含块，不只是一种“GPU 优化”。

练习：将旋转改为 90 度，比较两种 transform 中心位置；检查卡片前后面的键盘与读屏可达性。

- [CSS Transforms Level 1](https://drafts.csswg.org/css-transforms-1/)
- [MDN transform 与顺序示例](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/transform)

---
