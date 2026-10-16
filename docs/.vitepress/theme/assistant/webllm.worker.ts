/// <reference lib="webworker" />
import { prebuiltAppConfig, WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';
import { checkCapabilities, type CapabilityEnvironment } from './capabilities';
import { ASSISTANT_MODELS } from './model-config';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
const handler = new WebWorkerMLCEngineHandler();
workerScope.onmessage = async (event: MessageEvent) => {
  if (event.data?.channel === 'assistant-capability') {
    const candidate = ASSISTANT_MODELS.find((model) => model.id === event.data.modelId);
    const record = prebuiltAppConfig.model_list.find((model) => model.model_id === candidate?.id);
    const environment: CapabilityEnvironment = {
      secure: workerScope.isSecureContext,
      gpu: (workerScope.navigator as unknown as { gpu?: CapabilityEnvironment['gpu'] }).gpu,
      estimate: () => workerScope.navigator.storage.estimate(),
    };
    const report = candidate && record
      ? await checkCapabilities(environment, {
          ...record,
          required_features: [...new Set([
            ...record.required_features ?? [],
            ...candidate.requiresF16 ? ['shader-f16'] : [],
          ])],
        })
      : { supported: false, reason: '模型配置不可用。' };
    workerScope.postMessage({ channel: 'assistant-capability', modelId: event.data.modelId, report });
    return;
  }
  // 自有协议有独立 channel，其余消息原样交由固定版本 SDK 处理。
  handler.onmessage(event);
};
