const sources = new Set(['instruction', 'user', 'assistant', 'tool', 'retrieval', 'handoff']);

export function packContext(blocks, { limit, reserve, measure }) {
  if (!Number.isSafeInteger(limit) || !Number.isSafeInteger(reserve) ||
      limit <= 0 || reserve < 0 || reserve >= limit || typeof measure !== 'function') {
    throw new Error('Invalid context budget');
  }
  const groups = new Map();
  const ids = new Set();
  for (const block of blocks) {
    if (!sources.has(block.source)) throw new Error('Unknown context source');
    if (typeof block.id !== 'string' || !block.id || ids.has(block.id) ||
        typeof block.group !== 'string' || !block.group ||
        typeof block.text !== 'string' || !Number.isFinite(block.priority)) {
      throw new Error('Invalid context block');
    }
    ids.add(block.id);
    const cost = measure(block.text);
    if (!Number.isSafeInteger(cost) || cost < 0) throw new Error('Invalid token measurement');
    const group = groups.get(block.group) ?? {
      id: block.group, cost: 0, required: false, priority: -Infinity,
    };
    group.cost += cost;
    group.required ||= Boolean(block.required);
    group.priority = Math.max(group.priority, block.priority);
    groups.set(block.group, group);
  }
  const ordered = [...groups.values()].sort((a, b) =>
    Number(b.required) - Number(a.required) || b.priority - a.priority);
  const selected = new Set();
  let used = 0;
  for (const group of ordered) {
    if (used + group.cost > limit - reserve) {
      if (group.required) throw new Error('Context mandatory facts exceed available budget');
      continue;
    }
    used += group.cost;
    selected.add(group.id);
  }
  // 选择按优先级，输出仍按原协议顺序；同一 group 永远一起进出。
  return {
    blocks: blocks.filter((block) => selected.has(block.group)),
    dropped: blocks.filter((block) => !selected.has(block.group)).map((block) => block.id),
    used, reserve, limit,
  };
}
