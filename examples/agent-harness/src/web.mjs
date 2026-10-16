import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

export async function startWeb({ run, port = 8787, timeoutMs = 90_000 }) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error('Invalid web timeout');
  const html = await readFile(new URL('../web/index.html', import.meta.url));
  let busy = false;
  const server = createServer(async (req, res) => {
    const expected = new Set([`127.0.0.1:${server.address().port}`, `localhost:${server.address().port}`]);
    const host = req.headers.host;
    if (!expected.has(host) || (req.headers.origin && req.headers.origin !== `http://${host}`)) {
      res.writeHead(403).end('Origin rejected'); return;
    }
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
        'x-content-type-options': 'nosniff', 'cache-control': 'no-store',
      }).end(html); return;
    }
    if (req.method !== 'POST' || req.url !== '/api/run') { res.writeHead(404).end(); return; }
    if (!req.headers['content-type']?.startsWith('application/json')) { res.writeHead(415).end('JSON required'); return; }
    if (busy) { res.writeHead(409).end('Another run is active'); return; }
    busy = true;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]);
    const stopReading = () => req.destroy(signal.reason);
    signal.addEventListener('abort', stopReading, { once: true });
    res.on('close', () => controller.abort());
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16_384) { res.writeHead(413).end('Request too large'); return; }
        chunks.push(chunk);
      }
      signal.removeEventListener('abort', stopReading);
      signal.throwIfAborted();
      let prompt;
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (Object.keys(body).length !== 1 || typeof body.prompt !== 'string'
          || !body.prompt.trim() || Buffer.byteLength(body.prompt) > 8000) throw new Error('Invalid prompt');
        prompt = body.prompt;
      } catch { res.writeHead(400).end('Provide a prompt of 1–8000 bytes'); return; }
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' });
      res.flushHeaders();
      let outputBytes = 0;
      const emit = (event) => {
        if (res.destroyed) return;
        const frame = `data: ${JSON.stringify(event)}\n\n`;
        outputBytes += Buffer.byteLength(frame);
        // Bounded stream and cancellation keep a slow consumer from accumulating unlimited data.
        if (outputBytes > 1_048_576 || !res.write(frame)) {
          controller.abort(new Error('Web stream consumer too slow or output too large'));
        }
      };
      await run(prompt, { signal, emit });
      if (!res.destroyed) res.end();
    } catch {
      if (!res.destroyed) {
        if (!res.headersSent) res.writeHead(500).end('Run failed');
        else res.end(`data: ${JSON.stringify({ type: 'run.error', message: '运行未完成。请检查本地模型服务、上下文预算或取消状态。' })}\n\n`);
      }
    } finally {
      signal.removeEventListener('abort', stopReading);
      busy = false;
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}
