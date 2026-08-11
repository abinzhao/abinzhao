// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { experimentLoaders } from "@/scripts/scenes/registry";
import {
  createExperimentRuntime,
  type ExperimentController,
  type ExperimentModule,
} from "@/scripts/scenes/runtime";

class IntersectionObserverStub {
  static instances: IntersectionObserverStub[] = [];

  readonly disconnect = vi.fn();
  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    IntersectionObserverStub.instances.push(this);
  }

  readonly observe = vi.fn();
  readonly takeRecords = vi.fn(() => []);
  readonly unobserve = vi.fn();
  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds = [0];

  setVisible(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

function createShell() {
  document.body.innerHTML = `
    <section data-experiment-shell>
      <canvas data-experiment-canvas></canvas>
      <p data-experiment-status></p>
      <div data-experiment-controls></div>
      <button data-experiment-action="pause">暂停实验</button>
      <button data-experiment-action="resume">继续实验</button>
      <button data-experiment-action="reset">重置实验</button>
      <button data-experiment-retry>重试实验</button>
    </section>
  `;

  return document.querySelector<HTMLElement>("[data-experiment-shell]")!;
}

function createController(): ExperimentController {
  return {
    pause: vi.fn(),
    resume: vi.fn(),
    resize: vi.fn(),
    reset: vi.fn(),
    dispose: vi.fn(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  IntersectionObserverStub.instances = [];
  document.body.innerHTML = "";
});

describe("实验注册表", () => {
  it("只暴露三个已批准实验", () => {
    expect(Object.keys(experimentLoaders)).toEqual([
      "particle-galaxy",
      "shader-art",
      "physics-sandbox",
    ]);
  });

  it("已实现实验的 loader 成功解析实验模块", async () => {
    for (const slug of ["particle-galaxy", "shader-art"] as const) {
      const module = await experimentLoaders[slug]();

      expect(module.mount).toBeTypeOf("function");
    }
  });

  it("物理沙盒通过受控 loader 明确拒绝", async () => {
    await expect(experimentLoaders["physics-sandbox"]()).rejects.toThrow(
      "模块尚未实现：physics-sandbox",
    );
  });
});

describe("实验运行时", () => {
  it("根据视口、页面可见性和尺寸变化管理控制器", async () => {
    vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
    const controller = createController();
    const module: ExperimentModule = { mount: vi.fn(() => controller) };
    const runtime = createExperimentRuntime(createShell(), async () => module);

    await runtime.start();
    const observer = IntersectionObserverStub.instances[0];
    observer.setVisible(false);
    observer.setVisible(true);
    window.dispatchEvent(new Event("resize"));

    expect(controller.pause).toHaveBeenCalledTimes(1);
    expect(controller.resume).toHaveBeenCalledTimes(1);
    expect(controller.resize).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(controller.pause).toHaveBeenCalledTimes(2);
  });

  it("重复重试先清理旧控制器，pagehide 再完整清理", async () => {
    vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
    const first = createController();
    const second = createController();
    const loader = vi
      .fn<() => Promise<ExperimentModule>>()
      .mockResolvedValueOnce({ mount: () => first })
      .mockResolvedValueOnce({ mount: () => second });
    const runtime = createExperimentRuntime(createShell(), loader);

    await runtime.start();
    await runtime.retry();
    expect(first.dispose).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("pagehide"));
    expect(second.dispose).toHaveBeenCalledTimes(1);
  });

  it("重试取代尚未完成的启动且不覆盖新控制器", async () => {
    vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
    const stale = createController();
    const current = createController();
    let finishStaleMount!: () => void;
    let staleMountStarted!: () => void;
    const staleMountDidStart = new Promise<void>((resolve) => {
      staleMountStarted = resolve;
    });
    const staleMountCanFinish = new Promise<void>((resolve) => {
      finishStaleMount = resolve;
    });
    const loader = vi
      .fn<() => Promise<ExperimentModule>>()
      .mockResolvedValueOnce({
        mount: async () => {
          staleMountStarted();
          await staleMountCanFinish;
          return stale;
        },
      })
      .mockResolvedValueOnce({ mount: () => current });
    const runtime = createExperimentRuntime(createShell(), loader);

    const staleStart = runtime.start();
    await staleMountDidStart;
    await runtime.retry();
    finishStaleMount();
    await staleStart;

    expect(stale.dispose).toHaveBeenCalledTimes(1);
    expect(current.dispose).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("pagehide"));
    expect(current.dispose).toHaveBeenCalledTimes(1);
  });

  it("加载失败展示可重试错误状态", async () => {
    vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
    const shell = createShell();
    const runtime = createExperimentRuntime(shell, async () => {
      throw new Error("模块尚未实现");
    });

    await runtime.start();

    expect(shell.dataset.state).toBe("error");
    expect(
      shell.querySelector("[data-experiment-status]")?.textContent,
    ).toContain("实验未能启动");
    expect(
      shell.querySelector<HTMLButtonElement>("[data-experiment-retry]")?.hidden,
    ).toBe(false);
  });
});
