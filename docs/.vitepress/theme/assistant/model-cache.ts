import type { ModelRecord } from '@mlc-ai/web-llm';
import type { AssistantModelId } from './model-config';

type ModelLocation = Pick<ModelRecord, 'model' | 'model_lib'>;
export interface ModelCacheReport {
  complete: boolean;
  missing: string[];
  shardCount: number;
  weightBytes: number;
}

// 与固定 SDK 0.2.86 的 cleanModelUrl / Cache API scope 保持一致。
function modelRoot(model: ModelLocation): string {
  let url = model.model.endsWith('/') ? model.model : `${model.model}/`;
  if (!/.+\/resolve\/.+\//.test(url)) url += 'resolve/main/';
  return new URL(url).href;
}

export async function selectedModelLocation(id: AssistantModelId): Promise<ModelLocation> {
  const { prebuiltAppConfig } = await import('@mlc-ai/web-llm');
  const model = prebuiltAppConfig.model_list.find((item) => item.model_id === id);
  if (!model || model.model_manifest) throw new Error('当前模型配置不支持缓存核查。');
  return model;
}

export async function inspectModelCache(model: ModelLocation, storage: CacheStorage): Promise<ModelCacheReport> {
  const report: ModelCacheReport = { complete: false, missing: [], shardCount: 0, weightBytes: 0 };
  const root = modelRoot(model);
  const names = await storage.keys();
  async function response(scope: string, url: string, bytes?: number): Promise<Response | undefined> {
    const cached = names.includes(scope) ? await (await storage.open(scope)).match(url) : undefined;
    const length = cached?.headers.get('content-length');
    if (!cached?.ok || length === '0' || (bytes !== undefined && length !== null && length !== undefined && Number(length) !== bytes)) {
      report.missing.push(url);
      return undefined;
    }
    return cached;
  }
  const configUrl = `${root}mlc-chat-config.json`;
  const manifestUrl = `${root}tensor-cache.json`;
  const config = await response('webllm/config', configUrl);
  await response('webllm/wasm', model.model_lib);
  const manifest = await response('webllm/model', manifestUrl);
  try {
    const files = config ? (await config.json()).tokenizer_files : undefined;
    const tokenizer = Array.isArray(files) && (files.includes('tokenizer.json') ? 'tokenizer.json' : files.includes('tokenizer.model') ? 'tokenizer.model' : undefined);
    if (tokenizer) await response('webllm/model', `${root}${tokenizer}`);
    else if (config) report.missing.push(`${configUrl}（tokenizer 配置无效）`);
    const records = manifest ? (await manifest.json()).records : undefined;
    if (!Array.isArray(records) || !records.length) {
      if (manifest) report.missing.push(`${manifestUrl}（分片清单无效）`);
    } else {
      for (const record of records) {
        const url = typeof record.dataPath === 'string' ? new URL(record.dataPath, root).href : '';
        if (!url.startsWith(root) || !Number.isSafeInteger(record.nbytes) || record.nbytes <= 0) {
          report.missing.push(`${manifestUrl}（分片路径或大小无效）`);
          continue;
        }
        report.shardCount++;
        report.weightBytes += record.nbytes;
        await response('webllm/model', url, record.nbytes);
      }
    }
  } catch {
    report.missing.push('缓存中的配置或分片清单无法解析');
  }
  report.complete = report.missing.length === 0 && report.shardCount > 0;
  return report;
}

export async function clearModelCache(model: ModelLocation, storage: CacheStorage): Promise<void> {
  const root = modelRoot(model);
  const names = await storage.keys();
  for (const name of ['webllm/config', 'webllm/model', 'webllm/wasm']) {
    if (!names.includes(name)) continue;
    const cache = await storage.open(name);
    for (const request of await cache.keys()) {
      if ((name === 'webllm/wasm' && request.url === model.model_lib) ||
          (name !== 'webllm/wasm' && request.url.startsWith(root))) await cache.delete(request);
    }
  }
}
