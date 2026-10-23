---
title: '09 · 位置、媒体与能力降级'
description: 分清接口资格、隐私同意、微信授权与系统权限，处理坐标系、媒体临时路径、上传取消和拒绝后的可用主流程。
date: '2026-10-23'
category: 小程序开发
tags: [微信小程序, 定位, 媒体, 隐私, 权限]
series:
  order: 9
---

# 09 · 位置、媒体与能力降级

## 能力不是随时可调用的普通函数

“用户点了按钮”只是能力调用的一个前提。定位还涉及主体与类目是否符合接口要求、后台接口申请、代码声明、隐私说明、微信授权和手机系统定位开关。任何一层缺失都可能失败。不能只在模拟器里手动设一个经纬度，就承诺上线后所有用户都能定位。[cite:1]

本章把定位用于辅助门店选择，把图片用于用户主动补充信息，两者都不是创建预约的必要条件。主流程始终提供手动选择门店、文字备注和不上传图片的路径。这样的降级不是异常提示的修饰，而是产品结构：拒绝可选信息后仍有完整的业务入口，不应反复弹窗逼迫用户授权。

## 定位需要核对哪些配置

真实 AppID 工程应按官方接口说明确认资格与申请，后台隐私声明应与实际收集和用途一致。代码中的 `requiredPrivateInfos` 声明调用的相关能力，`permission` 用途文案解释为什么请求授权。声明不等于批准，后台获批也不等于用户同意；开发工具关闭某些检查仅帮助调试，不能替代生产配置。

在支持的目标基础库上使用第六章 `confirmPrivacy`，让平台处理默认隐私交互。没有支持时应停止依赖能力并保留替代入口，不伪造同意状态。首次调用能力可能触发微信授权交互，系统权限又可能单独拒绝。`getSetting` 只帮助查看相应设置，不是读取精确位置的替代接口，也不能证明系统定位服务可用。

```json
// app.json 示例：须使用真实账号完成相应资格、申请与后台声明
{
  "pages": ["pages/store/store"],
  "window": { "navigationBarTitleText": "选择门店" },
  "permission": {
    "scope.userLocation": { "desc": "用于辅助选择附近门店，可改为手动选择" }
  },
  "requiredPrivateInfos": ["getLocation"]
}
```

不要把这里的配置复制进不需要定位的项目。第十二章最小项目没有调用定位，因而不声明这项能力。代码、后台说明与实际功能应保持一致，避免为了“未来可能用到”提前申请和收集。精确位置也不应该进入一般错误日志或分析事件。

## 坐标系和数据可信度

`wx.getLocation` 可按 API 支持选择坐标类型，本章请求 `gcj02`，与后续腾讯系地图场景对应；服务器或其他地图服务若需要不同坐标，应在明确边界转换。把 WGS84 的经纬度直接放到采用 GCJ02 的地图上可能产生偏移，不是通过多刷新几次就能解决。

定位是一次测量，存在精度、时效和环境影响，不能把最近门店排序当绝对准确。返回的精度指标应结合业务解释；位置异常时允许手选，库存与服务能力仍由门店自身和服务器确认。客户端提交的坐标可能被修改，也不能作为反作弊或到店核销的唯一证明。

## 完整定位页面

添加 `pages/store/store` 四件套，沿用第六章隐私模块。页面不保存或上传坐标，只将一次结果显示给用户观察。不能取得位置时返回手动选择，没有在失败回调中自动打开设置页。`openSetting` 放在用户再次明确点击的按钮入口，打开设置后也不会假定已经授权成功。

