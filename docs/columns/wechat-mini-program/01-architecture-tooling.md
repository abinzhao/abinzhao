---
title: '01 · 运行架构与工具搭建'
description: 理解微信宿主、逻辑层与渲染层，建立可复现的原生小程序工程，区分工具、基础库与客户端版本。
date: '2026-10-23'
category: 小程序开发
tags: [微信小程序, 工程搭建, TypeScript, 运行架构]
series:
  order: 1
---

# 01 · 运行架构与工具搭建

## 本章要解决的问题

浏览器能够直接运行一段 JavaScript，不意味着这段代码可以直接搬进小程序。小程序运行在微信宿主中，页面注册、路由、网络域名和设备能力均由平台约束。本章的完成标准不是看到一个欢迎文字，而是能从入口文件追踪到页面、解释一次点击如何触发画面变化，并把编译错误与运行错误分开记录。后面所有预约业务都建立在这条可解释链路上。

先准备独立学习目录，不在个人网站的依赖中安装小程序编译工具。真实账号项目需要在微信公众平台注册小程序并获得 AppID；没有账号时可使用开发者工具提供的测试或游客路径观察基础页面。游客项目无法证明登录、后台权限、合法域名和提审流程可用。这个限制应写进实验记录，而不是等接口报错后再把问题归咎于代码。

## 宿主与两层执行模型

本专题选择原生 `Page`、`Component` 和 WebView 渲染路径。逻辑层负责事件、业务计算和调用 `wx` 能力，渲染层负责解释 WXML、WXSS 以及展示传入的数据。两层不是共享同一个 JavaScript 对象：修改页面对象中的普通字段不会让视图自动更新；需要使用 `setData` 把可序列化的展示状态同步过去。通信有复制与处理成本，后续性能优化首先分析这条边界。

因此，主业务不能依赖 `document.querySelector`、浏览器 Cookie 或直接操作 DOM。也不能把浏览器中的函数、循环引用对象、文件句柄塞进页面 `data`，期待另一层保持相同引用。使用平台组件与事件可以跨越这条边界，但不等于所有微信客户端完全一样。Skyline 是另一种渲染选择，glass-easel 是组件框架选择；它们有独立的兼容约束，本章不通过添加配置项假装完成迁移。

页面还存在实例边界。`App` 在一次运行中管理应用级生命周期，`Page` 每进入一个页面可能创建新实例；模块顶层变量则跟随模块加载与当前运行环境存在。把用户输入写在模块顶层会让多个页面实例意外共享状态。把访问令牌写入页面 `data` 又会扩大可见范围。开发者应先决定状态属于应用、页面还是纯业务模块，再选择存放位置。

## 三种版本必须分别记录

截至 **2026-10-23**，官方工具下载页的 Stable 为 `2.02.2608080`，标注日期为 `2026/09/30`；基础库日志本次可见最新条目为 `3.17.5`。它们不是微信客户端版本，也不是全体用户的基础库覆盖率。工具版本决定编辑、编译与调试功能；调试基础库影响 API 模拟和兼容检查；实际客户端、系统及基础库组合决定用户真正执行的行为。

安装时选择对应操作系统的 Stable 包，记录安装文件名和工具“关于”中的版本。创建项目后记录调试基础库、渲染器、AppID 类型和系统版本。不要只写“最新版”：当半年后复现失败时，这个词无法定位任何软件。也不要为了消除提示直接提高业务最低基础库；是否允许拒绝旧客户端，需要产品与实际用户分布共同决定。

## 从最小文件观察加载顺序

下面五个文件组成一个可导入的 JavaScript 实验。它不需要 npm 依赖，也不调用网络。先创建同名目录和文件，再通过开发者工具“导入项目”选择目录。项目中的 `touristappid` 仅用于游客练习，真实工程必须使用自己的 AppID。配置不包含密钥，AppSecret 永远不应出现在任何客户端文件中。

```json
// app.json
{
  "pages": ["pages/index/index"],
  "window": {
    "navigationBarTitleText": "架构实验",
    "backgroundColor": "#f4f6f8"
  }
}
```

```json
// project.config.json
{
  "appid": "touristappid",
  "projectname": "architecture-lab",
  "compileType": "miniprogram",
  "miniprogramRoot": "./",
  "setting": { "es6": true }
}
```

```javascript
// app.js
App({
  onLaunch() {
    console.info('app launch');
  }
});
```

```javascript
// pages/index/index.js
Page({
  data: { count: 0, lastAction: '尚未点击' },
  onLoad() {
    console.info('page load');
  },
  increment() {
    this.setData({
      count: this.data.count + 1,
      lastAction: '已通过 setData 更新'
    });
  }
});
```

```xml
<!-- pages/index/index.wxml -->
<view class="page">
  <text class="title">逻辑层与渲染层</text>
  <text>计数：{{count}}</text>
  <text>{{lastAction}}</text>
  <button bindtap="increment">增加一次</button>
</view>
```

