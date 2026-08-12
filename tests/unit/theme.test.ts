// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  THEME_STORAGE_KEY,
  resolveInitialTheme,
  type Theme,
} from "@/lib/theme";
import { initThemeToggle } from "@/scripts/theme";

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

  it("向 WebGL 场景广播主题变化", () => {
    const listener = vi.fn();
    document.addEventListener("zjb:themechange", listener);
    document.body.innerHTML = '<button data-theme-toggle></button>';
    document.documentElement.dataset.theme = "dark";

    initThemeToggle(document);
    document.querySelector<HTMLButtonElement>("[data-theme-toggle]")?.click();

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      detail: { theme: "light" },
    });
    document.removeEventListener("zjb:themechange", listener);
  });
});
