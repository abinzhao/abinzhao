---
title: '11 · 分包、发布与安全'
description: 按首屏职责组织主包和分包，测量启动与 setData 成本，建立发布检查、版本更新、服务端授权和安全回归流程。
date: '2026-10-23'
category: 小程序开发
tags: [微信小程序, 分包, 性能, 发布, 安全]
series:
  order: 11
---

# 11 · 分包、发布与安全

## 分包解决什么，不解决什么

小程序用户通常不会访问一次会话中的全部页面。将首屏以外、边界清楚的预约详情或帮助流程拆为分包，可以减少启动必须下载和处理的内容，但分包不是自动加速开关。若主包仍包含大图片、重型依赖和大量初始化请求，只搬几个空页面不会显著改善首屏。

分包首先是依赖设计。普通分包可依赖主包允许的内容，主包不能通过普通同步导入依赖尚未下载的分包；不同分包之间也不能按普通同步模块方式互相 require。独立分包有更严格的自足边界，不能因为名称中有“独立”就假定它还能使用主包的全局初始化和资源。[cite:1]

本章选择普通分包，因为服务列表与统一会话已经属于主包。是否采用独立分包，应由独立入口、资源依赖和测量决定，而不是为了展示更多配置。异步分包能力又有特定规则，不能把支持异步加载当作任意同步跨包引用的许可。

## 从真实路由拆分

假设列表是用户首屏，预约详情不是 tabBar 页面。目录中主包保留 `pages/index` 与 `utils`，详情放入 `packages/booking/pages/detail`。tabBar 页面必须在主包，不能把它迁入分包后仍沿用原入口。图片和组件也按实际归属放置，避免目录拆开而 import 仍指向不存在路径。

```json
// app.json 普通分包示例
{
  "pages": ["pages/index/index"],
  "window": { "navigationBarTitleText": "服务列表" },
  "subPackages": [
    { "root": "packages/booking", "pages": ["pages/detail/detail"] }
  ],
  "preloadRule": {
    "pages/index/index": {
      "network": "wifi",
      "packages": ["packages/booking"]
    }
  }
}
```

预下载不是免费操作，会使用用户网络和设备资源，也不能保证详情打开前下载一定完成。本例仅在无线网络下预下载，实际产品应按访问概率、包大小和失败情况测量。若用户多数只看列表，从首屏立即预下载全部分包可能抵消节省。不要把预下载完成当成业务接口数据已经读取。

## 路由代码与页面参数

列表只构造明确路由并编码合法 ID，详情解析参数后再读取主包公共模块或请求服务。路由参数可被深链、分享或调试直接构造，仍要验证。不要传完整预约对象、token 和个人信息；地址记录或分享会扩大暴露范围，而且对象快照可能已经过期。

```typescript
// pages/index/index.ts 中的打开方法
function openDetail(id: unknown): void {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
    wx.showToast({ title: '记录标识不正确', icon: 'none' });
    return;
  }
  wx.navigateTo({
    url: `/packages/booking/pages/detail/detail?id=${encodeURIComponent(id)}`,
    fail() { wx.showToast({ title: '详情暂不可打开，请重试', icon: 'none' }); }
  });
}
```

```typescript
// packages/booking/pages/detail/detail.ts
type Data = { id: string; message: string };
Page<Data, {}>({
  data: { id: '', message: '' },
  onLoad(query) {
    const id = query.id;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
      this.setData({ message: '入口缺少有效记录标识' });
      return;
    }
    this.setData({ id, message: '路由已解析，实际记录仍需读取并校验权限' });
  }
});
```

```json
// packages/booking/pages/detail/detail.json
{ "navigationBarTitleText": "预约详情" }
```

```xml
<!-- packages/booking/pages/detail/detail.wxml -->
<view class="page">
  <text>{{message}}</text>
  <text wx:if="{{id}}">当前标识：{{id}}</text>
</view>
```

```css
/* packages/booking/pages/detail/detail.wxss */
.page { padding: 32rpx; }
text { display: block; margin-bottom: 24rpx; overflow-wrap: anywhere; }
```

这里的可运行页面只验证路由，不显示“已查询预约”。集成时沿第五章请求和第六章会话契约读取服务器记录，并在页面隐藏或卸载时停止等待。页面解析成功和服务器授权成功是两回事，不应通过合法 ID 格式推断用户拥有记录。

## 测量启动与运行时成本

性能实验要保留同一设备、同一构建和明确缓存状态。冷启动、重新进入暖缓存和后台返回测量的过程不同，不能混合计算。分别记录启动到首屏骨架、核心列表可用、详情可操作的时间；只记录某个生命周期回调触发时间，不能代表用户已经能够完成业务。

首先检查主包资源与模块初始化，再检查首屏同步计算、请求串并行和 `setData` 体积。第四六章的世代号、局部更新和会话门闩应减少重复任务，但要观察真实工作量。性能改善需要前后对照数据，不能在教程中凭空给“提升百分之七十”的数值。