```typescript
// pages/store/store.ts
import { confirmPrivacy } from '../../utils/privacy';
type Data = { stores: string[]; selected: string; message: string; busy: boolean };
type Methods = {
  generation: number;
  locate(): Promise<void>;
  choose(event: WechatMiniprogram.TouchEvent): void;
  settings(): void;
};
Page<Data, Methods>({
  data: {
    stores: ['教学门店 A', '教学门店 B'],
    selected: '', message: '可直接手动选择门店', busy: false
  },
  generation: 0,
  onHide() {
    this.generation += 1;
    this.setData({ busy: false });
  },
  onUnload() { this.generation += 1; },
  choose(event) {
    const store: unknown = event.currentTarget.dataset.store;
    if (typeof store === 'string' && this.data.stores.includes(store)) {
      this.setData({ selected: store });
    }
  },
  settings() {
    wx.openSetting({
      fail: () => this.setData({ message: '设置暂不可打开，请继续手动选择' })
    });
  },
  async locate() {
    if (this.data.busy) return;
    const version = ++this.generation;
    this.setData({ busy: true, message: '正在请求可选定位能力' });
    try {
      await confirmPrivacy();
      if (version !== this.generation) return;
      const location = await new Promise<WechatMiniprogram.GetLocationSuccessCallbackResult>(
        (resolve, reject) => wx.getLocation({
          type: 'gcj02', success: resolve,
          fail: () => reject(new Error('无法取得位置，可手动选择门店'))
        })
      );
      if (version !== this.generation) return;
      if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude) ||
          Math.abs(location.latitude) > 90 || Math.abs(location.longitude) > 180) {
        throw new Error('位置结果异常，请手动选择门店');
      }
      this.setData({
        message: `本次 GCJ02 位置：${location.latitude.toFixed(3)}，` +
          `${location.longitude.toFixed(3)}；教学页不上传位置`
      });
    } catch {
      if (version === this.generation) this.setData({
        message: '未取得位置。可检查微信与系统设置，或直接手动选择'
      });
    } finally {
      if (version === this.generation) this.setData({ busy: false });
    }
  }
});
```

```json
// pages/store/store.json
{ "navigationBarTitleText": "选择门店" }
```

```xml
<!-- pages/store/store.wxml -->
<view class="page">
  <text class="message">{{message}}</text>
  <button loading="{{busy}}" disabled="{{busy}}" bindtap="locate">辅助定位</button>
  <button bindtap="settings">我想检查微信权限设置</button>
  <button wx:for="{{stores}}" wx:key="*this"
    data-store="{{item}}" bindtap="choose">{{item}}</button>
  <text class="message">当前选择：{{selected || '尚未选择'}}</text>
</view>
```

```css
/* pages/store/store.wxss */
.page { padding: 32rpx; }
.message { display: block; margin: 24rpx 0; line-height: 1.6; }
button { min-height: 88rpx; margin-top: 24rpx; }
```

世代号只是防止旧结果回写，不是取消底层定位。定位接口没有在此暴露可中断任务，页面隐藏后忽略结果即可。再次显示、再次操作会创建新的请求意图，不应该把上一次的 permission 失败永久缓存成“该设备不支持定位”。真实附近门店查询还需要合法服务端接口和位置用途说明，本页不伪造查询结果。

## 媒体选择与临时路径

优先使用当前官方媒体选择能力 `wx.chooseMedia`，并用 `canIUse` 判断目标版本。选择结果中的 `tempFilePath` 是临时路径，不是永久链接，不能跨重启持久化后期待始终可读。用户选择取消、系统拒绝、文件太大或接口不可用，都应该保留原表单，不把没有图片当作预约失败。[cite:2]

```typescript
// utils/media.ts，依赖第六章隐私模块
import { confirmPrivacy } from './privacy';
export async function chooseImage(): Promise<string> {
  if (!wx.canIUse('chooseMedia')) throw new Error('当前客户端不支持，可只填文字');
  await confirmPrivacy();
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sourceType: ['album', 'camera'],
      success(result) {
        const file = result.tempFiles[0];
        if (!file || !file.tempFilePath || file.size <= 0 ||
            file.size > 5 * 1024 * 1024) {
          reject(new Error('图片需大于零且不超过 5 MiB'));
          return;
        }
        resolve(file.tempFilePath);
      },
      fail() { reject(new Error('未选择图片，可继续填写文字')); }
    });
  });
}
export function uploadImage(url: string, filePath: string, token: string) {
  let task: WechatMiniprogram.UploadTask | undefined;
  let closed = false;
  let rejectJob: (error: Error) => void = () => {};
  const promise = new Promise<string>((resolve, reject) => {
    rejectJob = error => { if (!closed) { closed = true; reject(error); } };
    task = wx.uploadFile({
      url, filePath, name: 'image', header: { Authorization: `Bearer ${token}` },
      success(result) {
        if (closed) return;
        try {
          if (result.statusCode < 200 || result.statusCode >= 300) {
            throw new Error('上传被服务器拒绝');
          }
          const body: unknown = JSON.parse(result.data);
          if (typeof body !== 'object' || body === null) throw new Error('bad body');
          const id = (body as Record<string, unknown>).attachmentId;
          if (typeof id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(id)) {
            throw new Error('bad attachment');
          }
          closed = true;
          resolve(id);
        } catch { rejectJob(new Error('上传结果不满足协议，请确认后重试')); }
      },
      fail() { rejectJob(new Error('上传未完成，不影响文字草稿')); }
    });
  });
  return {
    promise,
    cancel() {
      rejectJob(new Error('已停止等待上传结果'));
      task?.abort();
    }
  };
}
```

