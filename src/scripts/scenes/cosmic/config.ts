import type {
  CosmicSceneConfig,
  CosmicVariant,
  LayerVisibility,
} from "./types";

const baseLayers: LayerVisibility = {
  streamer: true,
  farStars: true,
  galaxy: true,
  nebula: true,
  earth: false,
  transitStars: false,
};

const configs: Record<CosmicVariant, CosmicSceneConfig> = {
  home: {
    variant: "home",
    renderMode: "webgl",
    intensity: "high",
    interaction: "scroll-cinematic",
    layers: { ...baseLayers, earth: true, transitStars: true },
  },
  projects: {
    variant: "projects",
    renderMode: "webgl",
    intensity: "medium",
    interaction: "parallax",
    layers: { ...baseLayers },
  },
  project: {
    variant: "project",
    renderMode: "webgl",
    intensity: "low",
    interaction: "none",
    layers: { ...baseLayers },
  },
  blog: {
    variant: "blog",
    renderMode: "webgl",
    intensity: "low",
    interaction: "none",
    layers: { ...baseLayers },
  },
  article: {
    variant: "article",
    renderMode: "webgl",
    intensity: "low",
    interaction: "none",
    layers: { ...baseLayers },
  },
  about: {
    variant: "about",
    renderMode: "webgl",
    intensity: "medium",
    interaction: "parallax",
    layers: { ...baseLayers, earth: true },
  },
  playground: {
    variant: "playground",
    renderMode: "webgl",
    intensity: "high",
    interaction: "parallax",
    layers: { ...baseLayers, transitStars: true },
  },
  experiment: {
    variant: "experiment",
    renderMode: "static",
    intensity: "low",
    interaction: "none",
    layers: {
      streamer: false,
      farStars: false,
      galaxy: false,
      nebula: false,
      earth: false,
      transitStars: false,
    },
  },
  "not-found": {
    variant: "not-found",
    renderMode: "webgl",
    intensity: "low",
    interaction: "parallax",
    layers: { ...baseLayers },
  },
};

export function getCosmicSceneConfig(
  variant: CosmicVariant,
): CosmicSceneConfig {
  return configs[variant];
}
