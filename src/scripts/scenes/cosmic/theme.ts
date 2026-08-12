import type { Theme } from "@/lib/theme";

export interface CosmicPalette {
  background: number;
  nebula: [number, number, number];
  core: [number, number, number];
  signal: [number, number, number];
  exposure: number;
}

const palettes: Record<Theme, CosmicPalette> = {
  dark: {
    background: 0x010205,
    nebula: [0.03, 0.2, 0.32],
    core: [1, 0.78, 0.56],
    signal: [0.5, 0.93, 1],
    exposure: 1.08,
  },
  light: {
    background: 0xeaf2f5,
    nebula: [0.12, 0.35, 0.44],
    core: [0.72, 0.42, 0.14],
    signal: [0.03, 0.36, 0.47],
    exposure: 0.82,
  },
};

export const getCosmicPalette = (theme: Theme): CosmicPalette =>
  palettes[theme];

const mix = (from: number, to: number, progress: number) =>
  from + (to - from) * progress;

export function lerpCosmicPalette(
  from: CosmicPalette,
  to: CosmicPalette,
  progress: number,
): CosmicPalette {
  const amount = Math.max(0, Math.min(1, progress));
  const mixTuple = (
    start: [number, number, number],
    end: [number, number, number],
  ): [number, number, number] => [
    mix(start[0], end[0], amount),
    mix(start[1], end[1], amount),
    mix(start[2], end[2], amount),
  ];

  const fromBackground = {
    r: (from.background >> 16) & 0xff,
    g: (from.background >> 8) & 0xff,
    b: from.background & 0xff,
  };
  const toBackground = {
    r: (to.background >> 16) & 0xff,
    g: (to.background >> 8) & 0xff,
    b: to.background & 0xff,
  };

  return {
    background:
      (Math.round(mix(fromBackground.r, toBackground.r, amount)) << 16) |
      (Math.round(mix(fromBackground.g, toBackground.g, amount)) << 8) |
      Math.round(mix(fromBackground.b, toBackground.b, amount)),
    nebula: mixTuple(from.nebula, to.nebula),
    core: mixTuple(from.core, to.core),
    signal: mixTuple(from.signal, to.signal),
    exposure: mix(from.exposure, to.exposure, amount),
  };
}
