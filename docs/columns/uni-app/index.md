---
title: uni-app 开发：Vue 3 与 TypeScript 的跨端工程实践
description: 明确标准 uni-app、uni-app x 与 UTS 的边界，从 HBuilderX 和 CLI 到状态、网络、身份、平台能力、测试及完整预约项目。
status: ongoing
featured: true
---

# uni-app 开发：Vue 3 与 TypeScript 的跨端工程实践

本专题围绕**标准 uni-app 的 Vue 3、TypeScript 与 `.vue` 页面**展开。目标是用一套业务模型面对 Web、微信小程序与 App 的不同运行约束，而不是让所有平台假装具有相同 DOM、Cookie、授权和原生插件能力。读者需要基本 JavaScript 知识，不需要预先掌握 Vue 2。

uni-app x 使用 `.uvue`、UTS 与不同的编译、渲染路径；UTS 也能用于扩展标准 uni-app，但“使用一个 UTS 插件”不等于“项目已经迁移到 uni-app x”。本专题不会把 x 的蒸汽模式组件、原生对象或 API 保证移植到标准 Vue 3 工程。

## 版本核验矩阵

**核验日期：2026-10-23。** 版本来自本次读取的 DCloud 正式下载页、发布日志和官方 CLI 模板。它们是官方单源证据，不宣称已完成跨端兼容实测。

