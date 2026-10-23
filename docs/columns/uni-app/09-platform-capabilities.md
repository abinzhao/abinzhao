---
title: '09 · 端能力与条件编译'
description: 在用户主动操作后使用定位与选图，按官方支持选择 chooseMedia 或 Web 选图路径，处理隐私、权限、临时文件、上传及能力降级。
date: '2026-10-23'
category: uni-app 开发
tags: [uni-app, 条件编译, 定位, 媒体, 权限]
series:
  order: 9
---

# 09 · 端能力与条件编译

## 能力是可选边界

预约的核心是服务、日期、时段与服务器确认，定位和图片只是可选辅助。用户拒绝定位仍应能手工选择门店，拒绝相册仍应能提交文字。将可选授权设为首页必经步骤，既扩大收集范围，也使设备不支持时整个业务无法使用。先定义能力用途和无能力路径，再选择 API。

同名 uni API 不保证所有目标都有相同参数、权限和结果。编译期条件用于隔离根本不支持的实现，运行期能力判断处理同一目标中的版本与权限差异，两者互补。业务层接收统一结果，不直接读取 `wx`、`plus`、DOM 或原生对象。[cite:1]

## 当前选图 API 的边界

官方图片页明确：微信 `wx.chooseImage` 从基础库二点二一点零起停止维护，应使用 `uni.chooseMedia`。因此本章不会在微信目标继续默认走旧选图接口。核验的视频页显示标准 App 从四点五二支持 chooseMedia，Web 不支持；Web 采用仍被文档提供的 uni.chooseImage，而不是假定 chooseMedia 全端可用。[cite:2][cite:3]

下面适配器支持本专题的微信、标准 App 与 Web，其他目标返回明确不支持。调用时仅选择一张图片，回调再检查数量与路径。App 需要相机相册模块和符合商店政策的配置；选择系统相册资源不意味着可以遍历整部手机的媒体，也不应该为了选一张图片额外申请所有媒体权限。

```typescript
// capabilities/pickPicture.ts
export function pickPicture(): Promise<string> {
  // #ifdef MP-WEIXIN || APP-PLUS
  return new Promise((resolve, reject) => {
    uni.chooseMedia({
      count: 1, mediaType: ['image'], sourceType: ['album'],
      success(result) {
        const files = result.tempFiles
        if (!Array.isArray(files) || files.length !== 1 ||
            typeof files[0].tempFilePath !== 'string' || !files[0].tempFilePath) {
          reject(new Error('未得到单张图片路径'))
          return
        }
        resolve(files[0].tempFilePath)
      },
      fail() { reject(new Error('未完成选图，可继续使用文字表单')) }
    })
  })
  // #endif
  // #ifdef H5
  return new Promise((resolve, reject) => {
    uni.chooseImage({
      count: 1, sourceType: ['album'],
      success(result) {
        const paths = result.tempFilePaths
        if (!Array.isArray(paths) || paths.length !== 1 ||
            typeof paths[0] !== 'string' || !paths[0]) {
          reject(new Error('未得到单张图片路径'))
          return
        }
        resolve(paths[0])
      },
      fail() { reject(new Error('未完成选图，可继续使用文字表单')) }
    })
  })
  // #endif
  // #ifndef MP-WEIXIN
  // #ifndef APP-PLUS
  // #ifndef H5
  return Promise.reject(new Error('当前目标尚未接入选图适配'))
  // #endif
  // #endif
  // #endif
}
```

Web 浏览器对来源和选择数量的限制存在差异，设置 count 不替代回调检查。不同选图 API 的 size 单位在文档之间也有差异，不能把同名字段直接当成字节；上传前按目标核实，服务器始终根据实际内容限制体积与类型。临时路径只用于当前资源引用，不能作为跨设备永久地址。

## 一个只本地预览的页面

页面没有自动上传和后台采集。点击选图后才调用能力，结果只在当前页面显示；移除仅清理引用，不宣称删除系统相册原文件。离开页面后拒绝迟到结果，防止系统选择器返回后更新已经销毁的状态。预览和移除按钮都有实际行为，不添加未实现的“上传成功”状态。

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { onUnload } from '@dcloudio/uni-app'
import { pickPicture } from '../../capabilities/pickPicture'
const picture = ref('')
const busy = ref(false)
const message = ref('')
let alive = true
onUnload(() => { alive = false })
async function choose() {
  if (busy.value) return
  busy.value = true
  message.value = ''
  try {
    const path = await pickPicture()
    if (alive) {
      picture.value = path
      message.value = '只在本页预览，未上传服务器'
    }
  } catch (error) {
    if (alive) message.value = error instanceof Error ? error.message : '未完成选图'
  } finally {
    if (alive) busy.value = false
  }
}
function remove() { picture.value = ''; message.value = '预览引用已移除' }
</script>

<template>
  <view class="page">
    <text>可选图片，不影响文字预约</text>
    <button :disabled="busy" @click="choose">主动选择一张图片</button>
    <image v-if="picture" class="picture" :src="picture" mode="aspectFit" />
    <button v-if="picture" @click="remove">移除本页预览</button>
    <text>{{ message }}</text>
  </view>
</template>

