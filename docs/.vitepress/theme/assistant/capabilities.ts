export interface CapabilityReport {
  supported: boolean;
  reason?: string;
  features?: string[];
  limits?: GPUCapabilityLimits;
  storage?: { quota?: number; usage?: number };
}

export interface GPUCapabilityLimits {
  maxStorageBufferBindingSize: number;
  maxBufferSize: number;
  maxComputeWorkgroupStorageSize?: number;
  maxStorageBuffersPerShaderStage?: number;
}

export interface CapabilityEnvironment {
  secure: boolean;
  gpu?: { requestAdapter: () => Promise<{
    features: ReadonlySet<string>;
    limits: GPUCapabilityLimits;
  } | null> };
  estimate?: () => Promise<{ quota?: number; usage?: number }>;
}

export async function checkCapabilities(
  environment: CapabilityEnvironment,
  model: { required_features?: string[]; buffer_size_required_bytes?: number },
): Promise<CapabilityReport> {
  if (!environment.secure) return { supported: false, reason: '需要 HTTPS 或 localhost 安全上下文。' };
  if (!environment.gpu) return { supported: false, reason: '设备未提供 WebGPU，可继续使用本地检索。' };
  try {
    const adapter = await environment.gpu.requestAdapter();
    if (!adapter) return { supported: false, reason: '没有可用的 GPU adapter，可继续使用本地检索。' };
    const report: CapabilityReport = {
      supported: true,
      features: [...adapter.features],
      limits: {
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        maxBufferSize: adapter.limits.maxBufferSize,
        maxComputeWorkgroupStorageSize: adapter.limits.maxComputeWorkgroupStorageSize,
        maxStorageBuffersPerShaderStage: adapter.limits.maxStorageBuffersPerShaderStage,
      },
    };
    const missing = model.required_features?.filter((feature) => !adapter.features.has(feature));
    if (missing?.length) return { ...report, supported: false, reason: `GPU 缺少 ${missing.join('、')}，请选择兼容模型。` };
    const required = model.buffer_size_required_bytes ?? 0;
    // 0.2.86 内置运行时的最低绑定/计算限制，低于这些值会在下载后才初始化失败。
    if (
      adapter.limits.maxStorageBufferBindingSize < Math.max(required, 128 * 1024 ** 2) ||
      adapter.limits.maxBufferSize < Math.max(required, 256 * 1024 ** 2) ||
      (adapter.limits.maxComputeWorkgroupStorageSize !== undefined && adapter.limits.maxComputeWorkgroupStorageSize < 32 * 1024) ||
      (adapter.limits.maxStorageBuffersPerShaderStage !== undefined && adapter.limits.maxStorageBuffersPerShaderStage < 10)
    ) {
      return { ...report, supported: false, reason: 'GPU 缓冲区上限不足，请选择较小模型或本地检索。' };
    }
    // estimate 失败不应阻止推理；配额只是同源存储的估算，并非空闲显存。
    try { report.storage = await environment.estimate?.(); } catch { /* 存储信息可缺省。 */ }
    return report;
  } catch {
    return { supported: false, reason: 'GPU 能力检测失败，可继续使用本地检索。' };
  }
}
