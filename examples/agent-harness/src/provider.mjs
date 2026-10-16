import { setTimeout as delay } from 'node:timers/promises';

export function assertLocalURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.username || url.password || url.search || url.hash) {
    throw new Error('Model endpoint must use HTTP on a loopback host');
  }
  return url;
}

/** Decode bytes before splitting lines: network chunks are not SSE events. */
export async function* parseSSE(body) {
  if (!body) throw new Error('Missing SSE response body');
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '';
  let data = [];
  let frameSize = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (buffer.length > 1_048_576) throw new Error('SSE line exceeds limit');
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (line === '') {
          if (data.length) yield data.join('\n');
          data = [];
          frameSize = 0;
        } else if (line.startsWith('data:')) {
          const part = line.slice(5).replace(/^ /, '');
          frameSize += part.length;
          if (frameSize > 1_048_576) throw new Error('SSE frame exceeds limit');
          data.push(part);
        }
      }
      if (done) break;
    }
    // An unterminated event is not settled. The provider additionally requires [DONE].
    if (buffer || data.length) throw new Error('Incomplete SSE event');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function createProvider({ baseURL = 'http://127.0.0.1:11434/v1', model, fetchImpl = fetch }) {
  const base = assertLocalURL(baseURL);
  if (typeof model !== 'string' || !model.trim()) throw new Error('A model name is required');
  const endpoint = `${base.href.replace(/\/$/, '')}/chat/completions`;

  return {
    async complete(messages, tools, { signal, onDelta = () => {} } = {}) {
      signal?.throwIfAborted();
      // Only rejected requests are retried. A partial stream is never replayed.
      let response;
      for (let attempt = 0; attempt < 2; attempt++) {
        response = await fetchImpl(endpoint, {
          method: 'POST', redirect: 'error', signal,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model, messages, stream: true, temperature: 0,
            ...(tools.length ? { tools } : {}),
          }),
        });
        if (![429, 502, 503, 504].includes(response.status) || attempt === 1) break;
        await response.body?.cancel();
        await delay(200, undefined, { signal });
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Model HTTP ${response.status}`);
      }
      if (!response.headers.get('content-type')?.includes('text/event-stream')) {
        await response.body?.cancel();
        throw new Error('Model did not return SSE');
      }
      const reply = { role: 'assistant', content: '' };
      const calls = new Map();
      let complete = false;
      let size = 0;
      for await (const frame of parseSSE(response.body)) {
        signal?.throwIfAborted();
        if (frame === '[DONE]') { complete = true; break; }
        const chunk = JSON.parse(frame);
        if (chunk.error) throw new Error('Model stream reported an error');
        const choice = chunk.choices?.[0];
        if (!choice) continue; // Usage-only events do not contain choices.
        if (['length', 'content_filter'].includes(choice.finish_reason)) throw new Error('Model reply was truncated or filtered');
        const delta = choice.delta ?? {};
        if (typeof delta.content === 'string') {
          reply.content += delta.content;
          onDelta(delta.content);
          size += delta.content.length;
        }
        for (const call of delta.tool_calls ?? []) {
          if (!Number.isInteger(call.index) || call.index < 0 || call.index > 15) throw new Error('Invalid tool call index');
          const current = calls.get(call.index) ?? { id: '', type: 'function', function: { name: '', arguments: '' } };
          current.id += call.id ?? '';
          current.function.name += call.function?.name ?? '';
          current.function.arguments += call.function?.arguments ?? '';
          size += JSON.stringify(call).length;
          calls.set(call.index, current);
        }
        if (size > 131_072) throw new Error('Model reply exceeds limit');
      }
      if (!complete) throw new Error('Incomplete model stream');
      if (calls.size) {
        reply.tool_calls = [...calls].sort(([a], [b]) => a - b).map(([, call]) => call);
        const ids = reply.tool_calls.map((call) => call.id);
        if (ids.some((id) => !id) || new Set(ids).size !== ids.length
          || reply.tool_calls.some((call) => !call.function.name)) throw new Error('Invalid settled tool calls');
      }
      if (!reply.content && !reply.tool_calls?.length) throw new Error('Empty model reply');
      return reply;
    },
  };
}
