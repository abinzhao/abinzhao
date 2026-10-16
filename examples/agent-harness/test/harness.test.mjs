import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

const api = await import('../src/index.mjs').catch(() => ({}));

test('the tutorial exports a real runnable harness', () => {
  assert.equal(typeof api.runAgent, 'function', 'runAgent has not been implemented');
});

test('plugin services unwind in reverse order and failed mounts roll back', async () => {
  assert.equal(typeof api.createScope, 'function');
  const scope = api.createScope();
  const removed = [];
  await scope.mount(async (ctx) => {
    ctx.provide('answer', 42);
    ctx.onDispose(() => removed.push('first'));
    ctx.onDispose(() => removed.push('second'));
  });
  assert.equal(scope.get('answer'), 42);
  await assert.rejects(scope.mount(async (ctx) => {
    ctx.provide('temporary', true);
    throw new Error('mount failure');
  }), /mount failure/);
  assert.throws(() => scope.get('temporary'), /Unknown service/);
  await scope.dispose();
  assert.deepEqual(removed, ['second', 'first']);
  assert.throws(() => scope.get('answer'), /Unknown service/);
});

test('SSE handles fragmented UTF-8, CRLF, comments and tool argument deltas', async () => {
  assert.equal(typeof api.parseSSE, 'function');
  const text = ': keepalive\r\n\r\ndata: {"text":"中文"}\r\n\r\ndata: [DONE]\r\n\r\n';
  const bytes = new TextEncoder().encode(text);
  const stream = new ReadableStream({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  const frames = [];
  for await (const frame of api.parseSSE(stream)) frames.push(frame);
  assert.deepEqual(frames, ['{"text":"中文"}', '[DONE]']);
});

test('local provider assembles real HTTP streamed tools and refuses remote hosts', async () => {
  assert.equal(typeof api.createProvider, 'function');
  assert.throws(() => api.createProvider({ baseURL: 'https://example.com/v1', model: 'x' }), /loopback/);
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const part of req) body += part;
    requests.push(JSON.parse(body));
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const delta of [
      { content: '查看' },
      { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'read_file', arguments: '{"path":' } }] },
      { tool_calls: [{ index: 0, function: { arguments: '"guide.md"}' } }] },
    ]) res.write(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const provider = api.createProvider({ baseURL: `http://127.0.0.1:${server.address().port}/v1`, model: 'fixture' });
    const deltas = [];
    const reply = await provider.complete([{ role: 'user', content: 'hi' }], [], {
      onDelta: (text) => deltas.push(text),
    });
    assert.equal(reply.content, '查看');
    assert.equal(reply.tool_calls[0].function.arguments, '{"path":"guide.md"}');
    assert.deepEqual(deltas, ['查看']);
    assert.equal(requests[0].stream, true);
    assert.equal(requests[0].model, 'fixture');
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('a truncated SSE stream is never accepted as a settled reply', async () => {
  assert.equal(typeof api.createProvider, 'function');
  const provider = api.createProvider({
    baseURL: 'http://127.0.0.1:11434/v1', model: 'fixture',
    fetchImpl: async () => new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n', {
      headers: { 'content-type': 'text/event-stream' },
    }),
  });
  await assert.rejects(provider.complete([], []), /incomplete/i);
});

test('read tools reject traversal, symlink escapes, unknown fields and oversized files', async () => {
  assert.equal(typeof api.createTools, 'function');
  const root = await mkdtemp(join(tmpdir(), 'harness-tools-'));
  const outside = await mkdtemp(join(tmpdir(), 'harness-outside-'));
  await writeFile(join(root, 'guide.md'), 'real content');
  await writeFile(join(outside, 'private.md'), 'outside');
  await writeFile(join(root, 'big.md'), 'x'.repeat(20_000));
  await symlink(join(outside, 'private.md'), join(root, 'escape.md'));
  const tools = api.createTools(root);
  assert.match(await tools.execute('read_file', { path: 'guide.md' }), /real content/);
  for (const args of [{ path: '../private.md' }, { path: 'escape.md' }, { path: 'guide.md', command: 'rm' }, { path: 'big.md' }]) {
    await assert.rejects(tools.execute('read_file', args));
  }
  await assert.rejects(tools.execute('shell', {}), /Unknown tool/);
});

test('session replay excludes failed runs and rejects corrupted records', async () => {
  assert.equal(typeof api.openSession, 'function');
  const root = await mkdtemp(join(tmpdir(), 'harness-session-'));
  const session = await api.openSession(root, 'test');
  await session.append({ type: 'begin', runId: 'a', message: { role: 'user', content: 'first' } });
  await session.append({ type: 'turn', runId: 'a', messages: [{ role: 'assistant', content: 'done' }] });
  await session.append({ type: 'end', runId: 'a', status: 'completed' });
  await session.append({ type: 'begin', runId: 'b', message: { role: 'user', content: 'cancelled' } });
  await session.append({ type: 'end', runId: 'b', status: 'cancelled' });
  const reopened = await api.openSession(root, 'test');
  assert.deepEqual(reopened.history().map((message) => message.content), ['first', 'done']);
  await writeFile(join(root, 'broken.ndjson'), '{"type":');
  await assert.rejects(api.openSession(root, 'broken'), /Corrupt/);
  await assert.rejects(api.openSession(root, '../bad'), /session id/);
});

