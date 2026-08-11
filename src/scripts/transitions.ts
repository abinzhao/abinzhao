interface TransitionController {
  dispose: () => void;
}

export async function initHomeTransitions(
  hero: HTMLElement,
): Promise<TransitionController | undefined> {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const visual = hero.querySelector<HTMLElement>(".hero__visual");
  if (!visual) return;

  if (window.innerWidth < 1024) {
    const updateOpacity = () => {
      const bounds = hero.getBoundingClientRect();
      const progress = Math.max(
        0,
        Math.min(1, -bounds.top / Math.max(bounds.height * 0.7, 1)),
      );
      visual.style.setProperty(
        "--home-scene-opacity",
        String(1 - progress * 0.72),
      );
    };
    const dispose = () => {
      window.removeEventListener("scroll", updateOpacity);
      window.removeEventListener("pagehide", dispose);
      document.removeEventListener("astro:before-swap", dispose);
    };

    window.addEventListener("scroll", updateOpacity, { passive: true });
    window.addEventListener("pagehide", dispose, { once: true });
    document.addEventListener("astro:before-swap", dispose, { once: true });
    updateOpacity();
    return { dispose };
  }

  let disposed = false;
  const state: {
    animation?: {
      scrollTrigger?: { kill: () => void };
      kill: () => void;
    };
  } = {};
  const dispose = () => {
    disposed = true;
    state.animation?.scrollTrigger?.kill();
    state.animation?.kill();
    window.removeEventListener("pagehide", dispose);
    document.removeEventListener("astro:before-swap", dispose);
  };
  window.addEventListener("pagehide", dispose, { once: true });
  document.addEventListener("astro:before-swap", dispose, { once: true });

  let modules: [
    typeof import("gsap"),
    typeof import("gsap/ScrollTrigger"),
  ];
  try {
    modules = await Promise.all([
      import("gsap"),
      import("gsap/ScrollTrigger"),
    ]);
  } catch {
    dispose();
    return;
  }

  if (disposed || !hero.isConnected || !visual.isConnected) {
    dispose();
    return;
  }

  const [{ gsap }, { ScrollTrigger }] = modules;
  gsap.registerPlugin(ScrollTrigger);

  state.animation = gsap.to(visual, {
    scale: 1.055,
    opacity: 0.36,
    ease: "none",
    scrollTrigger: {
      trigger: hero,
      start: "top top",
      end: "bottom top",
      scrub: 0.35,
      onUpdate: ({ progress }) => {
        window.dispatchEvent(
          new CustomEvent<number>("hero:progress", { detail: progress }),
        );
      },
    },
  });

  return { dispose };
}
