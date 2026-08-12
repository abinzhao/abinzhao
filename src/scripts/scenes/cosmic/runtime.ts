import { getCosmicSceneConfig } from "./config";
import { createCosmicScene } from "./scene";
import type { CosmicSceneController } from "./scene";
import type { CosmicVariant } from "./types";

export async function mountCosmicScene(root: HTMLElement): Promise<void> {
  const canvas = root.querySelector<HTMLCanvasElement>("[data-cosmic-canvas]");
  const reducedMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  if (!canvas || reducedMotion) {
    canvas?.remove();
    root.dataset.sceneState = "static";
    return;
  }

  let disposed = false;
  let contextLost = false;
  let controller: CosmicSceneController | undefined;

  const onContextLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    controller?.pause();
    root.dataset.sceneState = "fallback";
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener("webglcontextlost", onContextLost);
    window.removeEventListener("pagehide", dispose);
    document.removeEventListener("astro:before-swap", dispose);
    controller?.dispose();
  };

  canvas.addEventListener("webglcontextlost", onContextLost);
  window.addEventListener("pagehide", dispose, { once: true });
  document.addEventListener("astro:before-swap", dispose, { once: true });

  try {
    const variant = root.dataset.cosmicVariant as CosmicVariant;
    controller = await createCosmicScene({
      root,
      canvas,
      config: getCosmicSceneConfig(variant),
    });
    if (disposed || !root.isConnected) {
      controller.dispose();
      return;
    }
    if (contextLost) {
      controller.pause();
      root.dataset.sceneState = "fallback";
      return;
    }
    root.dataset.sceneState = "ready";
  } catch (error) {
    controller?.dispose();
    canvas.remove();
    root.dataset.sceneState = "fallback";
    console.warn("Cosmic scene initialization failed; using fallback.", error);
  }
}
