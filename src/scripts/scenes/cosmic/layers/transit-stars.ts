import type { ThreeRuntime } from "@/scripts/scenes/three-runtime";
import { createTransitPointData } from "../galaxy-data";
import type { CosmicLayer } from "../types";
import { createPointLayer } from "./points";

export function createTransitStarLayer(
  three: ThreeRuntime,
  count: number,
): CosmicLayer {
  return createPointLayer(three, createTransitPointData(count), {
    pointSize: 0.72,
    opacity: 0.62,
  });
}
