---
title: '12 · 完整本地预约项目'
description: 导入独立原生小程序，完成服务与日期选择、创建、列表、取消和恢复，理解状态机、持久化顺序及向真实服务器演进的边界。
date: '2026-10-23'
category: 小程序开发
tags: [微信小程序, 完整项目, 预约, 状态机, 实践]
series:
  order: 12
---

# 12 · 完整本地预约项目

## 交付一个闭环，而不是几个孤立页面

前十一章分别解决了渲染、路由、性能、请求、身份、组件、存储、能力与验证。本章把必要能力组合为一个真正可以导入的项目：选择服务、选择日期和时段、填写可选备注、创建本地记录、查看列表、取消、重新打开恢复，以及坏缓存时停止写入并提供明确处理入口。

项目位于 `examples/wechat-mini-program/appointment`，使用原生 JavaScript、WXML、WXSS 和 CommonJS 模块，不需要 npm 构建。选择 JavaScript 是为了让最小示例直接导入；前面章节的 TypeScript 业务边界仍适用，可以在固定 TS 模板中逐步迁移。没有使用浏览器 DOM、模拟接口或虚构服务器成功响应。

这是**端侧教学预约**，记录只属于当前设备，不代表真实服务库存、服务端身份、付款或商家确认。页面持续展示这个边界，状态文案是“本地有效”和“本地已取消”。如果用户需要真实预约系统，必须实现服务端授权、事务和未知结果恢复，不能仅改按钮文字就把它当生产系统。

## 工程文件与导入步骤

打开索引中核验的微信开发者工具 Stable，在导入项目时选择下面目录，使用游客模式。项目配置的 `miniprogramRoot` 是当前目录，AppID 是 `touristappid`，没有定位和网络配置。开发工具如果要求登录开发者账号，按工具提示完成；游客模式不验证后台身份、接口资格或发布。

```text
examples/wechat-mini-program/appointment/
  app.js
  app.json
  app.wxss
  project.config.json
  pages/index/index.js
  pages/index/index.json
  pages/index/index.wxml
  pages/index/index.wxss
  utils/domain.js
  verify.cjs
  README.md
```

导入后先看编译器是否识别 `pages/index/index`，再检查页面有没有端侧边界说明、服务选择、日期选择和记录列表。默认日期是下一本地日；今天已经过去的时段会在提交时拒绝。不要为了通过体验把系统日期随意改到未来，这会改变验证输入，应在纯逻辑测试中显式注入时间。

## 业务模型和状态规则

每条记录包含本地 ID、服务 ID、日期、时段、备注、状态和创建时间。服务采用固定教学集合；日期是本地日历字符串，不是 ISO UTC 时间戳；创建时间用毫秒时间戳记录操作时刻。备注长度按 UTF-16 编码单元限制。模型没有用户手机号、定位和头像，避免采集无必要的信息。

状态只有 `active` 和 `cancelled`。创建产生有效记录；取消将该记录改为已取消；再次取消返回同样业务状态，不产生第二条记录。已取消记录保留用于学习恢复与幂等，也允许重新预约相同服务、日期和时段。取消不是物理删除，清除所有本地数据是另一项需要确认的操作。

同一服务、日期、时段最多一条有效记录，这是练习的本地重复规则，不是多用户库存。不同服务可以有相同时段，已取消记录不占用本地重复条件。本地 ID 只用于列表 key 和查找，不具备认证或防伪意义；生产幂等键需要服务器唯一约束，不能依赖客户端随机字符串。

## 日期边界为什么要显式计算

`new Date('2026-10-24')` 可能按 UTC 日期解析，与本地日历不完全等价。本项目先验证年、月、日，再用 UTC 日序数判断日期间隔，避免跨夏令时的一天不等于固定二十四小时。展示和今天判断仍使用本地年月日，两种用途分开，不能混用。

允许范围是今天到三十天后，这是应用规则。当天还要比较时段与当前本地分钟，过去和正好开始的时段拒绝创建。测试显式传入时间，因此无论运行当天是不是二〇二六年十月，都能复现边界。真实跨地区预约应改用门店时区和服务器时钟，本地设备时钟不能决定实际库存截止。