上传 URL 必须来自应用固定配置并满足微信 uploadFile 合法域名，不接受用户输入任意目标。代码要求自有服务返回附件 ID，而非直接信任任意 URL。服务器还要验证身份、文件大小、实际内容、恶意文件和访问权限；客户端限制不是安全防线。示例的五 MiB 是应用选择，不是平台最大值。

## 文件保存与上传未知结果

需要跨重启保留离线图片时，按文件 API 保存并记录受控路径、用途和清理时机，同时处理容量和读取失败。先保存成功再写草稿引用；若保存失败，保留文字内容并说明图片未持久化。临时路径、用户头像和私有附件都不应被当作公开网址分享或写入一般日志。

上传取消也不能证明服务器没有保存文件。真实系统应设置未关联附件的清理期限，完成预约时按当前用户校验附件所有权；不能允许客户端提交他人的附件 ID。弱网下上传完成但响应丢失，应按上传操作 ID 查询或让服务端安全清理孤立文件，而不是无限重发大文件。

## 预览、处理与最小收集

图片能在页面预览，不代表已经保存或上传。界面应分别显示“已选择”“上传中”“已关联”和“上传失败”，不要用同一个绿色勾把四个阶段合在一起。用户替换图片时应清理原选择的页面引用，上传进行中则取消等待并让旧结果失效，避免晚到的附件 ID 覆盖新选择。

图片压缩、裁剪和格式转换会改变内容和元信息，需要按当前能力文档验证返回路径。不能只按扩展名判断实际文件类型，也不能为了减小体积把全部处理放在阻塞主流程的同步计算中。真实业务若不需要照片中的定位等元信息，应在合适边界移除并说明处理目的；服务端仍需确认内容安全。

定位用途也要遵循最小范围。只为了门店排序时，不应默认持续追踪位置或把轨迹长期保存。用户手动选店后可以停止相关任务；再次进入页面不必强迫再次授权。确需后台位置的业务属于不同权限和审核范围，不能把本章前台一次定位代码改成循环调用就宣称已支持后台定位。

## 故障矩阵与作业

使用真实测试账号依次检查未申请接口、拒绝隐私、拒绝微信权限、关闭系统定位、室内低精度与页面隐藏后返回。每种失败都应能手动选择门店。截图和日志不保存精确经纬度；记录资格、客户端、基础库、系统权限状态及操作步骤即可。游客模式不具备这些证据。

媒体实验覆盖取消选择、超限图片、相机权限拒绝、上传四百零一、服务器非法结构和中途离开页面。作业是把图片加入第八章草稿：明确临时与持久路径，删除草稿时只清理它拥有的文件，不能删除其他业务文件。验收要求无图片路径仍能完成核心流程，权限失败可修复，上传结果未确认时不显示已关联成功。

## 官方依据

<a id="source-1"></a>[cite:1] [wx.getLocation](https://developers.weixin.qq.com/miniprogram/dev/api/location/wx.getLocation.html)：接口申请、授权、配置与坐标类型。

<a id="source-2"></a>[cite:2] [wx.chooseMedia](https://developers.weixin.qq.com/miniprogram/dev/api/media/video/wx.chooseMedia.html)：支持版本、媒体类型与临时文件。

- [wx.openSetting](https://developers.weixin.qq.com/miniprogram/dev/api/open-api/setting/wx.openSetting.html)：用户主动进入设置。
- [wx.uploadFile](https://developers.weixin.qq.com/miniprogram/dev/api/network/upload/wx.uploadFile.html)：上传响应和任务。

上一章：[存储、离线与数据恢复](./08-storage-offline)；下一章：[测试、工具与真机排错](./10-testing-devices)。
