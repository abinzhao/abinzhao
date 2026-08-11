import { describe, expect, it } from "vitest";
import {
  THEME_STORAGE_KEY,
  resolveInitialTheme,
  type Theme,
} from "@/lib/theme";

describe("主题初始化", () => {
  it("合法的用户选择优先于系统主题", () => {
    expect(resolveInitialTheme("light", true)).toBe("light");
    expect(resolveInitialTheme("dark", false)).toBe("dark");
  });

  it("没有合法用户选择时跟随系统主题", () => {
    expect(resolveInitialTheme(null, true)).toBe("dark");
    expect(resolveInitialTheme("sepia", false)).toBe("light");
  });

  it("使用稳定的主题类型和存储键", () => {
    const themes: Theme[] = ["light", "dark"];

    expect(themes).toEqual(["light", "dark"]);
    expect(THEME_STORAGE_KEY).toBe("zjb-theme");
  });
});
