/** A conservative byte budget, not a provider-specific token counter. */
export function selectContext(messages, system, budget = 24_000) {
  if (!Number.isSafeInteger(budget) || budget < 1) throw new Error('Invalid context budget');
  const groups = [];
  for (const message of messages) {
    if (message.role === 'user') groups.push([]);
    if (!groups.length) throw new Error('History must begin with a user message');
    groups.at(-1).push(message);
  }
  const selected = [{ role: 'system', content: system }];
  const sizeOf = (value) => Buffer.byteLength(JSON.stringify(value));
  let size = sizeOf(selected);
  const kept = [];
  for (let index = groups.length - 1; index >= 0; index--) {
    const next = sizeOf(groups[index]);
    if (size + next > budget) {
      if (index === groups.length - 1) throw new Error('Current turn exceeds context budget; shorten the prompt or start a new run');
      break;
    }
    kept.unshift(...groups[index]);
    size += next;
  }
  return [...selected, ...kept];
}
