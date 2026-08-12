import type { CosmicVariant } from "./types";

interface EarthLayout {
  position: [number, number, number];
  scale: number;
}

const homeLayout: EarthLayout = {
  position: [1.35, -7.25, 0.15],
  scale: 1,
};

export function getEarthLayout(variant: CosmicVariant): EarthLayout {
  if (variant === "about") {
    return {
      position: [3.6, -11.8, -2],
      scale: 0.72,
    };
  }

  return homeLayout;
}
