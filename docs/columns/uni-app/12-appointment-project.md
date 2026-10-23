---
title: '12 · 完整跨端预约项目'
description: 导入标准 Vue 3 本地预约工程，完成服务与时段、创建、取消、恢复和坏缓存保护，运行纯 TypeScript 断言并明确向服务器演进的边界。
date: '2026-10-23'
category: uni-app 开发
tags: [uni-app, Vue 3, TypeScript, 完整项目, 预约]
series:
  order: 12
---

# 12 · 完整跨端预约项目

## 项目目标与真实边界

本章交付的目录是 `examples/uni-app/appointment`，包含标准 uni-app 的入口、页面注册、manifest、Vue 3 页面与纯 TypeScript 领域模块。页面可以选择服务、日期和时段，填写备注，创建本地记录、取消、重新打开恢复，并在缓存损坏时停止写入和提供明确清除入口。不是只有界面截图或几个不连通片段。

这是端侧教学应用，记录只属于当前设备，不代表商家库存、身份、付款或服务器确认。页面与成功提示持续写明“本地”，没有虚构网络接口、模拟已支付或自动上传。跨端指源码沿标准 uni 模型组织，并非已经在所有设备验证；工具、浏览器与设备验证边界会分别说明。

## 导入与运行路径

HBuilderX 使用索引核验的正式版，打开该目录并确认 `.vue`、`main.js` 与 `vueVersion: "3"`。五点二六的新建默认项可能是 x，不能按默认重新创建后混入本代码。DCloud 与微信 AppID 留空，读者按目标工具提示设置合法学习工程标识，不把一个伪造 ID 当作可发布资格。[cite:1]

```text
appointment/
  main.js
  App.vue
  pages.json
  manifest.json
  pages/index/index.vue
  utils/domain.ts
  verify.mjs
  README.md
```

先运行到 Web 检查普通控件；微信目标编译后在微信工具打开当前产物，使用自己的 AppID 或工具允许的游客模式。App 需要目标模块、基座和设备，不由 Web 启动自动证明。没有服务器请求，所以不需要关闭域名校验，也不需要地图、登录、支付或相机权限。

CLI 读者先用官方 vite-ts 模板创建独立目录，保留编译器依赖与锁文件，再将上述源码放入模板 `src`。入口只保留一份，避免同时存在 main.ts 和 main.js 后不清楚编译器选择哪个。运行脚本与输出目录以实际模板为准，不在可视化工程硬塞另一套依赖。[cite:2]

## 模型、状态与重复规则

记录包括本地 ID、服务 ID、当地日期、时段、备注、状态和创建毫秒时间。服务是固定教学集合，日期采用本地日历字符串，状态只有有效与已取消。服务名与状态文案由展示层派生，不写入存储，避免翻译变化导致同一业务记录出现不同持久内容。

同一服务、日期、时段最多一条有效记录，取消保留历史并允许重新创建同组合。不同服务相同时段允许，这是单设备重复规则，不是多用户库存。取消再次执行保持同状态，不新增记录；清除是不可恢复的本地删除，与取消一条记录不同，需要明确确认。

容量上限一百条，包括已取消历史，不自动删除旧记录。备注最多一百二十 UTF-16 编码单元，创建时去掉首尾空白；长备注保存失败仍保持输入。这个限制是应用模型，不是平台存储额度。真实系统需要更完整的分页、保留与用户数据策略，不能把教学上限当成产品容量。

## 日期为什么不能只加二十四小时

默认明天通过本地 `setDate` 推进日历，不用毫秒加二十四小时。纽约夏令时结束当天可能长于二十四小时，固定毫秒会仍落在当天；开始时也存在不同长度。显示与“今天”使用本地年月日，比较日历跨度则验证年月日后使用 UTC 日序数，两个用途分开。

允许日期是今天起三十天内，当天时段还须晚于当前分钟。非法日历如二月三十日、过去日期、过远日期和已开始时段都拒绝。测试显式注入时间，不依赖运行当天。真实跨地区服务应采用门店时区与服务器时钟，设备时间不能决定实际预约截止。

## 领域与存储控制器

`utils/domain.ts` 不引用 Vue、uni 或 DOM，运行时解析外部值并返回新集合。`decode` 验证版本、字段、ID 唯一与有效组合唯一，`encode` 写版本信封；恢复返回独立对象，调用方修改展示副本不会污染源记录。纯逻辑可以在 Node 直接执行，平台接口只在页面注入。[cite:3]

下面片段是完整模块的使用流程，不是一个假服务器。放在独立练习脚本时按 Node 类型擦除方式运行，完成创建、编码、恢复与取消。项目自带 `verify.mjs` 已包含更广断言，不必另外建立这个练习文件。

```typescript
// 可保存于 appointment/flow.ts，运行 node --experimental-strip-types flow.ts
import { create, cancel, decode, encode } from './utils/domain.ts'
const now = new Date(2026, 9, 23, 8).getTime()
const created = create([], {
  serviceId: 'consult', day: '2026-10-24', slot: '09:00', note: '练习备注'
}, now, 'flow-1')
const restored = decode(encode(created))
const cancelled = cancel(restored, 'flow-1')
console.log(cancelled.map(row => ({ id: row.id, day: row.day, status: row.status })))
```

控制器接收同步的 read、write、remove 端口，维护已保存集合与阻写状态。创建和取消先生成候选，再存储成功后采用；存储失败就抛错，原集合保持。snapshot 返回副本，页面没有任意修改内部 records 的权限。此抽取不是通用框架，而是让同一真实业务流程可以注入存储失败并断言。

## 页面连接与失败反馈

