import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = new URL('./utils/domain.ts', import.meta.url);
assert.ok(fs.existsSync(source), 'Appointment domain implementation is required');
const domain = await import(source.href);
const { create, cancel, decode, encode, localDay, shiftDay, createController } = domain;
const now = new Date(2026, 9, 23, 8).getTime();
const input = { serviceId: 'consult', day: '2026-10-24', slot: '09:00', note: '  demo  ' };
const previous = [];
const created = create(previous, input, now, 'test-1');
assert.equal(previous.length, 0, 'create must preserve the previous state');
assert.equal(created.length, 1);
assert.equal(created[0].note, 'demo');
assert.equal(created[0].status, 'active');
assert.equal(localDay(now), '2026-10-23');
assert.throws(() => create(created, input, now, 'test-2'), /重复/);
assert.throws(() => create([], { ...input, day: '2026-02-30' }, now, 'bad'), /日期/);
assert.throws(() => create([], { ...input, day: '2026-10-22' }, now, 'past'), /日期/);
assert.throws(() => create([], { ...input, day: '2026-11-24' }, now, 'far'), /日期/);
assert.throws(() => create([], { ...input, day: localDay(now) },
  new Date(2026, 9, 23, 10).getTime(), 'elapsed'), /时段/);
assert.throws(() => create([], { ...input, serviceId: 'unknown' }, now, 'bad'), /服务/);
assert.throws(() => create([], { ...input, slot: '24:00' }, now, 'bad'), /时段/);
assert.throws(() => create([], { ...input, note: 'x'.repeat(121) }, now, 'bad'), /备注/);
assert.throws(() => create(created, { ...input, slot: '10:00' }, now, 'test-1'), /标识/);
assert.throws(() => create([], input, Number.NaN, 'bad'), /时间/);
const cancelled = cancel(created, 'test-1');
assert.equal(cancelled[0].status, 'cancelled');
assert.equal(created[0].status, 'active', 'cancel must preserve the previous state');
assert.deepEqual(cancel(cancelled, 'test-1'), cancelled, 'cancel is idempotent');
assert.throws(() => cancel(created, 'missing'), /不存在/);
assert.equal(create(cancelled, input, now, 'test-2').length, 2);
assert.deepEqual(decode(encode(cancelled)), cancelled);
assert.deepEqual(decode(''), []);
assert.throws(() => decode({ version: 2, items: [] }), /存储/);
assert.throws(() => decode({ version: 1, items: [{ id: 'broken' }] }), /存储/);
assert.throws(() => decode({ version: 1, items: [created[0], created[0]] }), /存储/);
assert.throws(() => decode({
  version: 1, items: [created[0], { ...created[0], id: 'different-id' }]
}), /存储/);
const restored = decode(encode(created));
restored[0].note = 'changed';
assert.equal(created[0].note, 'demo', 'decode must return independent rows');
const full = Array.from({ length: 100 }, (_, index) => ({
  ...created[0], id: `history-${index}`, status: 'cancelled'
}));
assert.throws(() => create(full, input, now, 'overflow'), /上限/);
const spring = new Date(2026, 2, 8, 0, 30).getTime();
const autumn = new Date(2026, 10, 1, 0, 30).getTime();
assert.equal(shiftDay(spring, 1), '2026-03-09', 'Tomorrow is a calendar day');
assert.equal(shiftDay(autumn, 1), '2026-11-02', 'Tomorrow must survive a 25-hour day');
assert.equal(shiftDay(autumn, 30), '2026-12-01');

let saved = '';
let failWrite = false;
let failRead = false;
let failRemove = false;
let writes = 0;
const controller = createController({
  read() {
    if (failRead) throw new Error('Injected read failure');
    return saved;
  },
  write(value) {
    if (failWrite) throw new Error('Injected write failure');
    writes += 1;
    saved = value;
  },
  remove() {
    if (failRemove) throw new Error('Injected remove failure');
    saved = '';
  }
});
assert.equal(controller.reload().blocked, false);
failWrite = true;
assert.throws(() => controller.create(input, now, 'store-1'), /write failure/);
assert.equal(controller.snapshot().rows.length, 0, 'failed writes cannot adopt state');
failWrite = false;
assert.equal(controller.create(input, now, 'store-1').rows.length, 1);
assert.equal(controller.reload().rows.length, 1, 'saved records must restore');
const owned = controller.snapshot();
owned.rows[0].note = 'changed';
assert.equal(controller.snapshot().rows[0].note, 'demo');
failWrite = true;
assert.throws(() => controller.cancel('store-1'), /write failure/);
assert.equal(controller.snapshot().rows[0].status, 'active');
failWrite = false;
assert.equal(controller.cancel('store-1').rows[0].status, 'cancelled');
saved = { version: 2, items: [] };
assert.equal(controller.reload().blocked, true);
const previousWrites = writes;
assert.throws(() => controller.create(input, now, 'blocked'), /停止写入/);
assert.equal(writes, previousWrites, 'invalid storage must not be overwritten');
failRemove = true;
assert.throws(() => controller.clear(), /remove failure/);
assert.equal(controller.snapshot().blocked, true);
failRemove = false;
assert.equal(controller.clear().blocked, false);
assert.equal(controller.snapshot().rows.length, 0);
failRead = true;
assert.equal(controller.reload().blocked, true, 'read failures must block writes');
failRead = false;
assert.equal(controller.reload().blocked, false);
console.log('Appointment domain and injected storage-controller assertions passed');
