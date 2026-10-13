---
title: GLSL、Uniform 与 ShaderMaterial
description: 运行完整 Vite Shader 项目，理解顶点变换、片元插值、时间与颜色更新。
---

# GLSL、Uniform 与 ShaderMaterial

## 学习目标

在 GPU 上生成一个流动的双色波纹平面，JS 只更新时间和颜色 uniform，不逐像素计算图案。
本例为独立 `shader-lab`，使用 Node 22+、Vite 与 Three.js；不依赖上一章遗留变量。
GLSL 在 GPU 编译执行，不是 JavaScript；浏览器支持 WebGL2 也不表示任意桌面 GLSL 都兼容。

## 两种 Shader 如何协作

Vertex Shader 对每个顶点执行，输出裁剪空间 `gl_Position`。
Fragment Shader 对光栅化产生的片元执行，输出颜色；片元不总等于最终屏幕像素，
还会经历深度、混合、采样等处理。
`uniform` 在一次 draw 内对所有顶点/片元相同；`varying` 由顶点输出并经光栅化插值到片元。

```text [渲染管线]
PlaneGeometry position / uv
  → vertex：模型视图投影，传递 vUv
  → 光栅化：插值 vUv
  → fragment：sin(vUv, uTime)，混合 uA / uB
  → 输出颜色，执行显示色彩空间转换
```

Three 的 `ShaderMaterial` 注入常用属性、矩阵与精度声明；`RawShaderMaterial` 不提供相同注入。
本例使用 Three 支持的 GLSL1 风格语法与默认转换，不设置 `glslVersion: THREE.GLSL3`；
若切换 GLSL3，应同步改为 `in/out` 和明确的片元输出，不能混用两种语法。

## 完整五文件示例

::: code-group
```json [package.json]
{
  "name": "shader-lab", "version": "1.0.0", "private": true, "type": "module",
  "scripts": { "dev": "vite --host 127.0.0.1", "build": "vite build" }
}
```

```html [index.html]
<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Shader 波纹</title><style>
body { margin: 0; background: #111827; color: white; font-family: sans-serif; }
header { padding: 16px; }
#stage { height: 70vh; width: 100%; }
canvas { display: block; width: 100%; height: 100%; }
</style></head><body>
<header><label>波纹颜色 <input id="color" type="color" value="#ff6633"></label>
<button id="stop">释放资源</button><output id="status">运行中</output></header>
<div id="stage" role="img" aria-label="双色动态波纹"></div>
<script type="module" src="/main.js"></script></body></html>
```

```glsl [wave.vert]
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

```glsl [wave.frag] {7-10}
uniform float uTime;
uniform vec3 uA;
uniform vec3 uB;
varying vec2 vUv;
void main() {
  vec2 p = vUv - vec2(0.5);
  float wave = sin(length(p) * 28.0 - uTime * 2.0);
  float weight = 0.5 + 0.5 * wave;
  vec3 color = mix(uA, uB, weight);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
```

```js [main.js]
import * as THREE from 'three';
import vertexShader from './wave.vert?raw';
import fragmentShader from './wave.frag?raw';
const stage = document.querySelector('#stage');
const colorInput = document.querySelector('#color');
const button = document.querySelector('#stop');
const status = document.querySelector('#status');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 20);
camera.position.z = 2.8;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.append(renderer.domElement);
const uniforms = {
  uTime: { value: 0 },
  uA: { value: new THREE.Color('#123b80') },
  uB: { value: new THREE.Color(colorInput.value) }
};
const geometry = new THREE.PlaneGeometry(2, 2);
const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms });
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);
let stopped = false;
let frame = 0;
let previous = null;
function resize() {
  if (stopped) return;
  const { width, height } = stage.getBoundingClientRect();
  if (width <= 0 || height <= 0) return;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
function changeColor() { uniforms.uB.value.set(colorInput.value); }
const observer = new ResizeObserver(resize);
observer.observe(stage);
window.addEventListener('resize', resize);
colorInput.addEventListener('input', changeColor);
function tick(now) {
  if (stopped) return;
  const dt = previous === null ? 0 : Math.min((now - previous) / 1000, 0.05);
  previous = now;
  uniforms.uTime.value += dt;
  renderer.render(scene, camera);
  frame = requestAnimationFrame(tick);
}
function dispose() {
  if (stopped) return;
  stopped = true;
  cancelAnimationFrame(frame);
  observer.disconnect();
  window.removeEventListener('resize', resize);
  colorInput.removeEventListener('input', changeColor);
  button.removeEventListener('click', dispose);
  geometry.dispose(); material.dispose(); renderer.dispose();
  scene.remove(mesh); renderer.domElement.remove();
  button.disabled = true; status.textContent = '已释放';
}
button.addEventListener('click', dispose);
resize();
frame = requestAnimationFrame(tick);
if (import.meta.hot) import.meta.hot.dispose(dispose);
```
:::

## 运行与机制验证

```bash [终端：shader-lab]
npm install --save-exact three@0.186.1
npm install --save-dev --save-exact vite@latest
npm run dev
```

浏览器应显示同心波纹随时间移动，改变颜色立即更新一端颜色，调整窗口不扭曲平面。
`?raw` 是 Vite 的字符串导入，不是访问 GLSL 文件的网络 API；无需额外 shader 插件。
更新 `uniforms.uTime.value` 不需要 `material.needsUpdate`；后者用于重新编译材质程序，
每帧设置它会浪费资源。改 GLSL 源码则要重新编译，开发时由热更新重建并清理旧实例。

`weight` 被正弦映射到 `[0,1]`，因此 `mix` 在两色之间插值。`new THREE.Color` 将 CSS 颜色转到线性工作空间，
片元末尾的 Three shader chunks 转为显示输出；这些 include 由 Three 预处理，不是浏览器原生 GLSL 语法。
本例时间是截断 dt 的动画时间，不是准确墙钟；纯平面图案只需四个顶点，增加分段不会增加片元图案细节。

## 常见故障、练习与官方资料

黑屏看 Console 中 shader 编译日志：漏分号、uniform/varying 类型不一致、拼错内置变量都可能失败。
把 `?raw` 去掉会让 Vite 把文件当资源路径；色彩异常检查是否重复转换 sRGB；
GPU 开销高先降低 DPR 和片元计算量，不能用增加几何顶点解决。
练习：新增 `uSpeed` 滑块，限制范围 `0..4`，允许速度为零；验收颜色和速度不触发每帧重编译，
暂停时图案不移动，热更新与释放后不残留 RAF，并记录低性能 GPU 的真实表现。

- [Three ShaderMaterial](https://threejs.org/docs/#api/en/materials/ShaderMaterial)
- [Three 色彩管理](https://threejs.org/manual/en/color-management.html)
- [Khronos WebGL GLSL ES 规范](https://registry.khronos.org/OpenGL/specs/es/2.0/GLSL_ES_Specification_1.00.pdf)
- [Vite 静态资源与 raw 导入](https://vite.dev/guide/assets.html#importing-asset-as-string)