大列表应避免持续全量同步和无限追加；图片提供实际需要的尺寸，非必要动画在低能力设备降级。布局、输入和滚动是否卡顿需要工具性能面板与真机观察一起判断。包体积符合限额不意味着运行时流畅，首屏快也不意味着长列表和键盘交互没有问题。

## 发布不是点击上传即可

真实发布需要正确主体、AppID、开发成员权限、类目、合法域名、隐私声明、接口资格和审核材料。工具上传成功只表示版本到达后台，仍需按官方流程提交审核、处理反馈和发布。游客示例不能完成这些流程，不应该通过修改游客配置就承诺能够上线。

发布前核对体验版与实际生产配置，删除测试数据、不可达占位服务和仅调试使用的安全绕过。版本描述应包含用户可观察变化与回归范围；审核需要测试路径时提供合法测试账号和操作说明，不提供真实用户凭据。若功能依赖服务端发布，先确认接口版本兼容和回退策略。

包大小和平台限额会调整，应以当前官方分包文档和工具上传检查为准，不从过期资料复制固定额度。构建产物应可追溯到源码、工具、基础库调试目标与后端配置。只看开发工程可以运行，不能证明上传后的产物使用同一配置。

## 安全更新与草稿保护

新版本下载完成不应在用户填写表单时静默重启。更新管理器提供检查、就绪和失败事件，应用决定何时提示。最好让用户先保存草稿，再主动重启；只放“立即更新”按钮而不说明输入可能丢失，会造成难以恢复的损失。

```typescript
// app.ts：在一次应用启动中注册一次
App({
  onLaunch() {
    if (!wx.canIUse('getUpdateManager')) return;
    const manager = wx.getUpdateManager();
    manager.onUpdateReady(() => {
      wx.showModal({
        title: '新版本已准备好',
        content: '请先保存正在填写的草稿，再确认重启。未保存内容可能丢失。',
        confirmText: '重启更新',
        cancelText: '稍后',
        success(result) { if (result.confirm) manager.applyUpdate(); }
      });
    });
    manager.onUpdateFailed(() => {
      wx.showToast({ title: '更新下载失败，可稍后重新进入', icon: 'none' });
    });
  }
});
```

生产应用还应在确认前检查是否存在未保存草稿，通过应用级状态决定提示与保存入口。更新过程中不依赖某个页面必然存在，不能直接调用已卸载页的方法。存储 schema 要考虑新旧版本同时存在的窗口；无法识别的新版记录不应被旧版本改写成空数据。

## 服务器最终授权

隐藏取消按钮只改善界面，不构成授权。服务器必须从已验证会话取得用户身份，不接受客户端自报 ownerId；读取或取消时按该用户限定资源。标识难猜也不是权限控制。查询到不存在或不属于当前用户的资源时，应采用不会泄露他人数据的稳定响应策略。

预约创建还需要服务端事务、库存约束和幂等键。两个设备同时预约最后一个时段时，前端都可能显示可用，服务器只能在事务内决定结果。取消需要验证状态和业务截止规则，已经完成的服务不能因客户端改一个 status 就重新取消。价格、优惠、付款和退款同样由服务器判断，不能信任缓存。

上传接口验证附件归属与内容，日志不保存令牌和敏感响应，测试账号数据按约定清理。需要处理支付时，应使用当前官方支付协议、服务端验签与回调确认；客户端成功回调不是最终入账证据。本专题没有支付实现，因此不通过演示状态承诺支付安全。

## 回归、作业与验收

按首屏进入、直接详情深链、首次分包下载失败、后台返回、过期会话、坏缓存和版本更新列出回归路径。网络断开时打开尚未下载的分包，应显示可重试的失败，不留无响应按钮。已缓存分包能够打开，也不能证明服务器数据离线可用。

作业是把详情移入普通分包，画出主包和分包的真实依赖，再分别测量冷启动与首次详情打开。检查没有主包同步引用分包、没有 tabBar 迁入分包。第二项作业是设计新旧 schema 共存的更新实验，明确不丢草稿的恢复动作。验收记录应区分包结构、运行性能、真实审核和服务端安全，未执行的项目保留待验证状态。

## 官方依据

<a id="source-1"></a>[cite:1] [使用分包](https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages/basic.html)：包结构与依赖限制。

- [分包预下载](https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages/preload.html)：预下载配置与边界。
- [合理使用数据更新方法](https://developers.weixin.qq.com/miniprogram/dev/framework/performance/tips/runtime_setData.html)：运行时同步成本。
- [UpdateManager](https://developers.weixin.qq.com/miniprogram/dev/api/base/update/UpdateManager.html)：下载就绪与应用更新。
- [小程序登录](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html)：客户端与服务端身份分工。

上一章：[测试、工具与真机排错](./10-testing-devices)；下一章：[完整预约项目](./12-appointment-project)。
