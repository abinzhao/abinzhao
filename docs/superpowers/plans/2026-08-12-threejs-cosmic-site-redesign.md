# ZJB.DEV Three.js Cosmic Site Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared Three.js digital-universe scene system, replace the homepage with the approved orbit-to-galaxy journey, and apply accessible deep-space/daylight variants across the existing Astro site.

**Architecture:** `BaseLayout` mounts one `CosmicScene` shell for normal pages. A typed variant configuration controls camera, layers, palette, intensity, and interaction; focused layer modules own stars, nebulae, galaxy particles, transit stars, and the Earth. Experiment details request the static global fallback so their existing experiment Canvas remains the only active WebGL context.

**Tech Stack:** Astro 7, TypeScript strict, Three.js 0.185, GLSL, GSAP 3, CSS custom properties, Vitest, Playwright

---

## File Map

### Create

```text
public/assets/cosmic/
├── earth_atmos_2048.jpg
├── earth_clouds_1024.png
├── earth_lights_2048.png
├── earth_normal_2048.jpg
├── earth_specular_2048.jpg
└── SOURCES.md

src/components/global/CosmicScene.astro

src/scripts/scenes/cosmic/
├── config.ts
├── galaxy-data.ts
├── home-timeline.ts
├── quality.ts
├── runtime.ts
├── scene.ts
├── theme.ts
├── types.ts
├── layers/
│   ├── earth.ts
│   ├── far-stars.ts
│   ├── galaxy.ts
│   ├── nebula.ts
│   ├── streamer.ts
│   └── transit-stars.ts
└── shaders/
    ├── atmosphere.frag.glsl
    ├── earth.frag.glsl
    ├── nebula.frag.glsl
    ├── points.frag.glsl
    ├── points.vert.glsl
    └── streamer.frag.glsl

src/styles/cosmic.css

tests/unit/cosmic-config.test.ts
tests/unit/cosmic-galaxy-data.test.ts
tests/unit/cosmic-home-timeline.test.ts
tests/unit/cosmic-quality.test.ts
tests/unit/cosmic-theme.test.ts
tests/e2e/cosmic-scene.spec.ts
```

### Modify

```text
src/components/home/Hero.astro
src/components/projects/ProjectCard.astro
src/components/blog/BlogCard.astro
src/components/playground/ExperimentCard.astro
src/layouts/BaseLayout.astro
src/layouts/ExperimentLayout.astro
src/pages/index.astro
src/pages/about.astro
src/pages/projects/index.astro
src/pages/projects/[slug].astro
src/pages/blog/index.astro
src/pages/blog/[slug].astro
src/pages/blog/archive.astro
src/pages/tags/index.astro
src/pages/tags/[tag].astro
src/pages/playground/index.astro
src/pages/404.astro
src/scripts/scenes/scene-lifecycle.ts
src/scripts/theme.ts
src/scripts/transitions.ts
src/styles/tokens.css
src/styles/base.css
src/styles/components.css
src/styles/home.css
src/styles/projects.css
src/styles/blog.css
src/styles/playground.css
tests/unit/scene-lifecycle.test.ts
tests/unit/theme.test.ts
tests/e2e/home.spec.ts
tests/e2e/smoke.spec.ts
tests/e2e/projects.spec.ts
tests/e2e/blog.spec.ts
tests/e2e/playground.spec.ts
tests/e2e/about-seo.spec.ts
```

### Remove After Replacement

```text
src/scripts/scenes/hero.ts
```

Delete it only after the global cosmic scene passes the homepage tests and no import remains.

---

### Task 1: Define Scene Contracts and Quality Profiles

**Files:**
- Create: `src/scripts/scenes/cosmic/types.ts`
- Create: `src/scripts/scenes/cosmic/config.ts`
- Create: `src/scripts/scenes/cosmic/quality.ts`
- Modify: `src/scripts/scenes/scene-lifecycle.ts`
- Test: `tests/unit/cosmic-config.test.ts`
- Test: `tests/unit/cosmic-quality.test.ts`
- Test: `tests/unit/scene-lifecycle.test.ts`

- [ ] **Step 1: Write failing variant configuration tests**

```ts
import { describe, expect, it } from "vitest";
import { getCosmicSceneConfig } from "@/scripts/scenes/cosmic/config";

describe("cosmic scene variants", () => {
  it("uses cinematic layers only on home", () => {
    expect(getCosmicSceneConfig("home")).toMatchObject({
      intensity: "high",
      interaction: "scroll-cinematic",
      layers: {
        earth: true,
        galaxy: true,
        nebula: true,
        transitStars: true,
      },
    });
  });

  it("keeps article motion quiet", () => {
    expect(getCosmicSceneConfig("article")).toMatchObject({
      intensity: "low",
      interaction: "none",
      layers: {
        earth: false,
        transitStars: false,
      },
    });
  });

  it("disables the global renderer on experiment details", () => {
    expect(getCosmicSceneConfig("experiment").renderMode).toBe("static");
  });
});
```

- [ ] **Step 2: Write failing quality profile tests**

```ts
import { describe, expect, it } from "vitest";
import { getCosmicQuality } from "@/scripts/scenes/cosmic/quality";

describe("cosmic scene quality", () => {
  it.each([
    [1440, 2, "high", 1.6, 60, 112_000, 7_000],
    [900, 2, "medium", 1.35, 45, 65_000, 3_500],
    [390, 3, "mobile", 1.2, 30, 42_000, 2_000],
  ] as const)(
    "selects %s px profile",
    (width, dpr, tier, maxDpr, fps, galaxyParticles, transitParticles) => {
      expect(getCosmicQuality({ width, dpr, reducedMotion: false })).toEqual({
        tier,
        animated: true,
        maxDpr,
        fps,
        galaxyParticles,
        transitParticles,
      });
    },
  );

  it("returns a static profile for reduced motion", () => {
    expect(
      getCosmicQuality({ width: 1440, dpr: 2, reducedMotion: true }),
    ).toMatchObject({
      tier: "static",
      animated: false,
      galaxyParticles: 0,
      transitParticles: 0,
    });
  });
});
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
pnpm test -- tests/unit/cosmic-config.test.ts tests/unit/cosmic-quality.test.ts
```

Expected: FAIL because `cosmic/config` and `cosmic/quality` do not exist.

- [ ] **Step 4: Implement the typed contracts**

```ts
// src/scripts/scenes/cosmic/types.ts
export type CosmicVariant =
  | "home"
  | "projects"
  | "project"
  | "blog"
  | "article"
  | "about"
  | "playground"
  | "experiment"
  | "not-found";

export type CosmicIntensity = "low" | "medium" | "high";
export type CosmicInteraction =
  | "none"
  | "parallax"
  | "scroll-cinematic";

export interface LayerVisibility {
  streamer: boolean;
  farStars: boolean;
  galaxy: boolean;
  nebula: boolean;
  earth: boolean;
  transitStars: boolean;
}

export interface CosmicSceneConfig {
  variant: CosmicVariant;
  renderMode: "webgl" | "static";
  intensity: CosmicIntensity;
  interaction: CosmicInteraction;
  layers: LayerVisibility;
}
```

