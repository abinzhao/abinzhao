---
title: '07 · 自定义组件与可恢复表单'
description: 用属性和事件分配组件责任，建立字段校验、提交互斥与草稿保存流程，避免受控状态分裂和重复业务写入。
date: '2026-10-23'
category: 小程序开发
tags: [微信小程序, 自定义组件, 表单, 校验, TypeScript]
series:
  order: 7
---

# 07 · 自定义组件与可恢复表单

## 组件化首先是分配责任

预约页需要选择时段、填写备注、展示错误和提交。如果把所有逻辑复制到多个页面，时段规则一旦改变就要修改多处；如果把登录、请求、存储与所有业务规则塞入一个组件，组件又会变成难以替换的第二个页面。本章把时段展示与交互放在组件，选择结果、表单校验和保存决策留在页面。

小程序自定义组件不是浏览器自定义元素，也不是 Vue 组件。它有自己的配置文件、属性声明、内部数据、方法与生命周期，通过 `triggerEvent` 向使用者报告变化。组件不会因为页面中写了一个标签就自动注册，必须设置 `component: true`，并在使用页面的 `usingComponents` 中映射路径。遇到“自定义组件不存在”，先检查注册链，而不是只检查标签拼写。[cite:1]

## 单一数据源与事件契约

本例采用受控选择：组件的 `value` 由页面传入，点击仅触发 `change` 事件，页面更新后再把值传回。组件不另存一份“最终选中值”，否则页面重置后容易出现视觉选中和实际提交不一致。临时动画或展开状态可以是组件内部数据，但业务选择必须只有一个所有者。

事件内容是一个明确对象 `{ value: string }`，不是整个组件实例或任意事件透传。组件内检查候选值是否存在，页面再按业务允许的集合检查一次。第二次检查不是浪费：页面可能接收其他调用入口，缓存也可能失效；界面允许选择不能替代提交时校验。真实库存仍需服务器确认，前端候选集合只控制当前交互。

## 搭建可复用时段组件

在第一章工程下创建 `components/slot-picker`，放入四个同名文件。组件只接收字符串数组，没有支付、定位或用户身份依赖。这里的固定时段是明确的教学输入，后续接入服务器时由页面解析后传入，不能在组件中偷偷发请求改变它的责任。

```json
// components/slot-picker/slot-picker.json
{ "component": true }
```

```typescript
// components/slot-picker/slot-picker.ts
Component({
  properties: {
    options: { type: Array, value: [] },
    value: { type: String, value: '' },
    disabled: { type: Boolean, value: false }
  },
  methods: {
    choose(event: WechatMiniprogram.TouchEvent) {
      if (this.properties.disabled) return;
      const value: unknown = event.currentTarget.dataset.value;
      const options: unknown[] = this.properties.options;
      if (typeof value !== 'string' || !options.includes(value)) return;
      this.triggerEvent('change', { value });
    }
  }
});
```

```xml
<!-- components/slot-picker/slot-picker.wxml -->
<view class="slots">
  <button
    wx:for="{{options}}" wx:key="*this"
    class="slot {{value === item ? 'selected' : ''}}"
    disabled="{{disabled}}" data-value="{{item}}" bindtap="choose"
  >{{item}}</button>
</view>
```

```css
/* components/slot-picker/slot-picker.wxss */
.slots { display: flex; flex-wrap: wrap; gap: 16rpx; }
.slot {
  margin: 0; min-height: 88rpx; padding: 0 24rpx;
  font-size: 28rpx; background: #f0f2f5; color: #172033;
}
.slot.selected { background: #176b48; color: #fff; }
.slot::after { border: none; }
```

默认样式隔离让页面样式不直接侵入组件内部，组件也不应该依赖外层的某个偶然类名。需要外部主题时可采用文档规定的外部样式类或 CSS 变量，先定义允许覆盖的范围。不要为一次颜色变更关闭全部隔离，再让每个页面覆盖组件内部结构；这种做法容易造成隐蔽回归。

