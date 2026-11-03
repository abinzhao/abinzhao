import type { ParticleInput } from '../../../../examples/site-labs/particle-model';
export interface RenderInput extends ParticleInput {
  material: number;
  roughness: number;
  dark: boolean;
  accent: [number, number, number];
}
export interface LabRenderer {
  backend: 'WebGPU' | 'Canvas2D' | 'WebGL2';
  canvas: HTMLCanvasElement;
  maxCount: number;
  draw(delta: number, input: RenderInput): void;
  resize(width: number, height: number, dpr: number): void;
  reset(count: number): void;
  destroy(): void;
}
export function sizeCanvas(canvas: HTMLCanvasElement, width: number, height: number, dpr: number) {
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
}
