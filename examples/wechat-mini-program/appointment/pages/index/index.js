const domain = require('../../utils/domain');
const storageKey = 'local-appointment:v1';

function shiftDay(now, days) {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return domain.localDay(date.getTime());
}

Page({
  data: {
    services: domain.services,
    slots: domain.slots,
    serviceIndex: 0,
    slotIndex: 0,
    day: '',
    startDay: '',
    endDay: '',
    note: '',
    rows: [],
    busy: false,
    blocked: false,
    message: ''
  },
  records: [],
  onShow() {
    const now = Date.now();
    this.setData({
      startDay: domain.localDay(now),
      endDay: shiftDay(now, 30),
      day: this.data.day || shiftDay(now, 1)
    });
    this.reload();
  },
  reload() {
    try {
      this.records = domain.decode(wx.getStorageSync(storageKey));
      this.setData({ blocked: false, message: '' });
      this.render();
    } catch {
      this.records = [];
      this.setData({
        rows: [], blocked: true,
        message: '读取或校验失败，已停止写入。可重试读取，或确认清除本地练习数据'
      });
    }
  },
  render() {
    const rows = this.records.slice().reverse().map(row => ({
      ...row,
      serviceName: domain.services.find(service => service.id === row.serviceId).name,
      statusLabel: row.status === 'active' ? '本地有效' : '本地已取消'
    }));
    this.setData({ rows });
  },
  service(event) {
    const index = Number(event.detail.value);
    if (Number.isInteger(index) && domain.services[index]) this.setData({ serviceIndex: index });
  },
  slot(event) {
    const index = Number(event.detail.value);
    if (Number.isInteger(index) && domain.slots[index]) this.setData({ slotIndex: index });
  },
  day(event) { this.setData({ day: event.detail.value }); },
  note(event) { this.setData({ note: event.detail.value }); },
  commit(next) {
    wx.setStorageSync(storageKey, domain.encode(next));
    this.records = next;
    this.render();
  },
  create() {
    if (this.data.busy || this.data.blocked) return;
    this.setData({ busy: true, message: '' });
    try {
      const now = Date.now();
      const id = `local-${now}-${Math.random().toString(36).slice(2, 10)}`;
      const next = domain.create(this.records, {
        serviceId: domain.services[this.data.serviceIndex].id,
        day: this.data.day,
        slot: domain.slots[this.data.slotIndex],
        note: this.data.note
      }, now, id);
      this.commit(next);
      this.setData({ note: '', message: '本地练习记录已保存；未提交任何服务器' });
    } catch (error) {
      this.setData({ message: error instanceof Error ? error.message : '保存失败，内容已保留' });
    } finally {
      this.setData({ busy: false });
    }
  },
  cancel(event) {
    if (this.data.busy || this.data.blocked) return;
    const id = event.currentTarget.dataset.id;
    if (typeof id !== 'string') return;
    this.setData({ busy: true, message: '' });
    try {
      this.commit(domain.cancel(this.records, id));
      this.setData({ message: '本地记录已取消；未调用服务器' });
    } catch (error) {
      this.setData({ message: error instanceof Error ? error.message : '取消保存失败' });
    } finally {
      this.setData({ busy: false });
    }
  },
  clear() {
    if (this.data.busy) return;
    wx.showModal({
      title: '清除本地练习数据？',
      content: '只清除此示例在当前设备保存的记录，无法恢复。不会取消任何真实预约。',
      success: result => {
        if (!result.confirm) return;
        try {
          wx.removeStorageSync(storageKey);
          this.records = [];
          this.setData({ blocked: false, message: '本地练习数据已清除' });
          this.render();
        } catch {
          this.setData({ message: '清除失败，可稍后重试' });
        }
      }
    });
  }
});