## 领域模块可以独立运行

领域模块不引用 `wx`、`Page` 或页面 `data`。`create` 和 `cancel` 返回新数组，不修改已有数组；`decode` 从未知存储结构恢复允许字段；`encode` 写出版本信封。这样的边界让业务断言可以在 Node 中直接验证，也让页面只负责平台适配与展示。

```javascript
// 在 appointment 目录保存为独立练习 flow.cjs 后运行 node flow.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const sandbox = { module: { exports: {} } };
const filename = path.join(__dirname, 'utils/domain.js');
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
const domain = sandbox.module.exports;
const now = new Date(2026, 9, 23, 8).getTime();
const input = {
  serviceId: 'consult', day: '2026-10-24', slot: '09:00', note: '练习备注'
};
const created = domain.create([], input, now, 'flow-1');
const saved = domain.encode(created);
const restored = domain.decode(saved);
const cancelled = domain.cancel(restored, 'flow-1');
console.log(cancelled.map(row => ({
  id: row.id, day: row.day, slot: row.slot, status: row.status
})));
```

这个流程真实执行创建、编码、恢复和取消，不访问服务器。输出只包含固定教学输入，不打印用户内容或敏感信息。沙箱不是为了伪造 API，而是为了把原生 CommonJS 模块与 Node 工程模块设置隔离。完整断言入口是项目自带的 `verify.cjs`，不必额外保存上述练习文件。

## 持久化顺序决定失败时是否说谎

页面提交先调用纯函数生成 `next`，再使用 `wx.setStorageSync` 写入版本信封，成功后才替换内存并渲染列表。如果先显示新记录再尝试存储，存储失败后用户会看到不存在于持久层的“成功”；重新打开又消失，形成难以解释的数据丢失。失败时应保留表单与上一份已保存记录。

下面是实际页面中的提交和取消路径。完整 `Page`、事件绑定和样式已经在项目文件中，读者不需要猜测缺失的按钮行为。页面的 `records` 属于实例，不在模块顶层与其他页面共享；展示副本增加服务名与状态文案，存储只保存业务模型。

```javascript
// pages/index/index.js 中的对象方法片段
({
commit(next) {
  wx.setStorageSync(storageKey, domain.encode(next));
  this.records = next;
  this.render();
},
create() {
  if (this.data.busy || this.data.blocked) return;
  this.setData({ busy: true, message: '' });
  try {
    const now = Date.now();
    const id = `local-${now}-${Math.random().toString(36).slice(2, 10)}`;
    const next = domain.create(this.records, {
      serviceId: domain.services[this.data.serviceIndex].id,
      day: this.data.day,
      slot: domain.slots[this.data.slotIndex],
      note: this.data.note
    }, now, id);
    this.commit(next);
    this.setData({ note: '', message: '本地练习记录已保存；未提交任何服务器' });
  } catch (error) {
    this.setData({ message: error instanceof Error ? error.message : '保存失败，内容已保留' });
  } finally {
    this.setData({ busy: false });
  }
},
cancel(event) {
  if (this.data.busy || this.data.blocked) return;
  const id = event.currentTarget.dataset.id;
  if (typeof id !== 'string') return;
  this.setData({ busy: true, message: '' });
  try {
    this.commit(domain.cancel(this.records, id));
    this.setData({ message: '本地记录已取消；未调用服务器' });
  } catch (error) {
    this.setData({ message: error instanceof Error ? error.message : '取消保存失败' });
  } finally {
    this.setData({ busy: false });
  }
}
});
```

互斥状态同时存在于控件属性和处理方法。重复快速点击即使进入处理函数，也不能绕过领域重复规则。同步存储只是小数据教学选择，不能将大文件和无限列表塞进同一方法；项目上限为一百条记录，达到上限时给出明确错误，不自动删除历史记录。

## 重开恢复与坏缓存保护

