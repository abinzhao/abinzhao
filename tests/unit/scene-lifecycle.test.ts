import { describe, expect, it } from "vitest";

import { getSceneProfile } from "@/scripts/scenes/scene-lifecycle";

describe("首页场景性能配置", () => {
  it("桌面、移动端和中档设备使用固定分级配置", () => {
    expect(
      getSceneProfile({ width: 1440, dpr: 2, reducedMotion: false }),
    ).toEqual({
      animated: true,
      particles: 2200,
      maxDpr: 1.6,
      fps: 60,
    });
    expect(
      getSceneProfile({ width: 390, dpr: 3, reducedMotion: false }),
    ).toEqual({
      animated: true,
      particles: 800,
      maxDpr: 1.2,
      fps: 30,
    });
    expect(
      getSceneProfile({ width: 900, dpr: 2, reducedMotion: false }),
    ).toEqual({
      animated: true,
      particles: 1400,
      maxDpr: 1.35,
      fps: 45,
    });
  });

  it("reduced-motion 禁用场景动画", () => {
    expect(
      getSceneProfile({ width: 1440, dpr: 1, reducedMotion: true }).animated,
    ).toBe(false);
  });
});
