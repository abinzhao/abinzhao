import { nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref, type WatchSource } from 'vue';
import { useMotionPolicy } from './use-motion-policy';

/** 在 Vue 提交前采样当前视觉位置；新输入从中断位置重新计算，DOM 顺序立即生效。 */
export function useFlip(root: Ref<HTMLElement | undefined>, source: WatchSource, selector: string, lostFocus?: () => void) {
  const motion = useMotionPolicy();
  const moving = ref(false);
  const animations = new Set<Animation>();
  let generation = 0;
  const cancel = () => {
    generation++;
    for (const animation of animations) animation.cancel();
    animations.clear();
    moving.value = false;
  };
  watch(source, async () => {
    if (!root.value) return;
    const focused = root.value.contains(document.activeElement) ? document.activeElement : null;
    const before = new Map(Array.from(root.value.querySelectorAll<HTMLElement>(selector), (element) => [element.dataset.flip!, element.getBoundingClientRect()]));
    cancel();
    const ticket = generation;
    await nextTick();
    if (ticket !== generation || !root.value) return;
    if (focused && !focused.isConnected) lostFocus?.();
    if (!motion.policy.value.motion || !motion.visible.value || typeof Element.prototype.animate !== 'function') return;
    const after = Array.from(root.value.querySelectorAll<HTMLElement>(selector), (element) => ({ element, bounds: element.getBoundingClientRect() }));
    for (const { element, bounds } of after) {
      const previous = before.get(element.dataset.flip!);
      const dx = previous ? previous.left - bounds.left : 0;
      const dy = previous ? previous.top - bounds.top : 0;
      if (previous && Math.abs(dx) < .5 && Math.abs(dy) < .5) continue;
      const animation = element.animate(previous
        ? [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }]
        : [{ opacity: 0 }, { opacity: 1 }],
      { duration: 280, easing: 'cubic-bezier(.22,.8,.24,1)' });
      animations.add(animation);
      void animation.finished.catch(() => {}).finally(() => {
        animations.delete(animation);
        if (ticket === generation && !animations.size) moving.value = false;
      });
    }
    moving.value = animations.size > 0;
  }, { flush: 'pre' });
  watch([motion.policy, motion.visible], ([policy, visible]) => { if (!policy.motion || !visible) cancel(); });
  onMounted(() => window.addEventListener('resize', cancel));
  onBeforeUnmount(() => { cancel(); window.removeEventListener('resize', cancel); });
  return { moving, cancel };
}
