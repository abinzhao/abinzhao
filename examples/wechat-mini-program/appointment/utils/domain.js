const services = [
  { id: 'consult', name: '学习咨询（本地练习）' },
  { id: 'review', name: '作品评审（本地练习）' }
];
const slots = ['09:00', '10:00', '14:00'];
const limit = 100;

function localDay(now) {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) throw new Error('时间不正确');
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-` +
    String(date.getDate()).padStart(2, '0');
}

function dayNumber(value) {
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

function object(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRow(value) {
  if (!object(value) || typeof value.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(value.id) ||
      !services.some(service => service.id === value.serviceId) ||
      !slots.includes(value.slot) || typeof value.note !== 'string' ||
      value.note.length > 120 || !['active', 'cancelled'].includes(value.status) ||
      !Number.isSafeInteger(value.createdAt) || value.createdAt < 0 ||
      !Number.isFinite(new Date(value.createdAt).getTime())) {
    throw new Error('存储记录格式不正确');
  }
  dayNumber(value.day);
  return {
    id: value.id, serviceId: value.serviceId, day: value.day, slot: value.slot,
    note: value.note, status: value.status, createdAt: value.createdAt
  };
}

function decode(raw) {
  if (raw === '' || raw === undefined || raw === null) return [];
  if (!object(raw) || raw.version !== 1 || !Array.isArray(raw.items) ||
      raw.items.length > limit) throw new Error('存储版本或容量不正确');
  const ids = new Set();
  const active = new Set();
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

function encode(rows) {
  return { version: 1, items: decode({ version: 1, items: rows }) };
}

function create(rows, input, now, id) {
  const previous = decode({ version: 1, items: rows });
  if (previous.length >= limit) throw new Error('已达 100 条本地记录上限');
  if (!object(input) || !services.some(service => service.id === input.serviceId)) {
    throw new Error('请选择有效服务');
  }
  if (!slots.includes(input.slot)) throw new Error('请选择有效时段');
  if (typeof input.note !== 'string' || input.note.trim().length > 120) {
    throw new Error('备注最多 120 个 UTF-16 编码单元');
  }
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('时间不正确');
  const today = dayNumber(localDay(now));
  const target = dayNumber(input.day);
  if (target < today || target > today + 30) throw new Error('日期须在今天起 30 天内');
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

function cancel(rows, id) {
  const previous = decode({ version: 1, items: rows });
  if (!previous.some(row => row.id === id)) throw new Error('预约不存在');
  return previous.map(row => row.id === id ? { ...row, status: 'cancelled' } : row);
}

module.exports = { services, slots, create, cancel, decode, encode, localDay };
