type OfflineGroup = 'site' | 'modelRuntime';
interface OfflineReport {
  complete: boolean;
  group: OfflineGroup;
  version: string;
}

async function requestOfflineGroup(
  worker: ServiceWorker,
  kind: 'assistant-offline-status' | 'assistant-offline-cache',
  group: OfflineGroup,
): Promise<OfflineReport> {
  return new Promise<OfflineReport>((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = kind === 'assistant-offline-cache' ? 120_000 : 10_000;
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error('离线缓存核查超时。')); }, timeout);
    channel.port1.onmessage = (event) => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
    worker.postMessage({ kind, group }, [channel.port2]);
  });
}

async function prepareOfflineGroup(
  base: string,
  group: OfflineGroup,
  download: boolean,
): Promise<{ complete: boolean; waiting: boolean; version: string }> {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) throw new Error('当前浏览器不支持站点离线缓存。可继续在线使用本地检索。');
  if (import.meta.env.DEV) throw new Error('开发服务器不生成离线资产，请在构建后的预览或站点中准备离线。');
  const registration = await navigator.serviceWorker.register(`${base}assistant-sw.js`, { scope: base, updateViaCache: 'none' });
  const installing = registration.installing;
  if (installing) await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('离线准备超时，请检查网络或存储空间。')); }, 60_000);
    function cleanup() { clearTimeout(timer); installing!.removeEventListener('statechange', changed); }
    function changed() {
      if (['installed', 'activated'].includes(installing!.state)) { cleanup(); resolve(); }
      else if (installing!.state === 'redundant') { cleanup(); reject(new Error('离线资产下载失败，请重试。')); }
    }
    installing!.addEventListener('statechange', changed);
    changed();
  });
  const worker = registration.waiting ?? registration.active ?? installing;
  if (!worker) throw new Error('离线缓存未就绪，请重试。');
  const result = await requestOfflineGroup(
    worker,
    download ? 'assistant-offline-cache' : 'assistant-offline-status',
    group,
  );
  return { ...result, waiting: Boolean(registration.waiting) };
}

export function prepareOfflineSite(base: string): Promise<{ complete: boolean; waiting: boolean; version: string }> {
  return prepareOfflineGroup(base, 'site', false);
}

export function prepareModelRuntime(base: string): Promise<{ complete: boolean; waiting: boolean; version: string }> {
  return prepareOfflineGroup(base, 'modelRuntime', true);
}
