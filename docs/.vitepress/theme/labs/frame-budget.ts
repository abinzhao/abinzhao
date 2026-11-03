/** 使用原始 rAF 时间检查两秒平均帧率；暂停需重置，模拟步长不能代替帧间隔。 */
export function createFrameBudget() {
  let start: number | undefined;
  let frames = 0;
  return {
    reset() { start = undefined; frames = 0; },
    observe(time: number, dpr: number): 'lower' | 'static' | undefined {
      if (start === undefined) { start = time; return; }
      frames++;
      const elapsed = time - start;
      if (elapsed < 2000) return;
      const slow = frames * 1000 / elapsed < 50;
      start = time; frames = 0;
      if (slow) return dpr > .75 ? 'lower' : 'static';
    },
  };
}
