import { describe, expect, it } from "vitest";
import { getEarthLayout } from "@/scripts/scenes/cosmic/variant-layout";

describe("页面宇宙对象布局", () => {
  it("About 仅保留下沉的薄地球地平线", () => {
    expect(getEarthLayout("about")).toEqual({
      position: [3.6, -11.8, -2],
      scale: 0.72,
    });
  });

  it("首页保留近地轨道初始位置", () => {
    expect(getEarthLayout("home")).toEqual({
      position: [1.35, -7.25, 0.15],
      scale: 1,
    });
  });
});
