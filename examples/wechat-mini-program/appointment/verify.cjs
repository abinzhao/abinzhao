const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const domainPath = path.join(__dirname, 'utils/domain.js');
assert.ok(fs.existsSync(domainPath), 'Appointment domain implementation is required');
const sandbox = { module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(domainPath, 'utf8'), sandbox, { filename: domainPath });
const { create, cancel, decode, encode, localDay } = sandbox.module.exports;
const now = new Date(2026, 9, 23, 8, 0).getTime();
const input = { serviceId: 'consult', day: '2026-10-24', slot: '09:00', note: '  demo  ' };
const original = [];
const created = create(original, input, now, 'test-1');
assert.equal(created.length, 1);
assert.equal(original.length, 0, 'create must not mutate the previous state');
assert.equal(created[0].note, 'demo');
assert.equal(created[0].status, 'active');
assert.equal(localDay(now), '2026-10-23');
assert.throws(() => create(created, input, now, 'test-2'), /重复/);
assert.throws(() => create([], { ...input, day: '2026-02-30' }, now, 'bad'), /日期/);
assert.throws(() => create([], { ...input, day: '2026-10-22' }, now, 'past'), /日期/);
assert.throws(() => create([], { ...input, day: '2026-11-24' }, now, 'far'), /日期/);
assert.throws(() => create([], { ...input, day: localDay(now), slot: '09:00' },
  new Date(2026, 9, 23, 10).getTime(), 'elapsed'), /时段/);
assert.throws(() => create([], { ...input, serviceId: 'unknown' }, now, 'bad'), /服务/);
assert.throws(() => create([], { ...input, slot: '24:00' }, now, 'bad'), /时段/);
assert.throws(() => create([], { ...input, note: 'x'.repeat(121) }, now, 'bad'), /备注/);
assert.throws(() => create(created, { ...input, slot: '10:00' }, now, 'test-1'), /标识/);
const cancelled = cancel(created, 'test-1');
assert.equal(cancelled[0].status, 'cancelled');
assert.equal(created[0].status, 'active', 'cancel must not mutate the previous state');
assert.deepEqual(cancel(cancelled, 'test-1'), cancelled, 'cancel is idempotent');
assert.throws(() => cancel(created, 'missing'), /不存在/);
assert.equal(create(cancelled, input, now, 'test-2').length, 2);
assert.deepEqual(decode(encode(cancelled)), cancelled);
assert.equal(decode('').length, 0);
assert.throws(() => decode({ version: 2, items: [] }), /存储/);
assert.throws(() => decode({ version: 1, items: [{ id: 'broken' }] }), /存储/);
assert.throws(() => decode({ version: 1, items: [created[0], created[0]] }), /存储/);
const restored = decode(encode(created));
restored[0].note = 'changed';
assert.equal(created[0].note, 'demo', 'restored data must not share row ownership');
const full = Array.from({ length: 100 }, (_, index) => ({
  ...created[0], id: `history-${index}`, status: 'cancelled'
}));
assert.throws(() => create(full, input, now, 'overflow'), /上限/);

let page;
let stored = '';
let failWrite = false;
let confirmClear = false;
let writes = 0;
const clock = new Date(2026, 10, 1, 0, 30).getTime();
class ClockDate extends Date {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
}
const pagePath = path.join(__dirname, 'pages/index/index.js');
vm.runInNewContext(fs.readFileSync(pagePath, 'utf8'), {
  Date: ClockDate,
  require(name) {
    assert.equal(name, '../../utils/domain');
    return sandbox.module.exports;
  },
  Page(value) {
    page = value;
    page.setData = patch => Object.assign(page.data, patch);
  },
  wx: {
    getStorageSync() { return stored; },
    setStorageSync(key, value) {
      if (failWrite) throw new Error('Injected storage failure');
      writes += 1;
      stored = value;
    },
    removeStorageSync() { stored = ''; },
    showModal(options) { options.success({ confirm: confirmClear }); }
  }
}, { filename: pagePath });
page.onShow();
assert.equal(page.data.day, '2026-11-02', 'Tomorrow is a calendar day, not 24 hours');
page.data.note = 'preserve this draft';
failWrite = true;
page.create();
assert.equal(page.records.length, 0, 'failed storage must not adopt a new record');
assert.equal(page.data.note, 'preserve this draft');
assert.equal(page.data.busy, false);
failWrite = false;
page.create();
assert.equal(page.records.length, 1);
assert.equal(page.data.note, '');
page.onShow();
assert.equal(page.records.length, 1, 'saved records must restore on show');
page.cancel({ currentTarget: { dataset: { id: page.records[0].id } } });
assert.equal(page.records[0].status, 'cancelled');
stored = { version: 2, items: [] };
page.reload();
assert.equal(page.data.blocked, true);
const previousWrites = writes;
page.create();
assert.equal(writes, previousWrites, 'invalid storage must block writes');
page.clear();
assert.equal(page.data.blocked, true, 'declining clear must preserve the block');
confirmClear = true;
page.clear();
assert.equal(page.data.blocked, false);
assert.equal(page.records.length, 0);
console.log('Appointment domain and injected page-storage assertions passed');
