import type { ObjectDirective } from 'vue';

const cleanups = new WeakMap<HTMLElement, () => void>();

/** 只移动图标或显式内层，链接命中区与焦点框始终静止。 */
export const vMagnetic: ObjectDirective<HTMLElement> = {
  mounted(element) {
    const inner = element.querySelector<HTMLElement | SVGElement>('[data-magnetic-inner], svg');
    if (!inner) return;
    let animation: Animation | undefined;
    const enabled = () => document.documentElement.dataset.motion !== 'static' && matchMedia('(pointer: fine)').matches;
    const move = (event: PointerEvent) => {
      if (!enabled() || event.pointerType !== 'mouse' || window.getSelection()?.toString()) return;
      const rect = element.getBoundingClientRect();
      const x = Math.max(-5, Math.min(5, (event.clientX - rect.x - rect.width / 2) * .08));
      const y = Math.max(-5, Math.min(5, (event.clientY - rect.y - rect.height / 2) * .12));
      animation?.cancel();
      inner.style.transform = `translate(${x}px, ${y}px)`;
    };
    const reset = () => {
      const from = getComputedStyle(inner).transform;
      animation?.cancel();
      inner.style.transform = '';
      if (enabled()) animation = inner.animate([{ transform: from }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,1.4,.4,1)' });
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerleave', reset);
    element.addEventListener('blur', reset);
    cleanups.set(element, () => {
      animation?.cancel();
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerleave', reset);
      element.removeEventListener('blur', reset);
      inner.style.transform = '';
    });
  },
  beforeUnmount(element) { cleanups.get(element)?.(); cleanups.delete(element); },
  getSSRProps() { return {}; },
};
