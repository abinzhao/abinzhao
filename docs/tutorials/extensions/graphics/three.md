---
title: Three.js 场景、渲染循环与资源释放
description: 用完整 Vite 实例理解相机、尺寸、DPR、帧时间和 GPU 资源生命周期。
---

# Three.js 场景、渲染循环与资源释放

## 目标与运行边界

显示一个旋转立方体，窗口改变时不拉伸，点击“释放场景”后停止动画并释放 GPU 资源。
实验使用 Node 22+、支持 WebGL2 的桌面浏览器；Three.js 是渲染库，不是自动管理生命周期的应用框架。
在独立 `three-lab` 目录运行，不改教程主站的依赖、配置或构建目录。

## 从数据到像素

`Scene` 保存对象关系；`Geometry` 定义顶点和索引；`Material` 决定着色；
`Mesh` 将几何和材质组合。`Camera` 决定从哪里观察及投影，`WebGLRenderer` 将场景提交给 GPU。
透视相机的 `near` 必须大于零，`far` 不宜无意义地增大，否则深度精度下降。
本例相机位于 z=3，立方体在原点；`MeshNormalMaterial` 用法线着色，无须光源。

```text [每帧关系]
RAF 时间戳 → 计算秒级 dt → 更新旋转
CSS 容器尺寸 → 相机 aspect / 投影矩阵
CSS 尺寸 × 受限 DPR → drawing buffer
renderer.render(scene, camera) → GPU 绘制
```

## 完整三文件实例

创建 `three-lab` 并写入以下文件。安装命令会将 Vite 与 Three 精确记录到该实验 package 和锁文件。

::: code-group
```json [package.json]
{
  "name": "three-lab", "version": "1.0.0", "private": true, "type": "module",
  "scripts": { "dev": "vite --host 127.0.0.1", "build": "vite build", "preview": "vite preview" }
}
```

```html [index.html]
<!doctype html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Three 场景实验</title>
<style>
body { margin: 0; background: #131722; color: white; font-family: sans-serif; }
main { padding: 20px; }
#stage { width: 100%; height: 65vh; min-height: 240px; }
canvas { display: block; width: 100%; height: 100%; }
button { padding: 12px; }
</style></head>
<body><main><h1>旋转立方体</h1>
<div id="stage" role="img" aria-label="持续旋转的彩色立方体"></div>
<button id="dispose" type="button">释放场景</button>
<output id="status" aria-live="polite">渲染中</output></main>
<script type="module" src="/main.js"></script></body>
</html>
```

```js [main.js] {23-25}
import * as THREE from 'three';
const stage = document.querySelector('#stage');
const button = document.querySelector('#dispose');
const status = document.querySelector('#status');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#131722');
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.z = 3;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.append(renderer.domElement);
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshNormalMaterial();
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);
let stopped = false;
let frame = 0;
let previous = null;
let dpr = 0;
function resize() {
  const { width, height } = stage.getBoundingClientRect();
  if (width <= 0 || height <= 0 || stopped) return;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
const observer = new ResizeObserver(resize);
observer.observe(stage);
window.addEventListener('resize', resize);
function tick(now) {
  if (stopped) return;
  if (Math.min(window.devicePixelRatio || 1, 2) !== dpr) resize();
  const dt = previous === null ? 0 : Math.min((now - previous) / 1000, 0.05);
  previous = now;
  cube.rotation.x += dt * 0.5;
  cube.rotation.y += dt * 0.8;
  renderer.render(scene, camera);
  frame = requestAnimationFrame(tick);
}
function dispose() {
  if (stopped) return;
  stopped = true;
  cancelAnimationFrame(frame);
  observer.disconnect();
  window.removeEventListener('resize', resize);
  button.removeEventListener('click', dispose);
  scene.remove(cube);
  geometry.dispose();
  material.dispose();
  renderer.dispose();
  renderer.domElement.remove();
  button.disabled = true;
  status.textContent = '场景与资源已释放';
}
button.addEventListener('click', dispose);
resize();
frame = requestAnimationFrame(tick);
if (import.meta.hot) import.meta.hot.dispose(dispose);
```
:::

## 实际运行

```bash [终端：three-lab]
npm install --save-exact three@0.186.1
npm install --save-dev --save-exact vite@latest
npm run dev
```

打开终端显示的地址，预期看到彩色立方体持续旋转。调整窗口宽高，立方体不能被拉成扁盒；
点击按钮，画布移除、状态变成“场景与资源已释放”，再次点击不可重复清理。
这里的 `npm run build` 只构建独立实验；不在教程主站执行，也不用共享输出。

## 尺寸、帧率与销毁机制

CSS 尺寸决定布局，drawing buffer 尺寸决定实际像素数量。DPR 从 1 升到 2，
同样 CSS 面积的像素数约变为四倍；封顶是性能策略，不是要求浏览器伪装低分辨率。
`setSize(..., false)` 不让 Three 改写画布的 CSS，避免 ResizeObserver 与布局互相触发。
改变相机 `aspect` 后必须更新投影矩阵，否则仅画布改变，相机仍按旧比例绘制。

按秒计算 `dt`，旋转速度不依赖 60 Hz 或 144 Hz。后台标签页的 RAF 常被暂停，
返回后截断 dt 防止突然跳跃；这不是严格物理模拟，模拟应采用固定时间步与累积器。
不要同时运行 RAF 和 `setAnimationLoop`，否则可能重复渲染。

移除 Mesh 不会释放几何、材质或纹理。此例显式释放几何、材质、renderer，取消 RAF 和监听器；
后续加纹理必须调用纹理自己的 `dispose()`，共享资源需在最后一个使用者结束后才释放。
热更新也调用同一个幂等清理函数；生产组件应在卸载时调用，而不是只等页面关闭。

## 常见故障、练习与官方资料

黑屏先看 Console：WebGL2 不可用、相机朝向/裁剪错误、容器高度为零都可能造成空画面。
基础材质需要光源时应加入灯光，本例法线材质不需要；不可为“修复”关闭深度测试。
锯齿检查 DPR 和 antialias，风扇高转先降低像素与几何复杂度，不仅看 JavaScript 帧时间。

练习：增加第二个共享 geometry/material 的 Mesh，保持不同转速，加入暂停与恢复按钮。
验收：不同刷新率速度接近，调整容器保持比例，暂停无连续绘制，最终只释放共享资源一次；
重复热更新不累积画布、观察器或 RAF。记录浏览器与 GPU 环境，不能把编译成功等同于视觉验收。

- [Three.js 创建场景](https://threejs.org/manual/en/creating-a-scene.html)
- [响应式画布](https://threejs.org/manual/en/responsive.html)
- [资源清理](https://threejs.org/manual/en/cleanup.html)
- [Vite 使用指南](https://vite.dev/guide/)
