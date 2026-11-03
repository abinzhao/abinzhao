export type TraceKind = 'start' | 'value' | 'abort' | 'cancelled' | 'done';
export interface TraceEvent { kind: TraceKind; index: number; value: number; total: number; aborted: boolean }
export interface TraceInput { count: number; factor: number; cancelAfter: number }

/** 仅在 next() 时执行下一段。UI 可回放不可变事件，但不能生成业务结果。 */
export async function* runCancellation(input: TraceInput, parent: AbortSignal): AsyncGenerator<TraceEvent, void> {
  const { count, factor, cancelAfter } = input;
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error('处理数量必须在 1 到 100 之间');
  if (!Number.isInteger(factor) || factor < 1 || factor > 10) throw new Error('倍率必须在 1 到 10 之间');
  if (!Number.isInteger(cancelAfter) || cancelAfter < 0 || cancelAfter > count) throw new Error('取消位置必须在 0 到处理数量之间');
  const controller = new AbortController();
  const abort = () => controller.abort();
  parent.addEventListener('abort', abort, { once: true });
  if (parent.aborted) abort();
  let index = 0, value = 0, total = 0;
  const snapshot = (kind: TraceKind): TraceEvent => ({ kind, index, value, total, aborted: controller.signal.aborted });
  try {
    yield snapshot('start'); // @trace start
    while (true) {
      if (controller.signal.aborted) {
        yield snapshot('cancelled'); // @trace cancelled
        return;
      }
      if (index >= count) break;
      value = (++index) * factor;
      total += value; yield snapshot('value'); // @trace value
      if (cancelAfter > 0 && index === cancelAfter) {
        controller.abort(); yield snapshot('abort'); // @trace abort
      }
    }
    yield snapshot('done'); // @trace done
  } finally {
    parent.removeEventListener('abort', abort);
  }
}
