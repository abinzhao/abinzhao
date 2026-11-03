import { inject, onBeforeUnmount, provide, type InjectionKey } from 'vue';

type TransitionKind = 'theme' | 'page';
interface TransitionHandle {
  ready: Promise<void>;
  finished: Promise<void>;
  updateCallbackDone: Promise<void>;
  skipTransition(): void;
}
const key: InjectionKey<ReturnType<typeof provideSharedTransition>> = Symbol('shared-transition');

/** 路由和主题共享一个过渡槽；新输入取消旧画面，不排队等待动画。 */
export function provideSharedTransition() {
  let active: TransitionHandle | undefined;
  let generation = 0;
  const cancel = () => {
    generation++;
    active?.skipTransition();
    active = undefined;
    if (typeof document !== 'undefined') delete document.documentElement.dataset.transition;
  };
  const run = async (update: () => void | Promise<void>, kind: TransitionKind, origin?: { x: number; y: number }) => {
    cancel();
    const ticket = generation;
    const root = document.documentElement;
    const start = document.startViewTransition?.bind(document);
    if (!start || root.dataset.motion === 'static' || document.visibilityState !== 'visible') {
      await update();
      return;
    }
    root.dataset.transition = kind;
    let applied = false;
    const commit = async () => {
      // 取消的是视觉快照，不能丢掉最终主题或导航；过期导航由路由意图序号拦截。
      if (applied) return;
      applied = true;
      await update();
    };
    try {
      const transition = start(commit);
      active = transition;
      // ready 在过渡被跳过时会拒绝；更新仍由浏览器执行。
      void transition.ready.then(() => {
        if (ticket !== generation || kind !== 'theme' || !origin) return;
        const radius = Math.hypot(Math.max(origin.x, innerWidth - origin.x), Math.max(origin.y, innerHeight - origin.y));
        root.animate({
          clipPath: [`circle(0px at ${origin.x}px ${origin.y}px)`, `circle(${radius}px at ${origin.x}px ${origin.y}px)`],
        }, { duration: 260, easing: 'ease-out', pseudoElement: '::view-transition-new(root)' });
      }).catch(() => {});
      await transition.updateCallbackDone;
      void transition.finished.catch(() => {}).finally(() => {
        if (ticket === generation) { active = undefined; delete root.dataset.transition; }
      });
      return transition;
    } catch {
      await commit();
      if (ticket === generation) { active = undefined; delete root.dataset.transition; }
    }
  };
  const context = { run, cancel };
  provide(key, context);
  onBeforeUnmount(cancel);
  return context;
}

export function useSharedTransition() {
  const context = inject(key);
  if (!context) throw new Error('Shared transitions require the site layout');
  return context;
}
