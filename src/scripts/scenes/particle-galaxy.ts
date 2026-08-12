import { getSceneProfile } from "./scene-lifecycle";
import { createSeededRandom } from "./seeded-random";
import type { ExperimentController } from "./runtime";

const vertexShader = `
  uniform float uTime;
  uniform vec2 uPointer;
  varying vec3 vColor;

  void main() {
    vec3 transformed = position;
    vec2 delta = transformed.xy - uPointer;
    float distanceToPointer = length(delta);
    float force = 1.0 - smoothstep(0.0, 1.7, distanceToPointer);
    transformed.xy += normalize(delta + vec2(0.0001)) * force * 0.34;
    transformed.y += sin(uTime * 0.7 + transformed.x * 1.4) * 0.035;

    vec4 viewPosition = modelViewMatrix * vec4(transformed, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = 3.2 * (8.0 / -viewPosition.z);
    vColor = color;
  }
`;

const fragmentShader = `
  varying vec3 vColor;

  void main() {
    float distanceToCenter = distance(gl_PointCoord, vec2(0.5));
    float alpha = 1.0 - smoothstep(0.16, 0.5, distanceToCenter);
    if (alpha <= 0.0) discard;
    gl_FragColor = vec4(vColor, alpha * 0.9);
  }
`;

export interface GalaxyPoints {
  positions: Float32Array;
  colors: Float32Array;
}

export function createGalaxyPoints(count: number, seed: number): GalaxyPoints {
  const random = createSeededRandom(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const warm = [1, 0.31, 0.12] as const;
  const cool = [0.31, 0.35, 1] as const;

  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    const branchAngle = ((index % 5) / 5) * Math.PI * 2;
    const radius = 0.35 + Math.pow(random(), 0.72) * 4.65;
    const angle =
      branchAngle + radius * 0.78 + (random() - 0.5) * 0.32;
    const spread = 0.08 + radius * 0.025;

    positions[offset] =
      Math.cos(angle) * radius + (random() - 0.5) * spread;
    positions[offset + 1] = (random() - 0.5) * 0.42;
    positions[offset + 2] =
      Math.sin(angle) * radius + (random() - 0.5) * spread;

    const colorMix = Math.min(
      1,
      (radius / 5) * 0.82 + random() * 0.18,
    );
    colors[offset] = warm[0] + (cool[0] - warm[0]) * colorMix;
    colors[offset + 1] = warm[1] + (cool[1] - warm[1]) * colorMix;
    colors[offset + 2] = warm[2] + (cool[2] - warm[2]) * colorMix;
  }

  return { positions, colors };
}

export async function mount(
  canvas: HTMLCanvasElement,
  controls: HTMLElement,
): Promise<ExperimentController> {
  void controls;

  const { loadThreeRuntime } =
    await import("@/scripts/scenes/three-runtime");
  const three = await loadThreeRuntime();
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const profile = getSceneProfile({
    width: window.innerWidth,
    dpr: window.devicePixelRatio,
    reducedMotion,
  });
  const scene = new three.Scene();
  const camera = new three.PerspectiveCamera(48, 1, 0.1, 100);
  const renderer = new three.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: profile.fps > 30,
    powerPreference: "high-performance",
  });
  const galaxy = createGalaxyPoints(profile.particles, 0x5a4a42);
  const geometry = new three.BufferGeometry();
  geometry.setAttribute(
    "position",
    new three.BufferAttribute(galaxy.positions, 3),
  );
  geometry.setAttribute("color", new three.BufferAttribute(galaxy.colors, 3));

  const uniforms = {
    uTime: { value: 0 },
    uPointer: { value: new three.Vector2(0, 0) },
  };
  const material = new three.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: three.AdditiveBlending,
  });
  const points = new three.Points(geometry, material);
  scene.add(points);
  camera.position.set(0, 1.15, 8);
  camera.lookAt(0, 0, 0);
  renderer.setClearColor(0x070812, 1);
  renderer.outputColorSpace = three.SRGBColorSpace;

  let disposed = false;
  let paused = false;
  let frame = 0;
  let previousFrame = 0;
  const frameInterval = 1000 / profile.fps;

  const resize = () => {
    if (disposed) return;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;

    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, profile.maxDpr),
    );
    renderer.setSize(bounds.width, bounds.height, false);
    camera.aspect = bounds.width / bounds.height;
    camera.updateProjectionMatrix();
    if (!profile.animated) renderer.render(scene, camera);
  };

  const render = (time: number) => {
    frame = 0;
    if (disposed || paused || !profile.animated) return;
    if (time - previousFrame < frameInterval) {
      frame = requestAnimationFrame(render);
      return;
    }

    previousFrame = time;
    uniforms.uTime.value = time / 1000;
    points.rotation.y = time * 0.000035;
    renderer.render(scene, camera);
    frame = requestAnimationFrame(render);
  };

  const resume = () => {
    paused = false;
    if (!disposed && profile.animated && frame === 0) {
      previousFrame = performance.now() - frameInterval;
      frame = requestAnimationFrame(render);
    }
  };

  const pause = () => {
    paused = true;
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };

  const reset = () => {
    uniforms.uPointer.value.set(0, 0);
    points.rotation.set(0, 0, 0);
    camera.position.set(0, 1.15, 8);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  };

  const onPointerMove = (event: PointerEvent) => {
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;

    uniforms.uPointer.value.set(
      ((event.clientX - bounds.left) / bounds.width - 0.5) * 8,
      (0.5 - (event.clientY - bounds.top) / bounds.height) * 4.5,
    );
  };
  const onPointerLeave = () => uniforms.uPointer.value.set(0, 0);

  canvas.addEventListener("pointermove", onPointerMove, { passive: true });
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("pointercancel", onPointerLeave);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    pause();
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    canvas.removeEventListener("pointercancel", onPointerLeave);
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };

  resize();
  if (profile.animated) {
    resume();
  } else {
    renderer.render(scene, camera);
  }

  return { pause, resume, resize, reset, dispose };
}
