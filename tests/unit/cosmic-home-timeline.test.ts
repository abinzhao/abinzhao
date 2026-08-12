import { describe, expect, it } from "vitest";

import { getHomeSceneState } from "@/scripts/scenes/cosmic/home-timeline";

describe("首页宇宙镜头时间线", () => {
  it("进度 0 对应近地轨道首帧", () => {
    expect(getHomeSceneState(0)).toMatchObject({
      earthY: -7.25,
      galaxyZ: -5.9,
      cameraFov: 48,
      heroOpacity: 1,
      cardsOpacity: 0,
    });
  });

  it("进度 1 对应银河核心终帧", () => {
    const state = getHomeSceneState(1);
    expect(state).toMatchObject({
      earthY: -12.45,
      cameraFov: 41,
      heroOpacity: 0,
      cardsOpacity: 1,
    });
    expect(state.galaxyZ).toBeCloseTo(-2.35);
  });

  it("将越界进度限制在 0 到 1", () => {
    expect(getHomeSceneState(-1)).toEqual(getHomeSceneState(0));
    expect(getHomeSceneState(2)).toEqual(getHomeSceneState(1));
  });
});
