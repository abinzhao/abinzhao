import type { CosmicPalette } from "./theme";

export type CosmicVariant =
  | "home"
  | "projects"
  | "project"
  | "blog"
  | "article"
  | "about"
  | "playground"
  | "experiment"
  | "not-found";

export type CosmicIntensity = "low" | "medium" | "high";
export type CosmicInteraction =
  | "none"
  | "parallax"
  | "scroll-cinematic";

export interface LayerVisibility {
  streamer: boolean;
  farStars: boolean;
  galaxy: boolean;
  nebula: boolean;
  earth: boolean;
  transitStars: boolean;
}

export interface CosmicSceneConfig {
  variant: CosmicVariant;
  renderMode: "webgl" | "static";
  intensity: CosmicIntensity;
  interaction: CosmicInteraction;
  layers: LayerVisibility;
}

export interface CosmicLayer {
  object: import("three").Object3D;
  update(time: number, progress: number): void;
  setPalette?(palette: CosmicPalette): void;
  dispose(): void;
}
