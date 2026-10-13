---
title: CSS：过渡与关键帧
description: 区分状态过渡和时间轴动画，处理 transform、暂停与减少动态效果。
---

# CSS：过渡与关键帧

## 学习目标

- 能区分 `transition` 与 `animation` 的触发机制。
- 能用 transform 表达移动，而不反复改变布局位置。
- 能提供暂停操作，并尊重 `prefers-reduced-motion`。

前置：[Flex 与 Grid](./layout.md)。
本章按钮脚本只负责切换状态，动画过程由 CSS 执行。

## 为什么要让变化可理解

瞬间出现的提示可能难以注意，轻量过渡可以表达“状态发生变化”。
但持续运动会分散注意力，也可能让部分用户感到不适。
动画应补充状态含义，而不是成为唯一的成功或错误提示。

`transition` 在属性从一个值变为另一个值时进行插值。
没有发生值变化，即使声明了过渡也不会凭空播放。
`animation` 由 `@keyframes` 定义时间轴，可以启动后独立运行或循环。
两者可以同时存在，但不要在同一元素上竞争同一个属性。

## 机制与边界

过渡需要可插值属性，例如 opacity、颜色或 transform。
`display: none` 的简单切换通常不能按数值方式插值，本章使用透明度与位移。
对不可见内容还要考虑焦点：仅设 `opacity: 0` 不会禁止键盘访问。
本例提示是不可交互文本，因此不用隐藏其中的控件。

transform 改变视觉位置，不改变普通流中的占位。
这通常减少布局工作，但不能保证所有动画都只在合成线程完成。
动画是否昂贵还取决于面积、滤镜、阴影、浏览器实现和硬件。
不要给所有元素长期添加 `will-change`，它会增加资源占用。

`animation-play-state: paused` 保留时间位置，重新运行时从那里继续。
删除动画再添加通常会重新开始，这是不同的交互。
`prefers-reduced-motion: reduce` 是用户偏好，不等于完全不能使用反馈。
可以移除移动并保留文字、颜色和进度信息。

## 运行步骤

1. 创建 `motion/index.html` 与 `motion/style.css`。
2. 启动练习服务器，打开 `/motion/`。
3. 点击提示按钮，观察过渡；点击播放按钮，观察关键帧。
4. 在 DevTools Rendering 面板模拟 reduced motion，再重复操作。

## 完整示例

::: code-group

```html [index.html]
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>动画状态实验</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <main>
    <h1>动画状态实验</h1>
    <section aria-labelledby="transition-title">
      <h2 id="transition-title">提示过渡</h2>
      <button id="notice-toggle" type="button" aria-pressed="false">显示提示</button>
      <p id="notice" class="notice" role="status"></p>
    </section>
    <section aria-labelledby="animation-title">
      <h2 id="animation-title">可暂停的时间轴</h2>
      <p>这是路径运动演示，不表示真实加载进度。</p>
      <div class="track" aria-hidden="true">
        <div id="marker" class="marker"></div>
      </div>
      <button id="play-toggle" type="button" aria-pressed="false">开始运动</button>
      <p id="play-status" role="status">演示已暂停。</p>
    </section>
  </main>
  <script>
    const notice = document.querySelector('#notice');
    const noticeToggle = document.querySelector('#notice-toggle');
    const playToggle = document.querySelector('#play-toggle');
    const marker = document.querySelector('#marker');
    const status = document.querySelector('#play-status');
    let showing = false;
    let playing = false;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    noticeToggle.addEventListener('click', () => {
      showing = !showing;
      notice.textContent = showing ? '提示已显示：本次操作只改变本地页面。' : '';
      notice.classList.toggle('is-visible', showing);
      noticeToggle.setAttribute('aria-pressed', String(showing));
      noticeToggle.textContent = showing ? '隐藏提示' : '显示提示';
    });
    function updatePlayback() {
      marker.classList.toggle('is-running', playing);
      playToggle.setAttribute('aria-pressed', String(playing));
      playToggle.textContent = playing ? '暂停运动' : '开始运动';
      status.textContent = preference.matches
        ? '已启用减少动态效果，保留静态标记。'
        : playing ? '演示正在运动，可以随时暂停。' : '演示已暂停。';
    }
    playToggle.addEventListener('click', () => {
      playing = !playing;
      updatePlayback();
    });
    preference.addEventListener('change', updatePlayback);
    updatePlayback();
  </script>
</body>
</html>
```

```css [style.css]
* { box-sizing: border-box; }
body { font-family: sans-serif; color: #203047; margin: 0; }
main { max-width: 42rem; margin: 2rem auto; padding: 1rem; }
section { margin-block: 2rem; }
button { font: inherit; padding: .7rem 1rem; cursor: pointer; }
button:hover { background: #edf2ff; }
:focus-visible { outline: 3px solid #2459b2; outline-offset: 3px; }
.notice {
  min-height: 3rem;
  padding: .75rem;
  background: #e9f2ff;
  opacity: 0;
  transform: translateY(.5rem);
  transition: opacity 180ms ease-out, transform 180ms ease-out;
}
.notice.is-visible { opacity: 1; transform: translateY(0); }
.track {
  width: 280px;
  padding: 8px;
  border: 2px solid #6b7d95;
  background: #edf1f7;
}
.marker {
  width: 24px;
  height: 24px;
  background: #2459b2;
  border-radius: 50%;
  animation: travel 2s ease-in-out infinite alternate;
  animation-play-state: paused;
}
.marker.is-running { animation-play-state: running; }
@keyframes travel {
  from { transform: translateX(0); }
  to { transform: translateX(236px); }
}
@media (prefers-reduced-motion: reduce) {
  .notice { transition: none; transform: none; }
  .marker { animation: none; transform: none; }
}
```

:::

轨道总宽 280px，扣除两侧边框 4px 和 padding 16px 后，内容宽为 260px。
再扣去圆点 24px，允许移动 236px；这解释了关键帧中的数值。
若改变轨道尺寸，应同步调整运动范围，不能只盲目修改终点。

## 效果验证

1. 提示出现时透明度从 0 到 1，位置轻微上移，按钮状态同步更新。
2. 圆点启动后往返运动，点击暂停会停在当前位置。
3. 键盘可操作两个按钮，焦点轮廓不会被隐藏。
4. 模拟 reduced motion 后圆点静止，文字明确说明当前偏好。
5. 在 Animations 面板查看时间轴，在 Performance 记录中观察布局活动。

## 常见错误

写 `transition: all` 会把未来新增的属性也纳入动画，容易产生意外变化。
过渡时间过长会让输入反馈滞后，界面反馈与装饰动画应区别处理。
不停移动的装饰元素没有暂停入口，会影响阅读和可访问性。
用动画结束事件承载关键业务提交不可靠，动画可能被取消或被用户偏好禁用。

## 练习与验收标准

将提示过渡缩短到 120ms，记录你感受到的变化。
新增“重置运动”按钮，使标记回到起点，并保持播放状态说明准确。
验收：暂停可继续；重置从起点开始；reduced motion 下无位移动画；无业务依赖动画完成。

## 延伸资料

- [MDN：CSS 过渡](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_transitions/Using_CSS_transitions)
- [MDN：CSS 动画](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_animations/Using_CSS_animations)
- [MDN：prefers-reduced-motion](https://developer.mozilla.org/zh-CN/docs/Web/CSS/@media/prefers-reduced-motion)
- [Chrome：动画检查](https://developer.chrome.com/docs/devtools/css/animations)

下一章：[JavaScript 基础](../javascript/fundamentals.md)。
