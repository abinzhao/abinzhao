import { describe, expect, it } from "vitest";

import {
  getCosmicQuality,
  getDowngradedDpr,
} from "@/scripts/scenes/cosmic/quality";

describe("数字宇宙性能档位", () => {
  it.each([
    [1440, 2, "high", 1.6, 60, 112_000, 7_000],
    [900, 2, "medium", 1.35, 45, 65_000, 3_500],
    [390, 3, "mobile", 1.2, 30, 42_000, 2_000],
  ] as const)(
    "%s px 视口使用 %s 档配置",
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

  it("reduced-motion 返回静态档位", () => {
    expect(
      getCosmicQuality({ width: 1440, dpr: 2, reducedMotion: true }),
    ).toMatchObject({
      tier: "static",
      animated: false,
      galaxyParticles: 0,
      transitParticles: 0,
    });
  });

  it("按页面强度降低桌面粒子预算", () => {
    expect(
      getCosmicQuality({
        width: 1440,
        dpr: 2,
        reducedMotion: false,
        intensity: "medium",
      }),
    ).toMatchObject({
      galaxyParticles: 67_200,
      transitParticles: 4_200,
    });
    expect(
      getCosmicQuality({
        width: 1440,
        dpr: 2,
        reducedMotion: false,
        intensity: "low",
      }),
    ).toMatchObject({
      galaxyParticles: 39_200,
      transitParticles: 2_450,
    });
  });

  it("自适应降级每次降低 0.2 DPR 且不低于 1", () => {
    expect(getDowngradedDpr(1.6)).toBeCloseTo(1.4);
    expect(getDowngradedDpr(1.1)).toBe(1);
    expect(getDowngradedDpr(1)).toBe(1);
  });
});
