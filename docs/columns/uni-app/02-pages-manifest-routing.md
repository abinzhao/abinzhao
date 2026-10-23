---
title: '02 · pages、manifest 与导航'
description: 注册页面与分包，区分应用配置和页面样式，处理页面栈、编码参数、冷启动入口及导航失败，避免把路由当作权限控制。
date: '2026-10-23'
category: uni-app 开发
tags: [uni-app, pages.json, manifest.json, 导航, 页面栈]
series:
  order: 2
---

# 02 · pages、manifest 与导航

## 配置决定页面是否存在

标准 uni-app 页面需要在 `pages.json` 注册，文件存在不等于路由可访问。普通组件不进入页面注册表；首页通常是主包 `pages` 的第一项。`manifest.json` 负责应用身份、版本、模块和平台设置，`pages.json` 负责页面路径、导航栏、tabBar、分包等。把权限说明写进页面标题并不能完成原生权限配置。[cite:1]

学习预约应用先建立首页与详情页，暂不添加 tabBar。首页负责服务与时段选择，详情页展示一个记录的状态。详情只接收不敏感的记录 ID，再从可信状态或服务器查询内容；不要把手机号、凭据、备注全文塞进 URL。URL 可能进入日志、分享链接、历史记录和错误报告，不能作为私人数据传输通道。

```json
{
  "pages": [
    {
      "path": "pages/index/index",
      "style": { "navigationBarTitleText": "本地预约练习" }
    },
    {
      "path": "pages/detail/detail",
      "style": { "navigationBarTitleText": "记录详情" }
    }
  ],
  "globalStyle": {
    "navigationBarTextStyle": "black",
    "navigationBarBackgroundColor": "#ffffff",
    "backgroundColor": "#f4f5f7"
  }
}
```

路径不包含 `.vue`，大小写必须与文件一致。Windows 或部分本地文件系统容易掩盖大小写错误，发布或另一台设备才失败。改变首页顺序会改变冷启动目标，不应该把它当作无风险排版调整。注册后先验证冷启动，再验证从首页进入详情，两个入口都正确才能继续。

## 根据任务选择导航动作

`navigateTo` 保留当前页并打开普通新页，`redirectTo` 替换当前页，`navigateBack` 返回已有栈，`switchTab` 面向 tabBar 页面，`reLaunch` 重建入口。它们不是可以随意互换的“跳转”。例如登录成功后用替换避免返回登录页，而查看详情通常需要保留列表。[cite:2]

页面栈不是无限缓存。连续打开同类详情会积累页面和任务，返回时又可能触发旧请求。用业务动作决定保留哪些历史，而不是每个点击都 `navigateTo`。tabBar 页面也不能按普通页面附带 URL 查询参数跳转；跨 tab 状态应由明确定义的状态入口传递，不能依赖一个偶然保留的页面实例。

## 一个可运行的导航入口

在已注册的首页放入下面组件。示例 ID 是明确的固定教学输入，不声称对应服务器记录。点击前验证 ID，编码后跳转，失败时恢复按钮和提示。互斥标记防止一次双击同时堆叠两个页面，完成回调不等于目的页业务加载成功。

```vue
<script setup lang="ts">
import { ref } from 'vue'
const navigating = ref(false)
const message = ref('')
function openDetail() {
  if (navigating.value) return
  const id = 'local-lesson-1'
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) return
  navigating.value = true
  message.value = ''
  uni.navigateTo({
    url: `/pages/detail/detail?id=${encodeURIComponent(id)}`,
    fail() { message.value = '未能打开详情，请重试' },
    complete() { navigating.value = false }
  })
}
</script>

<template>
  <view class="page">
    <text>路由练习，不查询真实预约</text>
    <button :disabled="navigating" @click="openDetail">打开详情入口</button>
    <text v-if="message">{{ message }}</text>
  </view>
</template>

<style scoped>
.page { padding: 32rpx; }
button { min-height: 44px; margin-top: 24rpx; }
</style>
```

## 在目的页验证输入

路由参数在运行时来自外部字符串，可能缺失、超长或恶意构造。`onLoad` 在页面创建时获取入口参数；不要用 Vue `onMounted` 代替参数读取，也不要在每次 `onShow` 重复初始化覆盖用户已经编辑的内容。目标页先解析参数，再决定业务加载，不要直接断言成预约类型。

不同入口的编码行为需要在目标编译器验证。下面保守地支持普通安全 ID 与一次百分号解码，解码失败返回空值。ID 集合本身不允许百分号，因而不会把合法 ID 二次解码为其他值。真实项目应定义一套明确编码约定，不递归解码到“看起来像有效”为止。

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
const recordId = ref('')
const error = ref('')
function parseId(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 192) return null
  try {
    const decoded = decodeURIComponent(value)
    return /^[a-zA-Z0-9_-]{1,64}$/.test(decoded) ? decoded : null
  } catch { return null }
}
onLoad(options => {
  const id = parseId(options?.id)
  if (!id) {
    error.value = '入口标识缺失或不合法，请从首页重新打开'
    return
  }
  recordId.value = id
})
function returnHome() {
  if (getCurrentPages().length > 1) {
    uni.navigateBack({ fail: launchHome })
  } else {
    launchHome()
  }
}
function launchHome() {
  uni.reLaunch({ url: '/pages/index/index' })
}
</script>

