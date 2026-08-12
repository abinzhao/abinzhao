import { describe, expect, it } from "vitest";
import { getCosmicPalette } from "@/scripts/scenes/cosmic/theme";

describe("cosmic theme palettes", () => {
  it("defines independent dark and light exposure", () => {
    expect(getCosmicPalette("dark")).toMatchObject({
      background: 0x010205,
      exposure: 1.08,
    });
    expect(getCosmicPalette("light")).toMatchObject({
      background: 0xeaf2f5,
      exposure: 0.82,
    });
  });

  it("uses distinct shader colors for both themes", () => {
    expect(getCosmicPalette("dark").nebula).not.toEqual(
      getCosmicPalette("light").nebula,
    );
    expect(getCosmicPalette("dark").signal).not.toEqual(
      getCosmicPalette("light").signal,
    );
  });
});
