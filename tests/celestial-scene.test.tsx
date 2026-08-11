// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CelestialScene } from "@/components/CelestialScene";
import { ThemeProvider } from "@/components/ThemeProvider";

const { createCelestialScene } = vi.hoisted(() => ({
  createCelestialScene: vi.fn(),
}));

vi.mock("@/components/CelestialScene/createCelestialScene", () => ({
  createCelestialScene,
}));

type SceneController = {
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
};

let intersectionCallback: IntersectionObserverCallback | undefined;
let observerDisconnect: ReturnType<typeof vi.fn>;
let observerObserve: ReturnType<typeof vi.fn>;

function mockMedia(matchesByQuery: Record<string, boolean>) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: matchesByQuery[query] ?? false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function useSceneEnvironment({
  theme,
  mobile = false,
  reducedMotion = false,
}: {
  theme: "light" | "dark";
  mobile?: boolean;
  reducedMotion?: boolean;
}) {
  document.documentElement.dataset.theme = theme;
  mockMedia({
    "(max-width: 767px)": mobile,
    "(prefers-reduced-motion: reduce)": reducedMotion,
  });
}

function createController(): SceneController {
  return {
    pause: vi.fn(),
    resume: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
  };
}

beforeEach(() => {
  observerDisconnect = vi.fn();
  observerObserve = vi.fn();
  intersectionCallback = undefined;

  class IntersectionObserverStub {
    constructor(callback: IntersectionObserverCallback) {
      intersectionCallback = callback;
    }

    observe = observerObserve;
    disconnect = observerDisconnect;
  }

  vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
  Object.defineProperty(document, "hidden", {
    value: false,
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("CelestialScene", () => {
  it("服务端静态渲染不访问 window 并输出静态星体", () => {
    vi.stubGlobal("window", undefined);
    let markup = "";

    expect(() => {
      markup = renderToStaticMarkup(
        <ThemeProvider>
          <CelestialScene />
        </ThemeProvider>,
      );
    }).not.toThrow();
    expect(markup).toContain('data-testid="static-celestial"');
  });

  it("浅色主题使用静态星体", () => {
    useSceneEnvironment({ theme: "light" });

    render(
      <ThemeProvider>
        <CelestialScene />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("static-celestial")).toBeInTheDocument();
    expect(screen.queryByTestId("webgl-celestial")).not.toBeInTheDocument();
    expect(createCelestialScene).not.toHaveBeenCalled();
  });

  it("移动端使用静态星体且不初始化 WebGL", () => {
    useSceneEnvironment({ theme: "dark", mobile: true });

    render(
      <ThemeProvider>
        <CelestialScene />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("static-celestial")).toBeInTheDocument();
    expect(screen.queryByTestId("webgl-celestial")).not.toBeInTheDocument();
    expect(createCelestialScene).not.toHaveBeenCalled();
  });

  it("reduced-motion 使用静态星体且不初始化 WebGL", () => {
    useSceneEnvironment({ theme: "dark", reducedMotion: true });

    render(
      <ThemeProvider>
        <CelestialScene />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("static-celestial")).toBeInTheDocument();
    expect(screen.queryByTestId("webgl-celestial")).not.toBeInTheDocument();
    expect(createCelestialScene).not.toHaveBeenCalled();
  });

  it("深色桌面通过门控并初始化 WebGL", async () => {
    const controller = createController();
    createCelestialScene.mockReturnValue(controller);
    useSceneEnvironment({ theme: "dark" });

    render(
      <ThemeProvider>
        <CelestialScene />
      </ThemeProvider>,
    );

    const scene = await screen.findByTestId("webgl-celestial");
    expect(createCelestialScene).toHaveBeenCalledWith(
      scene.querySelector("canvas"),
    );
    expect(screen.queryByTestId("static-celestial")).not.toBeInTheDocument();
  });

  it("WebGL 初始化失败时回退静态星体", async () => {
    createCelestialScene.mockImplementation(() => {
      throw new Error("WebGL unavailable");
    });
    useSceneEnvironment({ theme: "dark" });

    render(
      <ThemeProvider>
        <CelestialScene />
      </ThemeProvider>,
    );

    await waitFor(() => expect(createCelestialScene).toHaveBeenCalledOnce());
    await waitFor(() => {
      expect(screen.getByTestId("static-celestial")).toBeInTheDocument();
      expect(screen.queryByTestId("webgl-celestial")).not.toBeInTheDocument();
    });
  });

  it("根据可见性暂停恢复并在卸载时完整清理控制器", async () => {
    const controller = createController();
    createCelestialScene.mockReturnValue(controller);
    useSceneEnvironment({ theme: "dark" });

    const { unmount } = render(
      <ThemeProvider>
        <CelestialScene />
      </ThemeProvider>,
    );

    const canvas = (await screen.findByTestId("webgl-celestial")).querySelector(
      "canvas",
    );
    expect(observerObserve).toHaveBeenCalledWith(canvas);

    act(() => {
      intersectionCallback?.(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    expect(controller.pause).toHaveBeenCalled();

    act(() => {
      intersectionCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    expect(controller.resume).toHaveBeenCalled();

    Object.defineProperty(document, "hidden", {
      value: true,
      configurable: true,
    });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(controller.pause).toHaveBeenCalledTimes(2));

    unmount();
    expect(observerDisconnect).toHaveBeenCalledOnce();
    expect(controller.dispose).toHaveBeenCalledOnce();
  });
});
