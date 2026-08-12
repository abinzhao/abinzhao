import { getHomeSceneState } from "./scenes/cosmic/home-timeline";

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
  const heroCopy = hero.querySelector<HTMLElement>("[data-hero-copy]");
  const galaxyCopy = hero.querySelector<HTMLElement>("[data-galaxy-copy]");
  const cosmicCards = hero.querySelector<HTMLElement>("[data-cosmic-cards]");
  if (!visual || !heroCopy || !galaxyCopy || !cosmicCards) return;

  const updateProgress = (progress: number) => {
    const settledProgress = progress > 0.98 ? 1 : progress;
    const state = getHomeSceneState(settledProgress);
    heroCopy.style.opacity = String(state.heroOpacity);
    heroCopy.style.transform = `translate3d(0, ${state.eased * -2.5}rem, 0)`;
    galaxyCopy.style.opacity = String(state.galaxyCopyOpacity);
    galaxyCopy.style.transform = `translate3d(0, ${(1 - state.galaxyCopyOpacity) * 2}rem, 0)`;
    cosmicCards.style.opacity = String(state.cardsOpacity);
    cosmicCards.style.transform = `translate3d(0, ${(1 - state.cardsOpacity) * 2}rem, 0)`;
    cosmicCards.style.pointerEvents = state.cardsOpacity > 0.95 ? "auto" : "none";
    window.dispatchEvent(
      new CustomEvent("cosmic:progress", {
        detail: { variant: "home", progress: state.progress },
      }),
    );
  };

  if (window.innerWidth < 1024) {
    const updateFromScroll = () => {
      const bounds = hero.getBoundingClientRect();
      const progress = Math.max(
        0,
        Math.min(1, -bounds.top / Math.max(bounds.height - window.innerHeight, 1)),
      );
      updateProgress(progress);
    };
    const dispose = () => {
      window.removeEventListener("scroll", updateFromScroll);
      window.removeEventListener("pagehide", dispose);
      document.removeEventListener("astro:before-swap", dispose);
    };

    window.addEventListener("scroll", updateFromScroll, { passive: true });
    window.addEventListener("pagehide", dispose, { once: true });
    document.addEventListener("astro:before-swap", dispose, { once: true });
    updateFromScroll();
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

  const timelineState = { progress: 0 };
  state.animation = gsap.to(timelineState, {
    progress: 1,
    ease: "none",
    scrollTrigger: {
      trigger: hero,
      start: "top top",
      end: "bottom bottom",
      scrub: 0.35,
      onUpdate: ({ progress }) => updateProgress(progress),
    },
  });
  updateProgress(0);

  return { dispose };
}