| 对象 | 本次可核实版本或规范 | 采用策略 | 官方来源 |
|---|---|---|---|
| HBuilderX 正式通道 | `5.26.2026091802` | 可视化路径采用此正式版本；下载页 Alpha `5.33.2026102115-alpha` 不作为默认 | [下载页](https://www.dcloud.io/hbuilderx.html) |
| HBuilderX 新建默认项 | 5.26 日志说明默认改为 uni-app x 蒸汽模式 | 必须显式选择标准 uni-app、Vue 3；检查 `main.js/ts` 与 `.vue`，不要误建 x | [5.26 发布日志](https://download.dcloud.io/hbuilderx/changelog/5.26.2026091802.html) |
| Vue 3 TS CLI 模板 | 官方 `vite-ts` 分支中 DCloud 编译器包固定为 `3.0.0-5020420260813003` | 作为本次可核实的模板快照，不称为所有渠道最新；分支可移动，应保存取得的源码与锁文件 | [官方模板 package.json](https://raw.githubusercontent.com/dcloudio/uni-preset-vue/vite-ts/package.json) |
| CLI 配套依赖 | 模板写明 Vite `5.2.8`、Vue `^3.4.21`、TypeScript `^4.9.4`、vue-tsc `^1.0.24` | 区间不是已安装精确版本；从学习工程锁文件读取真实版本，不借用其他项目依赖替代 | [同一模板](https://raw.githubusercontent.com/dcloudio/uni-preset-vue/vite-ts/package.json) |
| Node.js | CLI 文档写明 Vue 3/Vite 要求 Node 18+、20+ | 教程命令使用维护中的 Node 22 系列并先看模板 engines；文档最低条件不等于维护建议 | [CLI 快速开始](https://uniapp.dcloud.net.cn/quickstart-cli.html) |
| 自动化工具 | HBuilderX 自动化测试插件从 `4.1.0` 起提供 CLI 接口 | 这是能力最低版本，不冒充插件当前发行版；安装后先查 `--version` 和 `--help` | [uniapp.test](https://uniapp.dcloud.net.cn/worktile/auto/hbuilderx-cli-uniapp-test.html) |
| 微信目标工具 | 微信开发者工具 Stable `2.02.2608080`；基础库日志可见 `3.17.5` | 两者与 uni 编译器分别记录；客户端和实际覆盖率待设备验收 | [微信下载页](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)、[基础库日志](https://developers.weixin.qq.com/miniprogram/dev/framework/release/) |

CLI 编译器安装在工程依赖中，不随 HBuilderX 升级自动变化；可视化工程通常使用 IDE 内置编译器。因此，IDE 为 5.26、CLI 模板仍使用对应 5.24 系列的包版本并不自动构成错误，但混用产物、插件与基座可能出错。发生差异时，应记录两条路径，不强行把三个对象写成一个版本。[cite:1]

媒体接口也需要按目标选择。官方文档明确微信旧 `chooseImage` 已停止维护，微信目标采用 `chooseMedia`；标准 App 的 `chooseMedia` 支持从 4.52 起，Web 仍不支持该接口。第九章将差异集中在适配器，不以一个同名调用承诺全端能力。[cite:10]

## 十二章学习路径

| 章 | 主题 | 阶段验收 |
|---|---|---|
| [01 工具、版本与工程边界](./01-tooling-project-boundaries) | HBuilderX / CLI、Vue 3 TS、编译与运行目录 | 能说明项目使用哪套编译器 |
| [02 pages、manifest 与导航](./02-pages-manifest-routing) | 页面注册、配置分工、页面栈、参数 | 冷启动和深链都能恢复正确页面 |
| [03 组件、布局与跨端样式](./03-components-layout) | 内置组件、props / emit、rpx、安全区 | 窄屏、长文本和键盘出现时可用 |
| [04 组合式 API 与生命周期](./04-composition-lifecycle) | ref、computed、watch、页面事件、清理 | 隐藏和卸载后无悬挂任务 |
| [05 状态模型与类型边界](./05-state-types) | 分层状态、只读 store、schema、派生值 | 业务变化经过统一入口 |
| [06 类型安全请求与取消](./06-request-cancellation) | unknown 解析、RequestTask、状态码与预算 | 旧响应不回写，取消和超时可区分 |
| [07 身份认证与安全会话](./07-authentication-session) | 微信 code、App OAuth、Web 会话、退出 | 平台身份有不同入口，服务端最终鉴权 |
| [08 存储、表单与离线恢复](./08-forms-storage-offline) | 字段校验、草稿版本、持久化与冲突 | 表单错误可修复，不把草稿当订单 |
| [09 端能力与条件编译](./09-platform-capabilities) | 定位、图片、上传、权限、编译适配 | 拒绝能力后可继续核心业务 |
| [10 插件、UTS 与 uni-app x](./10-plugins-uts-x) | 插件选型、平台接口、基座、迁移边界 | 能解释为何插件在某端不可用 |
| [11 性能、分包、CI 与真机](./11-performance-testing-release) | 包依赖、构建、自动化、发布矩阵 | 构建和平台验收互不替代 |
| [12 完整跨端预约项目](./12-appointment-project) | 服务、时段、创建、取消、恢复 | 独立标准 uni-app 端侧教学项目 |

## 代码与实践约定

代码默认使用 `<script setup lang="ts">` 与 ESM；入口沿标准 uni-app 的 `createSSRApp` 约定。示例坚持内置组件，不引入一次性 UI 框架，也不使用浏览器全局对象实现跨端主流程。需要真实服务器时会写清请求与响应契约、取消边界、授权和未知结果恢复，不用虚构域名响应宣称接入成功。

完整示例位于 `examples/uni-app/appointment`，采用 HBuilderX 可视化工程结构，无独立编译器依赖。端侧创建、取消和恢复均为本地练习；这不是可销售的真实预约系统，也不模拟已付款、已鉴权或已提审。CLI 读者应先用官方 `vite-ts` 模板创建独立学习工程，再放入章节说明的源文件并按模板命令运行。

本地检查包括文档链接与元数据、示例工程结构、代码语法及预约领域断言；第十二章提供可复跑命令。**HBuilderX 目标编译、H5 浏览器交互、微信 Android / iOS / 桌面 / 鸿蒙客户端、Android App、iOS App、HarmonyOS App，以及其他小程序平台均未实测；打包、OAuth、上传、CI 和商店发布未执行。** 平台 API 文档标为支持，不等于此业务流程在该设备上已经通过验收。

## 官方资料

<a id="source-1"></a>[cite:1] [CLI 快速开始](https://uniapp.dcloud.net.cn/quickstart-cli.html)：模板、工程结构、输出目录与编译器管理。

<a id="source-2"></a>[cite:2] [pages.json](https://uniapp.dcloud.net.cn/collocation/pages.html)：页面、导航、easycom 和分包配置。

<a id="source-3"></a>[cite:3] [Vue 3 基础及差异](https://uniapp.dcloud.net.cn/tutorial/vue3-basics.html)：Vue 与 uni-app 的组件、生命周期差异。

<a id="source-4"></a>[cite:4] [uni.request](https://uniapp.dcloud.net.cn/api/request/request.html)：回调 / Promise 形式、任务取消与平台差异。

<a id="source-5"></a>[cite:5] [uni.login](https://uniapp.dcloud.net.cn/api/plugins/login.html)：平台能力、App code、Web 入口与历史用户信息方案边界。

<a id="source-6"></a>[cite:6] [存储 API](https://uniapp.dcloud.net.cn/api/storage/storage.html)：同步和异步缓存操作。

<a id="source-7"></a>[cite:7] [条件编译](https://uniapp.dcloud.net.cn/tutorial/platform.html)：编译时隔离多端差异。

<a id="source-8"></a>[cite:8] [UTS 插件](https://doc.dcloud.net.cn/uni-app-x/plugin/uts-plugin.html)、[UTS 组件模式](https://doc.dcloud.net.cn/uni-app-x/plugin/uts-component.html)与[x 项目结构](https://doc.dcloud.net.cn/uni-app-x/project.html)：插件、原生对象和渲染模式边界。

<a id="source-9"></a>[cite:9] [自动化快速开始](https://uniapp.dcloud.net.cn/worktile/auto/quick-start.html)与[HBuilderX 自动化 CLI](https://uniapp.dcloud.net.cn/worktile/auto/hbuilderx-cli-uniapp-test.html)：测试执行条件。

<a id="source-10"></a>[cite:10] [图片 API](https://uniapp.dcloud.net.cn/api/media/image.html)、[chooseMedia](https://uniapp.dcloud.net.cn/api/media/video.html#choosemedia)与[定位 API](https://uniapp.dcloud.net.cn/api/location/location.html)：当前媒体入口、平台支持、配置和权限。
