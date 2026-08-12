import { describe, expect, it } from "vitest";

import { getCosmicSceneConfig } from "@/scripts/scenes/cosmic/config";

describe("数字宇宙页面变体", () => {
  it("仅首页启用电影镜头、地球和穿越粒子", () => {
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

  it("文章页使用低强度静默场景", () => {
    expect(getCosmicSceneConfig("article")).toMatchObject({
      intensity: "low",
      interaction: "none",
      layers: {
        earth: false,
        transitStars: false,
      },
    });
  });

  it("实验详情禁用全局 WebGL Renderer", () => {
    expect(getCosmicSceneConfig("experiment").renderMode).toBe("static");
  });
});
