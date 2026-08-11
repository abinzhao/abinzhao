import { getSceneProfile } from "./scene-lifecycle";

interface SceneController {
  dispose: () => void;
}

function seededRandom(seed = 0x5a4a42) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createPlanetTexture(three: typeof import("three")) {
  const surface = document.createElement("canvas");
  surface.width = 256;
  surface.height = 128;
  const context = surface.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable");

  const gradient = context.createLinearGradient(0, 0, surface.width, surface.height);
  gradient.addColorStop(0, "#ffd08a");
  gradient.addColorStop(0.45, "#ff7653");
  gradient.addColorStop(1, "#8d2630");
  context.fillStyle = gradient;
  context.fillRect(0, 0, surface.width, surface.height);

  const random = seededRandom();
  for (let index = 0; index < 42; index += 1) {
    context.beginPath();
    context.fillStyle = `rgba(91, 24, 43, ${0.08 + random() * 0.2})`;
    context.ellipse(
      random() * surface.width,
      random() * surface.height,
      3 + random() * 18,
      2 + random() * 7,
      random() * Math.PI,
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  const texture = new three.CanvasTexture(surface);
  texture.colorSpace = three.SRGBColorSpace;
  return texture;
}

function createBrandPoints(count: number, random: () => number) {
  const surface = document.createElement("canvas");
  surface.width = 480;
  surface.height = 180;
  const context = surface.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas 2D is unavailable");

  context.fillStyle = "#fff";
  context.font = "900 142px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("ZJB", surface.width / 2, surface.height / 2 + 4);
  const pixels = context.getImageData(0, 0, surface.width, surface.height).data;
  const candidates: Array<[number, number]> = [];

  for (let y = 4; y < surface.height; y += 4) {
    for (let x = 4; x < surface.width; x += 4) {
      if (pixels[(y * surface.width + x) * 4 + 3] > 128) {
        candidates.push([x, y]);
      }
    }
  }

  const points = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const [x, y] = candidates[Math.floor(random() * candidates.length)];
    points[index * 3] = (x / surface.width - 0.5) * 4.8;
    points[index * 3 + 1] = (0.5 - y / surface.height) * 1.8;
    points[index * 3 + 2] = (random() - 0.5) * 0.18;
  }
  return points;
}

function createParticlePositions(count: number) {
  const random = seededRandom();
  const initial = new Float32Array(count * 3);
  const brand = createBrandPoints(count, random);
  const orbit = new Float32Array(count * 3);

  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    initial[offset] = (random() - 0.5) * 10;
    initial[offset + 1] = (random() - 0.5) * 7;
    initial[offset + 2] = (random() - 0.5) * 4;

    const angle = random() * Math.PI * 2;
    const radius = 1.45 + random() * 2.35;
    orbit[offset] = Math.cos(angle) * radius;
    orbit[offset + 1] = Math.sin(angle) * radius * 0.34;
    orbit[offset + 2] = (random() - 0.5) * 1.15;
  }

  return { initial, brand, orbit };
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

export async function initHeroScene(
  hero: HTMLElement,
  canvas: HTMLCanvasElement,
): Promise<SceneController | undefined> {
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const profile = getSceneProfile({
    width: window.innerWidth,
    dpr: window.devicePixelRatio,
    reducedMotion,
  });

  if (!profile.animated) {
    canvas.remove();
    hero.dataset.sceneState = "static";
    return;
  }

  let renderer: import("three").WebGLRenderer | undefined;
  let disposed = false;

  try {
    const three = await import("three");
    if (!canvas.isConnected || disposed) return;

    const scene = new three.Scene();
    const camera = new three.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 6.1);

    renderer = new three.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: profile.fps > 30,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = three.SRGBColorSpace;

    const texture = createPlanetTexture(three);
    const planetGeometry = new three.SphereGeometry(1.05, 48, 32);
    const planetMaterial = new three.MeshStandardMaterial({
      map: texture,
      roughness: 0.72,
      metalness: 0.04,
    });
    const planet = new three.Mesh(planetGeometry, planetMaterial);
    planet.position.set(0.25, 0.02, 0);
    scene.add(planet);
    scene.add(new three.AmbientLight(0xffd6bb, 1.45));
    const keyLight = new three.DirectionalLight(0xffffff, 2.8);
    keyLight.position.set(-3, 4, 5);
    scene.add(keyLight);

    const positions = createParticlePositions(profile.particles);
    const particleGeometry = new three.BufferGeometry();
    const positionAttribute = new three.BufferAttribute(
      positions.initial.slice(),
      3,
    );
    particleGeometry.setAttribute("position", positionAttribute);
    const particleMaterial = new three.PointsMaterial({
      color: 0x8d82ff,
      size: profile.fps === 30 ? 0.045 : 0.035,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      blending: three.AdditiveBlending,
    });
    const particles = new three.Points(particleGeometry, particleMaterial);
    particles.rotation.x = -0.12;
    scene.add(particles);

    const visual =
      hero.querySelector<HTMLElement>(".hero__visual") ?? hero;
    const pointer = { x: 0, y: 0 };
    const targetPointer = { x: 0, y: 0 };
    let scrollProgress = 0;
    let inViewport = true;
    let pageVisible = !document.hidden;
    let frame = 0;
    let previousFrame = 0;
    const startTime = performance.now();
    const frameInterval = 1000 / profile.fps;

    const resize = () => {
      const { width, height } = visual.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      renderer?.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, profile.maxDpr),
      );
      renderer?.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const render = (time: number) => {
      frame = 0;
      if (disposed || !inViewport || !pageVisible) return;
      if (time - previousFrame < frameInterval) {
        frame = requestAnimationFrame(render);
        return;
      }
      previousFrame = time;

      const elapsed = (time - startTime) / 1000;
      const values = positionAttribute.array as Float32Array;
      const brandProgress = easeOutCubic(Math.min(elapsed / 1.2, 1));
      const orbitProgress = easeOutCubic(
        Math.min(Math.max((elapsed - 1.2) / 0.6, 0), 1),
      );

      for (let index = 0; index < values.length; index += 3) {
        const brandX =
          positions.initial[index] +
          (positions.brand[index] - positions.initial[index]) * brandProgress;
        const brandY =
          positions.initial[index + 1] +
          (positions.brand[index + 1] - positions.initial[index + 1]) *
            brandProgress;
        const brandZ =
          positions.initial[index + 2] +
          (positions.brand[index + 2] - positions.initial[index + 2]) *
            brandProgress;
        values[index] =
          brandX + (positions.orbit[index] - brandX) * orbitProgress;
        values[index + 1] =
          brandY +
          (positions.orbit[index + 1] - brandY) * orbitProgress +
          (orbitProgress === 1 ? Math.sin(elapsed + index) * 0.004 : 0);
        values[index + 2] =
          brandZ + (positions.orbit[index + 2] - brandZ) * orbitProgress;
      }
      positionAttribute.needsUpdate = true;

      pointer.x += (targetPointer.x - pointer.x) * 0.06;
      pointer.y += (targetPointer.y - pointer.y) * 0.06;
      particles.rotation.y = elapsed * 0.045 + pointer.x * 0.35;
      particles.rotation.x = -0.12 + pointer.y * 0.22;
      planet.rotation.y = elapsed * 0.08;
      planet.rotation.x = pointer.y * 0.08;
      camera.position.x = pointer.x * 0.35;
      camera.position.y = pointer.y * 0.25;
      camera.position.z = 6.1 - scrollProgress * 0.35;
      camera.lookAt(0, 0, 0);
      renderer?.render(scene, camera);
      frame = requestAnimationFrame(render);
    };

    const resume = () => {
      if (!disposed && inViewport && pageVisible && frame === 0) {
        previousFrame = performance.now() - frameInterval;
        frame = requestAnimationFrame(render);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      const bounds = visual.getBoundingClientRect();
      targetPointer.x = Math.max(
        -0.35,
        Math.min(0.35, ((event.clientX - bounds.left) / bounds.width - 0.5) * 0.7),
      );
      targetPointer.y = Math.max(
        -0.35,
        Math.min(0.35, (0.5 - (event.clientY - bounds.top) / bounds.height) * 0.7),
      );
    };
    const onPointerLeave = () => {
      targetPointer.x = 0;
      targetPointer.y = 0;
    };
    const onVisibilityChange = () => {
      pageVisible = !document.hidden;
      if (!pageVisible && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      resume();
    };
    const onScrollProgress = (event: Event) => {
      const value = (event as CustomEvent<number>).detail;
      scrollProgress = Math.max(0, Math.min(1, value));
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        inViewport = entry.isIntersecting;
        if (!inViewport && frame) {
          cancelAnimationFrame(frame);
          frame = 0;
        }
        resume();
      },
      { threshold: 0.01 },
    );
    observer.observe(hero);

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(visual);
    visual.addEventListener("pointermove", onPointerMove, { passive: true });
    visual.addEventListener("pointerleave", onPointerLeave);
    visual.addEventListener("pointercancel", onPointerLeave);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("hero:progress", onScrollProgress);

    const dispose = () => {
      if (disposed) return;
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      visual.removeEventListener("pointermove", onPointerMove);
      visual.removeEventListener("pointerleave", onPointerLeave);
      visual.removeEventListener("pointercancel", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("hero:progress", onScrollProgress);
      window.removeEventListener("pagehide", dispose);
      document.removeEventListener("astro:before-swap", dispose);
      particleGeometry.dispose();
      particleMaterial.dispose();
      planetGeometry.dispose();
      planetMaterial.dispose();
      texture.dispose();
      renderer?.dispose();
      renderer?.forceContextLoss();
    };

    window.addEventListener("pagehide", dispose, { once: true });
    document.addEventListener("astro:before-swap", dispose, { once: true });
    resize();
    resume();
    hero.dataset.sceneState = "ready";
    return { dispose };
  } catch (error) {
    renderer?.dispose();
    canvas.remove();
    hero.dataset.sceneState = "fallback";
    console.warn("Hero scene initialization failed; using static fallback.", error);
    return;
  }
}
