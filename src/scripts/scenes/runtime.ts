export interface ExperimentController {
  pause(): void;
  resume(): void;
  resize(): void;
  reset(): void;
  dispose(): void;
}

export interface ExperimentModule {
  mount(
    canvas: HTMLCanvasElement,
    controls: HTMLElement,
  ): Promise<ExperimentController> | ExperimentController;
}

export type ExperimentLoader = () => Promise<ExperimentModule>;

export interface ExperimentRuntime {
  start(): Promise<void>;
  retry(): Promise<void>;
  dispose(): void;
}

const statusMessages = {
  loading: "正在连接实验模块…",
  ready: "实验运行中",
  paused: "实验已暂停",
  error: "实验未能启动。你可以重试，或稍后返回。",
} as const;

export function createExperimentRuntime(
  shell: HTMLElement,
  loader: ExperimentLoader,
): ExperimentRuntime {
  const canvas = shell.querySelector<HTMLCanvasElement>(
    "[data-experiment-canvas]",
  );
  const controls = shell.querySelector<HTMLElement>(
    "[data-experiment-controls]",
  );
  const status = shell.querySelector<HTMLElement>("[data-experiment-status]");
  const retryButton = shell.querySelector<HTMLButtonElement>(
    "[data-experiment-retry]",
  );
  const actionButtons = Array.from(
    shell.querySelectorAll<HTMLButtonElement>("[data-experiment-action]"),
  );

  if (!canvas || !controls || !status || !retryButton) {
    throw new Error("实验容器结构不完整");
  }

  const retryControl = retryButton;
  const reducedMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  let controller: ExperimentController | null = null;
  let disposed = false;
  let inViewport = true;
  let manuallyPaused = false;
  let loadAttempt = 0;

  const setState = (state: keyof typeof statusMessages) => {
    shell.dataset.state = state;
    status.textContent = statusMessages[state];
    retryControl.hidden = state !== "error";
    for (const button of actionButtons) {
      button.disabled = state !== "ready" && state !== "paused";
    }
  };

  const disposeController = () => {
    controller?.dispose();
    controller = null;
  };

  const syncPlayback = () => {
    if (!controller) return;

    const shouldPause =
      reducedMotion ||
      manuallyPaused ||
      !inViewport ||
      document.visibilityState === "hidden";

    if (shouldPause) {
      controller.pause();
      setState("paused");
    } else {
      controller.resume();
      setState("ready");
    }
  };

  const start = async () => {
    if (disposed) return;

    const attempt = ++loadAttempt;
    setState("loading");

    try {
      const experiment = await loader();
      if (disposed || attempt !== loadAttempt) return;

      const mountedController = await experiment.mount(canvas, controls);
      if (disposed || attempt !== loadAttempt) {
        mountedController.dispose();
        return;
      }

      controller = mountedController;
      setState("ready");
      if (
        reducedMotion ||
        manuallyPaused ||
        !inViewport ||
        document.visibilityState === "hidden"
      ) {
        syncPlayback();
      }
    } catch {
      if (!disposed && attempt === loadAttempt) {
        controller = null;
        setState("error");
      }
    }
  };

  const retry = async () => {
    disposeController();
    manuallyPaused = false;
    await start();
  };

  const onAction = (event: Event) => {
    const button = event.currentTarget as HTMLButtonElement;

    switch (button.dataset.experimentAction) {
      case "pause":
        manuallyPaused = true;
        syncPlayback();
        break;
      case "resume":
        manuallyPaused = false;
        syncPlayback();
        break;
      case "reset":
        controller?.reset();
        break;
    }
  };

  const onResize = () => controller?.resize();
  const onVisibilityChange = () => syncPlayback();
  const observer = new IntersectionObserver(([entry]) => {
    inViewport = entry?.isIntersecting ?? false;
    syncPlayback();
  });

  observer.observe(shell);
  window.addEventListener("resize", onResize);
  window.addEventListener("pagehide", dispose);
  document.addEventListener("visibilitychange", onVisibilityChange);
  retryControl.addEventListener("click", retry);
  for (const button of actionButtons) {
    button.addEventListener("click", onAction);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    loadAttempt += 1;
    observer.disconnect();
    window.removeEventListener("resize", onResize);
    window.removeEventListener("pagehide", dispose);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    retryControl.removeEventListener("click", retry);
    for (const button of actionButtons) {
      button.removeEventListener("click", onAction);
    }
    disposeController();
  }

  return { start, retry, dispose };
}
