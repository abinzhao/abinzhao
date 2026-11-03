import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { createReadingMemory, decodeReadingMemory, READING_KEY, type ReadingRecords } from './reading-memory';

export function useReadingMemory(articles: Array<{ id: string; href: string }> = []) {
  let memory = createReadingMemory();
  const records = shallowRef<ReadingRecords>({});
  const persistent = ref(true);
  function sync() { memory.migrate(articles); records.value = memory.snapshot(); persistent.value = memory.persistent(); }
  function changed(event: StorageEvent) {
    if (event.key !== READING_KEY && event.key !== null) return;
    records.value = decodeReadingMemory(event.newValue);
    try { memory = createReadingMemory(window.localStorage); } catch { /* 当前页继续可用。 */ }
    sync();
  }
  onMounted(() => {
    try { memory = createReadingMemory(window.localStorage); } catch { /* 禁用存储时仅保留内存记录。 */ }
    sync();
    window.addEventListener('storage', changed);
  });
  onBeforeUnmount(() => window.removeEventListener('storage', changed));
  return {
    records, persistent,
    visit(id: string, heading: string) { memory.visit(id, heading); sync(); },
    complete(id: string, done: boolean) { memory.complete(id, done); sync(); },
    clear() { memory.clear(); sync(); },
  };
}
