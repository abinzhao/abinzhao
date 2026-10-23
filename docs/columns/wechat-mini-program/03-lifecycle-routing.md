---
title: '03 · 生命周期与页面路由'
description: 用列表到详情的完整流程解释页面栈、生命周期、返回刷新、参数校验与资源清理，避免隐藏页面继续执行任务。
date: '2026-10-23'
category: 小程序开发
tags: [微信小程序, 生命周期, 路由, 页面栈]
series:
  order: 3
---

# 03 · 生命周期与页面路由

## 页面离开不一定被销毁

从服务列表打开详情时，列表通常仍保留在页面栈中，只是不再可见。返回详情之前的页面，并不必然重新运行它的 `onLoad`。如果仅在首次加载时读数据，详情中的修改就不会出现在列表上；如果在每次显示时无条件启动任务，又可能创建多个定时器和重复请求。理解可见性与存在性，是本章核心。

目标流程是：列表显示当前服务与互动次数；打开详情；详情执行一次明确标记的本地互动；返回后列表重新读取状态；隐藏期间不更新时间；卸载后不保留任务。互动次数不是预约数，也不是服务器结果，只是帮助观察跨页面状态的实验变量。真正业务数据应放在有明确用户和持久化边界的存储层，不能由这个内存计数推断已经保存。

## 先画生命周期，再写处理器

`onLoad` 适合解析路由参数和建立页面初始上下文，`onShow` 适合处理重新可见后的刷新，`onReady` 表示初次渲染完成后可以执行某些界面操作。`onHide` 表示页面不可见，`onUnload` 表示实例销毁。两种离开必须分别清理资源；只写 `onUnload` 会让仍在栈中的隐藏页面持续发请求或轮询。

应用的 `onShow` 与页面的 `onShow` 不承担同样职责。前者可感知应用进入前台，后者关心具体页面变为可见。不要让两者都无条件触发登录和同一请求，否则从后台回来时容易放大并发。把应用级身份恢复放在集中入口，把页面数据刷新放在页面或业务状态层，并通过版本或过期条件减少重复工作。

页面中的资源清理应幂等：调用两次也不会抛错。进入详情导致 `onHide` 清一次，随后页面栈被重置又触发 `onUnload` 再清一次，是正常路径。定时器 ID、订阅取消函数和请求任务应属于页面实例，不能放在模块顶层共享。模块级存储可共享业务状态，但实例资源不应共享所有权。

## 路由 API 的选择

`navigateTo` 在当前页面上方增加非 tabBar 页面，适合保留返回路径；`redirectTo` 替换当前页面，适合不需要再回到当前步骤；`navigateBack` 按页面栈返回；`switchTab` 用于已注册 tabBar 页面；`reLaunch` 重建入口栈。它们不是五种等价跳转，错误选择会导致返回行为、参数携带和页面生命周期变化。

不要把大对象、令牌或用户资料拼进 URL。路由只传稳定资源标识，详情用该标识重新读取数据。URL 会出现在调试记录、分享和日志里；即使做了编码，也没有保密能力。外部分享进入的参数必须重新验证，不能默认它来自你的列表按钮。页面栈也有平台限制，不能通过无限 `navigateTo` 把每次筛选都变成新页面。

## 完整的列表与详情实验

在独立 TS 模板中注册两个页面，添加共享业务模块。代码使用明确的页面实例类型保存定时器；同步到 `data` 的只有展示字段。这里的定时器每秒更新一个时间字符串，仅用于观察可见性，真实预约列表不需要持续刷新时钟。

```json
{
  "pages": ["pages/list/list", "pages/detail/detail"],
  "window": { "navigationBarTitleText": "路由实验" }
}
```

```typescript
// utils/service-state.ts
export interface Service {
  id: string;
  name: string;
  visits: number;
}
const rows: Service[] = [
  { id: 'consult', name: '开发问题咨询', visits: 0 },
  { id: 'review', name: '项目代码评审', visits: 0 }
];
export function listServices(): Service[] {
  return rows.map(row => ({ ...row }));
}
export function findService(id: string): Service | undefined {
  const row = rows.find(item => item.id === id);
  return row ? { ...row } : undefined;
}
export function recordVisit(id: string): boolean {
  const row = rows.find(item => item.id === id);
  if (!row) return false;
  row.visits += 1;
  return true;
}
```

```typescript
// pages/list/list.ts
import { listServices, Service } from '../../utils/service-state';
type Data = { rows: Service[]; clock: string };
type Methods = {
  timer: ReturnType<typeof setInterval> | undefined;
  stopClock(): void;
  open(event: WechatMiniprogram.TouchEvent): void;
};
Page<Data, Methods>({
  data: { rows: [], clock: '' },
  timer: undefined,
  onShow() {
    this.stopClock();
    this.setData({ rows: listServices(), clock: new Date().toLocaleTimeString() });
    this.timer = setInterval(() => {
      this.setData({ clock: new Date().toLocaleTimeString() });
    }, 1000);
  },
  onHide() { this.stopClock(); },
  onUnload() { this.stopClock(); },
  stopClock() {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  },
  open(event) {
    const id: unknown = event.currentTarget.dataset.id;
    if (typeof id !== 'string' || !listServices().some(row => row.id === id)) return;
    wx.navigateTo({
      url: `/pages/detail/detail?id=${encodeURIComponent(id)}`,
      fail() {
        wx.showToast({ title: '暂时无法打开详情', icon: 'none' });
      }
    });
  }
});
```

```xml
<!-- pages/list/list.wxml -->
<view class="page">
  <text>仅在页面可见时更新：{{clock}}</text>
  <view wx:for="{{rows}}" wx:key="id" class="row">
    <text>{{item.name}}，本地互动 {{item.visits}} 次</text>
    <button data-id="{{item.id}}" bindtap="open">查看详情</button>
  </view>
</view>
```

