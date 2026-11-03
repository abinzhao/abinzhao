export type MotionPreference = 'auto' | 'minimal' | 'full';
export type MotionQuality = 'static' | 'low' | 'high';

export function resolveMotionPreference(value: unknown): MotionPreference {
  return value === 'minimal' || value === 'full' ? value : 'auto';
}

export function resolveMotionPolicy(
  preference: MotionPreference,
  reducedMotion: boolean,
  constrained: boolean,
): { motion: boolean; quality: MotionQuality } {
  if (reducedMotion || preference === 'minimal') return { motion: false, quality: 'static' };
  return { motion: true, quality: constrained ? 'low' : 'high' };
}

/** 暂停后不累计后台时间；销毁是终态，异步回调不能重新唤醒实例。 */
export function createFrameLoop(
  draw: (deltaSeconds: number, time: number) => void,
  scheduler = {
    request: (callback: FrameRequestCallback) => requestAnimationFrame(callback),
    cancel: (id: number) => cancelAnimationFrame(id),
  },
) {
  let frame: number | undefined;
  let previous: number | undefined;
  let running = false;
  let disposed = false;
  const tick: FrameRequestCallback = (time) => {
    frame = undefined;
    if (!running || disposed) return;
    const delta = previous === undefined ? 0 : Math.min(Math.max((time - previous) / 1000, 0), 0.05);
    previous = time;
    draw(delta, time);
    if (running && !disposed) frame = scheduler.request(tick);
  };
  const pause = () => {
    running = false;
    if (frame !== undefined) scheduler.cancel(frame);
    frame = undefined;
    previous = undefined;
  };
  return {
    resume() {
      if (disposed || running) return;
      running = true;
      frame = scheduler.request(tick);
    },
    pause,
    dispose() { pause(); disposed = true; },
  };
}

/** 最新一次明确启动独占重任务；旧租约释放不能撤销新实例。 */
export function createWorkloadGate() {
  let blocked = false;
  let active: { suspend: () => void } | undefined;
  const cancelActive = () => {
    const previous = active;
    active = undefined;
    previous?.suspend();
  };
  return {
    acquire(suspend: () => void): (() => void) | null {
      if (blocked) return null;
      cancelActive();
      const lease = { suspend };
      active = lease;
      return () => { if (active === lease) active = undefined; };
    },
    cancelActive,
    block(value: boolean) {
      blocked = value;
      if (value) cancelActive();
    },
  };
}
