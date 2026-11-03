import { createFixedStepper, createParticles } from '../../../../examples/site-labs/particle-model';
import computeCode from '../../../../examples/site-labs/particle.wgsl?raw';
import renderCode from '../../../../examples/site-labs/particle-render.wgsl?raw';
import { bufferUsage, type GPUApi, type GPUCanvas, type BufferHandle, type DeviceHandle } from './gpu-api';
import { sizeCanvas, type LabRenderer, type RenderInput } from './renderer-types';

export async function createGPUParticles(canvas: HTMLCanvasElement, count: number, signal: AbortSignal, lost: (message: string) => void): Promise<LabRenderer> {
  const gpu = (navigator as Navigator & { gpu?: GPUApi }).gpu;
  if (!isSecureContext || !gpu) throw new Error('WebGPU 不可用');
  const adapter = await gpu.requestAdapter({ powerPreference: 'low-power' });
  if (!adapter || signal.aborted) throw new Error('WebGPU adapter 不可用');
  let device: DeviceHandle | undefined;
  let context: GPUCanvas | undefined;
  let particles: BufferHandle | undefined;
  let uniform: BufferHandle | undefined;
  let disposed = false;
  const destroy = () => {
    if (disposed) return;
    disposed = true; signal.removeEventListener('abort', destroy);
    particles?.destroy(); uniform?.destroy(); context?.unconfigure(); device?.destroy();
  };
  try {
    device = await adapter.requestDevice();
    if (signal.aborted) { destroy(); throw new Error('启动已取消'); }
    signal.addEventListener('abort', destroy, { once: true });
    context = canvas.getContext('webgpu') as unknown as GPUCanvas;
    if (!context) throw new Error('WebGPU canvas 不可用');
    const format = gpu.getPreferredCanvasFormat();
    const activeDevice = device;
    context.configure({ device, format, alphaMode: 'premultiplied' });
    device.pushErrorScope('validation');
    const compute = await device.createComputePipelineAsync({
      layout: 'auto', compute: { module: device.createShaderModule({ code: computeCode }), entryPoint: 'update' },
    });
    const shader = device.createShaderModule({ code: renderCode });
    const render = await device.createRenderPipelineAsync({
      layout: 'auto', vertex: { module: shader, entryPoint: 'vertex' },
      fragment: { module: shader, entryPoint: 'fragment', targets: [{ format, blend: {
        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
      } }] }, primitive: { topology: 'triangle-list' },
    });
    const validation = await device.popErrorScope();
    if (validation) throw new Error(validation.message);
    if (disposed) throw new Error('启动已取消');
    uniform = device.createBuffer({ size: 64, usage: bufferUsage.UNIFORM | bufferUsage.COPY_DST });
    let computeGroup: unknown; let renderGroup: unknown;
    const values = new Float32Array(16);
    let currentInput: RenderInput;
    let time = 0;
    const writeUniform = (dt: number) => {
      values.set([dt, time, currentInput.mode, count, currentInput.x, currentInput.y, Number(currentInput.active), currentInput.speed, canvas.width / canvas.height, 2.8 / canvas.height, Number(currentInput.dark), 0, ...currentInput.accent, 0]);
      activeDevice.queue.writeBuffer(uniform!, 0, values);
    };
    const fixed = createFixedStepper((dt, elapsed) => {
      time = elapsed; writeUniform(dt);
      const encoder = activeDevice.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(compute); pass.setBindGroup(0, computeGroup); pass.dispatchWorkgroups(Math.ceil(count / 64)); pass.end();
      activeDevice.queue.submit([encoder.finish()]);
    });
    const reset = (next: number) => {
      count = Math.min(8192, next); time = 0; fixed.reset(); particles?.destroy();
      const data = createParticles(count);
      particles = activeDevice.createBuffer({ size: data.byteLength, usage: bufferUsage.STORAGE | bufferUsage.COPY_DST });
      activeDevice.queue.writeBuffer(particles, 0, data);
      const entries = [{ binding: 0, resource: { buffer: particles } }, { binding: 1, resource: { buffer: uniform } }];
      computeGroup = activeDevice.createBindGroup({ layout: compute.getBindGroupLayout(0), entries });
      renderGroup = activeDevice.createBindGroup({ layout: render.getBindGroupLayout(0), entries });
    };
    reset(count);
    void device.lost.then((info) => { if (!disposed) { destroy(); lost(`WebGPU 设备已失去连接（${info.reason}）。可重新初始化。`); } });
    return {
      backend: 'WebGPU', canvas, maxCount: 8192,
      resize: (width, height, dpr) => sizeCanvas(canvas, width, height, dpr),
      reset, destroy,
      draw(delta, input) {
        if (disposed) return;
        currentInput = input; fixed.advance(delta); writeUniform(0);
        const encoder = activeDevice.createCommandEncoder();
        const pass = encoder.beginRenderPass({ colorAttachments: [{ view: context!.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }] });
        pass.setPipeline(render); pass.setBindGroup(0, renderGroup); pass.draw(6, count); pass.end();
        activeDevice.queue.submit([encoder.finish()]);
      },
    };
  } catch (error) { destroy(); throw error; }
}