页面 setup 创建自己的控制器，避免模块顶层状态被其他页面意外共享。`onShow` 更新本地日期范围并重新读取记录；服务、日期与备注仍保留当前输入。列表由保存集合倒序派生，增加服务名和中文状态。内置 picker 的索引转换成整数后检查范围，备注通过 detail.value 接入。

```typescript
// pages/index/index.vue 中的实际适配方式
const key = 'uni-local-appointment:v1'
const controller = createController({
  read: () => uni.getStorageSync(key) as unknown,
  write: value => uni.setStorageSync(key, value),
  remove: () => uni.removeStorageSync(key)
})
const state = ref(controller.snapshot())
```

创建和取消共享明确 busy，控件属性与处理函数同时检查。失败反馈重新读取控制器可信快照并附加错误，不清空输入、不添加虚假成功行；成功后才清空备注。确认清除期间同样互斥，取消确认不执行删除，删除失败保留阻写与原数据，用户可以稍后重试。

## 坏缓存与恢复策略

未知版本、非法字段、重复 ID、重复有效组合和超量集合都拒绝采用。页面隐藏不可信记录并停止创建取消，提供重新读取与确认清除。读取异常不是合法的空集合，不能自动保存空数组“修复”，否则会无声毁掉潜在可恢复数据。

清除只删除 `uni-local-appointment:v1`，不会调用全局清空。提示说明当前设备、教学内容和不可恢复，不宣称取消了真实服务器预约。生产应用遇到坏数据通常需要迁移、备份或支持入口，本地练习的清除不能替代这些方案。退出账号分区不在本示例，因为它没有真实身份。

## 可执行的纯逻辑验证

Node 二十二点二十二零支持本章使用的可擦除 TypeScript；模块没有 enum、参数属性或运行时依赖。以下命令不安装依赖、不调用平台服务。类型擦除负责执行而非静态类型检查，静态语法、类型和 Vue 组件检查仍是另一类证据。

```bash
node --experimental-strip-types examples/uni-app/appointment/verify.mjs
TZ=Asia/Shanghai node --experimental-strip-types examples/uni-app/appointment/verify.mjs
TZ=America/New_York node --experimental-strip-types examples/uni-app/appointment/verify.mjs
```

断言覆盖创建、重复、日期、时段、备注、ID、取消幂等、恢复副本、版本、重复缓存与容量。存储注入实验验证读取失败阻写、创建写失败不采用、取消写失败保留有效状态、删除失败保持阻写、读取重试恢复。上海与纽约覆盖本地日历，并显式验证夏令时开始和结束后的明天。

两时区输出分别记录在示例目录的 `verification-shanghai.log` 与 `verification-new-york.log`。日志只有固定教学断言结果，不打印真实用户内容或凭据。这证明领域与注入存储控制器，不证明实际设备 storage、picker、键盘或生命周期；不能将纯测试注入写成真机故障已复现。

## 手工闭环验收

先创建明天记录，重复同组合应拒绝且列表不增加；切换服务后允许。取消第一条，状态改变，重新创建同组合允许，历史仍保留。关闭再打开，状态与备注恢复。当天已经过去的时段拒绝，超长备注拒绝并保留内容，每个错误都能通过改输入或重试恢复。

随后在开发工具改成未知缓存版本，确认保存按钮和处理函数都阻写；恢复合法缓存后重读解除。清除分别取消与确认，取消不得改变记录。窄屏、长备注、键盘、大字号与底部安全区检查所有动作仍可触达，至少四十四像素触控区域不是只看 CSS 数字，还要看真实控件。

## 向真实系统演进

第一步建立服务器服务、库存和会话契约，创建与取消在事务中执行并支持操作查询。客户端发送后断网应进入结果待确认，按操作 ID 恢复，不自动再创建；本地随机 ID 只用于列表身份，没有防伪或全局幂等保证。

第二步将草稿、缓存与服务器记录分开，按身份管理缓存，退出时取消请求并拒绝旧结果。匿名草稿迁移要用户确认和重新校验。第三步按业务必要接入可选定位与媒体，拒绝后仍保留核心流程。每一步都扩展实际断言和设备矩阵，不先把按钮文案改为真实成功。

目前 HBuilderX 目标编译、Web 交互、微信 Android、iOS、桌面与鸿蒙客户端，以及 Android、iOS、HarmonyOS App 和其他小程序均未实测。登录、上传、CI、提审和商店发布未执行。完整源码与纯逻辑通过只证明已声明范围，正式业务仍需要服务器、平台资格与设备验收。

## 实践作业

基础作业增加有效与已取消筛选 computed，不修改原集合，也不把筛选结果写回存储。进阶作业增加草稿保存，但保持草稿与记录不同版本 key，证明恢复草稿不会自动创建记录。系统作业写出身份变化、库存售罄和创建超时的服务器协议，再接真实接口。

验收要求另一位读者能按 README 导入并复跑断言，能解释失败时保留什么、谁有权确认成功、未实测哪些目标。可运行课程的完成不是截图漂亮，而是所有动作有真实实现、失败有明确恢复、证据不越过实际执行范围。

## 官方依据

<a id="source-1"></a>[cite:1] [标准 Vue 3](https://uniapp.dcloud.net.cn/tutorial/vue3-basics.html)与[HBuilderX 正式下载](https://www.dcloud.io/hbuilderx.html)：工程入口与工具。

<a id="source-2"></a>[cite:2] [CLI 快速开始](https://uniapp.dcloud.net.cn/quickstart-cli.html)：模板与编译路径。

<a id="source-3"></a>[cite:3] [存储 API](https://uniapp.dcloud.net.cn/api/storage/storage.html)与[页面生命周期](https://uniapp.dcloud.net.cn/tutorial/page.html)：平台适配边界。

上一章：[性能、测试与发布](./11-performance-testing-release)。返回：[专题首页](./index)。
