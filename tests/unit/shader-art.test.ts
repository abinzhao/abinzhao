import { describe, expect, it } from "vitest";

import { normalizeShaderSettings } from "@/scripts/scenes/shader-art";

describe("着色器艺术参数", () => {
  it("将参数限制在允许范围内", () => {
    expect(normalizeShaderSettings({ speed: 9, scale: 0, hue: 720 })).toEqual({
      speed: 2,
      scale: 0.5,
      hue: 360,
    });
  });
});