<style scoped>
.page { padding: 32rpx; }
button { min-height: 44px; margin: 24rpx 0; }
.picture { width: 100%; height: 360rpx; }
</style>
```

## 定位与坐标系

定位请求应由“按当前位置查找”的按钮触发，说明用途并保留手工选择。GPS 的 WGS84 与国内地图常用 GCJ02 不可混用；地图展示要按提供者规定转换或请求对应坐标。默认返回经纬度并不等于可直接定位门店，精度、时效与服务器距离计算都要明确。[cite:4]

本章只取一次 WGS84 位置供当前筛选，不持续跟踪，不打印或持久化坐标。可用一个 Promise 包装 `uni.getLocation({ type: 'wgs84', success, fail })`，验证经纬度为有限数且处于合法范围，再交给门店查询。需要 GCJ02 时，Web 和 App 的地图配置、授权与配额必须先完成，不能只改参数就认为有效。

核验的官方定位页提醒旧 Web 坐标转换服务已停用，需要使用更新编译器并配置地图厂商。这里的最低升级条件不是当前最新版本，本专题版本矩阵已提供具体工具快照。标准运行基座可能借用工具自身地图配置，正式包必须使用自己的包名、证书和厂商 key，不把基座定位成功当作正式包保证。[cite:4]

## 权限、隐私与拒绝恢复

微信小程序的相关隐私声明、敏感接口资格和授权流程，需要在平台后台与客户端完整实现；App 需要用途说明、运行时权限和平台商店审核要求；Web 需要安全上下文及浏览器授权。一次 `uni.authorize` 不是跨端全部隐私流程，也不能用循环调用强迫用户授权。

拒绝后展示替代入口，不立刻反复弹框。用户明确选择重新开启时才提供平台允许的设置入口，并在返回后重新检查。系统关闭位置服务、应用权限拒绝、地图配额不足和网络失败是不同原因，提示可以保守但不能伪造“已授权”。日志只记录类别，不包含坐标或图片路径。

低精度位置有时足够，只有业务必要才申请高精度。相册访问优先使用系统选择器获得用户选择资源，不尝试越权读取其他照片。照片可能包含位置元数据和个人内容，是否去除元数据、保留多久、谁能访问，应在接入上传前确定，不等数据已经上云再补隐私说明。

## 上传与临时资源寿命

真正上传使用 `uni.uploadFile` 并保留 UploadTask，进度只代表已传输字节比例，不代表服务器业务保存完成。先检查状态码，再解析响应字符串并校验文件 ID。服务器验证 MIME、实际内容、体积与访问权限，客户端扩展名过滤只改善体验。暂存文件与业务关联分开，失败和取消需要服务器清理策略。

用户取消上传，底层传输可能停止，但服务器可能已收到部分或全部内容。状态应根据接口查询与清理结果处理，不立即显示“服务器文件已删除”。临时本地路径跨启动可能失效，草稿不能只保存路径就声称附件可恢复；需要用户重新选择或经允许进行本地持久保存，并管理容量。

压缩图片也有目标差异，不能把压缩参数和旋转策略一套到底。先获取图像信息，限制像素面积与体积，在目标工具检查方向和质量，再决定上传。弱网重试仍需操作 ID 与预算，避免反复生成同一附件。真实业务只有服务器关联成功后，才能显示附件已提交。

## 条件编译的工程纪律

差异代码集中在适配器，业务只看到定位结果或图片资源。不要在每个页面复制十段平台判断，也不要用运行时 if 包裹无法在当前目标编译的原生导入。编译后检查不支持平台的代码已移除；注释条件写错可能留下两条 return 或不合法 API，但普通语法检查未必报错。

支持矩阵至少包含目标、最低能力条件、配置、拒绝路径与实际验证。新增一个小程序目标时，先写适配与测试，再加入支持表；默认拒绝比无依据调用更清楚。UTS 插件与 x 项目也遵循同样的业务边界，下一章会继续分析，不把它们当成跨端万能补丁。

## 实践与验收

基础作业运行本地预览页，分别选择、取消、移除、离开后返回，确认没有自动上传和资源泄露。进阶作业设计可选定位筛选，拒绝后可手工选择，当前坐标只用于本次查询。验收覆盖无权限、系统关闭、弱网、临时路径失效及大图片，不只演示一张正常照片。

本章没有执行真实定位、选图、权限弹窗或上传，支持条件来自官方单源文档。微信、Web 与 App 的配置和设备行为均需补测；尤其 App 正式签名包、HarmonyOS 安全媒体访问和其他小程序平台，不由标准 Vue 3 编译通过证明。

## 官方依据

<a id="source-1"></a>[cite:1] [条件编译](https://uniapp.dcloud.net.cn/tutorial/platform.html)：平台宏与隔离。

<a id="source-2"></a>[cite:2] [图片 API](https://uniapp.dcloud.net.cn/api/media/image.html)：微信旧接口边界与 Web 差异。

<a id="source-3"></a>[cite:3] [chooseMedia](https://uniapp.dcloud.net.cn/api/media/video.html#choosemedia)：支持矩阵与参数。

<a id="source-4"></a>[cite:4] [定位 API](https://uniapp.dcloud.net.cn/api/location/location.html)：坐标系、配置、基座与权限。

上一章：[表单与离线恢复](./08-forms-storage-offline)。下一章：[插件、UTS 与 uni-app x](./10-plugins-uts-x)。
