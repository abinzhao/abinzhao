import type { CosmicIntensity } from "./types";

export interface CosmicQualityInput {
  width: number;
  dpr: number;
  reducedMotion: boolean;
  intensity?: CosmicIntensity;
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

  let quality: CosmicQuality;

  if (input.width < 768) {
    quality = {
      tier: "mobile",
      animated: true,
      maxDpr: 1.2,
      fps: 30,
      galaxyParticles: 42_000,
      transitParticles: 2_000,
    };
  } else if (input.width < 1024) {
    quality = {
      tier: "medium",
      animated: true,
      maxDpr: 1.35,
      fps: 45,
      galaxyParticles: 65_000,
      transitParticles: 3_500,
    };
  } else {
    quality = {
      tier: "high",
      animated: true,
      maxDpr: 1.6,
      fps: 60,
      galaxyParticles: 112_000,
      transitParticles: 7_000,
    };
  }

  const intensityScale =
    input.intensity === "low" ? 0.35 : input.intensity === "medium" ? 0.6 : 1;

  return {
    ...quality,
    galaxyParticles: Math.round(quality.galaxyParticles * intensityScale),
    transitParticles: Math.round(quality.transitParticles * intensityScale),
  };
}

export function getDowngradedDpr(currentDpr: number): number {
  return Math.max(1, Math.round((currentDpr - 0.2) * 100) / 100);
}
