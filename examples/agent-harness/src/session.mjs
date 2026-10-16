import { mkdir, readFile, open } from 'node:fs/promises';
import { join } from 'node:path';

function validateEvent(event) {
  if (!event || typeof event !== 'object' || typeof event.runId !== 'string' || !event.runId) throw new Error('Invalid session event');
  if (event.type === 'begin') {
    if (event.message?.role !== 'user' || typeof event.message.content !== 'string') throw new Error('Invalid begin event');
  } else if (event.type === 'turn') {
    if (!Array.isArray(event.messages) || !event.messages.length || event.messages[0].role !== 'assistant') throw new Error('Invalid turn event');
    const [assistant, ...results] = event.messages;
    if (typeof assistant.content !== 'string' && assistant.content !== null) throw new Error('Invalid assistant content');
    const calls = assistant.tool_calls ?? [];
    if (!Array.isArray(calls) || results.length !== calls.length) throw new Error('Unpaired tool results');
    const ids = new Set();
    calls.forEach((call, index) => {
      if (!call.id || ids.has(call.id) || call.type !== 'function' || typeof call.function?.name !== 'string'
        || typeof call.function.arguments !== 'string' || results[index]?.role !== 'tool'
        || results[index].tool_call_id !== call.id || typeof results[index].content !== 'string') throw new Error('Invalid tool group');
      ids.add(call.id);
    });
  } else if (event.type === 'end') {
    if (!['completed', 'failed', 'cancelled'].includes(event.status)) throw new Error('Invalid run status');
  } else throw new Error('Unknown session event');
}

export async function openSession(directory, id = 'default') {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error('Invalid session id');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `${id}.ndjson`);
  let text = '';
  try { text = await readFile(path, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (Buffer.byteLength(text) > 8_388_608) throw new Error('Session exceeds 8 MiB; start a new session');
  const runs = new Map();
  function checkTransition(event) {
    validateEvent(event);
    if (event.type === 'begin') {
      if (runs.has(event.runId)) throw new Error('Duplicate run');
    } else {
      const run = runs.get(event.runId);
      if (!run || run.status !== 'running') throw new Error('Invalid run transition');
      if (event.type === 'end' && event.status === 'completed' && (run.messages.at(-1)?.role !== 'assistant'
        || run.messages.at(-1)?.tool_calls?.length)) throw new Error('Cannot complete an unsettled run');
    }
  }
  function accept(event) {
    checkTransition(event);
    if (event.type === 'begin') {
      runs.set(event.runId, { status: 'running', messages: [event.message] });
    } else {
      const run = runs.get(event.runId);
      if (event.type === 'turn') run.messages.push(...event.messages);
      else run.status = event.status;
    }
  }
  for (const [index, line] of text.split('\n').entries()) {
    if (!line) continue;
    try { accept(JSON.parse(line)); } catch (error) { throw new Error(`Corrupt session at line ${index + 1}`, { cause: error }); }
  }
  let queue = Promise.resolve();
  return {
    history() {
      return structuredClone([...runs.values()].filter((run) => run.status === 'completed').flatMap((run) => run.messages));
    },
    append(event) {
      const record = structuredClone(event);
      const job = queue.then(async () => {
        // Reject before disk writes: a bad transition must not poison future replay.
        checkTransition(record);
        const line = `${JSON.stringify(record)}\n`;
        if (Buffer.byteLength(text) + Buffer.byteLength(line) > 8_388_608) throw new Error('Session exceeds 8 MiB');
        const handle = await open(path, 'a', 0o600);
        try {
          // The runner owns this session. A web run lock prevents concurrent writers.
          await handle.writeFile(line);
          await handle.sync();
        } finally { await handle.close(); }
        accept(record);
        text += line;
      });
      queue = job.catch(() => {});
      return job;
    },
  };
}
