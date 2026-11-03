/** 本实验用到的 WebGPU 结构子集；不扩展全局 DOM 类型，也不引入运行时 SDK。 */
type Descriptor = Record<string, unknown>;
export interface BufferHandle { destroy(): void }
interface Pipeline { getBindGroupLayout(index: number): unknown }
interface Pass {
  setPipeline(pipeline: Pipeline): void;
  setBindGroup(index: number, group: unknown): void;
  dispatchWorkgroups(count: number): void;
  draw(vertices: number, instances: number): void;
  end(): void;
}
interface Encoder {
  beginComputePass(): Pass;
  beginRenderPass(descriptor: Descriptor): Pass;
  finish(): unknown;
}
export interface DeviceHandle {
  queue: { writeBuffer(buffer: BufferHandle, offset: number, data: Float32Array<ArrayBuffer>): void; submit(commands: unknown[]): void };
  lost: Promise<{ reason: string; message: string }>;
  destroy(): void;
  createBuffer(descriptor: Descriptor): BufferHandle;
  createShaderModule(descriptor: Descriptor): unknown;
  createComputePipelineAsync(descriptor: Descriptor): Promise<Pipeline>;
  createRenderPipelineAsync(descriptor: Descriptor): Promise<Pipeline>;
  createBindGroup(descriptor: Descriptor): unknown;
  createCommandEncoder(): Encoder;
  pushErrorScope(filter: string): void;
  popErrorScope(): Promise<{ message: string } | null>;
}
export interface GPUCanvas {
  configure(descriptor: Descriptor): void;
  unconfigure(): void;
  getCurrentTexture(): { createView(): unknown };
}
export interface GPUApi {
  requestAdapter(options: Descriptor): Promise<{ requestDevice(): Promise<DeviceHandle> } | null>;
  getPreferredCanvasFormat(): string;
}
export const bufferUsage = { COPY_DST: 0x0008, UNIFORM: 0x0040, STORAGE: 0x0080 };
