export const ASSISTANT_PROMPT_VERSION = 'site-rag-v1';
export const ASSISTANT_CONTEXT_TOKENS = 4096;
export const ASSISTANT_OUTPUT_TOKENS = 768;

// 官方配置中的VRAM估算不能用于展示下载字节或判断剩余显存。
export const ASSISTANT_MODELS = [
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    label: 'Qwen 2.5 · 1.5B',
    description: '推荐桌面设备，中文解释质量优先',
    estimatedVramMB: 1629.75,
    requiresF16: true,
  },
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    label: 'Qwen 2.5 · 0.5B',
    description: '较低资源需求，回答能力有限',
    estimatedVramMB: 944.62,
    requiresF16: true,
  },
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC',
    label: 'Qwen 2.5 · 1.5B（f32）',
    description: '无 f16 的备选，预计占用更多资源',
    estimatedVramMB: 1888.97,
    requiresF16: false,
  },
] as const;

export type AssistantModelId = typeof ASSISTANT_MODELS[number]['id'];
