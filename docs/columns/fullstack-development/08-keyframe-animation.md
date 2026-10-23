---
title: "第 8 章：关键帧动画"
description: "使用关键帧和 animation 子属性实现可控、可复用的连续动画。"
date: '2026-10-23'
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

`animation-fill-mode: both` 适合需要延迟期起始样式和结束期样式的入场效果。是否出现闪烁或跳回，取决于基础样式和关键帧是否一致；不能用填充模式补偿缺失的业务状态。

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

### 8.5 动画不是状态存储

`forwards` 或 `both` 只影响动画填充期的样式，不能替代“已展开”“已完成”这类业务状态。删除 animation 后样式可能恢复；界面最终状态应由 class 或数据属性表达。减少动画时不能只禁用动画却保留 `.list-item { opacity: 0 }`，否则正文永久不可见：

```css
@media (prefers-reduced-motion: reduce) {
  .list-item { animation: none; opacity: 1; transform: none; }
  .skeleton, .spinner, .typing { animation: none; }
}
```

加载动画旁保留文字状态，不能仅用旋转表达网络仍在进行。持续移动内容需要暂停机制，不能把 hover 暂停当成触屏或键盘用户的完整方案。

验收：禁用动画后内容仍可读；切到后台再返回不错误地将计时当业务进度；快速重复操作不会留下过期动画状态。

### 8.6 把时间线与任务状态分开

CSS 时间线只有播放进度，没有“服务器已保存”或“用户已取消”的含义。上传完成应来自请求结果，旋转器只是等待状态的表现。即使动画已经播放一次，也不能自动显示成功。反过来，网络响应很快时不必为了播完一圈而延迟反馈；业务先进入完成状态，再按用户偏好选择短暂的视觉过渡。

填充期样式的取值还与方向和迭代次数有关。`alternate`、`reverse` 与非整数迭代次数可能让结束画面不同于 `100%`；`forwards` 并不一律意味着停在最后一条关键帧。负延迟表示从已走过的时间位置开始，不代表任务真的提前执行。先用 Animations 面板降低播放速度，观察开始、迭代边界和结束，再调整参数，避免靠叠加延迟碰运气。

多个动画若同时写 `transform`，默认合成方式可能使后一个效果覆盖前一个。初学项目更容易维护的做法是用外层负责位置、内层负责呼吸或旋转；只有明确需要效果合成时才进一步核对 `animation-composition`。同名关键帧也应检查定义范围，不要让复制的模板悄悄改掉另一处效果。

### 8.7 中断、重放与可访问性验证

`animationend` 不保证总会发生：移除元素、取消动画或改变动画名称都可能中断原时间线。资源清理应覆盖 `animationcancel` 和组件销毁；事件监听还要区分事件来源及 `animationName`，避免子元素冒泡的结束事件误完成父组件状态。单纯删除再添加 class 也不保证立即重播，浏览器可能将两次变更合并；确需重播时可用 Web Animations API 明确管理一个 Animation 实例。

练习实现一个可取消的加载面板，分别模拟成功、失败、立即取消和连续两次开始。保留文字状态、重试按钮和可见焦点，打开减少动画偏好后重复所有步骤。骨架屏不能遮住可读内容，持续滚动的区域要提供键盘可操作的暂停按钮。验收记录应说明四条业务路径的最终状态和事件清理结果，而不是只提交一段动图；步骤动画中的帧数还须与素材宽度、背景终点对应，避免最后一帧跳到空白区域。

官方参考：[CSS Animations](https://drafts.csswg.org/css-animations/)、[WCAG 暂停停止隐藏](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)。

---
