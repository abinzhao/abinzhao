// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteHeader } from "@/components/SiteHeader";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("主题组件", () => {
  it("hydration 后恢复已持久化的主题", async () => {
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("personal-site-theme", "dark");

    render(<ThemeProvider>内容</ThemeProvider>);

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(document.documentElement.style.colorScheme).toBe("dark");
    });
  });

  it("切换主题并持久化明确选择", () => {
    document.documentElement.dataset.theme = "dark";

    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "切换到浅色模式" }));

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("personal-site-theme")).toBe("light");
  });

  it("用户明确选择后不再响应系统主题变化", () => {
    let handleSystemChange: ((event: MediaQueryListEvent) => void) | undefined;
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: (
          _type: string,
          listener: (event: MediaQueryListEvent) => void,
        ) => {
          handleSystemChange = listener;
        },
        removeEventListener: vi.fn(),
      }),
    );
    document.documentElement.dataset.theme = "dark";

    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "切换到浅色模式" }));

    act(() => handleSystemChange?.({ matches: true } as MediaQueryListEvent));

    expect(document.documentElement.dataset.theme).toBe("light");
  });
});

describe("站点导航", () => {
  it("玻璃卡片降级不覆盖导航默认透明状态", () => {
    const componentsCss = readFileSync(
      resolve(process.cwd(), "app/styles/components.css"),
      "utf8",
    );

    expect(componentsCss).toContain(
      "@supports not (\n  (backdrop-filter: blur(1rem)) or (-webkit-backdrop-filter: blur(1rem))\n)",
    );
    expect(componentsCss).not.toContain(".glass-card,\n  .site-header");
  });

  it("默认不启用玻璃状态，页面滚动后启用", () => {
    render(
      <ThemeProvider>
        <SiteHeader />
      </ThemeProvider>,
    );

    expect(screen.getByRole("banner")).toHaveAttribute(
      "data-scrolled",
      "false",
    );

    Object.defineProperty(window, "scrollY", { value: 80, configurable: true });
    fireEvent.scroll(window);

    expect(screen.getByRole("banner")).toHaveAttribute(
      "data-scrolled",
      "true",
    );
  });

  it("桌面导航和移动菜单均提供主题切换入口", () => {
    document.documentElement.dataset.theme = "dark";

    render(
      <ThemeProvider>
        <SiteHeader />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText("菜单"));

    expect(
      screen.getByRole("navigation", { name: "主导航" }),
    ).toHaveAccessibleName("主导航");
    expect(
      screen.getByRole("navigation", { name: "移动端主导航" }),
    ).toHaveAccessibleName("移动端主导航");
    expect(
      screen.getAllByRole("button", { name: "切换到浅色模式" }),
    ).toHaveLength(2);
  });
});
