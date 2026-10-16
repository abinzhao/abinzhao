---
title: "第 7 章：CSS 变换"
description: "理解二维与三维变换、透视、变换原点和合成层动画。"
date: "2026-10-15"
category: CSS 动画
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

  /* 多个变换：从左到右依次应用，顺序很重要 */
  transform: translate(50px, 0) rotate(45deg);   /* 先移动再绕新原点旋转 */
  transform: rotate(45deg) translate(50px, 0);   /* 先旋转坐标系再移动 */

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

/* 好：只触发 Composite */
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

---