组件若创建计时器、监听或订阅，应在 `lifetimes.detached` 清理。组件生命周期和所在页面的显示隐藏不是同一件事，页面隐藏时组件可能仍存在，需要 `pageLifetimes` 或显式属性协调暂停。当前组件没有外部资源，故意不加空生命周期方法；只有真实资源才需要对应清理逻辑。

## 表单保存实现

下面页面保存的是**本地草稿**，不是服务器预约。页面使用第五章的错误分层思路，但没有凭空返回预约成功。表单只有可选备注和必选时段，不收集手机号或姓名，避免为了演示多余采集个人信息。后续真实业务确需联系人时，应补充用途、最小字段、保留期限与权限说明。

```json
// pages/booking/booking.json
{
  "navigationBarTitleText": "预约草稿",
  "usingComponents": {
    "slot-picker": "/components/slot-picker/slot-picker"
  }
}
```

```typescript
// pages/booking/booking.ts
const slots = ['09:00', '10:00', '14:00'];
type Data = {
  slots: string[]; slot: string; note: string;
  busy: boolean; message: string;
};
type Methods = {
  choose(event: WechatMiniprogram.CustomEvent<{ value: string }>): void;
  note(event: WechatMiniprogram.Input): void;
  submit(): void;
  reset(): void;
};
Page<Data, Methods>({
  data: { slots, slot: '', note: '', busy: false, message: '' },
  choose(event) {
    if (!this.data.busy && slots.includes(event.detail.value)) {
      this.setData({ slot: event.detail.value, message: '' });
    }
  },
  note(event) {
    if (!this.data.busy) this.setData({ note: event.detail.value });
  },
  reset() {
    if (!this.data.busy) this.setData({ slot: '', note: '', message: '' });
  },
  submit() {
    if (this.data.busy) return;
    const note = this.data.note.trim();
    if (!slots.includes(this.data.slot)) {
      this.setData({ message: '请选择时段' });
      return;
    }
    if (note.length > 120) {
      this.setData({ message: '备注最多 120 个 UTF-16 编码单元' });
      return;
    }
    this.setData({ busy: true, message: '' });
    try {
      wx.setStorageSync('booking-draft:v1', {
        version: 1, savedAt: Date.now(), slot: this.data.slot, note
      });
      this.setData({ note, message: '草稿已保存到当前设备，尚未提交预约' });
    } catch {
      this.setData({ message: '本地保存失败，请保留页面内容后重试' });
    } finally {
      this.setData({ busy: false });
    }
  }
});
```

```xml
<!-- pages/booking/booking.wxml -->
<view class="form">
  <text class="heading">选择时段</text>
  <slot-picker options="{{slots}}" value="{{slot}}"
    disabled="{{busy}}" bind:change="choose" />
  <text class="label">备注，可不填写</text>
  <textarea value="{{note}}" maxlength="-1" disabled="{{busy}}"
    placeholder="请勿填写证件号等敏感信息" bindinput="note" />
  <text class="message" aria-role="text">{{message}}</text>
  <button type="primary" loading="{{busy}}" disabled="{{busy}}"
    bindtap="submit">保存本地草稿</button>
  <button disabled="{{busy}}" bindtap="reset">重置表单</button>
</view>
```

```css
/* pages/booking/booking.wxss */
.form { padding: 32rpx; color: #172033; }
.heading { display: block; font-size: 36rpx; font-weight: 600; }
.label { display: block; margin: 32rpx 0 16rpx; }
textarea {
  box-sizing: border-box; width: 100%; min-height: 180rpx;
  padding: 20rpx; border: 2rpx solid #657083; border-radius: 12rpx;
}
.message { display: block; min-height: 60rpx; margin-top: 20rpx; }
button { min-height: 88rpx; margin-top: 20rpx; }
```

最后在 `app.json` 的 `pages` 注册 `pages/booking/booking`。它不是 tabBar 页，可以从列表用 `navigateTo` 打开。第五章之后的工程若已有请求模块，无需为了保存草稿额外登录；本地草稿和服务器用户数据要按第八章分别管理。

