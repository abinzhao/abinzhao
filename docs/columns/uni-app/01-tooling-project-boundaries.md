---
title: '01 · 工具、版本与工程边界'
description: 区分标准 uni-app 与 uni-app x，使用 HBuilderX 或官方 Vue 3 TS 模板建立可复现工程，理解编译产物与各端运行约束。
date: '2026-10-23'
category: uni-app 开发
tags: [uni-app, Vue 3, TypeScript, HBuilderX, 工程]
series:
  order: 1
---

# 01 · 工具、版本与工程边界

## 先确定开发的产品

uni-app 不是把浏览器网页原样放进所有设备。标准 uni-app 接受 Vue 单文件组件，编译时将模板、样式和平台调用转换成不同目标的产物。Web 面对浏览器与跨域，小程序面对宿主组件与逻辑层通信，App 面对原生基座与页面渲染。共享的首先是业务规则和组件表达，不是任意浏览器库。[cite:1]

本专题使用标准 uni-app、Vue 3、TypeScript 和 `.vue`。uni-app x 的 `.uvue`、UTS 与原生渲染是另一条路线；标准项目调用 UTS 插件也不会自动变为 x。开始前先看页面扩展名和入口，不要只看项目名称里是否出现 uni。选错路线后再寻找同名 API，往往会把编译错误误判为版本问题。

二〇二六年十月二十三日核验时，正式 HBuilderX 为 `5.26.2026091802`，下载页另有 Alpha 通道。正式不等于无缺陷，Alpha 也不等于课程默认。特别是五点二六日志说明新建默认项变为 uni-app x 蒸汽模式，因此必须主动选择标准 uni-app 与 Vue 3，再检查生成结构。[cite:2]

## 两种工程入口的取舍

可视化工程由 HBuilderX 管理编译插件、模拟器和设备运行，适合初次学习平台能力。CLI 工程把编译器和依赖声明放入工程，便于锁版本、代码检查和持续集成。两者均可开发标准 Vue 3，但输出路径与编译器来源不同，不能把一个目录下的旧产物当作另一条路径刚生成的结果。

最小预约示例采用可视化工程，不需要安装一套独立依赖。需要团队可重复构建时，采用官方 CLI 模板更直接。不要在同一学习目录同时运行两条编译路径并共用输出；若确实需要对比，应建立两个独立目录，使用同一份业务输入，分别记录工具、目标和产物时间。

| 维度 | HBuilderX 可视化工程 | CLI 工程 |
|---|---|---|
| 编译器来源 | IDE 安装的编译插件 | 工程依赖与锁文件 |
| 常见源码位置 | 工程根目录 | 模板的 `src` |
| 常见输出位置 | `unpackage/dist` | 模板的 `dist` |
| 适用学习任务 | 设备运行、基座和平台设置 | 版本锁定、脚本与 CI |

## 用官方模板建立 CLI 工程

在独立学习目录运行以下命令。先检查 Node 与包管理器是否可用，使用维护中的 Node 二十二系列，并核对模板的最低要求。模板分支可以移动，下载成功后记录提交、依赖声明和生成的锁文件；不要将命令中的分支名解释为永远不变的版本。[cite:1]

```bash
node --version
npm --version
npx degit dcloudio/uni-preset-vue#vite-ts uni-appointment
cd uni-appointment
npm install
npm run
npm run dev:h5
```

安装命令会访问包仓库并生成学习工程的锁文件。先阅读模板依赖，再进行安装；不要为解决一个报错无差别升级所有包。核验的模板声明 Vite `5.2.8`、Vue `^3.4.21`、TypeScript `^4.9.4` 和 vue-tsc `^1.0.24`，区间不是安装精确值。DCloud 编译器包在该模板快照中为 `3.0.0-5020420260813003`，必须作为配套集合管理。[cite:3]

运行 `npm run` 是为了看到模板实际提供的脚本，不猜测名称。微信目标通常通过对应小程序开发脚本生成目录，再在微信开发者工具导入该输出；导入源码根目录不会得到正确的原生页面。App 还涉及基座与原生资源，Web 开发服务启动并不证明 App 能打包。

## 第一个完整页面

在模板已注册的首页替换下面组件。它仅使用 `view`、`text` 与 `button`，没有 DOM 选择器或浏览器存储。这个简单页面用于确认 Vue 响应式链路、内置组件和事件编译都工作，不负责验证网络、身份或设备能力。

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
const visits = ref(0)
const label = computed(() => `已完成 ${visits.value} 次本地练习`)
function increment() {
  visits.value += 1
}
</script>

<template>
  <view class="page">
    <text class="title">跨端工程检查</text>
    <text>{{ label }}</text>
    <button @click="increment">增加一次</button>
  </view>
