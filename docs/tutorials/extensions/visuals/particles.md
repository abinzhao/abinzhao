---
title: Canvas 粒子与连线
description: 用位置、速度、时间步长和距离建立粒子网络，并控制高 DPI 和连线成本。
---

# Canvas 粒子与连线

## 学习目标

实现一个完整的粒子网络：按时间更新位置、邻近连线、适配窗口、暂停、页面不可见时停止渲染，并解释性能瓶颈。

## 从数据模型开始

每个粒子包含 `x/y` 位置和 `vx/vy` 速度。速度单位设为像素/秒，每帧位移等于 `速度 × 两帧时间差`。如果每帧固定移动 1px，144Hz 屏幕将比 60Hz 快 2.4 倍。

两点距离 `Math.hypot(dx, dy)` 小于阈值才连线；透明度按距离衰减。朴素算法比较每对粒子，次数为 `n(n−1)/2`，不是 O(n)。60 个粒子比较 1770 对，600 个比较 179700 对。

Canvas 的 CSS 尺寸和绘图缓冲区尺寸不同。高 DPI 屏幕使用较大的缓冲区，再用 `setTransform` 将绘图单位恢复为 CSS 像素。限制 DPR 可以降低像素处理量。

## 操作步骤

新建 `index.html`，复制完整文件，执行 `npx serve . --listen 5173`，打开本地地址。这个例子用 70 个粒子，没有依赖。

## 完整代码

```html [index.html]
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Canvas 粒子网络</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; color: #edf3ff; background: #0a1020; font-family: system-ui; }
    main { width: min(900px, 100%); margin: auto; padding: 24px; }
    canvas { width: 100%; height: 360px; display: block; border: 1px solid #29344e; border-radius: 12px; }
    button { margin-top: 16px; min-height: 44px; padding: 0 18px; border: 0; border-radius: 6px; cursor: pointer; }
    button:focus-visible { outline: 3px solid #789bff; outline-offset: 4px; }
  </style>
</head>
<body>
<main>
  <h1>粒子网络</h1>
  <canvas aria-label="70 个点根据距离连线的粒子动画"></canvas>
  <button type="button" aria-pressed="false">暂停动画</button>
  <p id="status" role="status">70 个粒子，距离阈值 100px。</p>
</main>
<script type="module">
  const canvas = document.querySelector('canvas');
  const button = document.querySelector('button');
  const status = document.querySelector('#status');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法创建 Canvas 2D 上下文');
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let width = 1;
  const height = 360;
  let particles = [];
  let paused = false;
  let frame = 0;
  let previous = 0;
  let visible = true;

  function paint(dt) {
    context.clearRect(0, 0, width, height);
    for (const point of particles) {
      point.x = (point.x + point.vx * dt + width) % width;
      point.y = (point.y + point.vy * dt + height) % height;
    }
    for (let i = 0; i < particles.length; i++) {
      const point = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const other = particles[j];
        const distance = Math.hypot(point.x - other.x, point.y - other.y);
        if (distance >= 100) continue;
        context.strokeStyle = `rgba(130,170,255,${(1 - distance / 100) * .45})`;
        context.beginPath();
        context.moveTo(point.x, point.y);
        context.lineTo(other.x, other.y);
        context.stroke();
      }
      context.fillStyle = i % 3 ? '#91acff' : '#65dfc1';
      context.beginPath();
      context.arc(point.x, point.y, 2.3, 0, Math.PI * 2);
      context.fill();
    }
  }
  function loop(time) {
    const dt = previous ? Math.min((time - previous) / 1000, .04) : 0; // [!code highlight]
    previous = time;
    paint(dt);
    frame = requestAnimationFrame(loop);
  }
  function sync() {
    cancelAnimationFrame(frame);
    previous = 0;
    paint(0);
    const running = !paused && !media.matches && !document.hidden && visible;
    if (running) frame = requestAnimationFrame(loop);
    button.disabled = media.matches;
    status.textContent = media.matches
      ? '减少动态模式：显示静态粒子网络。'
      : paused ? '已暂停。' : '70 个粒子，距离阈值 100px。';
  }
  function resize() {
    width = canvas.clientWidth;
    const ratio = Math.min(devicePixelRatio, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    particles = Array.from({ length: 70 }, () => ({
      x: Math.random() * width, y: Math.random() * height,
      vx: (Math.random() - .5) * 40, vy: (Math.random() - .5) * 40,
    }));
    sync();
  }
  button.addEventListener('click', () => {
    paused = !paused;
    button.setAttribute('aria-pressed', String(paused));
    button.textContent = paused ? '继续动画' : '暂停动画';
    sync();
  });
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  });
  intersectionObserver.observe(canvas);
  document.addEventListener('visibilitychange', sync);
  media.addEventListener('change', sync);
  resize();
</script>
</body>
</html>
```

## 时间与暂停的边界

限制 `dt` 到 40ms，可以避免恢复页面后粒子突然飞出视野。这里暂停时停止 RAF，恢复时重置上一帧时间；不能只在画面上加“已暂停”文字而保留持续计算。

示例是独立页面，浏览器卸载时会销毁资源。如果移入 SPA 组件，在卸载阶段 `cancelAnimationFrame`、断开两个 Observer、移除两个事件监听，防止切换页面后旧循环继续运行。

## 效果验证

- 粒子慢速移动，距离越近连线越明显。
- 拉宽窗口画布清晰且不拉伸；暂停后画面静止。
- 开启减少动态效果后显示静态网络，按钮不可启动持续动画。
- 滚出画布或切到其他标签页后，Performance 中不再持续出现该循环。
- 将数量改为 140，记录 JS 耗时；比较量约增长为四倍，而非两倍。

## 常见错误与进一步优化

画布越来越模糊或放大：每次 resize 用 `scale` 累乘。`setTransform` 设置绝对变换。

粒子闪烁：没有每帧清屏，或 resize 在每帧重建缓冲区。缓冲区只在尺寸变化时更新。

数量增长卡顿：先采样测量，再考虑空间网格把粒子放进邻近单元，避免全局两两比较；不要仅靠降低透明度期待降低计算量。需要更高密度时再考虑 WebGL 与 GPU 数据批量更新。

## 练习与验收

加入距离阈值滑块，范围 40–140px。验收：连线随参数即时变化，粒子数量不变，暂停状态不产生新 RAF。使用 Performance 对比最高与最低阈值，解释“比较次数相同，实际绘制数量不同”。

## 延伸阅读

- [MDN：Canvas API](https://developer.mozilla.org/zh-CN/docs/Web/API/Canvas_API)
- [MDN：requestAnimationFrame](https://developer.mozilla.org/zh-CN/docs/Web/API/Window/requestAnimationFrame)