```ts
// src/scripts/scenes/cosmic/config.ts
import type {
  CosmicSceneConfig,
  CosmicVariant,
  LayerVisibility,
} from "./types";

const baseLayers: LayerVisibility = {
  streamer: true,
  farStars: true,
  galaxy: true,
  nebula: true,
  earth: false,
  transitStars: false,
};

const configs: Record<CosmicVariant, CosmicSceneConfig> = {
  home: {
    variant: "home",
    renderMode: "webgl",
    intensity: "high",
    interaction: "scroll-cinematic",
    layers: { ...baseLayers, earth: true, transitStars: true },
  },
  projects: {
    variant: "projects",
    renderMode: "webgl",
    intensity: "medium",
    interaction: "parallax",
    layers: baseLayers,
  },
  project: {
    variant: "project",
    renderMode: "webgl",
    intensity: "low",
    interaction: "none",
    layers: baseLayers,
  },
  blog: {
    variant: "blog",
    renderMode: "webgl",
    intensity: "low",
    interaction: "none",
    layers: baseLayers,
  },
  article: {
    variant: "article",
    renderMode: "webgl",
    intensity: "low",
    interaction: "none",
    layers: { ...baseLayers, earth: false, transitStars: false },
  },
  about: {
    variant: "about",
    renderMode: "webgl",
    intensity: "medium",
    interaction: "parallax",
    layers: { ...baseLayers, earth: true },
  },
  playground: {
    variant: "playground",
    renderMode: "webgl",
    intensity: "high",
    interaction: "parallax",
    layers: { ...baseLayers, transitStars: true },
  },
  experiment: {
    variant: "experiment",
    renderMode: "static",
    intensity: "low",
    interaction: "none",
    layers: {
      streamer: false,
      farStars: false,
      galaxy: false,
      nebula: false,
      earth: false,
      transitStars: false,
    },
  },
  "not-found": {
    variant: "not-found",
    renderMode: "webgl",
    intensity: "low",
    interaction: "parallax",
    layers: { ...baseLayers, earth: false, transitStars: false },
  },
};

export function getCosmicSceneConfig(
  variant: CosmicVariant,
): CosmicSceneConfig {
  return configs[variant];
}
```

```ts
// src/scripts/scenes/cosmic/quality.ts
export interface CosmicQualityInput {
  width: number;
  dpr: number;
  reducedMotion: boolean;
}

export interface CosmicQuality {
  tier: "high" | "medium" | "mobile" | "static";
  animated: boolean;
  maxDpr: number;
  fps: number;
  galaxyParticles: number;
  transitParticles: number;
}

export function getCosmicQuality(input: CosmicQualityInput): CosmicQuality {
  if (input.reducedMotion) {
    return {
      tier: "static",
      animated: false,
      maxDpr: 1,
      fps: 0,
      galaxyParticles: 0,
      transitParticles: 0,
    };
  }
  if (input.width < 768) {
    return {
      tier: "mobile",
      animated: true,
      maxDpr: 1.2,
      fps: 30,
      galaxyParticles: 42_000,
      transitParticles: 2_000,
    };
  }
  if (input.width < 1024) {
    return {
      tier: "medium",
      animated: true,
      maxDpr: 1.35,
      fps: 45,
      galaxyParticles: 65_000,
      transitParticles: 3_500,
    };
  }
  return {
    tier: "high",
    animated: true,
    maxDpr: 1.6,
    fps: 60,
    galaxyParticles: 112_000,
    transitParticles: 7_000,
  };
}
```

- [ ] **Step 5: Make the legacy profile delegate to the new profile**

Keep `getSceneProfile()` exported until existing experiment tests are migrated:

```ts
import { getCosmicQuality } from "./cosmic/quality";

export function getSceneProfile(input: SceneProfileInput): SceneProfile {
  const quality = getCosmicQuality(input);
  return {
    animated: quality.animated,
    particles:
      quality.tier === "high"
        ? 2200
        : quality.tier === "medium"
          ? 1400
          : quality.tier === "mobile"
            ? 800
            : 0,
    maxDpr: quality.maxDpr,
    fps: quality.fps || 30,
  };
}
```

- [ ] **Step 6: Run unit tests and verify GREEN**

Run:

```bash
pnpm test -- tests/unit/cosmic-config.test.ts tests/unit/cosmic-quality.test.ts tests/unit/scene-lifecycle.test.ts
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/scripts/scenes/cosmic/types.ts src/scripts/scenes/cosmic/config.ts src/scripts/scenes/cosmic/quality.ts src/scripts/scenes/scene-lifecycle.ts tests/unit/cosmic-config.test.ts tests/unit/cosmic-quality.test.ts tests/unit/scene-lifecycle.test.ts
git commit -m "feat: define cosmic scene contracts"
```

---

### Task 2: Mount the Shared Scene Shell and Lifecycle

**Files:**
- Create: `src/components/global/CosmicScene.astro`
- Create: `src/scripts/scenes/cosmic/runtime.ts`
- Create: `src/styles/cosmic.css`
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/layouts/ExperimentLayout.astro`
- Test: `tests/e2e/cosmic-scene.spec.ts`

- [ ] **Step 1: Write failing shell tests**

```ts
import { expect, test } from "@playwright/test";

test("normal pages expose one global cosmic canvas", async ({ page }) => {
  await page.goto("/abinzhao/projects/");
  await expect(page.locator("[data-cosmic-scene]")).toHaveAttribute(
    "data-cosmic-variant",
    "projects",
  );
  await expect(page.locator("[data-cosmic-canvas]")).toHaveCount(1);
});

test("experiment details keep only the experiment canvas", async ({ page }) => {
  await page.goto("/abinzhao/playground/particle-galaxy/");
  await expect(page.locator("[data-cosmic-scene]")).toHaveAttribute(
    "data-render-mode",
    "static",
  );
  await expect(page.locator("[data-cosmic-canvas]")).toHaveCount(0);
  await expect(page.locator("[data-experiment-canvas]")).toHaveCount(1);
});
```

- [ ] **Step 2: Run E2E and verify RED**

Run:

```bash
pnpm test:e2e -- tests/e2e/cosmic-scene.spec.ts
```

Expected: FAIL because the shell is absent.

- [ ] **Step 3: Implement the scene component**

```astro
---
import { withBase } from "@/lib/site";
import { getCosmicSceneConfig } from "@/scripts/scenes/cosmic/config";
import type { CosmicVariant } from "@/scripts/scenes/cosmic/types";

interface Props {
  variant: CosmicVariant;
}

const { variant } = Astro.props;
const config = getCosmicSceneConfig(variant);
---

<div
  class="cosmic-scene"
  data-cosmic-scene
  data-cosmic-variant={variant}
  data-render-mode={config.renderMode}
  data-transit-stars={String(config.layers.transitStars)}
  data-scene-state="static"
  data-assets-base={withBase("/assets/cosmic/")}
  aria-hidden="true"
>
  <div class="cosmic-scene__fallback"></div>
  {config.renderMode === "webgl" && <canvas data-cosmic-canvas></canvas>}
</div>

{
  config.renderMode === "webgl" && (
    <script>
      const root = document.querySelector<HTMLElement>("[data-cosmic-scene]");
      if (root) {
        void import("@/scripts/scenes/cosmic/runtime").then(({ mountCosmicScene }) =>
          mountCosmicScene(root),
        );
      }
    </script>
  )
}
```

- [ ] **Step 4: Add `cosmicVariant` to `BaseLayout`**

```astro
---
import CosmicScene from "@/components/global/CosmicScene.astro";
import type { CosmicVariant } from "@/scripts/scenes/cosmic/types";
import "@/styles/cosmic.css";