<template>
  <view class="page">
    <text v-if="error">{{ error }}</text>
    <text v-else>收到教学入口 ID：{{ recordId }}；业务查询尚未接入</text>
    <button @click="returnHome">返回首页</button>
  </view>
</template>

<style scoped>
.page { padding: 32rpx; }
button { min-height: 44px; margin-top: 24rpx; }
</style>
```

返回逻辑区分正常栈与直接进入详情。冷启动、扫码或 Web 深链接可能没有上一页，盲目返回会失败。兜底应使用注册的首页，且不要为防止失败无限重试导航。生产应用还需要导航失败反馈和可操作入口，而不是在错误状态自动循环跳转。

## 冷启动、分享与业务恢复

冷启动不能依赖首页刚刚写入的模块变量。详情页若只从“当前选中记录”读取，分享或刷新会得到空状态，甚至误展示另一条记录。正确流程是入口 ID 解析、会话检查、按 ID 获取授权数据、展示加载与不存在状态。缓存可以改善体验，但不能绕过服务器权限。

恢复也要考虑记录已取消、已删除或当前用户无权访问。不存在与无权限在安全策略上可能需要统一提示，避免枚举别人记录。服务端决定访问结果，前端路由守卫只改善体验。有人可以直接调用接口，不经过页面；“隐藏了详情按钮”从来不是鉴权。

Web 的历史路由和静态服务器回退要一起检查。开发服务能处理深链不代表部署服务器配置一致；刷新出现服务器四〇四时，先定位是页面注册、路由模式还是静态服务回退，不要把所有问题归结为 Vue。小程序没有同样的服务器地址栏，但分享、场景值和启动参数同样是外部入口。

## 分包与导航的关联

分包通过 `subPackages` 声明包根和相对页面路径，目标 URL 仍包含完整包根。主包的首页、tabBar 和关键公共资源不能随意搬入分包。先按用户进入路径设计：立即使用的核心流程留在主包，低频管理页或长资料页放入分包，避免首页为一次详情加载拖入全部次要依赖。[cite:1]

预加载不是免费性能。它把用户可能需要的包提前下载，但也会增加网络、内存与流量。只有知道用户下一步概率并测过包大小，才决定预加载范围。包切换失败应有重试和返回，不把下载中当作业务请求中；两种失败的恢复动作不同。

## 编辑离开与返回结果

表单未保存时的离开策略需要提前定义：自动保存草稿、提示确认或允许直接丢弃，三者不能在不同入口随机切换。物理返回、顶部返回和应用内按钮不一定经过相同事件，逐端检查拦截能力；不支持时提供显式草稿保存与说明，不声称已经拦截所有关闭。

详情页取消记录后，列表返回应重新查询或采用经过校验的状态更新，不能把导航成功回调当作取消结果。事件通道可以传递一次页面间通知，但通知仍不具备服务器事实权威；冷启动没有这条通道，也必须能独立加载。这样返回路径与直接进入路径才不会出现两套业务规则。

## 常见故障与定位

“页面不存在”先看注册路径与输出目录，检查编辑源码后是否重新编译。跳 tab 报错先看是否用了普通导航以及 tabBar 配置是否完整。返回不工作先看栈长度和入口来源。参数丢失先记录经过脱敏的字段存在性与长度，不打印凭据或完整查询字符串。

导航成功但内容错误，通常属于业务状态而非路由层。观察目标 ID、加载序号、会话代际和缓存 key 是否一致；快速连续进入不同记录时，旧响应可能回写新页面，第六章会使用取消与序号双重保护。不要通过延迟几百毫秒来掩盖竞争，这会在慢设备重新出现。

## 实践与验收

基础作业增加一个合法详情 ID 输入框，验证空值、长度超限、非法百分号、中文和合法下划线 ID。无效输入不能发起业务请求，错误必须有返回入口。进阶作业设计登录后回到原详情的流程，只保存允许的内部路由，不允许外部 URL 作为任意跳转目标。

验收至少包含首页进入、直接详情入口、刷新或重开、双击、返回栈为空、页面未注册与分包加载失败。把每种情境的当前页、下一页、保留状态和提示写清楚，再在实际目标工具执行。仅检查 JSON 语法证明不了导航栈；未执行的深链和分享路径应保持待验证。

## 官方依据

<a id="source-1"></a>[cite:1] [pages.json](https://uniapp.dcloud.net.cn/collocation/pages.html)：注册、tabBar 与分包。

<a id="source-2"></a>[cite:2] [路由与页面跳转](https://uniapp.dcloud.net.cn/api/router.html)：导航 API 与平台差异。

<a id="source-3"></a>[cite:3] [manifest.json](https://uniapp.dcloud.net.cn/collocation/manifest.html)：应用级配置。

上一章：[工具与工程边界](./01-tooling-project-boundaries)。下一章：[组件、布局与跨端样式](./03-components-layout)。
