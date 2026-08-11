import { describe, expect, it } from "vitest";
import { resolveInitialTheme } from "@/lib/theme";

describe("主题初始化", () => {
  it("优先使用已保存主题", () => {
    expect(resolveInitialTheme("light", true)).toBe("light");
  });

  it("没有保存值时跟随系统主题", () => {
    expect(resolveInitialTheme(null, true)).toBe("dark");
    expect(resolveInitialTheme(null, false)).toBe("light");
  });

  it("忽略非法保存值", () => {
    expect(resolveInitialTheme("system", false)).toBe("light");
  });
});
