import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtimePath = "src/scripts/scenes/three-runtime.ts";
const runtimePartPaths = [
  "src/scripts/scenes/three-renderer-runtime.ts",
  "src/scripts/scenes/three-scene-runtime.ts",
];
const sceneEntrypoints = [
  "src/scripts/scenes/cosmic/scene.ts",
  "src/scripts/scenes/particle-galaxy.ts",
  "src/scripts/scenes/shader-art.ts",
];

const requiredExports = [
  "ACESFilmicToneMapping",
  "AdditiveBlending",
  "AmbientLight",
  "BackSide",
  "BufferAttribute",
  "BufferGeometry",
  "Camera",
  "Color",
  "DirectionalLight",
  "Group",
  "Mesh",
  "MeshPhongMaterial",
  "PerspectiveCamera",
  "PlaneGeometry",
  "Points",
  "RawShaderMaterial",
  "Scene",
  "ShaderMaterial",
  "SphereGeometry",
  "SRGBColorSpace",
  "TextureLoader",
  "Vector2",
  "Vector3",
  "WebGLRenderer",
];

describe("Three.js 浏览器运行时边界", () => {
  it("只通过受控运行时动态加载 Three.js", () => {
    expect(existsSync(runtimePath)).toBe(true);

    const runtime = readFileSync(runtimePath, "utf8");
    for (const path of runtimePartPaths) {
      expect(existsSync(path)).toBe(true);
    }
    expect(runtime).toContain('import("./three-renderer-runtime")');
    expect(runtime).toContain('import("./three-scene-runtime")');

    const runtimeParts = runtimePartPaths
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    for (const name of requiredExports) {
      expect(runtimeParts).toMatch(new RegExp(`\\b${name}\\b`));
    }

    for (const path of sceneEntrypoints) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain('import("@/scripts/scenes/three-runtime")');
      expect(source).toContain("loadThreeRuntime()");
      expect(source).not.toContain('import("three")');
    }
  });
});
