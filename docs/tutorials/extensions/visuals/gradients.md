---
title: 渐变、流光与玻璃质感
description: 从颜色、图层与时间建立可控的视觉效果，理解模糊、透明和渲染成本。
---

# 渐变、流光与玻璃质感

## 学习目标

写一个可以暂停的流动光场，解释线性渐变、径向渐变、透明图层与 `backdrop-filter` 的区别，并避免把特效盖在正文上。

## 视觉效果来自图层关系

线性渐变按方向分配颜色，径向渐变按中心向外变化，锥形渐变围绕中心按角度变化。渐变不是图片文件，也不需要网络请求，但频繁改变渐变背景仍可能触发重绘。

`filter: blur()` 模糊元素本身；`backdrop-filter: blur()` 模糊它后面的内容。玻璃感需要后方有颜色或纹理，再加半透明背景与细边框。单独在纯色背景上加模糊不会产生丰富层次。

| 实现 | 更适合 | 代价与边界 |
| --- | --- | --- |
| `linear-gradient` | 按钮、文字、分隔线 | 注意文字对比度 |
| `radial-gradient` | 光斑、光晕 | 大面积动画可能需要重绘 |
| `conic-gradient` | 环形仪表、转动边框 | 装饰图层不表达实际数据 |
| `transform` 移动光斑 | 持续流动背景 | 仍需控制图层尺寸与模糊范围 |
| `backdrop-filter` | 玻璃面板 | 背景复杂、大范围模糊会增加成本 |

<ConceptFlow :steps="['深色底层', '彩色光斑', '模糊扩散', '半透明前景']" caption="光场只负责环境氛围；正文与操作保留稳定的对比度。" />

## 操作步骤

创建 `index.html`，把下面整个文件保存后运行：

```bash
npx serve . --listen 5173
```

打开 `http://localhost:5173/`。无需框架、图片或其他依赖。

## 完整代码

```html [index.html]
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>流动光场</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 24px; min-height: 100vh;
      display: grid; place-items: center;
      background: #090f1c; color: #f1f5ff;
      font-family: system-ui, sans-serif;
    }
    .scene {
      position: relative; isolation: isolate; overflow: hidden;
      width: min(720px, 100%); padding: 64px 28px;
      border: 1px solid #273349; border-radius: 20px;
      background: radial-gradient(ellipse at 50% 100%, #182940, #090f1c 70%);
    }
    .orb {
      position: absolute; z-index: -1;
      width: 240px; height: 240px; border-radius: 50%;
      filter: blur(44px); opacity: .7;
      animation: drift 8s ease-in-out infinite alternate; /* [!code highlight] */
    }
    .orb.one { left: 4%; top: -90px; background: #536aff; }
    .orb.two {
      right: 0; bottom: -100px; background: #39bba6;
      animation-delay: -3s; animation-direction: alternate-reverse;
    }
    .glass {
      width: min(460px, 100%); margin: auto; padding: 28px;
      background: rgba(255,255,255,.045);
      border: 1px solid rgba(255,255,255,.18); border-radius: 14px;
      backdrop-filter: blur(16px);
    }
    h1 { margin: 0; font-size: clamp(28px, 6vw, 42px); line-height: 1.2; }
    p { color: #c3cee5; line-height: 1.8; }
    button {
      min-height: 44px; border: 1px solid #95b3ff; border-radius: 8px;
      padding: 0 18px; background: #a8baff; color: #10192b; cursor: pointer;
    }
    button:focus-visible { outline: 3px solid #5bdfc1; outline-offset: 4px; }
    .paused .orb { animation-play-state: paused; }
    @keyframes drift {
      to { transform: translate(100px, 50px) scale(1.2); }
    }
    @media (prefers-reduced-motion: reduce) {
      .orb { animation: none; }
    }
    @supports not (backdrop-filter: blur(16px)) {
      .glass { background: rgba(16,25,43,.95); }
    }
  </style>
</head>
<body>
  <main class="scene">
    <div class="orb one" aria-hidden="true"></div>
    <div class="orb two" aria-hidden="true"></div>
    <article class="glass">
      <h1>让光，流动起来。</h1>
      <p>缓慢变化的背景，稳定清晰的前景。</p>
      <button type="button" aria-pressed="false">暂停动画</button>
    </article>
  </main>
  <script>
    const scene = document.querySelector('.scene');
    const button = document.querySelector('button');
    button.addEventListener('click', () => {
      const paused = scene.classList.toggle('paused');
      button.setAttribute('aria-pressed', String(paused));
      button.textContent = paused ? '继续动画' : '暂停动画';
    });
  </script>
</body>
</html>
```

## 为什么这样写

`isolation: isolate` 建立独立叠放上下文，让 `z-index: -1` 的光斑留在场景内。`overflow: hidden` 约束移动范围，避免光斑产生横向滚动。固定前景色保证动画过程中可读性稳定。

动画只改变光斑的 `transform`，不持续修改宽高或位置布局属性。合成是否完全发生在 GPU 取决于浏览器，不能仅凭属性名字声称“零成本”。模糊依然需要计算，尤其在高 DPI 和大窗口下。

## 效果验证

1. 两个光斑慢速移动，卡片文字保持清晰。
2. 暂停按钮按下后停在当前位置，再按继续，而不是从头开始。
3. 开启系统“减少动态效果”，光斑静止，内容与按钮仍可用。
4. 在 390px 宽度无横向滚动，键盘 Tab 能到达按钮。
5. 开发者工具 Performance 录制十秒，比较关闭模糊前后的绘制成本。

## 常见错误

背景完全消失：负 `z-index` 跑到了祖先背景后方，检查叠放上下文与 `isolation`。

文字发虚：把 `filter` 加在包含正文的父元素上。把装饰和文本分层，不要模糊整个主容器。

光斑移动导致滚动条：检查尺寸和溢出约束。不能靠全站 `overflow-x: hidden` 掩盖错误布局。

## 练习与验收

增加第三个光斑，并用 CSS 变量提供速度设置。验收：调整速度不改变文字对比，暂停与减少动态仍有效，移动端不溢出。再把模糊半径从 44px 改到 100px，记录帧时间变化，解释画面更柔和的成本。

## 延伸阅读

- [MDN：CSS 渐变](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_images/Using_CSS_gradients)
- [MDN：backdrop-filter](https://developer.mozilla.org/zh-CN/docs/Web/CSS/backdrop-filter)
- [MDN：叠放上下文](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_positioned_layout/Stacking_context)
