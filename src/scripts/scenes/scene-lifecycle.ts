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
  const animated = !input.reducedMotion;

  if (input.width < 768) {
    return { animated, particles: 800, maxDpr: 1.5, fps: 30 };
  }

  if (input.width < 1024) {
    return { animated, particles: 1400, maxDpr: 1.5, fps: 45 };
  }

  return { animated, particles: 2200, maxDpr: 1.75, fps: 60 };
}
