import { describe, expect, it } from "vitest";

import { createGalaxyPoints } from "@/scripts/scenes/particle-galaxy";

describe("粒子银河点位", () => {
  it("固定种子生成稳定的点位和颜色", () => {
    const galaxy = createGalaxyPoints(4, 42);

    expect(galaxy.positions).toHaveLength(12);
    expect(galaxy.colors).toHaveLength(12);
    expect(Array.from(galaxy.positions)).toEqual([
      0.18387748301029205, -0.11652720719575882, 2.0517191886901855,
      -2.7674708366394043, 0.20774640142917633, -0.8137917518615723,
      2.7581799030303955, -0.1718849390745163, -2.5911741256713867,
      1.223416805267334, -0.13418304920196533, 4.596824645996094,
    ]);
    expect(Array.from(galaxy.colors)).toEqual([
      0.7619604468345642, 0.32379940152168274, 0.4235866367816925,
      0.6035093665122986, 0.33298495411872864, 0.6256692409515381,
      0.45994576811790466, 0.34130749106407166, 0.8087648153305054,
      0.4309312701225281, 0.3429895043373108, 0.8457688093185425,
    ]);
  });
});
