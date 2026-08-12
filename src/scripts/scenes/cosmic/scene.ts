import type { Theme } from "@/lib/theme";
import { getHomeSceneState } from "./home-timeline";
import { createEarthLayer } from "./layers/earth";
import { createFarStarLayer } from "./layers/far-stars";
import { createGalaxyLayer } from "./layers/galaxy";
import { createNebulaLayer } from "./layers/nebula";
import { createStreamerLayer } from "./layers/streamer";
import { createTransitStarLayer } from "./layers/transit-stars";
import { getCosmicQuality, getDowngradedDpr } from "./quality";
import {
  getCosmicPalette,
  lerpCosmicPalette,
  type CosmicPalette,
} from "./theme";
import { getEarthLayout } from "./variant-layout";
import type {
  CosmicLayer,
  CosmicSceneConfig,
  CosmicVariant,
} from "./types";

export interface CosmicSceneController {
  setProgress(progress: number): void;
  setTheme(theme: "dark" | "light"): void;
  pause(): void;
  resume(): void;
  dispose(): void;
}

interface CreateCosmicSceneOptions {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  config: CosmicSceneConfig;
}

interface ProgressDetail {
  variant: CosmicVariant;
  progress: number;
}

interface ThemeDetail {
  theme: Theme;
}

export async function createCosmicScene({
  root,
  canvas,
  config,
}: CreateCosmicSceneOptions): Promise<CosmicSceneController> {
  const { loadThreeRuntime } =
    await import("@/scripts/scenes/three-runtime");
  const three = await loadThreeRuntime();
  const quality = getCosmicQuality({
    width: window.innerWidth,
    dpr: window.devicePixelRatio || 1,
    reducedMotion: false,
    intensity: config.intensity,
  });
  const renderer = new three.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: quality.tier === "high",
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = three.SRGBColorSpace;
  renderer.toneMapping = three.ACESFilmicToneMapping;
  const initialTheme: Theme =
    document.documentElement.dataset.theme === "light" ? "light" : "dark";
  let currentPalette = getCosmicPalette(initialTheme);
  let paletteFrom = currentPalette;
  let paletteTarget = currentPalette;
  let paletteTransitionStarted = 0;
  renderer.toneMappingExposure = currentPalette.exposure;
  renderer.setClearColor(currentPalette.background, 1);

  const scene = new three.Scene();
  const camera = new three.PerspectiveCamera(48, 1, 0.1, 100);
  camera.position.set(0, 0.25, 8.6);
  const layers: CosmicLayer[] = [];
  const addLayer = <T extends CosmicLayer>(layer: T) => {
    layers.push(layer);
    scene.add(layer.object);
    return layer;
  };

  const streamer = config.layers.streamer
    ? addLayer(createStreamerLayer(three))
    : undefined;
  if (streamer) streamer.object.renderOrder = -10;
  if (config.layers.farStars) addLayer(createFarStarLayer(three));
  const nebula = config.layers.nebula
    ? addLayer(createNebulaLayer(three))
    : undefined;
  const galaxy = config.layers.galaxy
    ? addLayer(createGalaxyLayer(three, quality.galaxyParticles))
    : undefined;
  let transitStars = config.layers.transitStars
    ? addLayer(createTransitStarLayer(three, quality.transitParticles))
    : undefined;
  const earth = config.layers.earth
    ? addLayer(
        await createEarthLayer(
          three,
          root.dataset.assetsBase ?? "/assets/cosmic/",
        ),
      )
    : undefined;
  if (earth) {
    const earthLayout = getEarthLayout(config.variant);
    earth.object.position.set(...earthLayout.position);
    earth.object.scale.setScalar(earthLayout.scale);
  }

  scene.add(new three.AmbientLight(0x102038, 0.08));
  const sunlight = new three.DirectionalLight(0xffe2c0, 2.2);
  sunlight.position.set(-5, 3, 5);
  scene.add(sunlight);

  const pointer = new three.Vector2();
  const targetPointer = new three.Vector2();
  let progress = 0;
  let frame = 0;
  let disposed = false;
  let inViewport = true;
  let pageVisible = !document.hidden;
  let previousFrame = 0;
  const startedAt = performance.now();
  const frameInterval = 1000 / quality.fps;
  let currentMaxDpr = quality.maxDpr;
  let monitorWindowStarted = startedAt + 2000;
  let monitorFrames = 0;
  let consecutiveLowWindows = 0;
  let qualityDowngraded = false;
  root.dataset.qualityTier = quality.tier;

  const resize = () => {
    const width = Math.max(root.clientWidth, 1);
    const height = Math.max(root.clientHeight, 1);
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, currentMaxDpr),
    );
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  const downgradeQuality = () => {
    if (qualityDowngraded) return;
    qualityDowngraded = true;
    root.dataset.qualityDowngraded = "true";
    currentMaxDpr = getDowngradedDpr(currentMaxDpr);

    if (transitStars) {
      scene.remove(transitStars.object);
      const index = layers.indexOf(transitStars);
      if (index >= 0) layers.splice(index, 1);
      transitStars.dispose();
      transitStars = undefined;
    }
    resize();
  };

  const sampleFrameRate = (time: number) => {
    if (qualityDowngraded || time < monitorWindowStarted) return;
    monitorFrames += 1;
    const duration = time - monitorWindowStarted;
    if (duration < 1000) return;

    const measuredFps = (monitorFrames * 1000) / duration;
    consecutiveLowWindows =
      measuredFps < quality.fps * 0.8 ? consecutiveLowWindows + 1 : 0;
    monitorWindowStarted = time;
    monitorFrames = 0;
    if (consecutiveLowWindows >= 2) downgradeQuality();
  };

  const setProgress = (value: number) => {
    progress = Math.max(0, Math.min(1, value));
  };

  const applyPalette = (palette: CosmicPalette) => {
    currentPalette = palette;
    renderer.toneMappingExposure = palette.exposure;
    renderer.setClearColor(palette.background, 1);
    layers.forEach((layer) => layer.setPalette?.(palette));
  };

  const setTheme = (theme: Theme) => {
    paletteFrom = currentPalette;
    paletteTarget = getCosmicPalette(theme);
    paletteTransitionStarted = performance.now();
  };

  const applyHomeState = () => {
    const state = getHomeSceneState(progress);
    if (earth) {
      earth.object.position.x = state.earthX + pointer.x * 0.08;
      earth.object.position.y = state.earthY + pointer.y * 0.08;
    }
    if (galaxy) {
      galaxy.object.position.set(
        state.galaxyX,
        state.galaxyY,
        state.galaxyZ,
      );
      galaxy.object.scale.setScalar(state.galaxyScale);
      galaxy.object.rotation.z = -0.32 + pointer.x * 0.012 - state.zoom * 0.035;
    }
    if (nebula) {
      nebula.object.position.set(
        state.galaxyX,
        state.galaxyY,
        state.galaxyZ,
      );
      nebula.object.scale.setScalar(state.galaxyScale);
      nebula.object.rotation.z = -0.32 - state.zoom * 0.035;
    }
    if (transitStars) transitStars.object.position.z = state.zoom * 18;
    camera.fov = state.cameraFov;
    camera.position.set(
      pointer.x * 0.14,
      state.cameraY + pointer.y * 0.09,
      state.cameraZ,
    );
    camera.lookAt(-state.zoom * 0.32, 0.48 + state.zoom * 0.36, -state.zoom * 0.5);
    camera.updateProjectionMatrix();
  };

  const render = (time: number) => {
    frame = 0;
    if (disposed || !inViewport || !pageVisible) return;
    sampleFrameRate(time);
    if (time - previousFrame < frameInterval) {
      frame = requestAnimationFrame(render);
      return;
    }
    previousFrame = time;
    const elapsed = (time - startedAt) / 1000;
    const paletteProgress = Math.min(
      1,
      Math.max(0, (time - paletteTransitionStarted) / 250),
    );
    applyPalette(
      lerpCosmicPalette(paletteFrom, paletteTarget, paletteProgress),
    );
    if (paletteProgress === 1) paletteFrom = paletteTarget;
    pointer.lerp(targetPointer, 0.045);
    layers.forEach((layer) => layer.update(elapsed, progress));
    if (config.variant === "home") applyHomeState();
    renderer.render(scene, camera);
    frame = requestAnimationFrame(render);
  };

  const resume = () => {
    if (!disposed && inViewport && pageVisible && frame === 0) {
      previousFrame = performance.now() - frameInterval;
      frame = requestAnimationFrame(render);
    }
  };

  const pause = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };

  const onPointerMove = (event: PointerEvent) => {
    targetPointer.set(
      (event.clientX / window.innerWidth - 0.5) * 0.7,
      (0.5 - event.clientY / window.innerHeight) * 0.7,
    );
  };
  const onPointerLeave = () => targetPointer.set(0, 0);
  const onProgress = (event: Event) => {
    const detail = (event as CustomEvent<ProgressDetail>).detail;
    if (detail?.variant === config.variant) setProgress(detail.progress);
  };
  const onThemeChange = (event: Event) => {
    const detail = (event as CustomEvent<ThemeDetail>).detail;
    if (detail?.theme) setTheme(detail.theme);
  };
  const onVisibilityChange = () => {
    pageVisible = !document.hidden;
    if (pageVisible) resume();
    else pause();
  };
  const observer = new IntersectionObserver(([entry]) => {
    inViewport = entry?.isIntersecting ?? false;
    if (inViewport) resume();
    else pause();
  });
  const resizeObserver = new ResizeObserver(resize);
  observer.observe(root);
  resizeObserver.observe(root);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onPointerLeave);
  window.addEventListener("cosmic:progress", onProgress);
  document.addEventListener("zjb:themechange", onThemeChange);
  document.addEventListener("visibilitychange", onVisibilityChange);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    pause();
    observer.disconnect();
    resizeObserver.disconnect();
    window.removeEventListener("pointermove", onPointerMove);
    document.documentElement.removeEventListener("pointerleave", onPointerLeave);
    window.removeEventListener("cosmic:progress", onProgress);
    document.removeEventListener("zjb:themechange", onThemeChange);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    layers.forEach((layer) => layer.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
  };

  resize();
  applyPalette(currentPalette);
  applyHomeState();
  resume();

  return {
    setProgress,
    setTheme,
    pause,
    resume,
    dispose,
  };
}
