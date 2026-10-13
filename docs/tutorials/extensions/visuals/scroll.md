---
title: 滚动、视差与进入动画
description: 用 IntersectionObserver 和请求帧节奏实现滚动反馈，避免布局抖动与不可见内容。
---

# 滚动、视差与进入动画

## 学习目标

创建阅读进度条、轻量视差和逐段进入效果，解释滚动回调、布局读取、绘制与清理的关系。

## 三种效果需要三种信号

进入动画只关心元素是否到达视口，适合 `IntersectionObserver`。阅读进度关心整个文档滚动比例，计算 `scrollY / (scrollHeight - innerHeight)`。视差关心元素与视口中心的距离，用小幅 `transform` 变化表达深度。

不应将所有动画塞进同步 `scroll` 回调。高频回调反复交错读取布局与写入样式，会增加浏览器强制布局风险。用 RAF 合并一批更新：先统一读取，再统一写入。

| 效果 | 触发依据 | 回退行为 |
| --- | --- | --- |
| 进入 | 是否相交 | 内容默认可见，脚本启用后才增强 |
| 进度条 | 文档总滚动范围 | 短页面显示 0，不除以 0 |
| 视差 | 视口相对位置 | 限制位移，减少动态时固定 |
| 固定章节说明 | CSS sticky | 检查祖先溢出和可滚动高度 |

## 操作步骤

保存以下两个文件到同一目录，启动 `npx serve . --listen 5173`。页面有足够高度让滚动行为可见。

## 完整代码

::: code-group
```html [index.html]
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>滚动与进入动画</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #0b1220; color: #edf3ff; font-family: system-ui; }
    .progress {
      position: fixed; z-index: 10; left: 0; right: 0; top: 0; height: 3px;
      background: linear-gradient(90deg, #839eff, #58d6b9);
      transform: scaleX(0); transform-origin: left;
    }
    main { width: min(800px, 100%); padding: 48px 24px; margin: auto; }
    h1 { font-size: clamp(28px, 6vw, 42px); }
    section {
      min-height: 70vh; padding: 36px 0;
      border-bottom: 1px solid #29364e;
    }
    p { line-height: 1.9; color: #acbad1; }
    .orbit {
      width: 120px; height: 120px; margin: 32px auto;
      border-radius: 50%; background: radial-gradient(circle at 30% 30%, #8caaff, #17515a);
      box-shadow: 0 0 70px rgba(106,152,255,.2);
    }
    .enhanced .reveal { opacity: 0; transform: translateY(22px); }
    .enhanced .reveal.visible {
      opacity: 1; transform: none;
      transition: opacity .6s ease, transform .6s ease;
    }
    @media (prefers-reduced-motion: reduce) {
      .enhanced .reveal { opacity: 1; transform: none; transition: none; }
      .orbit { transform: none !important; }
    }
  </style>
  <script type="module" src="./main.js"></script>
</head>
<body>
  <div class="progress" aria-hidden="true"></div>
  <main>
    <h1>滚动，观察变化。</h1>
    <section class="reveal"><h2>01 进入</h2><p>进入视口后出现，这一动作只运行一次。</p><div class="orbit" aria-hidden="true"></div></section>
    <section class="reveal"><h2>02 进度</h2><p>顶部线条展示文档整体滚动比例。</p><div class="orbit" aria-hidden="true"></div></section>
    <section class="reveal"><h2>03 视差</h2><p>装饰位移控制在 24 像素以内，正文保持稳定。</p><div class="orbit" aria-hidden="true"></div></section>
  </main>
</body>
</html>
```
```js [main.js]
const media = matchMedia('(prefers-reduced-motion: reduce)');
const sections = [...document.querySelectorAll('.reveal')];
const orbits = [...document.querySelectorAll('.orbit')];
const progress = document.querySelector('.progress');
let frame = 0;
let observer;

function measureAndPaint() {
  frame = 0;
  const max = document.documentElement.scrollHeight - innerHeight;
  const ratio = max > 0 ? Math.min(scrollY / max, 1) : 0;
  const offsets = orbits.map(element => {
    const box = element.parentElement.getBoundingClientRect();
    return Math.max(-24, Math.min(24, (box.top - innerHeight / 2) * .06));
  });
  progress.style.transform = `scaleX(${ratio})`; // [!code highlight]
  orbits.forEach((element, index) => {
    element.style.transform = media.matches ? 'none' : `translateY(${offsets[index]}px)`;
  });
}
function schedule() {
  if (!frame) frame = requestAnimationFrame(measureAndPaint);
}
function setup() {
  observer?.disconnect();
  if (media.matches) {
    document.documentElement.classList.remove('enhanced');
  } else {
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    }, { threshold: .12 });
    sections.forEach(element => observer.observe(element));
    document.documentElement.classList.add('enhanced');
  }
  schedule();
}
window.addEventListener('scroll', schedule, { passive: true });
window.addEventListener('resize', schedule);
media.addEventListener('change', setup);
setup();
```
:::

## 为什么正文必须默认可见

如果 CSS 先把所有章节设为 `opacity: 0`，脚本失败、Observer 不可用或初始化中断就会留下空白页面。上面的增强类只在 Observer 建立后添加。减少动态模式会移除增强类，让内容立即可见。

视差对装饰生效，避免标题和按钮随着鼠标滚动不断漂移。最大位移受到限制，减少阅读时的运动负担。

示例的 RAF 只在滚动或 resize 时申请，不建立永不停止的循环。在 SPA 中卸载时移除两个窗口监听、媒体监听，取消帧并断开 Observer。

## 效果验证

1. 首段可见，滚动后其他段落进入，不会反复闪入。
2. 到页面底部时进度接近 100%，顶部接近 0%。
3. 禁用 JavaScript 再刷新，所有正文仍然可读。
4. 切换系统减少动态设置，内容立即显示、球体停止视差。
5. Performance 中仅在滚动时运行更新，静止时没有持续 RAF。

## 常见错误

Sticky 不生效：祖先的 `overflow` 改变了滚动容器，或容器高度没有给 sticky 留出距离。先检查布局再改 `z-index`。

Observer 回调反复触发：它不是“一次性进入事件”，相交比例变化都会通知。完成一次性动画后 `unobserve`。

阅读进度不准：图片加载或折叠内容改变文档高度。每次更新重新读取总高度；不要只在初始化算一次。

## 练习与验收

增加一个“阅读进度”文本输出，四舍五入到整数百分比，并避免每像素变化都触发屏幕阅读器播报。验收：动态和减少动态两种模式都准确，禁用 JS 后正文可用，缩放窗口无横向滚动。

## 延伸阅读

- [MDN：IntersectionObserver](https://developer.mozilla.org/zh-CN/docs/Web/API/Intersection_Observer_API)
- [MDN：prefers-reduced-motion](https://developer.mozilla.org/zh-CN/docs/Web/CSS/@media/prefers-reduced-motion)
