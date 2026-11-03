import { createParticles, createFixedStepper, stepParticles } from '../../../../examples/site-labs/particle-model';
import { sizeCanvas, type LabRenderer, type RenderInput } from './renderer-types';
import { createGPUParticles } from './particle-gpu';

export async function createParticleRenderer(mount: HTMLElement, count: number, signal: AbortSignal, lost: (message: string) => void): Promise<LabRenderer> {
  let canvas = document.createElement('canvas');
  try {
    const renderer = await createGPUParticles(canvas, count, signal, lost);
    if (signal.aborted) { renderer.destroy(); throw new Error('启动已取消'); }
    mount.append(canvas);
    return renderer;
  } catch (error) {
    if (signal.aborted) throw error;
    // 一个 canvas 不能在 WebGPU 初始化失败后切换 context 类型。
    canvas = document.createElement('canvas');
  }
  const context = canvas.getContext('2d');
  if (!context) throw new Error('图形上下文不可用，保留静态预览。');
  let data = createParticles(Math.min(count, 1024));
  let input: RenderInput; let disposed = false;
  const fixed = createFixedStepper((dt, time) => stepParticles(data, dt, time, input));
  mount.append(canvas);
  return {
    backend: 'Canvas2D', canvas, maxCount: 1024,
    resize: (width, height, dpr) => sizeCanvas(canvas, width, height, dpr),
    reset(next) { data = createParticles(Math.min(next, 1024)); fixed.reset(); },
    destroy() { disposed = true; canvas.remove(); },
    draw(delta, next) {
      if (disposed) return;
      input = next; fixed.advance(delta);
      const { width, height } = canvas;
      context.clearRect(0, 0, width, height);
      const accent = input.accent.map((value) => Math.round(value * 255));
      for (let i = 0; i < data.length; i += 8) {
        context.fillStyle = data[i + 6] > .85 ? input.dark ? '#f4b36c' : '#97501e' : `rgb(${accent.join(',')})`;
        context.globalAlpha = .5 + data[i + 6] * .45;
        context.beginPath();
        context.arc(width / 2 + data[i] * height / 2, height / 2 - data[i + 1] * height / 2, .8 + data[i + 6] * .8, 0, Math.PI * 2);
        context.fill();
      }
    },
  };
}
