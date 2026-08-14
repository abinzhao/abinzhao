export function initPointerEffects(root: Document = document): void {
  const html = root.documentElement;
  const ring = root.querySelector<HTMLElement>("[data-pointer-ring]");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (!ring || !finePointer.matches || reducedMotion.matches) {
    return;
  }
  if (ring.dataset.ready === "true") {
    return;
  }
  ring.dataset.ready = "true";

  let targetX = window.innerWidth / 2;
  let targetY = window.innerHeight / 2;
  let currentX = targetX;
  let currentY = targetY;
  let frame = 0;

  const render = (): void => {
    currentX += (targetX - currentX) * 0.18;
    currentY += (targetY - currentY) * 0.18;
    ring.style.translate = `${currentX}px ${currentY}px`;
    frame = window.requestAnimationFrame(render);
  };

  const handlePointerMove = (event: PointerEvent): void => {
    targetX = event.clientX;
    targetY = event.clientY;
    html.style.setProperty("--pointer-x", `${targetX}px`);
    html.style.setProperty("--pointer-y", `${targetY}px`);
  };

  const setInteractive = (active: boolean): void => {
    ring.dataset.interactive = String(active);
  };

  const handlePointerOver = (event: PointerEvent): void => {
    const target = event.target;
    setInteractive(
      target instanceof Element &&
        Boolean(target.closest("a, button, input, textarea, [data-tilt]")),
    );
  };

  const handleTilt = (event: PointerEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const surface = target.closest<HTMLElement>("[data-tilt]");
    if (!surface) return;
    const bounds = surface.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    surface.style.setProperty("--tilt-x", `${y * -2.4}deg`);
    surface.style.setProperty("--tilt-y", `${x * 3.2}deg`);
  };

  const resetTilt = (event: PointerEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const surface = target.closest<HTMLElement>("[data-tilt]");
    surface?.style.removeProperty("--tilt-x");
    surface?.style.removeProperty("--tilt-y");
  };

  const dispose = (): void => {
    window.cancelAnimationFrame(frame);
    root.removeEventListener("pointermove", handlePointerMove);
    root.removeEventListener("pointerover", handlePointerOver);
    root.removeEventListener("pointermove", handleTilt);
    root.removeEventListener("pointerout", resetTilt);
    ring.dataset.ready = "false";
  };

  root.addEventListener("pointermove", handlePointerMove, { passive: true });
  root.addEventListener("pointerover", handlePointerOver, { passive: true });
  root.addEventListener("pointermove", handleTilt, { passive: true });
  root.addEventListener("pointerout", resetTilt, { passive: true });
  root.addEventListener("astro:before-swap", dispose, { once: true });
  frame = window.requestAnimationFrame(render);
}
