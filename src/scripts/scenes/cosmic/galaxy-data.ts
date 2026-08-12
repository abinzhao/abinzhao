import { createSeededRandom } from "../seeded-random";

export interface PointData {
  positions: Float32Array;
  colors: Float32Array;
  scales: Float32Array;
}

export function createGalaxyPointData(
  count: number,
  seed = 0x5a4a42,
): PointData {
  const random = createSeededRandom(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const scales = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    const central = index < count * 0.23;
    const x = central
      ? (random() + random() + random() - 1.5) * 2.5
      : (random() - 0.5) * 14.4;
    const z = (random() - 0.5) * (central ? 1.45 : 2.5);
    const strand = ((index % 5) - 2) * (0.05 + Math.abs(x) * 0.007);
    const spread = 0.15 + Math.abs(x) * 0.034;
    const warp =
      Math.sin(x * 0.54 + z * 1.7) * (0.12 + Math.abs(x) * 0.012) +
      Math.sin(x * 1.31 - z * 0.7) * 0.055;
    const y =
      (random() + random() + random() + random() - 2) * spread +
      warp +
      strand;
    const core = Math.max(0, 1 - Math.abs(x) / 4.7);

    positions.set([x, y, z], offset);
    colors.set(
      [
        0.42 + core * 0.36,
        0.64 + core * 0.18,
        0.72 - core * 0.18,
      ],
      offset,
    );
    scales[index] = 0.16 + random() * (central ? 0.55 : 0.38);
  }

  return { positions, colors, scales };
}

export function createTransitPointData(
  count: number,
  seed = 0x314159,
): PointData {
  const random = createSeededRandom(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const scales = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    positions.set(
      [
        (random() - 0.5) * 18,
        (random() - 0.5) * 10,
        -8 - random() * 23,
      ],
      offset,
    );
    colors.set([0.48, 0.82, 0.95], offset);
    scales[index] = 0.22 + random() * 0.75;
  }

  return { positions, colors, scales };
}