```typescript
// pages/detail/detail.ts
import { findService, recordVisit } from '../../utils/service-state';
Page({
  data: { id: '', name: '', visits: 0, error: '' },
  onLoad(options) {
    const id: unknown = options.id;
    if (typeof id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(id)) {
      this.setData({ error: '链接参数无效' });
      return;
    }
    const row = findService(id);
    if (!row) {
      this.setData({ error: '该服务不存在' });
      return;
    }
    this.setData({ id: row.id, name: row.name, visits: row.visits });
  },
  record() {
    if (!recordVisit(this.data.id)) return;
    const row = findService(this.data.id);
    if (row) this.setData({ visits: row.visits });
  },
  back() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack({ delta: 1 });
    } else {
      wx.reLaunch({ url: '/pages/list/list' });
    }
  }
});
```

```xml
<!-- pages/detail/detail.wxml -->
<view class="page">
  <text wx:if="{{error}}">{{error}}</text>
  <block wx:else>
    <text>{{name}}</text>
    <text>本地互动次数：{{visits}}</text>
    <button bindtap="record">记录一次本地互动</button>
  </block>
  <button bindtap="back">返回服务列表</button>
</view>
```

```css
/* app.wxss */
.page { padding: 32rpx; display: flex; flex-direction: column; gap: 24rpx; }
.row { padding: 24rpx; border: 2rpx solid #cbd5e1; border-radius: 16rpx; }
button { min-height: 88rpx; margin: 16rpx 0 0; }
```

共享模块返回对象副本，避免页面意外修改它所拥有的数据。列表在每次 `onShow` 读取最新状态，因此返回时可以观察详情互动。这个例子没有使用全局事件广播，原因是返回刷新已经满足需求；引入总线反而需要额外维护订阅、取消和实例顺序。大列表以后可用修订号判断是否真的需要同步，但不要提前添加复杂机制。

## 深链、编码与身份

编码解决字符传输，不解决合法性和权限。页面收到参数后只接受限定格式，再查询是否存在。服务不存在应显示可恢复状态，而不是让空对象继续进入表单。平台解析过的参数不要反复 `decodeURIComponent`，重复解码可能改变含义或抛异常；若业务确实定义嵌套编码，应在协议中明确次数、长度和失败反馈。

深链直接打开详情时，页面栈可能只有一个实例，所以“返回”不能永远调用 `navigateBack`。代码检查当前栈长度，缺少前页时重建列表入口。这不是越权保护，订单详情仍必须由服务器检查当前用户是否有权限读取；仅在前端检查资源 ID 格式，不能阻止别人构造合法格式的其他用户 ID。

## 刷新与异步竞态

把 `onShow` 等同于“所有数据都重新下载”会增加耗电和闪烁。可根据数据版本、页面参数变化、过期时间和明确用户动作刷新。真正请求还需防止旧响应覆盖新状态：页面隐藏后取消当前任务，或使用递增版本号忽略晚到结果。只取消任务并不足以证明服务器没有执行，写操作更不能用页面卸载推断失败，第五章会展开。

异步结果也可能落到已经卸载的实例。不要依赖一个全局 `destroyed` 标志，因为重新进入时新实例需要自己的标志。让任务和有效性检查属于各自页面；清理后不再写入视图，同时保留业务层对未知结果的恢复能力。页面离开和业务取消是两个不同动作，用户按返回键不必然撤销正在处理的预约。

## 排错路径与实验

在工具中反复执行列表、详情、返回十次，观察是否每次只存在一个列表时钟。再从编译入口直接打开详情并设置无效参数，检查错误状态和回列表按钮。重新编译会重置模块内存，所以互动次数恢复为零是预期；如果需要持久化，应引入有 schema 的存储，不应把工具热更新表现当作永久保存。

出现返回不刷新时先确认读取逻辑位于 `onShow` 而不是只在 `onLoad`；时钟越来越快时检查是否先停止旧定时器；详情错误时查看注册路径和参数，不要连续改多个路由 API。隐藏页面还打印日志时，定位资源创建入口与清理入口是否一一对应。调试日志只记录匿名事件和资源数量，不输出个人数据。

## 作业与验收

把实验互动替换为“收藏服务”的明确本地动作，并实现再次点击取消收藏；保持共享模块返回副本和页面资源归属不变。不要使用实际预约文案误导用户。增加一个不存在服务的深链、一个无 ID 的深链和一个只有详情页面的入口，为每条路径写预期状态与恢复动作。

验收要求正常返回更新收藏、深链可恢复到列表、重复进出不增加后台任务、重新编译后的内存丢失被明确解释。真机再测试切到其他应用、锁屏后恢复和手势返回；没有运行这些步骤时只提交实验计划，不声称生命周期在所有客户端一致。最终应能回答“隐藏与销毁有什么差别”和“谁拥有这个定时器”。

## 官方依据

- [Page](https://developers.weixin.qq.com/miniprogram/dev/reference/api/Page.html)、[App](https://developers.weixin.qq.com/miniprogram/dev/reference/api/App.html)：应用与页面生命周期。
- [页面路由](https://developers.weixin.qq.com/miniprogram/dev/framework/app-service/route.html)：页面栈与跳转行为。
- [wx.navigateTo](https://developers.weixin.qq.com/miniprogram/dev/api/route/wx.navigateTo.html)：非 tabBar 页面与参数传递。
- [wx.navigateBack](https://developers.weixin.qq.com/miniprogram/dev/api/route/wx.navigateBack.html)：返回页面栈。

上一章：[WXML、WXSS 与类型边界](./02-template-style-types)；下一章：[setData 与运行时性能](./04-setdata-performance)。