interface Props {
  title?: string;
  description?: string;
  canonicalPath?: string;
  image?: string;
  jsonLd?: Record<string, unknown>;
  cosmicVariant?: CosmicVariant;
}

const { cosmicVariant = "article" } = Astro.props;
---

<body data-cosmic-page={cosmicVariant}>
  <CosmicScene variant={cosmicVariant} />
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <SiteHeader />
  <main id="main-content"><slot /></main>
  <Footer />
  <BackToTop />
  <slot name="scripts" />
</body>
```

Set `cosmicVariant="experiment"` inside `ExperimentLayout`.

- [ ] **Step 5: Implement lifecycle guards before Three.js construction**

```ts
// src/scripts/scenes/cosmic/runtime.ts
import { getCosmicSceneConfig } from "./config";
import { createCosmicScene } from "./scene";
import type { CosmicVariant } from "./types";

export async function mountCosmicScene(root: HTMLElement): Promise<void> {
  const canvas = root.querySelector<HTMLCanvasElement>("[data-cosmic-canvas]");
  const variant = root.dataset.cosmicVariant as CosmicVariant;
  const reducedMotion = matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (!canvas || reducedMotion) {
    canvas?.remove();
    root.dataset.sceneState = "static";
    return;
  }

  let disposed = false;
  let controller: Awaited<ReturnType<typeof createCosmicScene>> | undefined;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    controller?.dispose();
  };
  window.addEventListener("pagehide", dispose, { once: true });
  document.addEventListener("astro:before-swap", dispose, { once: true });

  try {
    controller = await createCosmicScene({
      root,
      canvas,
      config: getCosmicSceneConfig(variant),
    });
    if (disposed || !root.isConnected) {
      controller.dispose();
      return;
    }
    root.dataset.sceneState = "ready";
  } catch (error) {
    canvas.remove();
    root.dataset.sceneState = "fallback";
    console.warn("Cosmic scene initialization failed; using fallback.", error);
  }
}
```

- [ ] **Step 6: Add structural CSS**

```css
.cosmic-scene {
  position: fixed;
  z-index: -2;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.cosmic-scene canvas,
.cosmic-scene__fallback {
  position: absolute;
  width: 100%;
  height: 100%;
  inset: 0;
}

.cosmic-scene__fallback {
  background:
    radial-gradient(circle at 64% 32%, var(--cosmic-nebula), transparent 36%),
    radial-gradient(circle at 50% 110%, var(--cosmic-horizon), transparent 42%),
    var(--color-bg);
}

[data-scene-state="ready"] .cosmic-scene__fallback {
  opacity: 0;
}
```

- [ ] **Step 7: Run shell and existing no-JS tests**

Run:

```bash
pnpm test:e2e -- tests/e2e/cosmic-scene.spec.ts tests/e2e/smoke.spec.ts
```

Expected: new shell tests PASS; existing content and no-JS checks remain PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/global/CosmicScene.astro src/scripts/scenes/cosmic/runtime.ts src/styles/cosmic.css src/layouts/BaseLayout.astro src/layouts/ExperimentLayout.astro tests/e2e/cosmic-scene.spec.ts
git commit -m "feat: mount shared cosmic scene shell"
```

---

### Task 3: Build Deterministic Galaxy, Nebula, and Star Layers

**Files:**
- Create: `src/scripts/scenes/cosmic/galaxy-data.ts`
- Create: `src/scripts/scenes/cosmic/layers/far-stars.ts`
- Create: `src/scripts/scenes/cosmic/layers/galaxy.ts`
- Create: `src/scripts/scenes/cosmic/layers/nebula.ts`
- Create: `src/scripts/scenes/cosmic/layers/streamer.ts`
- Create: `src/scripts/scenes/cosmic/layers/transit-stars.ts`
- Create: `src/scripts/scenes/cosmic/shaders/points.vert.glsl`
- Create: `src/scripts/scenes/cosmic/shaders/points.frag.glsl`
- Create: `src/scripts/scenes/cosmic/shaders/nebula.frag.glsl`
- Create: `src/scripts/scenes/cosmic/shaders/streamer.frag.glsl`
- Test: `tests/unit/cosmic-galaxy-data.test.ts`

- [ ] **Step 1: Write failing deterministic data tests**

```ts
import { describe, expect, it } from "vitest";
import {
  createGalaxyPointData,
  createTransitPointData,
} from "@/scripts/scenes/cosmic/galaxy-data";

describe("cosmic particle data", () => {
  it("is deterministic and finite", () => {
    const first = createGalaxyPointData(100, 42);
    const second = createGalaxyPointData(100, 42);
    expect(Array.from(first.positions)).toEqual(Array.from(second.positions));
    expect(Array.from(first.positions).every(Number.isFinite)).toBe(true);
    expect(first.positions).toHaveLength(300);
    expect(first.colors).toHaveLength(300);
    expect(first.scales).toHaveLength(100);
  });

  it("keeps transit stars in front-to-back depth", () => {
    const data = createTransitPointData(100, 7);
    const z = Array.from(data.positions).filter((_, index) => index % 3 === 2);
    expect(Math.max(...z)).toBeLessThanOrEqual(-8);
    expect(Math.min(...z)).toBeGreaterThanOrEqual(-31);
  });
});
```

- [ ] **Step 2: Run unit test and verify RED**

Run:

```bash
pnpm test -- tests/unit/cosmic-galaxy-data.test.ts
```

Expected: FAIL because `galaxy-data.ts` does not exist.

- [ ] **Step 3: Implement deterministic point generation**

Use the existing `src/scripts/scenes/seeded-random.ts` helper:

```ts
import { createSeededRandom } from "../seeded-random";

export interface PointData {
  positions: Float32Array;
  colors: Float32Array;
  scales: Float32Array;
}

export function createGalaxyPointData(
  count: number,
  seed = 0x5a4a42,
): PointData {
  const random = createSeededRandom(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const scales = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    const central = index < count * 0.23;
    const x = central
      ? (random() + random() + random() - 1.5) * 2.5
      : (random() - 0.5) * 14.4;
    const z = (random() - 0.5) * (central ? 1.45 : 2.5);
    const strand = ((index % 5) - 2) * (0.05 + Math.abs(x) * 0.007);
    const spread = 0.15 + Math.abs(x) * 0.034;
    const warp =
      Math.sin(x * 0.54 + z * 1.7) * (0.12 + Math.abs(x) * 0.012) +
      Math.sin(x * 1.31 - z * 0.7) * 0.055;
    const y =
      (random() + random() + random() + random() - 2) * spread +
      warp +
      strand;
    const core = Math.max(0, 1 - Math.abs(x) / 4.7);

    positions.set([x, y, z], offset);
    colors.set(
      [
        0.42 + core * 0.36,
        0.64 + core * 0.18,
        0.72 - core * 0.18,
      ],
      offset,
    );
    scales[index] = 0.16 + random() * (central ? 0.55 : 0.38);
  }
  return { positions, colors, scales };
}

export function createTransitPointData(
  count: number,
  seed = 0x314159,
): PointData {
  const random = createSeededRandom(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    positions.set(
      [
        (random() - 0.5) * 18,
        (random() - 0.5) * 10,
        -8 - random() * 23,
      ],
      offset,
    );
    colors.set([0.48, 0.82, 0.95], offset);
    scales[index] = 0.22 + random() * 0.75;
  }
  return { positions, colors, scales };
}
```

- [ ] **Step 4: Implement the point shaders**

```glsl
// points.vert.glsl
uniform float uPointSize;
uniform float uTime;
uniform float uTravel;
attribute float scale;
varying vec3 vColor;
varying float vPulse;
varying float vTravel;

void main() {
  vColor = color;
  vTravel = uTravel;
  float phase = position.x * 2.17 + position.z * 3.11;
  float twinkle = 0.82 + 0.18 * sin(uTime * 0.8 + phase);
  vPulse = twinkle;
  vec3 animated = position;
  animated.y += sin(uTime * 0.1 + length(position.xz)) * 0.005;
  vec4 viewPosition = modelViewMatrix * vec4(animated, 1.0);
  gl_PointSize = max(
    1.0,
    scale * uPointSize * twinkle * (48.0 / max(1.0, -viewPosition.z))
  );
  gl_Position = projectionMatrix * viewPosition;
}
```

```glsl
// points.frag.glsl
uniform float uOpacity;
varying vec3 vColor;
varying float vPulse;
varying float vTravel;

void main() {
  vec2 point = gl_PointCoord - 0.5;
  float distanceToCenter = length(point);
  float core = smoothstep(0.46, 0.055, distanceToCenter);
  float halo = smoothstep(0.5, 0.16, distanceToCenter) * 0.18;
  float flare =
    (
      smoothstep(0.055, 0.0, abs(point.x)) *
      smoothstep(0.46, 0.08, abs(point.y))
    ) * vTravel * 0.24;
  float alpha = (core * core + halo + flare) * vPulse * uOpacity;
  gl_FragColor = vec4(vColor, alpha);
}
```

- [ ] **Step 5: Implement three nebula planes and the Streamer layer**

The nebula factory must return one group and one `update(time, travel)` function. Create three cloned `ShaderMaterial` instances with `uLayer` values `0`, `1`, and `2`; vary `z`, rotation, and scale. Keep `depthWrite: false`, `depthTest: false`, and normal blending. The Streamer layer renders behind the stars and receives pointer, time, travel, and theme uniforms.

Use this public interface in both files:

```ts
export interface CosmicLayer {
  object: import("three").Object3D;
  update(time: number, progress: number): void;
  dispose(): void;
}
```

- [ ] **Step 6: Compose galaxy, far-star, and transit-star layers**

Each layer must:

```ts
const geometry = new three.BufferGeometry();
geometry.setAttribute(
  "position",
  new three.BufferAttribute(data.positions, 3),
);
geometry.setAttribute("color", new three.BufferAttribute(data.colors, 3));
geometry.setAttribute("scale", new three.BufferAttribute(data.scales, 1));
```

Use additive blending for points, set `vertexColors: true`, and dispose geometry plus material.

- [ ] **Step 7: Run unit tests and typecheck**

Run:

```bash
pnpm test -- tests/unit/cosmic-galaxy-data.test.ts
pnpm exec astro check
```

Expected: PASS with no TypeScript or Astro errors.

- [ ] **Step 8: Commit**

```bash
git add src/scripts/scenes/cosmic/galaxy-data.ts src/scripts/scenes/cosmic/layers src/scripts/scenes/cosmic/shaders tests/unit/cosmic-galaxy-data.test.ts
git commit -m "feat: add layered cosmic particle field"
```

---

### Task 4: Localize Earth Textures and Build the Planet Layer

**Files:**
- Create: `public/assets/cosmic/earth_atmos_2048.jpg`
- Create: `public/assets/cosmic/earth_clouds_1024.png`
- Create: `public/assets/cosmic/earth_lights_2048.png`
- Create: `public/assets/cosmic/earth_normal_2048.jpg`
- Create: `public/assets/cosmic/earth_specular_2048.jpg`
- Create: `public/assets/cosmic/SOURCES.md`
- Create: `src/scripts/scenes/cosmic/layers/earth.ts`
- Create: `src/scripts/scenes/cosmic/shaders/earth.frag.glsl`
- Create: `src/scripts/scenes/cosmic/shaders/atmosphere.frag.glsl`
- Modify: `tests/e2e/cosmic-scene.spec.ts`

- [ ] **Step 1: Add failing local asset tests**

```ts
test("cosmic textures resolve below the GitHub Pages base", async ({
  request,
}) => {
  for (const asset of [
    "earth_atmos_2048.jpg",
    "earth_clouds_1024.png",
    "earth_lights_2048.png",
    "earth_normal_2048.jpg",
    "earth_specular_2048.jpg",
  ]) {
    const response = await request.get(`/abinzhao/assets/cosmic/${asset}`);
    expect(response.ok(), asset).toBe(true);
  }
});
```

- [ ] **Step 2: Run the asset test and verify RED**

Run:

```bash
pnpm test:e2e -- tests/e2e/cosmic-scene.spec.ts -g "cosmic textures"
```

Expected: FAIL with `404` responses.

- [ ] **Step 3: Download pinned local copies**

Run:

```bash
curl -L "https://raw.githubusercontent.com/mrdoob/three.js/r185/examples/textures/planets/earth_atmos_2048.jpg" -o public/assets/cosmic/earth_atmos_2048.jpg
curl -L "https://raw.githubusercontent.com/mrdoob/three.js/r185/examples/textures/planets/earth_clouds_1024.png" -o public/assets/cosmic/earth_clouds_1024.png
curl -L "https://raw.githubusercontent.com/mrdoob/three.js/r185/examples/textures/planets/earth_lights_2048.png" -o public/assets/cosmic/earth_lights_2048.png
curl -L "https://raw.githubusercontent.com/mrdoob/three.js/r185/examples/textures/planets/earth_normal_2048.jpg" -o public/assets/cosmic/earth_normal_2048.jpg
curl -L "https://raw.githubusercontent.com/mrdoob/three.js/r185/examples/textures/planets/earth_specular_2048.jpg" -o public/assets/cosmic/earth_specular_2048.jpg
```

Record the pinned URLs, Three.js revision, MIT repository license, downloaded filenames, and download date in `SOURCES.md`. If an asset has a separate attribution notice upstream, include it verbatim before continuing.

- [ ] **Step 4: Implement night-side Earth shading**

```glsl
// earth.frag.glsl
uniform sampler2D uDayMap;
uniform sampler2D uLightsMap;
uniform vec3 uSunDirection;
varying vec2 vUv;
varying vec3 vWorldNormal;

void main() {
  vec3 normal = normalize(vWorldNormal);
  float light = smoothstep(-0.18, 0.32, dot(normal, uSunDirection));
  vec3 day = texture2D(uDayMap, vUv).rgb * (0.07 + light * 0.48);
  vec3 city = texture2D(uLightsMap, vUv).rgb;
  float luminance = max(city.r, max(city.g, city.b));
  float cityMask = smoothstep(0.18, 0.62, luminance);
  float night = 1.0 - smoothstep(-0.12, 0.2, dot(normal, uSunDirection));
  vec3 glow = vec3(1.8, 0.68, 0.18) * cityMask * night * 2.7;
  gl_FragColor = vec4(day + glow, 1.0);
}
```

The Earth layer loads from the `data-assets-base` value, uses a large sphere positioned below the viewport, creates a separate cloud sphere, and creates a thin backside atmosphere sphere. It returns `ready`, `update`, and `dispose` through the common layer interface.

- [ ] **Step 5: Verify local assets and network isolation**

Run:

```bash
pnpm test:e2e -- tests/e2e/cosmic-scene.spec.ts -g "cosmic textures"
pnpm build
rg -n "threejs\\.org|raw\\.githubusercontent\\.com|unpkg\\.com" dist
```

Expected: asset test PASS; build PASS; final `rg` returns no runtime CDN references.

- [ ] **Step 6: Commit**

```bash
git add public/assets/cosmic src/scripts/scenes/cosmic/layers/earth.ts src/scripts/scenes/cosmic/shaders/earth.frag.glsl src/scripts/scenes/cosmic/shaders/atmosphere.frag.glsl tests/e2e/cosmic-scene.spec.ts
git commit -m "feat: add local night-side Earth layer"
```

---

### Task 5: Compose the Scene Runtime and Homepage Journey

**Files:**
- Create: `src/scripts/scenes/cosmic/scene.ts`
- Create: `src/scripts/scenes/cosmic/home-timeline.ts`
- Test: `tests/unit/cosmic-home-timeline.test.ts`
- Modify: `src/components/home/Hero.astro`
- Modify: `src/pages/index.astro`
- Modify: `src/scripts/transitions.ts`
- Modify: `src/styles/home.css`
- Modify: `tests/e2e/home.spec.ts`
- Remove: `src/scripts/scenes/hero.ts`

- [ ] **Step 1: Write failing timeline tests**

```ts
import { describe, expect, it } from "vitest";
import { getHomeSceneState } from "@/scripts/scenes/cosmic/home-timeline";

describe("home cosmic timeline", () => {
  it("matches the orbit keyframe", () => {
    expect(getHomeSceneState(0)).toMatchObject({
      earthY: -7.25,
      galaxyZ: -5.9,
      cameraFov: 48,
      heroOpacity: 1,
      cardsOpacity: 0,
    });
  });

  it("matches the galactic-core keyframe", () => {
    expect(getHomeSceneState(1)).toMatchObject({
      earthY: -12.45,
      galaxyZ: -2.35,
      cameraFov: 41,
      heroOpacity: 0,
      cardsOpacity: 1,
    });
  });

  it("clamps out-of-range progress", () => {
    expect(getHomeSceneState(-1)).toEqual(getHomeSceneState(0));
    expect(getHomeSceneState(2)).toEqual(getHomeSceneState(1));
  });
});
```

- [ ] **Step 2: Run timeline test and verify RED**

Run:

```bash
pnpm test -- tests/unit/cosmic-home-timeline.test.ts
```

Expected: FAIL because the timeline module does not exist.

- [ ] **Step 3: Implement the pure timeline**

```ts
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smoothstep = (value: number) => value * value * (3 - 2 * value);

export function getHomeSceneState(progress: number) {
  const raw = clamp01(progress);
  const eased = smoothstep(raw);
  const zoom = smoothstep(eased);
  return {
    progress: raw,
    eased,
    zoom,
    earthX: 1.35 - eased * 0.45,
    earthY: -7.25 - eased * 5.2,
    galaxyX: 0.4 - zoom * 0.9,
    galaxyY: 2.6 - zoom * 1.42,
    galaxyZ: -5.9 + zoom * 3.55,
    galaxyScale: 1.06 + zoom * 0.5,
    cameraY: 0.25 + zoom * 0.78,
    cameraZ: 8.6 - zoom * 1.15,
    cameraFov: 48 - zoom * 7,
    heroOpacity: 1 - Math.min(1, eased * 1.8),
    galaxyCopyOpacity: Math.max(0, (eased - 0.4) / 0.6),
    cardsOpacity: Math.max(0, (eased - 0.65) / 0.35),
  };
}
```

- [ ] **Step 4: Compose active layers in `scene.ts`**

`createCosmicScene()` must:

1. Dynamically import Three.js.
2. Read quality from `getCosmicQuality()`.
3. Create only layers enabled by the variant.
4. Resize with a `ResizeObserver`.
5. Pause when the document is hidden or Canvas is outside the viewport.
6. Apply homepage timeline state only for `scroll-cinematic`.
7. Dispose every layer, observer, listener, renderer, and context.

Expose:

```ts
export interface CosmicSceneController {
  setProgress(progress: number): void;
  setTheme(theme: "dark" | "light"): void;
  pause(): void;
  resume(): void;
  dispose(): void;
}
```

- [ ] **Step 5: Replace the Hero with the approved DOM structure**

`Hero.astro` keeps semantic text and links but removes its local Canvas. Add:

```astro
<section
  class="cosmic-journey"
  id="hero"
  data-home-section
  data-cosmic-journey
  aria-labelledby="hero-title"
>
  <div class="cosmic-journey__stage">
    <div class="hero__copy" data-hero-copy>
      <p class="hero__eyebrow">THREE.JS / ORBIT LIVE</p>
      <h1 id="hero-title">把复杂，<strong>做得有意思。</strong></h1>
      <!-- keep existing truthful introduction and links -->
    </div>
    <div class="hero__galaxy-copy" data-galaxy-copy>
      <p class="hero__eyebrow">GALACTIC CORE / ONLINE</p>
      <h2>每个作品，都是宇宙中的一个坐标。</h2>
    </div>
    <nav
      class="hero__quick-links"
      data-cosmic-cards
      aria-label="首页快速入口"
    >
      <a href={withBase("/about/")}>01 关于</a>
      <a href={withBase("/projects/")}>02 项目</a>
      <a href={withBase("/blog/")}>03 博客</a>
      <a href={withBase("/playground/")}>04 实验室</a>
    </nav>
  </div>
</section>
```

- [ ] **Step 6: Select the homepage scene variant**

Change the homepage layout invocation:

```astro
<BaseLayout cosmicVariant="home" jsonLd={personJsonLd}>
```

- [ ] **Step 7: Dispatch one scroll progress event**

Replace the old `hero:progress` contract with:

```ts
window.dispatchEvent(
  new CustomEvent("cosmic:progress", {
    detail: { variant: "home", progress },
  }),
);
```

Use one passive scroll source or GSAP ScrollTrigger, not both. Register cleanup before dynamic GSAP import and preserve the existing unhandled-rejection guard.

- [ ] **Step 8: Update homepage E2E assertions**

Add:

```ts
await expect(page.locator("[data-cosmic-scene]")).toHaveAttribute(
  "data-scene-state",
  "ready",
);
await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
await expect(page.locator("[data-galaxy-copy]")).toHaveCSS("opacity", "1");
await expect(page.locator("[data-cosmic-cards]")).toBeVisible();
```

Keep the existing section order, no-JS content, and reduced-motion tests. Change reduced-motion Canvas assertion from `[data-hero-scene]` to `[data-cosmic-canvas]`.

- [ ] **Step 9: Run homepage tests**

Run:

```bash
pnpm test -- tests/unit/cosmic-home-timeline.test.ts
pnpm test:e2e -- tests/e2e/home.spec.ts
```

Expected: PASS at desktop and reduced-motion settings.

- [ ] **Step 10: Remove the legacy Hero scene**

Run:

```bash
rg -n "initHeroScene|scenes/hero|data-hero-scene" src tests
```

Expected: no imports or selectors remain. Then delete `src/scripts/scenes/hero.ts`.

- [ ] **Step 11: Commit**

```bash
git add src/components/home/Hero.astro src/pages/index.astro src/scripts/scenes/cosmic/scene.ts src/scripts/scenes/cosmic/home-timeline.ts src/scripts/transitions.ts src/styles/home.css tests/unit/cosmic-home-timeline.test.ts tests/e2e/home.spec.ts
git rm src/scripts/scenes/hero.ts
git commit -m "feat: add orbit-to-galaxy homepage journey"
```

---

### Task 6: Synchronize Deep-Space and Daylight Themes

**Files:**
- Create: `src/scripts/scenes/cosmic/theme.ts`
- Test: `tests/unit/cosmic-theme.test.ts`
- Modify: `src/scripts/theme.ts`
- Modify: `tests/unit/theme.test.ts`
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/base.css`
- Modify: `src/styles/components.css`
- Modify: `src/styles/cosmic.css`

- [ ] **Step 1: Write failing palette and event tests**

```ts
import { describe, expect, it } from "vitest";
import { getCosmicPalette } from "@/scripts/scenes/cosmic/theme";

describe("cosmic theme palettes", () => {
  it("defines independent dark and light exposure", () => {
    expect(getCosmicPalette("dark")).toMatchObject({
      background: 0x010205,
      exposure: 1.08,
    });
    expect(getCosmicPalette("light")).toMatchObject({
      background: 0xeaf2f5,
      exposure: 0.82,
    });
  });
});
```

Extend `tests/unit/theme.test.ts`:

```ts
it("announces theme changes to the WebGL scene", () => {
  const event = vi.fn();
  document.addEventListener("zjb:themechange", event);
  document.body.innerHTML = '<button data-theme-toggle></button>';
  document.documentElement.dataset.theme = "dark";
  initThemeToggle(document);
  document.querySelector<HTMLButtonElement>("[data-theme-toggle]")?.click();
  expect(event).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm test -- tests/unit/cosmic-theme.test.ts tests/unit/theme.test.ts
```

Expected: FAIL because the palette and event do not exist.

- [ ] **Step 3: Implement palette mapping**

```ts
import type { Theme } from "@/lib/theme";

export interface CosmicPalette {
  background: number;
  nebula: [number, number, number];
  core: [number, number, number];
  signal: [number, number, number];
  exposure: number;
}

const palettes: Record<Theme, CosmicPalette> = {
  dark: {
    background: 0x010205,
    nebula: [0.03, 0.2, 0.32],
    core: [1, 0.78, 0.56],
    signal: [0.5, 0.93, 1],
    exposure: 1.08,
  },
  light: {
    background: 0xeaf2f5,
    nebula: [0.12, 0.35, 0.44],
    core: [0.72, 0.42, 0.14],
    signal: [0.03, 0.36, 0.47],
    exposure: 0.82,
  },
};

export const getCosmicPalette = (theme: Theme) => palettes[theme];
```

- [ ] **Step 4: Dispatch the theme event**

After updating `html.dataset.theme`:

```ts
pageDocument.dispatchEvent(
  new CustomEvent("zjb:themechange", { detail: { theme: nextTheme } }),
);
```

The cosmic controller listens once and lerps current uniforms to the target palette over `250ms`; it does not rebuild layers.

- [ ] **Step 5: Replace visual tokens**

Define semantic variables for both themes:

```css
:root[data-theme="dark"] {
  --color-bg: #010205;
  --color-surface: rgba(4, 16, 26, 0.88);
  --color-text: #f3fafc;
  --color-muted: #9aaeb7;
  --color-border: rgba(128, 238, 255, 0.18);
  --color-accent: #80eeff;
  --color-focus: #ffe0b8;
  --cosmic-nebula: rgba(27, 124, 164, 0.22);
  --cosmic-horizon: rgba(51, 139, 255, 0.24);
}

:root[data-theme="light"] {
  --color-bg: #eaf2f5;
  --color-surface: rgba(240, 247, 249, 0.9);
  --color-text: #09171d;
  --color-muted: #425a64;
  --color-border: rgba(7, 91, 120, 0.2);
  --color-accent: #075b78;
  --color-focus: #b66a24;
  --cosmic-nebula: rgba(71, 139, 164, 0.2);
  --cosmic-horizon: rgba(182, 106, 36, 0.16);
}
```

- [ ] **Step 6: Add reusable fluid-edge cards**

```css
.fluid-card {
  --fluid-edge: var(--color-accent);
  position: relative;
  overflow: hidden;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  isolation: isolate;
}

.fluid-card::before {
  position: absolute;
  z-index: -2;
  inset: -1px;
  background: conic-gradient(
    from var(--fluid-angle),
    transparent 0 70%,
    var(--fluid-edge) 79%,
    var(--color-text) 82%,
    transparent 89%
  );
  content: "";
  animation: fluid-edge 7s linear infinite;
}

@property --fluid-angle {
  syntax: "<angle>";
  initial-value: 0deg;
  inherits: false;
}

@keyframes fluid-edge {
  to { --fluid-angle: 360deg; }
}
```

Add a second pseudo-element for the opaque card interior so the conic gradient remains edge-only.

- [ ] **Step 7: Run theme tests and accessibility smoke checks**

Run:

```bash
pnpm test -- tests/unit/cosmic-theme.test.ts tests/unit/theme.test.ts
pnpm test:e2e -- tests/e2e/shell.spec.ts tests/e2e/smoke.spec.ts
```

Expected: PASS in dark and light mode; focus and 44px target checks remain green.

- [ ] **Step 8: Commit**

```bash
git add src/scripts/scenes/cosmic/theme.ts src/scripts/theme.ts src/styles/tokens.css src/styles/base.css src/styles/components.css src/styles/cosmic.css tests/unit/cosmic-theme.test.ts tests/unit/theme.test.ts
git commit -m "feat: synchronize cosmic color themes"
```

---

### Task 7: Apply Projects, About, and 404 Scene Variants

**Files:**
- Modify: `src/pages/projects/index.astro`
- Modify: `src/pages/projects/[slug].astro`
- Modify: `src/pages/about.astro`
- Modify: `src/pages/404.astro`
- Modify: `src/components/projects/ProjectCard.astro`
- Modify: `src/styles/projects.css`
- Modify: `src/styles/components.css`
- Modify: `tests/e2e/projects.spec.ts`
- Modify: `tests/e2e/about-seo.spec.ts`

- [ ] **Step 1: Add failing page-variant assertions**

```ts
await expect(page.locator("[data-cosmic-scene]")).toHaveAttribute(
  "data-cosmic-variant",
  "projects",
);
```

For project detail expect `project`; About expect `about`; 404 expect `not-found`.

- [ ] **Step 2: Run page tests and verify RED**

Run:

```bash
pnpm test:e2e -- tests/e2e/projects.spec.ts tests/e2e/about-seo.spec.ts
```

Expected: FAIL because pages still use the default variant.

- [ ] **Step 3: Pass explicit variants**

```astro
<BaseLayout cosmicVariant="projects" ...>
<BaseLayout cosmicVariant="project" ...>
<BaseLayout cosmicVariant="about" ...>
<BaseLayout cosmicVariant="not-found" ...>
```

- [ ] **Step 4: Apply star-map DOM semantics**

Add `fluid-card` to project cards. Add decorative, hidden-from-AT coordinates:

```astro
<span class="project-card__coordinate" aria-hidden="true">
  NODE / {String(index + 1).padStart(2, "0")}
</span>
```

Do not move project titles, categories, tags, or links into Canvas.

- [ ] **Step 5: Add scoped variant styling**

Projects use medium-opacity surfaces and node lines. About uses a thin Earth-horizon overlay. The 404 CSS black hole remains as the no-WebGL fallback and fades only when `[data-scene-state="ready"]`.

Use:

```css
[data-cosmic-page="projects"] .project-card,
[data-cosmic-page="project"] .project-detail__body,
[data-cosmic-page="about"] .technology-group {
  backdrop-filter: blur(18px);
  background: color-mix(in srgb, var(--color-surface) 92%, transparent);
}
```

- [ ] **Step 6: Verify behavior and truthfulness remain unchanged**

Run:

```bash
pnpm test:e2e -- tests/e2e/projects.spec.ts tests/e2e/about-seo.spec.ts
```

Expected: filtering, JSON-LD, public contact links, privacy assertions, 404 links, and variants all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/projects src/pages/about.astro src/pages/404.astro src/components/projects/ProjectCard.astro src/styles/projects.css src/styles/components.css tests/e2e/projects.spec.ts tests/e2e/about-seo.spec.ts
git commit -m "feat: add project and profile cosmic variants"
```

---

### Task 8: Apply Blog and Playground Variants Without Context Competition

**Files:**
- Modify: `src/pages/blog/index.astro`
- Modify: `src/pages/blog/[slug].astro`
- Modify: `src/pages/blog/archive.astro`
- Modify: `src/pages/tags/index.astro`
- Modify: `src/pages/tags/[tag].astro`
- Modify: `src/pages/playground/index.astro`
- Modify: `src/layouts/ExperimentLayout.astro`
- Modify: `src/components/blog/BlogCard.astro`
- Modify: `src/components/playground/ExperimentCard.astro`
- Modify: `src/styles/blog.css`
- Modify: `src/styles/playground.css`
- Modify: `tests/e2e/blog.spec.ts`
- Modify: `tests/e2e/playground.spec.ts`
- Modify: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Replace the obsolete blog resource test**

Remove the assertion that article pages load no Three.js. Add:

```ts
test("博客详情只加载低强度共享场景", async ({ page }) => {
  const scriptRequests: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script") scriptRequests.push(request.url());
  });
  await page.goto("/abinzhao/blog/harmonyos-next-learning-path/");
  await expect(page.locator("[data-cosmic-scene]")).toHaveAttribute(
    "data-cosmic-variant",
    "article",
  );
  await expect(page.locator("[data-cosmic-canvas]")).toHaveCount(1);
  expect(scriptRequests.join("\n")).not.toMatch(
    /particle-galaxy|shader-art|physics-sandbox/i,
  );
  await expect(page.locator("[data-cosmic-scene]")).toHaveAttribute(
    "data-transit-stars",
    "false",
  );
});
```

- [ ] **Step 2: Add experiment context exclusivity assertion**

```ts
await page.goto("/abinzhao/playground/particle-galaxy/");
await expect(page.locator("canvas")).toHaveCount(1);
await expect(page.locator("[data-experiment-canvas]")).toHaveCount(1);
await expect(page.locator("[data-cosmic-canvas]")).toHaveCount(0);
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
pnpm test:e2e -- tests/e2e/blog.spec.ts tests/e2e/playground.spec.ts tests/e2e/smoke.spec.ts
```

Expected: variant and resource assertions FAIL.

- [ ] **Step 4: Set explicit variants**

```astro
<BaseLayout cosmicVariant="blog" ...>
<BaseLayout cosmicVariant="article" ...>
<BaseLayout cosmicVariant="playground" ...>
```

Archive and tag pages use `article` intensity. `ExperimentLayout` keeps `experiment`.

- [ ] **Step 5: Add low-motion reading surfaces**

```css
.article-detail,
.blog-card,
.archive-list section,
.tag-index a {
  background: color-mix(in srgb, var(--color-surface) 94%, transparent);
  backdrop-filter: blur(16px);
}

[data-cosmic-page="article"] .article-body {
  padding: clamp(1.25rem, 4vw, 3rem);
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-surface) 97%, transparent);
}
```

Add `fluid-card` to blog and experiment cards. Do not animate article body, TOC, or code blocks.

- [ ] **Step 6: Run page E2E tests**

Run:

```bash
pnpm test:e2e -- tests/e2e/blog.spec.ts tests/e2e/playground.spec.ts tests/e2e/smoke.spec.ts
```

Expected: blog content, filters, clipboard, experiment controls, no-JS content, scene variants, and single-context checks PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/blog src/pages/tags src/pages/playground/index.astro src/layouts/ExperimentLayout.astro src/components/blog/BlogCard.astro src/components/playground/ExperimentCard.astro src/styles/blog.css src/styles/playground.css tests/e2e/blog.spec.ts tests/e2e/playground.spec.ts tests/e2e/smoke.spec.ts
git commit -m "feat: add archive and lab cosmic variants"
```

---

### Task 9: Add Context-Loss, Adaptive Downgrade, and Reduced-Motion Guards

**Files:**
- Modify: `src/scripts/scenes/cosmic/runtime.ts`
- Modify: `src/scripts/scenes/cosmic/scene.ts`
- Modify: `src/scripts/scenes/cosmic/quality.ts`
- Modify: `src/styles/cosmic.css`
- Modify: `tests/unit/cosmic-quality.test.ts`
- Modify: `tests/e2e/cosmic-scene.spec.ts`
- Modify: `tests/e2e/home.spec.ts`

- [ ] **Step 1: Add failing context-loss and reduced-motion tests**

```ts
test("WebGL context loss switches to fallback", async ({ page }) => {
  await page.goto("/abinzhao/");
  await page.locator("[data-cosmic-canvas]").evaluate((canvas) => {
    canvas.dispatchEvent(
      new Event("webglcontextlost", { cancelable: true }),
    );
  });
  await expect(page.locator("[data-cosmic-scene]")).toHaveAttribute(
    "data-scene-state",
    "fallback",
  );
});

test("reduced motion uses the approved static frame", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/abinzhao/");
  await expect(page.locator("[data-cosmic-canvas]")).toHaveCount(0);
  await expect(page.locator("[data-cosmic-scene]")).toHaveAttribute(
    "data-scene-state",
    "static",
  );
  await expect(page.getByRole("heading", {
    name: "把复杂，做得有意思。",
  })).toBeVisible();
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm test:e2e -- tests/e2e/cosmic-scene.spec.ts tests/e2e/home.spec.ts
```

Expected: context-loss state test FAIL.

- [ ] **Step 3: Implement context-loss handling**

```ts
const onContextLost = (event: Event) => {
  event.preventDefault();
  controller?.pause();
  root.dataset.sceneState = "fallback";
};
canvas.addEventListener("webglcontextlost", onContextLost);
```

Remove the listener during disposal. Do not automatically recreate the renderer in the same page session.

- [ ] **Step 4: Implement measured downgrade**

Collect one-second rolling frame samples after the first two seconds. If average FPS remains below `80%` of the profile target for two consecutive windows:

1. Hide and dispose transit stars.
2. Lower DPR by `0.2`, not below `1`.
3. Mark `data-quality-downgraded="true"`.

Do not regenerate the galaxy geometry during active scrolling.

- [ ] **Step 5: Add static-theme CSS**

```css
@media (prefers-reduced-motion: reduce) {
  .cosmic-scene__fallback,
  .fluid-card::before {
    animation: none;
  }
  [data-cosmic-page="home"] .cosmic-scene__fallback {
    background:
      radial-gradient(ellipse at 60% 43%, var(--cosmic-nebula), transparent 32%),
      radial-gradient(ellipse at 58% 110%, var(--cosmic-horizon), transparent 46%),
      var(--color-bg);
  }
}
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm test -- tests/unit/cosmic-quality.test.ts
pnpm test:e2e -- tests/e2e/cosmic-scene.spec.ts tests/e2e/home.spec.ts
```

Expected: context-loss, reduced-motion, and quality tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/scripts/scenes/cosmic/runtime.ts src/scripts/scenes/cosmic/scene.ts src/scripts/scenes/cosmic/quality.ts src/styles/cosmic.css tests/unit/cosmic-quality.test.ts tests/e2e/cosmic-scene.spec.ts tests/e2e/home.spec.ts
git commit -m "fix: harden cosmic scene fallbacks"
```

---

### Task 10: Complete Responsive, Accessibility, Build, and Browser Verification

**Files:**
- Modify: `tests/e2e/cosmic-scene.spec.ts`
- Modify: `tests/e2e/smoke.spec.ts`
- Modify: `src/styles/home.css`
- Modify: `src/styles/projects.css`
- Modify: `src/styles/blog.css`
- Modify: `src/styles/playground.css`
- Modify: `src/styles/cosmic.css`
- Modify: `README.md`

- [ ] **Step 1: Add viewport composition tests**

```ts
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 900, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`cosmic composition fits ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/abinzhao/");
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      )
      .toBe(true);
    await expect(page.locator("[data-hero-copy]")).toBeVisible();
    await expect(page.locator("[data-cosmic-scene]")).toBeVisible();
  });
}
```

- [ ] **Step 2: Run full unit suite**

Run:

```bash
pnpm test
```

Expected: all Vitest tests PASS.

- [ ] **Step 3: Run lint, Astro check, and production build**

Run:

```bash
pnpm lint
pnpm exec astro check
pnpm build
```

Expected: all commands exit `0`; `dist/` is generated.

- [ ] **Step 4: Verify production asset isolation**

Run:

```bash
rg -n "threejs\\.org|raw\\.githubusercontent\\.com|unpkg\\.com" dist
```

Expected: no matches.

- [ ] **Step 5: Run the complete Playwright suite**

Run:

```bash
pnpm test:e2e
```

Expected: all desktop, tablet, mobile, no-JS, reduced-motion, route compatibility, content, and experiment tests PASS.

- [ ] **Step 6: Inspect the production preview in Chrome DevTools**

Run:

```bash
pnpm preview
```

Verify:

1. Homepage at scroll progress `0`, `0.5`, and `1`.
2. Dark and daylight themes.
3. Projects, blog article, About, Playground list, experiment detail, and 404.
4. Console has no application errors.
5. Network has no unexpected `4xx/5xx` or external texture requests.
6. Hidden tab and offscreen Canvas pause rendering.
7. No horizontal overflow at `1440`, `900`, and `390` widths.

- [ ] **Step 7: Run Lighthouse**

Audit the production homepage and article page for Performance, Accessibility, Best Practices, and SEO. Fix blocking failures before continuing. Record measured results in the implementation handoff; do not add unverified scores to public site content.

- [ ] **Step 8: Update README accurately**

Update the public technical overview to mention the shared Three.js digital-universe scene, local Earth textures, page variants, static fallbacks, and accessibility controls. Do not include local paths, implementation logs, or unverified performance claims.

- [ ] **Step 9: Re-run final verification**

Run:

```bash
pnpm lint && pnpm test && pnpm build && pnpm test:e2e
```

Expected: every command exits `0`.

- [ ] **Step 10: Commit**

```bash
git add src tests public/assets/cosmic README.md
git commit -m "feat: complete Three.js cosmic site redesign"
```

---

### Task 11: Tree-shake the Shared Three.js Runtime

**Files:**
- Create: `src/scripts/scenes/three-runtime.ts`
- Modify: `src/scripts/scenes/cosmic/scene.ts`
- Modify: `src/scripts/scenes/cosmic/layers/*.ts`
- Modify: `src/scripts/scenes/particle-galaxy.ts`
- Modify: `src/scripts/scenes/shader-art.ts`
- Test: `tests/unit/three-runtime.test.ts`

- [x] **Step 1: Add a failing runtime-boundary test**

Assert that browser scene entrypoints dynamically import `@/scripts/scenes/three-runtime`, that the runtime explicitly re-exports the required Three.js API, and that no browser scene dynamically imports the complete `three` namespace.

- [x] **Step 2: Verify the boundary test fails**

Run:

```bash
npm test -- tests/unit/three-runtime.test.ts
```

Expected: FAIL because `three-runtime.ts` does not exist and scene entrypoints still use `import("three")`.

- [x] **Step 3: Add the controlled runtime**

Create `three-runtime.ts` with named value exports for only the renderer, cameras, geometry, materials, math types, lights, objects, loaders, color-space values, blending values, sides, and tone mapping used by the three browser scenes.

- [x] **Step 4: Replace complete namespace imports**

Change the three browser scene entrypoints to dynamically import the controlled runtime. Update layer function parameter types to `typeof import("@/scripts/scenes/three-runtime")`; retain direct `import type` references for erased TypeScript-only types.

- [x] **Step 5: Verify tests and build output**

Run:

```bash
npm test -- tests/unit/three-runtime.test.ts
npm run build
```

Expected: the test passes, the Three.js runtime chunk is below 500KB before compression, and the build emits no chunk-size warning.

- [x] **Step 6: Run the complete verification sequence**

Run:

```bash
npm run lint && npm test && npm run build && npm run test:e2e
```

Expected: every command exits `0`.

- [ ] **Step 7: Commit and push**

Stage the complete approved cosmic redesign, create one new commit, and push `website` to `origin/website`.

---

## Manual Review Gates

1. **After Task 4:** Confirm the night-side Earth, cloud layer, city lights, and atmosphere remain realistic in dark and daylight themes.
2. **After Task 5:** Confirm the homepage desktop and mobile orbit-to-galaxy journey matches the approved prototype.
3. **After Task 6:** Confirm the daylight theme is independently designed and readable.
4. **After Task 8:** Confirm page variants feel like one universe without making articles difficult to read.
5. **After Task 10:** Confirm browser, accessibility, and performance evidence before deployment.

## Completion Evidence

The implementation is complete only when the handoff contains:

- Unit, lint, Astro check, production build, and Playwright command results.
- Chrome DevTools console and network results.
- Desktop and mobile screenshots at homepage scroll progress `0` and `1`.
- Dark and daylight theme screenshots.
- Confirmation that production assets contain no runtime texture CDN references.
- Measured Lighthouse results with any residual risk stated.
- A list of local texture sources and licenses.