```css
/* pages/index/index.wxss */
.page { padding: 32rpx; display: flex; flex-direction: column; gap: 24rpx; }
.title { font-size: 40rpx; font-weight: bold; }
button { margin: 0; min-height: 88rpx; }
```

以上代码块的文件名注释放在正文展示中；写入 JSON 文件时不要保留 `//` 注释。工具先读取项目配置确定源码根目录，再读取 `app.json` 的页面列表，运行应用入口并加载首个页面。页面的逻辑、模板和样式通过同一基础文件名关联。缺少全局 `app.wxss` 不影响这个实验；页面局部样式已经足够证明渲染链路。

## 再引入 TypeScript

验证 JavaScript 实验后，新建官方 TypeScript 模板观察差异。原生工具提供 `typescript` 编译插件，项目设置采用下面形式。沿用模板生成的类型声明和 `tsconfig.json`，不要从文章中猜测工具内部 TypeScript 版本，也不要同时保留同名手写 `.js` 和 `.ts` 页面造成入口歧义。

```json
{
  "setting": {
    "useCompilerPlugins": ["typescript"]
  }
}
```

```typescript
// 在 TS 模板中替换 pages/index/index.ts
interface ViewState {
  count: number;
  lastAction: string;
}
const initialState: ViewState = { count: 0, lastAction: '尚未点击' };

Page({
  data: initialState,
  increment() {
    const next: number = this.data.count + 1;
    this.setData({ count: next, lastAction: '类型检查后的更新' });
  }
});
```

这里的 TypeScript 是开发阶段检查，不会在运行时替你验证网络数据。示例使用显式类型变量，不额外依赖某个较新语法；后续代码若出现语法不支持，应按模板的检查器版本约束处理，而不是升级整个网站的 TypeScript。工具能转译、编辑器能提示、独立 `tsc` 能检查，是三个不同结果。团队应明确使用模板支持的检查方式，并保留失败输出。

## 第一次故障注入

先把 `app.json` 中页面路径改成不存在的路径，观察工具如何报告页面缺失；修复后再把 `bindtap` 指向不存在的方法，比较加载成功与事件失败的差异。然后把 `increment` 内的更新替换为 `this.data.count += 1`，注意逻辑对象变化并不保证画面同步。每个实验只改一处，记录输入、控制台、画面和恢复步骤，防止多个错误互相遮挡。

如果导入后出现空白页面，依次检查源码根目录、页面注册、文件同名关系、JSON 语法和控制台首个异常。不要先清空缓存、重装工具或关闭所有校验。这些动作可能暂时改变现象，却删除了根因证据。若只有真机失败，应补上客户端、系统、基础库、网络和账号信息，不能以模拟器日志替代设备日志。

## 工程组织与调试边界

学习阶段保持 `pages`、`components`、`utils` 三种职责即可。页面编排交互，组件表达可复用展示，纯业务模块负责校验和状态转移。先不要引入构建框架、全局事件总线和依赖注入容器；每多一个编译环节，就多一处需要解释版本和产物。确实需要 npm 包时，再核对小程序兼容性及工具构建 npm 的要求，浏览器可用不是充分条件。

调试设置中的“不校验合法域名”只是本机开发便利，不能成为业务发布前提。工具内置模拟也不能证明权限拒绝、系统设置、相机和弱网行为。日志允许记录匿名事件和错误类别，不应输出手机号、登录 code、令牌或完整响应。即使只在开发机运行，日志截图也可能进入工单和版本库，扩大数据暴露范围。

## 作业与验收

把计数实验改成“选择服务次数”，同时显示当前次数和最后动作。重新编译后应回到初始值，说明当前只存在页面内存状态；下一章再建立完整服务列表。为错误路径各写一条复现记录，要求别人只凭文件路径与步骤就能重现，不依赖你口头说明。

本章验收有四个可观察结果：工具可导入并定位首个页面；一次点击只增加一次；取消 `setData` 后能解释画面不刷新的原因；实验记录分别列出工具、基础库与实际客户端信息。尚未使用真机时，在客户端项写“未实测”，不要填一个推测版本。完成这些检查，才具备继续讨论状态、网络和授权的基础。

## 官方依据

- [代码构成](https://developers.weixin.qq.com/miniprogram/dev/framework/quickstart/code.html)：入口、页面及文件职责。
- [工具下载](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)、[基础库日志](https://developers.weixin.qq.com/miniprogram/dev/framework/release/)：版本事实，核验日期为 2026-10-23。
- [原生支持 TypeScript](https://developers.weixin.qq.com/miniprogram/dev/devtools/compilets.html)：内置插件与模板路径。
- [Page](https://developers.weixin.qq.com/miniprogram/dev/reference/api/Page.html)：页面注册与数据更新。

下一章：[WXML、WXSS 与类型边界](./02-template-style-types)。
