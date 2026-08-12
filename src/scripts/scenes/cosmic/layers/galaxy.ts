import type { ThreeRuntime } from "@/scripts/scenes/three-runtime";
import { createGalaxyPointData } from "../galaxy-data";
import type { CosmicLayer } from "../types";
import { createPointLayer } from "./points";

export function createGalaxyLayer(
  three: ThreeRuntime,
  count: number,
): CosmicLayer {
  const layer = createPointLayer(
    three,
    createGalaxyPointData(count),
    {
      pointSize: 0.31,
      opacity: 0.62,
      position: [0.4, 2.6, -5.9],
    },
  );
  layer.object.rotation.z = -0.32;
  layer.object.scale.setScalar(1.06);
  return layer;
}
