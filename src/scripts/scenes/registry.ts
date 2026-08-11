import type { ExperimentLoader } from "./runtime";

export const experimentLoaders = {
  "particle-galaxy": () => import("./particle-galaxy"),
  "shader-art": () => import("./shader-art"),
  "physics-sandbox": () => import("./physics-sandbox"),
} as const satisfies Record<string, ExperimentLoader>;

export type ExperimentSlug = keyof typeof experimentLoaders;
