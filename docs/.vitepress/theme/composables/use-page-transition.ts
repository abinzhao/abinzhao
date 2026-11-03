import { nextTick, onBeforeUnmount, onMounted } from 'vue';
import { useRouter } from 'vitepress';
import { useMotionPolicy } from './use-motion-policy';
import { useSharedTransition } from './use-shared-transition';

/** 仅包装 VitePress 的公开导航钩子；加载、URL 与历史条目仍由原路由器提交。 */
export function usePageTransition(motion: ReturnType<typeof useMotionPolicy>, transitions: ReturnType<typeof useSharedTransition>) {
  const router = useRouter();
  const previous = {
    beforeRoute: router.onBeforeRouteChange,
    beforeLoad: router.onBeforePageLoad,
    afterRoute: router.onAfterRouteChange,
  };
  let intent = 0;
  let bypass: string | undefined;
  let transactionHref: string | undefined;
  let expectedHref = '';
  let restoreScroll: number | undefined;
  let mountedPath = '';
  let resolveView: (() => void) | undefined;
  let viewPromise = Promise.resolve();
  let sharedId = '';
  let named: HTMLElement[] = [];
  let focusFrame = 0;
  let disposed = false;
  const clearNames = () => { named.forEach((element) => element.style.removeProperty('view-transition-name')); named = []; };
  function nameElements() {
    clearNames();
    if (!sharedId) return;
    for (const [attribute, name] of [['data-shared-id', 'lab-title'], ['data-shared-preview', 'lab-preview']]) {
      // 一个页面可以有多个相同身份的入口，快照只选一个可见元素，避免同名冲突。
      const element = Array.from(document.querySelectorAll<HTMLElement>(`[${attribute}]`)).find((node) => node.getAttribute(attribute) === sharedId && node.getBoundingClientRect().width > 0);
      if (element) { element.style.viewTransitionName = name; named.push(element); }
    }
  }
  function prepare(href: string, fromHistory: boolean) {
    resolveView?.();
    expectedHref = href;
    restoreScroll = fromHistory ? history.state?.scrollPosition ?? 0 : undefined;
    viewPromise = new Promise<void>((resolve) => { resolveView = resolve; });
    motion.gate.cancelActive();
    cancelAnimationFrame(focusFrame);
  }
  async function navigate(href: string) {
    const ticket = ++intent;
    transitions.cancel();
    sharedId = '';
    const target = new URL(href, location.href);
    const link = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[data-shared-id]')).find((node) => new URL(node.href).pathname === target.pathname);
    sharedId = link?.dataset.sharedId ?? document.querySelector<HTMLElement>('.lab-heading h1')?.dataset.sharedId ?? '';
    nameElements();
    try {
      const transition = await transitions.run(async () => {
        if (ticket !== intent || disposed) return;
        transactionHref = href;
        bypass = href;
        await router.go(href);
        await nextTick();
        if (ticket === intent && mountedPath !== router.route.path) await viewPromise;
      }, 'page');
      void (transition?.finished ?? Promise.resolve()).catch(() => {}).finally(() => {
        if (ticket === intent) clearNames();
      });
    } finally {
      if (ticket === intent) {
        transactionHref = undefined;
      }
    }
  }
  const beforeRoute: NonNullable<typeof router.onBeforeRouteChange> = async (href) => {
    if (bypass === href) { bypass = undefined; return; }
    if (await previous.beforeRoute?.(href) === false) return false;
    void navigate(href);
    return false;
  };
  const beforeLoad: NonNullable<typeof router.onBeforePageLoad> = async (href) => {
    if (await previous.beforeLoad?.(href) === false) return false;
    const fromHistory = transactionHref !== href;
    if (fromHistory) { intent++; transitions.cancel(); clearNames(); sharedId = ''; }
    prepare(href, fromHistory);
  };
  const afterRoute: NonNullable<typeof router.onAfterRouteChange> = async (href) => {
    await previous.afterRoute?.(href);
    // 同页 hash 导航不重新挂载组件。
    if (mountedPath === router.route.path && expectedHref === href) viewReady();
  };
  function viewReady() {
    if (typeof window === 'undefined') return;
    mountedPath = router.route.path;
    nameElements();
    resolveView?.(); resolveView = undefined;
    if (!expectedHref) return;
    const href = expectedHref;
    const scroll = restoreScroll;
    cancelAnimationFrame(focusFrame);
    focusFrame = requestAnimationFrame(() => {
      if (href !== expectedHref || disposed) return;
      expectedHref = '';
      document.getElementById('page-content')?.focus({ preventScroll: true });
      const url = new URL(href, location.href);
      if (scroll !== undefined && scroll > 0) window.scrollTo({ top: scroll, behavior: 'instant' });
      else if (url.hash) {
        try {
          const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
          if (target) window.scrollTo({ top: window.scrollY + target.getBoundingClientRect().top - 88 + parseInt(getComputedStyle(target).paddingTop || '0', 10), behavior: 'instant' });
        } catch { /* 非法 hash 保留普通页面。 */ }
      } else if (scroll !== undefined) window.scrollTo({ top: scroll, behavior: 'instant' });
    });
  }
  onMounted(() => {
    mountedPath = router.route.path;
    router.onBeforeRouteChange = beforeRoute;
    router.onBeforePageLoad = beforeLoad;
    router.onAfterRouteChange = afterRoute;
  });
  onBeforeUnmount(() => {
    disposed = true; intent++; resolveView?.(); transitions.cancel(); clearNames(); cancelAnimationFrame(focusFrame);
    router.onBeforeRouteChange = previous.beforeRoute;
    router.onBeforePageLoad = previous.beforeLoad;
    router.onAfterRouteChange = previous.afterRoute;
  });
  return { viewReady };
}
