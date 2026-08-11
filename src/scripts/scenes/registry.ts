import type { ExperimentLoader } from "./runtime";

function pendingExperiment(slug: string): ExperimentLoader {
  return () =>
    Promise.reject(new Error(`模块尚未实现：${slug}`));
}

export const experimentLoaders = {
  "particle-galaxy": () => import("./particle-galaxy"),
  "shader-art": () => import("./shader-art"),
  "physics-sandbox": pendingExperiment("physics-sandbox"),
} as const satisfies Record<string, ExperimentLoader>;

export type ExperimentSlug = keyof typeof experimentLoaders;