</template>

<style scoped>
.page { padding: 32rpx; display: flex; flex-direction: column; gap: 24rpx; }
.title { font-size: 40rpx; font-weight: 600; }
button { min-height: 44px; margin: 0; }
</style>
```

依次点击三次，再触发开发服务热更新。热更新可能保留或重建状态，不能把这个行为当作正式冷启动恢复。完全关闭页面再打开，计数回到零才符合当前内存模型；持久化将在第八章实现，不应在第一章顺手加入用户数据保存。

入口必须保持模板约定。标准 Vue 3 的 `createSSRApp` 是 uni-app 的入口形式，不意味着这个项目已经部署服务器渲染。不要将它替换为普通浏览器教程的 `createApp().mount('#app')`，也不要添加一个手写 DOM 容器来绕过平台编译。[cite:4]

```typescript
// main.ts，沿官方标准 Vue 3 模板
import { createSSRApp } from 'vue'
import App from './App.vue'
export function createApp() {
  const app = createSSRApp(App)
  return { app }
}
```

## 理解类型检查与运行检查

TypeScript 可以发现字段拼写、函数参数和部分组件绑定问题，但类型注解在运行产物中不会验证服务器返回的对象。构建器把源文件变为目标代码，类型工具检查程序约束，设备测试检查宿主行为；三者解决不同问题。仅看到页面出现，不足以说明输入、权限拒绝和异常恢复正确。

编译失败时先找第一条源码错误，而不是最后一条打包摘要。类型缺失要检查模板声明文件和目标 API 类型；模块找不到要检查文件大小写、路径别名和依赖安装。Web 能找到某个仅浏览器支持的包，不代表微信端也能执行；平台不支持应改变边界，不应用 `any` 消除提示。

小程序出现空白页时，先确认导入的是当前目标产物、首页已注册、开发工具 AppID 与目标一致，再看逻辑层错误。App 看不到新插件时，要确认基座是否包含插件与原生权限；重启 JavaScript 服务无法凭空增加原生二进制。保持一条失败路径只改变一个因素，避免同时换工具、依赖和目标后失去证据。

## 建立版本记录与验收习惯

每次练习记录源码版本、编译方式、Node、编译器集合、目标工具和设备。可视化与 CLI 的记录分开；开发、生产构建分开；模拟器与真机分开。版本号用于复现，不用于替代测试。当官方页面只有最低支持条件时，写明这是能力门槛，不把它称作推荐版本或最新发行。

一个有用的首章验收是：新目录从零建立，首页点击后计数正确，冷启动恢复为零，类型检查没有新增错误，目标产物路径能够说明。随后在另一目标重复这组动作，并记录实际差异。没有安装或设备资格的目标标记待验证，不用文档里的支持表补写“已通过”。

依赖更新也应保持可回退。先阅读发布日志和模板变化，保存旧锁文件版本，在学习分支验证类型、构建与设备路径，再决定采用。编译器相关包通常要求一致的配套版本，单独升级其中一个包会产生隐蔽的不兼容。不要以清除全部缓存作为第一步；先检查缓存是否真的参与了错误。

## 实践作业

基础作业是在第一个页面增加“归零”按钮，通过同一个计数状态更新派生文案，验证快速点击和冷启动。不要增加网络或存储。进阶作业是分别建立 HBuilderX 与 CLI 标准工程，列出源码入口、编译器来源和产物目录，解释为什么 IDE 版本与 CLI 编译包不是一个对象。

验收时向另一位读者提供可重复命令与版本记录，让对方只按记录运行。对方若必须猜 AppID、目录或脚本，说明说明书仍不完整。这个练习培养的是工程可复现性；后续每项跨端能力都应继续保持同样的记录，不让“本机可用”成为无法调查的结论。

## 官方依据

<a id="source-1"></a>[cite:1] [CLI 快速开始](https://uniapp.dcloud.net.cn/quickstart-cli.html)：模板、运行命令与编译器。

<a id="source-2"></a>[cite:2] [HBuilderX 下载](https://www.dcloud.io/hbuilderx.html)与[5.26 发布日志](https://download.dcloud.io/hbuilderx/changelog/5.26.2026091802.html)：通道和新建默认项。

<a id="source-3"></a>[cite:3] [官方 vite-ts 模板依赖](https://raw.githubusercontent.com/dcloudio/uni-preset-vue/vite-ts/package.json)：本次可核验的依赖声明。

<a id="source-4"></a>[cite:4] [Vue 3 基础](https://uniapp.dcloud.net.cn/tutorial/vue3-basics.html)：标准 Vue 3 使用方式。

下一章：[pages、manifest 与导航](./02-pages-manifest-routing)。
