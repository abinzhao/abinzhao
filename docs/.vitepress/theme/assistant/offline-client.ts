export async function prepareOfflineSite(base: string): Promise<{ complete: boolean; waiting: boolean; version: string }> {
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
  const result = await new Promise<{ complete: boolean; version: string }>((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error('离线缓存核查超时。')); }, 10_000);
    channel.port1.onmessage = (event) => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
    worker.postMessage({ kind: 'assistant-offline-status' }, [channel.port2]);
  });
  return { ...result, waiting: Boolean(registration.waiting) };
}