页面在 `onShow` 读取当前 key，经过 `decode` 后才采用。未知版本、非法字段、重复 ID、重复有效时段或超出记录上限，都使读取失败并设置 `blocked`。此时页面隐藏不可信记录、停止创建和取消，提供重试读取与显式清除，避免把坏缓存自动覆盖成空集合。

清除按钮只删除 `local-appointment:v1`，不调用全局清空存储；确认文案说明当前设备和不可恢复边界。取消确认时保持原状态，删除失败时给出重试提示。真实产品通常还需要数据导出、迁移或联系支持入口，本地教学示例不把简单清除当作生产数据修复方案。

## 可执行验收顺序

先选明天与上午时段创建一条记录，确认列表显示对应字段和本地有效状态。再次提交相同服务、日期、时段，应显示重复错误且列表不增加；切换服务创建则允许。输入超长备注时应保留内容并拒绝提交，不能悄悄截断后造成用户误解。

取消第一条记录，确认状态改变；重新创建同一组合应允许，已取消历史仍保留。关闭再打开页面，确认两种状态都恢复。修改存储版本为未知版本，页面应停止写入；恢复正确缓存后重试读取，列表恢复；清除时分别测试取消确认和确认删除。

```bash
node examples/wechat-mini-program/appointment/verify.cjs
```

该命令覆盖创建、重复、备注、非法日期、过去与过远日期、已过时段、标识冲突、取消幂等、恢复副本、版本异常、重复存储和容量边界，还包括注入式页面存储故障与清除确认。使用 `TZ=Asia/Shanghai` 和 `TZ=America/New_York` 分别运行，可以覆盖不同日历环境与夏令时边界。通过只证明本地逻辑与固定输入，不证明开发工具 UI 或真机。工具点击、键盘、重开和实际存储故障实验仍需按第十章补充实际记录。

## 演进为真实预约系统

第一步不是加支付按钮，而是明确服务器契约：会话从微信 code 交换，服务与库存从鉴权接口读取，创建与取消使用可查询的操作 ID，服务器在事务内执行状态和库存约束。客户端发出写请求后断网，状态应是结果待确认，不直接把当前端侧模型标为已确认。

第二步确定草稿与服务器记录的职责。草稿可离线保存，真实确认必须可从服务器重新查询；缓存按用户分区，退出后清除当前内存，跨账号不自动上传匿名内容。第三步根据实际需要接入可选定位与媒体，并保留拒绝后的主流程，不为了功能数量扩大收集。

最后固定工具与编译路径，使用真实 AppID、后台配置、目标设备和后端完成验证。示例没有执行微信安卓、苹果、桌面或鸿蒙客户端测试，没有进行真实登录、上传、支付、提审或发布。读者的交付记录应逐项补齐，不把本地创建成功当作这些能力已经通过。

## 实践作业

基础作业是添加按有效与已取消状态筛选的派生列表，不修改原始 records、不把筛选结果写回存储，并验证切换筛选不会丢记录。进阶作业是把模型迁移到前面章节的 TypeScript 模板，保留运行时解析与全部断言；编译通过不能替代原有业务验证。

系统设计作业是写出创建超时、取消超时、账号切换和时段售罄的服务器恢复协议。每条包含当前状态、请求、服务器事实和下一步用户动作，明确哪些状态能自动恢复、哪些需要确认。完成后再接真实接口，避免先凭空实现成功流程，最后才发现异常路径无法闭环。

## 官方依据

- [代码构成](https://developers.weixin.qq.com/miniprogram/dev/framework/quickstart/code.html)：原生工程文件与运行入口。
- [Page](https://developers.weixin.qq.com/miniprogram/dev/reference/api/Page.html)：页面实例、数据和生命周期。
- [wx.setStorageSync](https://developers.weixin.qq.com/miniprogram/dev/api/storage/wx.setStorageSync.html)：持久化接口与失败处理。
- [小程序登录](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html)：向真实服务器身份链路演进。

上一章：[分包、发布与安全](./11-subpackages-release-security)；返回：[专题目录](./index)。
