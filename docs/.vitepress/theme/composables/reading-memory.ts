export const READING_KEY = 'abin-reading-v1';
export interface ReadingRecord { headingId: string; updatedAt: number; completed: boolean }
export type ReadingRecords = Record<string, ReadingRecord>;
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;

export function decodeReadingMemory(raw: string | null): ReadingRecords {
  try {
    const value = JSON.parse(raw ?? '');
    if (value.version !== 1 || !value.records || typeof value.records !== 'object') return {};
    return Object.fromEntries(Object.entries(value.records)
      .filter(([id, record]) => {
        const item = record as ReadingRecord | null;
        return id.length > 0 && id.length <= 300 && !['__proto__', 'constructor', 'prototype'].includes(id)
          && item && typeof item.headingId === 'string' && item.headingId.length <= 500
          && typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt)
          && typeof item.completed === 'boolean';
      })
      .sort((a, b) => (b[1] as ReadingRecord).updatedAt - (a[1] as ReadingRecord).updatedAt)
      .slice(0, 500)) as ReadingRecords;
  } catch { return {}; }
}

/** 保存位置与显式完成分别写入；存储被禁用时保持当前页面会话可用。 */
export function createReadingMemory(storage?: StoragePort) {
  let records: ReadingRecords = {};
  let persistent = Boolean(storage);
  try { records = decodeReadingMemory(storage?.getItem(READING_KEY) ?? null); }
  catch { persistent = false; }
  function save() {
    records = decodeReadingMemory(JSON.stringify({ version: 1, records }));
    try { storage?.setItem(READING_KEY, JSON.stringify({ version: 1, records })); }
    catch { persistent = false; }
  }
  return {
    snapshot: () => ({ ...records }),
    persistent: () => persistent,
    migrate(articles: Array<{ id: string; href: string }>) {
      let changed = false;
      for (const { id, href } of articles) {
        if (id === href || !records[href]) continue;
        if (!records[id] || records[href].updatedAt > records[id].updatedAt) records[id] = records[href];
        delete records[href];
        changed = true;
      }
      if (changed) save();
    },
    visit(id: string, headingId: string, updatedAt = Date.now()) {
      records[id] = { headingId, updatedAt, completed: records[id]?.completed ?? false };
      save();
    },
    complete(id: string, completed: boolean, updatedAt = Date.now()) {
      records[id] = { headingId: records[id]?.headingId ?? '', updatedAt, completed };
      save();
    },
    clear() { records = {}; save(); },
  };
}

export function resolveResume(href: string, record?: ReadingRecord, headings?: string[]) {
  const heading = record?.headingId ?? '';
  const missing = Boolean(heading && headings && !headings.includes(heading));
  return { href: heading && !missing ? `${href}#${encodeURIComponent(heading)}` : href, missing };
}
