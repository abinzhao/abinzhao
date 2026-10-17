import { createHash } from 'node:crypto';

function validate(tasks) {
  const byId = new Map();
  for (const task of tasks) {
    if (typeof task.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(task.id) ||
        Object.hasOwn(Object.prototype, task.id) || byId.has(task.id) || typeof task.revision !== 'string' ||
        !Array.isArray(task.depends) || typeof task.run !== 'function' ||
        typeof task.replaySafe !== 'boolean') throw new Error('Invalid workflow task');
    byId.set(task.id, task);
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new Error('Workflow contains a cycle');
    if (visited.has(id)) return;
    if (!byId.has(id)) throw new Error('Unknown workflow dependency');
    visiting.add(id);
    for (const dependency of byId.get(id).depends) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of byId.keys()) visit(id);
  return createHash('sha256').update(JSON.stringify(tasks.map(({ id, revision, depends, replaySafe }) =>
    ({ id, revision, depends, replaySafe })))).digest('hex');
}

export async function runWorkflow({
  tasks, state, maxSteps = 100, signal, checkpoint = async () => {},
}) {
  const definition = validate(tasks);
  if (!Number.isSafeInteger(maxSteps) || maxSteps < 0) throw new Error('Invalid step budget');
  if (state && (state.version !== 1 || state.definition !== definition)) {
    throw new Error('Checkpoint definition differs from this workflow');
  }
  const current = state ? structuredClone(state) : { version: 1, definition, tasks: {} };
  if (!current.tasks || typeof current.tasks !== 'object' || Array.isArray(current.tasks) ||
      Object.keys(current.tasks).some((id) => !tasks.some((task) => task.id === id))) {
    throw new Error('Invalid checkpoint task set');
  }
  for (const task of tasks) {
    const saved = current.tasks[task.id];
    if (Object.hasOwn(current.tasks, task.id) && (!saved || typeof saved !== 'object' || Array.isArray(saved) ||
        !['running', 'failed', 'completed'].includes(saved.status) ||
        (saved.status === 'completed' && !Object.hasOwn(saved, 'result')) ||
        !task.depends.every((id) => current.tasks[id]?.status === 'completed'))) {
      throw new Error('Checkpoint dependencies or results are inconsistent');
    }
  }
  const results = {};
  for (const task of tasks) {
    const saved = current.tasks[task.id];
    if (saved?.status === 'completed') results[task.id] = saved.result;
    else if (saved && !task.replaySafe) {
      return { status: 'blocked', reason: `Task ${task.id} has ambiguous external effects`, state: current };
    }
  }
  let steps = 0;
  while (tasks.some((task) => current.tasks[task.id]?.status !== 'completed')) {
    if (signal?.aborted) return { status: 'cancelled', state: current };
    if (steps >= maxSteps) return { status: 'budget', state: current };
    const task = tasks.find((candidate) => current.tasks[candidate.id]?.status !== 'completed' &&
      candidate.depends.every((id) => current.tasks[id]?.status === 'completed'));
    if (!task) throw new Error('Checkpoint dependencies are inconsistent');
    current.tasks[task.id] = { status: 'running' };
    // 必须先确认 intent 已持久化再调用动作；失败时不触发动作。
    await checkpoint(structuredClone(current));
    if (signal?.aborted) {
      // 动作尚未启动，可恢复为 pending；不能留成不安全动作的未知结果。
      delete current.tasks[task.id];
      await checkpoint(structuredClone(current));
      return { status: 'cancelled', state: current };
    }
    steps++;
    try {
      const result = await task.run(Object.fromEntries(task.depends.map((id) => [id, results[id]])), signal);
      // 下载包演示使用 JSON 可持久化值，不接受函数、undefined 或循环结构。
      const encoded = JSON.stringify(result);
      if (encoded === undefined) throw new Error('Task result must be JSON serializable');
      const persistedResult = JSON.parse(encoded);
      current.tasks[task.id] = { status: 'completed', result: persistedResult };
      results[task.id] = persistedResult;
    } catch (error) {
      current.tasks[task.id] = { status: 'failed', error: String(error.message ?? error) };
      await checkpoint(structuredClone(current));
      return { status: signal?.aborted ? 'cancelled' : 'failed', state: current };
    }
    // 完成记录写失败不伪造成功。调用者必须从最后耐久快照恢复。
    await checkpoint(structuredClone(current));
  }
  return { status: 'completed', state: current };
}
