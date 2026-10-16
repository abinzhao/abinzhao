import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

const api = await import('../src/web.mjs').catch(() => ({}));

test('web transport exposes the actual UI, streams events, and blocks cross-origin requests', async () => {
  assert.equal(typeof api.startWeb, 'function', 'Web transport is missing');
  const server = await api.startWeb({
    port: 0,
    async run(prompt, { emit }) {
      assert.equal(prompt, 'hello');
      emit({ type: 'text.delta', text: '<script>plain text</script>' });
      emit({ type: 'run.end', status: 'completed' });
      return 'answer';
    },
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const ui = await fetch(base);
    assert.match(await ui.text(), /AbortController/);
    const response = await fetch(`${base}/api/run`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ prompt: 'hello' }),
    });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /text.delta/);
    const denied = await fetch(`${base}/api/run`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://foreign.example' },
      body: JSON.stringify({ prompt: 'hello' }),
    });
    assert.equal(denied.status, 403);
    const wrongType = await fetch(`${base}/api/run`, { method: 'POST', body: 'hello' });
    assert.equal(wrongType.status, 415);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('web run lock rejects overlapping requests and disconnect cancels the active run', async () => {
  assert.equal(typeof api.startWeb, 'function');
  let ready;
  let aborted;
  const began = new Promise((resolve) => { ready = resolve; });
  const stopped = new Promise((resolve) => { aborted = resolve; });
  const server = await api.startWeb({ port: 0, async run(prompt, { signal, emit }) {
    emit({ type: 'run.start' });
    ready();
    await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
    aborted();
    signal.throwIfAborted();
  } });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const controller = new AbortController();
    const pending = fetch(`${base}/api/run`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'first' }), signal: controller.signal,
    }).then((response) => response.text()).catch(() => {});
    await began;
    const busy = await fetch(`${base}/api/run`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'second' }),
    });
    assert.equal(busy.status, 409);
    controller.abort();
    await stopped;
    await pending;
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});

test('a stalled request body times out and releases the run lock', async () => {
  let calls = 0;
  const server = await api.startWeb({ port: 0, timeoutMs: 50, async run(prompt, { emit }) {
    calls++;
    emit({ type: 'run.end', status: 'completed' });
  } });
  const base = `http://127.0.0.1:${server.address().port}`;
  const partial = request(`${base}/api/run`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '100' },
  });
  partial.on('error', () => {});
  partial.write('{"prompt":');
  try {
    await delay(150);
    const response = await fetch(`${base}/api/run`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'after timeout' }),
    });
    assert.equal(response.status, 200, 'Timed out request must not keep the session busy');
    await response.text();
    assert.equal(calls, 1);
  } finally { partial.destroy(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});
