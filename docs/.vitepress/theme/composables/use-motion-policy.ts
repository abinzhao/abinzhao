import { computed, inject, onBeforeUnmount, onMounted, provide, ref, watch, type InjectionKey } from 'vue';
import { createWorkloadGate, resolveMotionPolicy, resolveMotionPreference, type MotionPreference } from './motion-policy';

export const MOTION_STORAGE_KEY = 'abin-lab-motion';
const key: InjectionKey<ReturnType<typeof createMotionPolicy>> = Symbol('motion-policy');

function createMotionPolicy() {
  const preference = ref<MotionPreference>('auto');
  const reduced = ref(true);
  const constrained = ref(false);
  const visible = ref(true);
  const policy = computed(() => resolveMotionPolicy(preference.value, reduced.value, constrained.value));
  const gate = createWorkloadGate();
  const cleanups: Array<() => void> = [];
  const setPreference = (value: MotionPreference) => {
    preference.value = value;
    try { localStorage.setItem(MOTION_STORAGE_KEY, value); } catch { /* 本次会话仍可使用设置。 */ }
  };
  onMounted(() => {
    try { preference.value = resolveMotionPreference(localStorage.getItem(MOTION_STORAGE_KEY)); } catch { /* 自动档。 */ }
    const reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');
    const coarseQuery = matchMedia('(pointer: coarse)');
    const update = () => {
      reduced.value = reduceQuery.matches;
      constrained.value = coarseQuery.matches || navigator.hardwareConcurrency <= 4;
      visible.value = document.visibilityState === 'visible';
    };
    const storage = (event: StorageEvent) => {
      if (event.key === MOTION_STORAGE_KEY || event.key === null) preference.value = resolveMotionPreference(event.newValue);
    };
    for (const query of [reduceQuery, coarseQuery]) {
      query.addEventListener('change', update);
      cleanups.push(() => query.removeEventListener('change', update));
    }
    document.addEventListener('visibilitychange', update);
    window.addEventListener('storage', storage);
    cleanups.push(() => document.removeEventListener('visibilitychange', update), () => window.removeEventListener('storage', storage));
    update();
    cleanups.push(watch(policy, (value) => {
      document.documentElement.dataset.motion = value.motion ? 'full' : 'static';
    }, { immediate: true }));
  });
  watch([policy, visible], ([value, isVisible]) => {
    if (!value.motion || !isVisible) gate.cancelActive();
  });
  onBeforeUnmount(() => { gate.cancelActive(); cleanups.forEach((cleanup) => cleanup()); });
  return { preference, policy, visible, gate, setPreference };
}

export function provideMotionPolicy() {
  const context = createMotionPolicy();
  provide(key, context);
  return context;
}

export function useMotionPolicy() {
  const context = inject(key);
  if (!context) throw new Error('Motion policy requires the site layout');
  return context;
}
