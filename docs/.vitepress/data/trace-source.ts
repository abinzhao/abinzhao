import type { TraceKind } from '../../../examples/site-labs/execution';
export function traceLines(source: string): Record<TraceKind, number> {
  const result = {} as Record<TraceKind, number>;
  source.split('\n').forEach((line, index) => {
    const match = line.match(/@trace (start|value|abort|cancelled|done)/);
    if (match) result[match[1] as TraceKind] = index + 1;
  });
  for (const kind of ['start', 'value', 'abort', 'cancelled', 'done'] as const) if (!result[kind]) throw new Error(`缺少轨迹源码映射：${kind}`);
  return result;
}
