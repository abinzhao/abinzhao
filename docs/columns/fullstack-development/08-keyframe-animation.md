---
title: "第 8 章：关键帧动画"
description: "使用关键帧和 animation 子属性实现可控、可复用的连续动画。"
date: "2026-10-15"
category: CSS
tags: [CSS3, 关键帧, 动画]
series:
  order: 9
---
## 第 8 章 @keyframes 动画

### 8.1 语法

```css
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 用百分比，可以任意多个关键帧 */
@keyframes pulse {
  0%   { transform: scale(1);    opacity: 1; }
  50%  { transform: scale(1.08); opacity: .8; }
  100% { transform: scale(1);    opacity: 1; }
}

/* from/to 等价于 0%/100% */
@keyframes spin {
  to { transform: rotate(360deg); }
}

.element {
  animation: fadeInUp 0.5s var(--ease-out-expo) both;
  /* animation: name duration timing-function delay iteration-count
                 direction fill-mode play-state */
}
```

### 8.2 animation 全部子属性

```css
.element {
  animation-name: fadeInUp;
  animation-duration: 0.5s;

  /* 缓动，也可以用 steps() 做逐帧动画 */
  animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
  animation-timing-function: steps(8, end);   /* 精灵图动画 */

  /* 延迟，可为负值（动画从中间开始） */
  animation-delay: 0.2s;
  animation-delay: -0.5s;      /* 相当于已经播了 0.5s */

  /* 播放次数 */
  animation-iteration-count: 1;
  animation-iteration-count: infinite;

  /* 方向 */
  animation-direction: normal;              /* 正向 */
  animation-direction: reverse;             /* 反向 */
  animation-direction: alternate;           /* 正反交替 */
  animation-direction: alternate-reverse;

  /* 填充模式：动画外的状态 */
  animation-fill-mode: none;       /* 默认，回到原状态 */
  animation-fill-mode: forwards;   /* 停在最后一帧 */
  animation-fill-mode: backwards;  /* 延迟期间应用第一帧 */
  animation-fill-mode: both;       /* 两个都应用 ← 常用 */

  /* 播放状态 */
  animation-play-state: running;
  animation-play-state: paused;    /* 悬停暂停常用 */

  /* 多个动画：逗号分隔 */
  animation: fadeIn .5s, slideUp .6s .1s both;
}
```

**`animation-fill-mode: both` 是最常用的值**。没有它，带动画的元素在延迟期间会显示原始状态（闪烁），动画结束后会瞬间跳回原始状态。

**`animation-play-state: paused` 做悬停暂停**：

```css
.marquee { animation: scroll 20s linear infinite; }
.marquee:hover { animation-play-state: paused; }
```

### 8.3 实用动画模板

```css
/* 1. 入场：淡入上移 */
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* 2. 骨架屏闪烁 */
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.skeleton {
  background: linear-gradient(90deg, #eee 25%, #f5f5f5 50%, #eee 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;
}

/* 3. 加载旋转器 */
@keyframes spin { to { transform: rotate(360deg); } }
.spinner {
  width: 24px; height: 24px;
  border: 3px solid rgba(0,0,0,.1);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin .8s linear infinite;
}

/* 4. 呼吸效果 */
@keyframes breathe {
  0%, 100% { opacity: .5; transform: scale(1); }
  50%      { opacity: 1;  transform: scale(1.05); }
}

/* 5. 弹跳 */
@keyframes bounce {
  0%, 100% { transform: translateY(0); animation-timing-function: cubic-bezier(0.8,0,1,1); }
  50%      { transform: translateY(-25%); animation-timing-function: cubic-bezier(0,0,0.2,1); }
}

/* 6. 逐字打字机 */
@keyframes typing { from { width: 0; } to { width: 100%; } }
@keyframes caret  { 50% { border-color: transparent; } }
.typing {
  overflow: hidden;
  white-space: nowrap;
  border-right: 2px solid;
  width: 0;
  animation: typing 2s steps(20, end) forwards,
             caret .8s step-end infinite;
}

/* 7. 元素依次入场（用 delay 制造错落感） */
.list-item {
  opacity: 0;
  animation: fadeInUp .5s var(--ease-out-expo) both;
}
.list-item:nth-child(1) { animation-delay: 0ms; }
.list-item:nth-child(2) { animation-delay: 60ms; }
.list-item:nth-child(3) { animation-delay: 120ms; }
.list-item:nth-child(4) { animation-delay: 180ms; }

/* 更好的做法：用 CSS 变量传索引，或用 --i 由 JS 设置 */
.list-item { animation-delay: calc(var(--i, 0) * 60ms); }
```

### 8.4 用 animation 做精灵图逐帧动画

```css
@keyframes walk {
  from { background-position: 0 0; }
  to   { background-position: -800px 0; }   /* 8 帧 × 100px */
}

.sprite {
  width: 100px;
  height: 100px;
  background: url('sprite.png') no-repeat;
  animation: walk 0.8s steps(8) infinite;
}
```

`steps(8)` 把动画分成 8 个离散跳跃，正好对应 8 帧。用 `linear` 会得到平滑移动而不是逐帧切换。

---
