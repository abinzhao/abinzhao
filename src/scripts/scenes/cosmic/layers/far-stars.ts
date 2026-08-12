import type { ThreeRuntime } from "@/scripts/scenes/three-runtime";
import { createTransitPointData } from "../galaxy-data";
import type { CosmicLayer } from "../types";
import { createPointLayer } from "./points";

export function createFarStarLayer(
  three: ThreeRuntime,
  count = 9_000,
): CosmicLayer {
  const data = createTransitPointData(count, 0x7f4a7c15);
  for (let index = 2; index < data.positions.length; index += 3) {
    data.positions[index] -= 8;
  }
  return createPointLayer(three, data, {
    pointSize: 0.54,
    opacity: 0.48,
  });
}
