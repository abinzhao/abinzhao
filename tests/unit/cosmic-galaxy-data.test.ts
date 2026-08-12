import { describe, expect, it } from "vitest";

import {
  createGalaxyPointData,
  createTransitPointData,
} from "@/scripts/scenes/cosmic/galaxy-data";

describe("数字宇宙粒子数据", () => {
  it("同一 seed 生成稳定且有限的银河数据", () => {
    const first = createGalaxyPointData(100, 42);
    const second = createGalaxyPointData(100, 42);

    expect(Array.from(first.positions)).toEqual(Array.from(second.positions));
    expect(Array.from(first.positions).every(Number.isFinite)).toBe(true);
    expect(first.positions).toHaveLength(300);
    expect(first.colors).toHaveLength(300);
    expect(first.scales).toHaveLength(100);
  });

  it("穿越粒子保持前后景深度范围", () => {
    const data = createTransitPointData(100, 7);
    const z = Array.from(data.positions).filter((_, index) => index % 3 === 2);

    expect(Math.max(...z)).toBeLessThanOrEqual(-8);
    expect(Math.min(...z)).toBeGreaterThanOrEqual(-31);
  });
});
