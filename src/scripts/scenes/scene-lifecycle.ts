import { getCosmicQuality } from "./cosmic/quality";

export interface SceneProfileInput {
  width: number;
  dpr: number;
  reducedMotion: boolean;
}

export interface SceneProfile {
  animated: boolean;
  particles: number;
  maxDpr: number;
  fps: number;
}

export function getSceneProfile(input: SceneProfileInput): SceneProfile {
  const quality = getCosmicQuality(input);
  const particles =
    quality.tier === "high"
      ? 2200
      : quality.tier === "medium"
        ? 1400
        : quality.tier === "mobile"
          ? 800
          : 0;

  return {
    animated: quality.animated,
    particles,
    maxDpr: quality.maxDpr,
    fps: quality.fps || 30,
  };
}
