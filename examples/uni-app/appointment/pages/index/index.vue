<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { createController, localDay, services, shiftDay, slots } from '../../utils/domain';

const key = 'uni-local-appointment:v1';
const controller = createController({
  read: () => uni.getStorageSync(key) as unknown,
  write: value => uni.setStorageSync(key, value),
  remove: () => uni.removeStorageSync(key)
});
const state = ref(controller.snapshot());
const busy = ref(false);
const serviceIndex = ref(0);
const slotIndex = ref(0);
const day = ref('');
const startDay = ref('');
const endDay = ref('');
const note = ref('');
const serviceNames = services.map(service => service.name);
const slotNames = [...slots];
const rows = computed(() => state.value.rows.slice().reverse().map(row => ({
  ...row,
  serviceName: services.find(service => service.id === row.serviceId)?.name ?? row.serviceId,
  statusLabel: row.status === 'active' ? '本地有效' : '本地已取消'
})));

onShow(() => {
  const now = Date.now();
  startDay.value = localDay(now);
  endDay.value = shiftDay(now, 30);
  if (!day.value) day.value = shiftDay(now, 1);
  reload();
});
function reload() {
  if (!busy.value) state.value = controller.reload();
}
function changeService(event: { detail: { value: string | number } }) {
  const index = Number(event.detail.value);
  if (Number.isInteger(index) && services[index]) serviceIndex.value = index;
}
function changeSlot(event: { detail: { value: string | number } }) {
  const index = Number(event.detail.value);
  if (Number.isInteger(index) && slots[index]) slotIndex.value = index;
}
function changeDay(event: { detail: { value: string } }) {
  day.value = event.detail.value;
}
function changeNote(event: { detail: { value: string } }) {
  note.value = event.detail.value;
}
function report(error: unknown, fallback: string) {
  state.value = {
    ...controller.snapshot(),
    message: error instanceof Error ? error.message : fallback
  };
}
function create() {
  if (busy.value || state.value.blocked) return;
  busy.value = true;
  try {
    const now = Date.now();
    const id = `local-${now}-${Math.random().toString(36).slice(2, 10)}`;
    state.value = controller.create({
      serviceId: services[serviceIndex.value].id,
      day: day.value,
      slot: slots[slotIndex.value],
      note: note.value
    }, now, id);
    note.value = '';
  } catch (error) {
    report(error, '保存失败，内容已保留');
  } finally {
    busy.value = false;
  }
}
function cancel(id: string) {
  if (busy.value || state.value.blocked) return;
  busy.value = true;
  try {
    state.value = controller.cancel(id);
  } catch (error) {
    report(error, '取消保存失败，请重试');
  } finally {
    busy.value = false;
  }
}
function clear() {
  if (busy.value) return;
  busy.value = true;
  uni.showModal({
    title: '清除本地练习数据？',
    content: '只删除当前设备的练习记录，无法恢复。不会取消任何真实预约。',
    success(result) {
      if (!result.confirm) return;
      try {
        state.value = controller.clear();
      } catch (error) {
        report(error, '清除失败，请稍后重试');
      }
    },
    fail() { report(new Error('确认窗口未完成，未清除任何数据'), '未清除'); },
    complete() { busy.value = false; }
  });
}
</script>

<template>
  <view class="page">
    <view class="notice">
      <text class="heading">本地预约练习</text>
      <text>只保存本设备记录，不占用商家库存，没有登录、付款或服务器确认。</text>
    </view>

    <view class="panel">
      <text class="label">服务</text>
      <picker :range="serviceNames" :value="serviceIndex" :disabled="busy || state.blocked"
        @change="changeService">
        <view class="field">{{ serviceNames[serviceIndex] }} · 点击选择</view>
      </picker>
      <text class="label">日期（今天起 30 天内）</text>
      <picker mode="date" :value="day" :start="startDay" :end="endDay"
        :disabled="busy || state.blocked" @change="changeDay">
        <view class="field">{{ day || '请选择日期' }}</view>
      </picker>
      <text class="label">本地时段</text>
      <picker :range="slotNames" :value="slotIndex" :disabled="busy || state.blocked"
        @change="changeSlot">
        <view class="field">{{ slotNames[slotIndex] }} · 点击选择</view>
      </picker>
      <text class="label">可选备注（最多 120 个 UTF-16 编码单元）</text>
      <textarea class="note" :value="note" :maxlength="-1" :disabled="busy || state.blocked"
        placeholder="只填写练习内容，不填写个人敏感信息" @input="changeNote" />
      <text class="counter">{{ note.length }}/120</text>
      <button class="primary" :disabled="busy || state.blocked" @click="create">保存本地记录</button>
      <text v-if="state.message" class="message">{{ state.message }}</text>
    </view>

    <view class="panel">
      <text class="heading">本设备记录（最多 100 条）</text>
      <text v-if="state.blocked">记录读取失败，已停止创建和取消。</text>
      <text v-else-if="rows.length === 0">暂无本地记录。</text>
      <view v-for="row in rows" :key="row.id" class="record">
        <text class="service-name">{{ row.serviceName }}</text>
        <text>{{ row.day }} · {{ row.slot }} · {{ row.statusLabel }}</text>
        <text v-if="row.note" class="record-note">备注：{{ row.note }}</text>
        <button v-if="row.status === 'active'" :disabled="busy || state.blocked"
          @click="cancel(row.id)">取消这条本地记录</button>
      </view>
      <button :disabled="busy" @click="reload">重新读取本地记录</button>
      <button :disabled="busy" @click="clear">确认清除本地练习数据</button>
    </view>
  </view>
</template>

<style scoped>
.page { padding: 24rpx; padding-bottom: calc(24rpx + env(safe-area-inset-bottom)); }
.notice, .panel {
  padding: 28rpx; margin-bottom: 24rpx; border-radius: 16rpx; background: #ffffff;
}
.notice { background: #eaf0fb; }
.heading { display: block; font-size: 36rpx; font-weight: 600; margin-bottom: 16rpx; }
.label { display: block; margin: 24rpx 0 12rpx; font-size: 28rpx; font-weight: 600; }
.field {
  min-height: 44px; box-sizing: border-box; padding: 20rpx; line-height: 1.5;
  border: 1px solid #8893a5; border-radius: 8rpx; background: #ffffff;
}
.note {
  width: 100%; min-height: 160rpx; box-sizing: border-box; padding: 16rpx;
  border: 1px solid #8893a5; border-radius: 8rpx; line-height: 1.5;
}
.counter { display: block; font-size: 26rpx; margin-top: 8rpx; color: #515e73; }
.message { display: block; margin-top: 20rpx; line-height: 1.6; }
.record { margin-top: 24rpx; padding-top: 24rpx; border-top: 1px solid #c8cfdb; }
.record text { display: block; line-height: 1.6; }
.service-name { font-weight: 600; }
.record-note { overflow-wrap: break-word; }
button {
  min-height: 44px; box-sizing: border-box; margin: 24rpx 0 0; font-size: 30rpx;
  border: 1px solid #8893a5; border-radius: 8rpx; background: #fff; color: #172033;
}
button::after { border: 0; }
.primary { background: #2459b8; color: #ffffff; }
</style>
