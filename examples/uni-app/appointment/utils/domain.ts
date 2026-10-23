export const services = [
  { id: 'consult', name: '学习咨询（本地练习）' },
  { id: 'review', name: '作品评审（本地练习）' }
] as const;
export const slots = ['09:00', '10:00', '14:00'] as const;
type ServiceId = typeof services[number]['id'];
type Slot = typeof slots[number];
export type Row = {
  id: string;
  serviceId: ServiceId;
  day: string;
  slot: Slot;
  note: string;
  status: 'active' | 'cancelled';
  createdAt: number;
};
export type Envelope = { version: 1; items: Row[] };
export type Snapshot = { rows: Row[]; blocked: boolean; message: string };
export type StoragePort = {
  read(): unknown;
  write(value: Envelope): void;
  remove(): void;
};
const limit = 100;

export function localDay(now: number): string {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) throw new Error('时间不正确');
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-` +
    String(date.getDate()).padStart(2, '0');
}

export function shiftDay(now: number, days: number): string {
  if (!Number.isInteger(days)) throw new Error('日期间隔不正确');
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return localDay(date.getTime());
}

function dayNumber(value: unknown): number {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('日期格式不正确');
  }
  const [year, month, day] = value.split('-').map(Number);
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day) throw new Error('日期不存在');
  return time / 86400000;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function serviceId(value: unknown): value is ServiceId {
  return services.some(service => service.id === value);
}
function slot(value: unknown): value is Slot {
  return slots.some(item => item === value);
}

function parseRow(value: unknown): Row {
  if (!object(value) || typeof value.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(value.id) || !serviceId(value.serviceId) ||
      !slot(value.slot) || typeof value.note !== 'string' || value.note.length > 120 ||
      (value.status !== 'active' && value.status !== 'cancelled') ||
      typeof value.createdAt !== 'number' || !Number.isSafeInteger(value.createdAt) ||
      value.createdAt < 0 || !Number.isFinite(new Date(value.createdAt).getTime())) {
    throw new Error('存储记录格式不正确');
  }
  dayNumber(value.day);
  if (typeof value.day !== 'string') throw new Error('存储日期不正确');
  return {
    id: value.id, serviceId: value.serviceId, day: value.day, slot: value.slot,
    note: value.note, status: value.status, createdAt: value.createdAt
  };
}

export function decode(raw: unknown): Row[] {
  if (raw === '' || raw === undefined || raw === null) return [];
  if (!object(raw) || raw.version !== 1 || !Array.isArray(raw.items) ||
      raw.items.length > limit) throw new Error('存储版本或容量不正确');
  const ids = new Set<string>();
  const active = new Set<string>();
  try {
    return raw.items.map(value => {
      const row = parseRow(value);
      const key = `${row.serviceId}|${row.day}|${row.slot}`;
      if (ids.has(row.id) || (row.status === 'active' && active.has(key))) {
        throw new Error('duplicate row');
      }
      ids.add(row.id);
      if (row.status === 'active') active.add(key);
      return row;
    });
  } catch {
    throw new Error('存储记录无法校验，请确认后清除本地练习数据');
  }
}

export function encode(rows: readonly Row[]): Envelope {
  return { version: 1, items: decode({ version: 1, items: rows }) };
}

export function create(
  rows: readonly Row[], input: unknown, now: number, id: string
): Row[] {
  const previous = decode({ version: 1, items: rows });
  if (previous.length >= limit) throw new Error('已达 100 条本地记录上限');
  if (!object(input) || !serviceId(input.serviceId)) throw new Error('请选择有效服务');
  if (!slot(input.slot)) throw new Error('请选择有效时段');
  if (typeof input.note !== 'string' || input.note.trim().length > 120) {
    throw new Error('备注最多 120 个 UTF-16 编码单元');
  }
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('时间不正确');
  const today = dayNumber(localDay(now));
  const target = dayNumber(input.day);
  if (typeof input.day !== 'string' || target < today || target > today + 30) {
    throw new Error('日期须在今天起 30 天内');
  }
  const date = new Date(now);
  const minutes = date.getHours() * 60 + date.getMinutes();
  const [hour, minute] = input.slot.split(':').map(Number);
  if (target === today && hour * 60 + minute <= minutes) {
    throw new Error('所选时段已过去，请选择其他日期或时段');
  }
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id) ||
      previous.some(row => row.id === id)) throw new Error('本地标识重复或无效');
  if (previous.some(row => row.status === 'active' &&
      row.serviceId === input.serviceId && row.day === input.day && row.slot === input.slot)) {
    throw new Error('相同服务、日期和时段已有预约，请勿重复创建');
  }
  return [...previous, {
    id, serviceId: input.serviceId, day: input.day, slot: input.slot,
    note: input.note.trim(), status: 'active', createdAt: now
  }];
}

export function cancel(rows: readonly Row[], id: string): Row[] {
  const previous = decode({ version: 1, items: rows });
  if (!previous.some(row => row.id === id)) throw new Error('预约不存在');
  return previous.map(row => row.id === id ? { ...row, status: 'cancelled' } : row);
}

export function createController(storage: StoragePort) {
  let rows: Row[] = [];
  let blocked = false;
  let message = '';
  function snapshot(): Snapshot {
    return { rows: rows.map(row => ({ ...row })), blocked, message };
  }
  function persist(next: Row[], notice: string) {
    if (blocked) throw new Error('读取失败，已停止写入，请先重试或确认清除');
    storage.write(encode(next));
    rows = next;
    message = notice;
    return snapshot();
  }
  return {
    snapshot,
    reload() {
      try {
        rows = decode(storage.read());
        blocked = false;
        message = '';
      } catch {
        rows = [];
        blocked = true;
        message = '读取或校验失败，已停止写入。可重试或确认清除本地练习数据';
      }
      return snapshot();
    },
    create(input: unknown, now: number, id: string) {
      if (blocked) throw new Error('读取失败，已停止写入，请先重试或确认清除');
      return persist(create(rows, input, now, id), '本地练习记录已保存；未提交任何服务器');
    },
    cancel(id: string) {
      if (blocked) throw new Error('读取失败，已停止写入，请先重试或确认清除');
      return persist(cancel(rows, id), '本地记录已取消；未调用服务器');
    },
    clear() {
      storage.remove();
      rows = [];
      blocked = false;
      message = '本地练习数据已清除';
      return snapshot();
    }
  };
}