test('context selection retains complete tool groups and fails for an oversized current turn', () => {
  assert.equal(typeof api.selectContext, 'function');
  const messages = [
    { role: 'user', content: 'a'.repeat(1000) },
    { role: 'assistant', content: null, tool_calls: [{ id: 't', type: 'function', function: { name: 'read_file', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 't', content: 'old result' },
    { role: 'assistant', content: 'old answer' },
    { role: 'user', content: 'new question' },
  ];
  const selected = api.selectContext(messages, 'system', 180);
  assert.deepEqual(selected.map((message) => message.role), ['system', 'user']);
  assert.throws(() => api.selectContext([{ role: 'user', content: 'x'.repeat(1000) }], 'system', 180), /budget/);
});

test('agent executes tools, streams events, persists settled turns and resumes', async () => {
  assert.equal(typeof api.runAgent, 'function');
  const root = await mkdtemp(join(tmpdir(), 'harness-loop-'));
  await writeFile(join(root, 'guide.md'), 'architecture evidence');
  const session = await api.openSession(join(root, 'sessions'), 'demo');
  const tools = api.createTools(root);
  let calls = 0;
  const provider = {
    async complete(messages, definitions, { onDelta }) {
      calls++;
      if (calls === 1) {
        assert.equal(definitions[0].function.name, 'list_files');
        return { role: 'assistant', content: '', tool_calls: [
          { id: 't1', type: 'function', function: { name: 'read_file', arguments: '{"path":"guide.md"}' } },
        ] };
      }
      assert.match(messages.at(-1).content, /architecture evidence/);
      onDelta('verified answer');
      return { role: 'assistant', content: 'verified answer' };
    },
  };
  const events = [];
  const result = await api.runAgent({ provider, tools, session, prompt: 'read guide', emit: (event) => events.push(event) });
  assert.equal(result, 'verified answer');
  assert.deepEqual(session.history().map((message) => message.role), ['user', 'assistant', 'tool', 'assistant']);
  assert.ok(events.some((event) => event.type === 'tool.end'));
  assert.equal(events.at(-1).type, 'run.end');
  const persisted = await readFile(join(root, 'sessions', 'demo.ndjson'), 'utf8');
  assert.ok(!persisted.includes('text.delta'));
});

test('cancellation and maximum steps terminate without committing partial history', async () => {
  assert.equal(typeof api.runAgent, 'function');
  const root = await mkdtemp(join(tmpdir(), 'harness-cancel-'));
  const session = await api.openSession(root, 'limit');
  const tools = { definitions: [], async execute() { return 'ok'; } };
  const forever = { async complete() { return { role: 'assistant', content: '', tool_calls: [
    { id: 't', type: 'function', function: { name: 'read_file', arguments: '{}' } },
  ] }; } };
  await assert.rejects(api.runAgent({ provider: forever, tools, session, prompt: 'loop', maxSteps: 2 }), /step limit/);
  assert.deepEqual(session.history(), []);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(api.runAgent({ provider: forever, tools, session, prompt: 'cancel', signal: controller.signal }), /abort/i);
  assert.deepEqual(session.history(), []);
});

test('only transient HTTP failures before visible output are retried', async () => {
  assert.equal(typeof api.createProvider, 'function');
  let attempts = 0;
  const provider = api.createProvider({
    baseURL: 'http://127.0.0.1:11434/v1', model: 'fixture',
    fetchImpl: async () => {
      attempts++;
      if (attempts === 1) return new Response('', { status: 503 });
      return new Response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n', {
        headers: { 'content-type': 'text/event-stream' },
      });
    },
  });
  assert.equal((await provider.complete([], [])).content, 'ok');
  assert.equal(attempts, 2);
});

test('invalid session transitions do not corrupt the durable log', async () => {
  const root = await mkdtemp(join(tmpdir(), 'harness-transitions-'));
  const session = await api.openSession(root, 'transition');
  await session.append({ type: 'begin', runId: 'a', message: { role: 'user', content: 'question' } });
  await assert.rejects(session.append({ type: 'end', runId: 'a', status: 'completed' }), /unsettled/);
  await session.append({ type: 'end', runId: 'a', status: 'failed' });
  const reopened = await api.openSession(root, 'transition');
  assert.deepEqual(reopened.history(), []);
});
