import fragmentShader from "./shaders/orbital.frag.glsl?raw";
import vertexShader from "./shaders/fullscreen.vert.glsl?raw";
import { getSceneProfile } from "./scene-lifecycle";
import type { ExperimentController } from "./runtime";

export interface ShaderSettings {
  speed: number;
  scale: number;
  hue: number;
}

const defaultShaderSettings: ShaderSettings = {
  speed: 1,
  scale: 1,
  hue: 24,
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteOrDefault(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

export function normalizeShaderSettings(
  settings: ShaderSettings,
): ShaderSettings {
  return {
    speed: clamp(
      finiteOrDefault(settings.speed, defaultShaderSettings.speed),
      0,
      2,
    ),
    scale: clamp(
      finiteOrDefault(settings.scale, defaultShaderSettings.scale),
      0.5,
      2,
    ),
    hue: clamp(
      finiteOrDefault(settings.hue, defaultShaderSettings.hue),
      0,
      360,
    ),
  };
}

interface RangeControl {
  input: HTMLInputElement;
  dispose(): void;
}

function createRangeControl(
  root: HTMLElement,
  options: {
    id: string;
    label: string;
    min: number;
    max: number;
    step: number;
    value: number;
    onChange(value: number): void;
  },
): RangeControl {
  const label = document.createElement("label");
  const input = document.createElement("input");

  label.htmlFor = options.id;
  label.textContent = options.label;
  label.style.display = "grid";
  label.style.gap = "0.25rem";

  input.id = options.id;
  input.name = options.id;
  input.type = "range";
  input.min = String(options.min);
  input.max = String(options.max);
  input.step = String(options.step);
  input.value = String(options.value);
  input.setAttribute("aria-valuetext", input.value);

  const onInput = () => {
    const value = Number(input.value);
    input.setAttribute("aria-valuetext", input.value);
    options.onChange(value);
  };

  input.addEventListener("input", onInput);
  label.append(input);
  root.append(label);

  return {
    input,
    dispose() {
      input.removeEventListener("input", onInput);
    },
  };
}

export async function mount(
  canvas: HTMLCanvasElement,
  controls: HTMLElement,
): Promise<ExperimentController> {
  const three = await import("three");
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const profile = getSceneProfile({
    width: window.innerWidth,
    dpr: window.devicePixelRatio,
    reducedMotion,
  });
  const renderer = new three.WebGLRenderer({
    canvas,
    antialias: profile.fps > 30,
    powerPreference: "high-performance",
  });
  const scene = new three.Scene();
  const camera = new three.Camera();
  const geometry = new three.BufferGeometry();
  geometry.setAttribute(
    "position",
    new three.BufferAttribute(
      new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]),
      3,
    ),
  );

  const settings = { ...defaultShaderSettings };
  const uniforms = {
    uResolution: { value: new three.Vector2(1, 1) },
    uTime: { value: 0 },
    uSpeed: { value: settings.speed },
    uScale: { value: settings.scale },
    uHue: { value: settings.hue },
  };
  const material = new three.RawShaderMaterial({
    fragmentShader,
    vertexShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });
  const triangle = new three.Mesh(geometry, material);
  triangle.frustumCulled = false;
  scene.add(triangle);
  renderer.outputColorSpace = three.SRGBColorSpace;
  renderer.setClearColor(0x070812, 1);

  const controlRoot = document.createElement("div");
  controlRoot.style.display = "grid";
  controlRoot.style.flex = "1 1 100%";
  controlRoot.style.gridTemplateColumns =
    "repeat(auto-fit, minmax(8rem, 1fr))";
  controlRoot.style.gap = "0.75rem";
  controls.append(controlRoot);

  let disposed = false;
  let paused = false;
  let frame = 0;
  let elapsed = 0;
  let previousFrame = 0;
  const frameInterval = 1000 / profile.fps;

  const renderOnce = () => {
    if (!disposed) renderer.render(scene, camera);
  };

  const rangeControls = [
    createRangeControl(controlRoot, {
      id: "shader-speed",
      label: "速度",
      min: 0,
      max: 2,
      step: 0.1,
      value: settings.speed,
      onChange(value) {
        settings.speed = value;
        uniforms.uSpeed.value = value;
        renderOnce();
      },
    }),
    createRangeControl(controlRoot, {
      id: "shader-scale",
      label: "噪声尺度",
      min: 0.5,
      max: 2,
      step: 0.1,
      value: settings.scale,
      onChange(value) {
        settings.scale = value;
        uniforms.uScale.value = value;
        renderOnce();
      },
    }),
    createRangeControl(controlRoot, {
      id: "shader-hue",
      label: "色相",
      min: 0,
      max: 360,
      step: 1,
      value: settings.hue,
      onChange(value) {
        settings.hue = value;
        uniforms.uHue.value = value;
        renderOnce();
      },
    }),
  ];

  const resize = () => {
    if (disposed) return;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;

    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, profile.maxDpr),
    );
    renderer.setSize(bounds.width, bounds.height, false);
    renderer.getDrawingBufferSize(uniforms.uResolution.value);
    renderOnce();
  };

  const render = (time: number) => {
    frame = 0;
    if (disposed || paused || !profile.animated) return;
    if (previousFrame && time - previousFrame < frameInterval) {
      frame = requestAnimationFrame(render);
      return;
    }

    if (previousFrame) elapsed += (time - previousFrame) / 1000;
    previousFrame = time;
    uniforms.uTime.value = elapsed;
    renderer.render(scene, camera);
    frame = requestAnimationFrame(render);
  };

  const resume = () => {
    paused = false;
    if (!disposed && profile.animated && frame === 0) {
      previousFrame = 0;
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
    Object.assign(settings, defaultShaderSettings);
    uniforms.uTime.value = 0;
    uniforms.uSpeed.value = settings.speed;
    uniforms.uScale.value = settings.scale;
    uniforms.uHue.value = settings.hue;
    elapsed = 0;

    for (const [control, value] of rangeControls.map((control, index) => [
      control,
      [settings.speed, settings.scale, settings.hue][index],
    ] as const)) {
      control.input.value = String(value);
      control.input.setAttribute("aria-valuetext", control.input.value);
    }
    renderOnce();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    pause();
    for (const control of rangeControls) control.dispose();
    controlRoot.remove();
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };

  resize();
  if (profile.animated) {
    resume();
  } else {
    uniforms.uTime.value = 0;
    renderOnce();
  }

  return { pause, resume, resize, reset, dispose };
}