## 校验要能帮助修复

前端校验的目的不是让用户猜哪一处错了，而是给出具体字段与修复动作。多个字段时应保留各字段错误，在提交时定位第一个错误；不能只弹“参数错误”再清空整张表单。输入期间可以清除已修复字段的错误，但不要每次键入都弹提示打断输入。备注是否允许换行、长度怎样计算，都应与服务器契约一致。

代码故意明确长度单位：JavaScript `length` 是 UTF-16 编码单元，不等同于视觉字符数量，部分表情会占两个或更多。若产品要求“最多一百二十个用户感知字符”，必须选定分段算法并测试目标基础库，不能继续用 `length` 却对用户承诺不同规则。模板关闭默认 maxlength，再由校验给出真实错误，便于练习超长路径。

键盘弹出后，错误提示和提交入口仍要能找到。真机上测试长备注、连续换行与系统大字号，观察输入框是否把按钮推到无法滚动的位置；不能只在工具里点保存判断可用。需要自动滚到错误字段时，以当前页面节点位置计算，不使用写死的屏幕高度。用户返回编辑后应保留原值，不能通过重新创建表单来重置错误。

## 组件变化的排错顺序

视觉未选中时先检查页面的 value，再检查组件实际收到的属性，最后检查模板比较值。点击后页面值不变，先确认组件是否触发 change 和页面绑定是否写在正确节点；不要直接在组件内另存一份 value 让外观暂时正常。若候选集合变化，页面要清理已经不存在的选择并说明原因，不能用第一项静默替换用户意图。

增加第三方组件前要核对它的属性类型、事件名称、样式隔离和最低基础库。组件能渲染不代表能在表单中正确提交，特别是事件返回索引而业务需要稳定 ID 的情形。适配应发生在页面边界，把索引查回当前候选对象；不要把索引长期保存为预约时段身份。

## 重复提交与不可编辑窗口

当前保存使用同步 API，互斥窗口很短；仍保留 `busy` 是为了展示统一入口。真实异步提交应在读取表单快照后进入互斥状态，禁用会改变提交含义的控件，在成功或明确失败时收尾。遇到超时的未知结果则不能只把 `busy` 改为 false 后鼓励重复创建，需要查询操作状态。

互斥不能只写在按钮属性中。自动化调用、多个点击事件或其他入口仍可能触发方法，处理函数必须检查状态。页面卸载时也不能对已经完成的服务器写入作“取消成功”承诺。第十二章的端侧项目通过先生成下一份数据、先持久化再更新界面，保证保存失败不会留下只存在于 UI 的预约。

## 练习与验收

先选择时段再点击重置，组件视觉必须回到未选中；不选时段保存，必须指出缺少时段而不写入缓存；输入超长备注保存，原内容保留且错误明确。模拟存储写入抛错，确认页面没有显示成功；随后解除故障重新保存，能写入正确结构。不要在失败路径把错误吞掉并当空对象保存。

作业是把该组件复用到另一个页面，传入不同候选集合，验证组件不依赖原页面名称。再增加一个“时段已经不可用”的情境，由页面替换 options 并重新校验当前 value；应提示重新选择，而不是悄悄提交旧值。验收记录至少包含重置、超长、重复调用、保存失败与组件复用五条路径，截图应覆盖错误态而不只是正常态。

## 官方依据

<a id="source-1"></a>[cite:1] [自定义组件](https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/)与[组件属性](https://developers.weixin.qq.com/miniprogram/dev/framework/component-framework/properties.html)：注册、属性和通信。

- [组件生命周期](https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/lifetimes.html)：组件存在与页面显示的区别。
- [组件模板和样式](https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/wxml-wxss.html)：样式隔离及外部样式边界。
- [textarea](https://developers.weixin.qq.com/miniprogram/dev/component/textarea.html)：输入值、长度和事件结构。

上一章：[登录、服务端会话与隐私](./06-session-privacy)；下一章：[存储、离线与数据恢复](./08-storage-offline)。
