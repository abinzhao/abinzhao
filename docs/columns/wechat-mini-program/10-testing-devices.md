---
title: '10 · 测试、工具与真机排错'
description: 从领域断言到工具自动化建立分层证据，设计弱网和存储故障实验，记录实际客户端与设备矩阵并定位平台差异。
date: '2026-10-23'
category: 小程序开发
tags: [微信小程序, 测试, 自动化, 真机, 排错]
series:
  order: 10
---

# 10 · 测试、工具与真机排错

## 测试先回答它证明什么

预约逻辑在 Node 中通过，只证明这段逻辑在给定输入下产生预期输出，不证明 WXML 按钮绑定正确、微信授权可用或弱网下服务器只创建一次预约。开发工具自动化通过，也不证明安卓、苹果、桌面或鸿蒙客户端行为一致。测试应分层，结论必须停留在对应证据范围，避免把一种通过扩大为“全端可用”。

本章把证据分为领域逻辑、平台边界、工具页面和真机集成。领域逻辑检查校验和状态转移；平台边界检查请求回调、取消和存储失败；工具页面检查路由与控件交互；真机集成检查权限、键盘、网络、生命周期和用户可完成的业务。各层都需要正常、异常和恢复路径，只有正常截图不足以交付。

## 可重复的输入与明确断言

日期、随机数和真实网络会让测试难以复现。领域函数应显式接收 `now` 与本地 ID，而不是内部每次读取当前时间。测试固定时间，覆盖合法日期、不存在日期、过去日期和上限之外日期；随机 ID 在测试中固定为已知字符串，才能准确判断重复标识和对象状态。

不应只断言“函数没有抛错”。创建要检查新增记录、备注规范化、状态以及输入数组未被修改；取消要检查目标变化、其他记录保持不变和重复取消的幂等行为；恢复要检查版本、字段和重复记录，坏数据必须拒绝。断言描述可观察结果，不依赖函数内部调用了几次某个无关辅助方法。

## 纯逻辑验证的完整入口

第十二章示例提供 `verify.cjs`，可以在安装 Node 22 的终端运行。它读取实际 `utils/domain.js`，在 CommonJS 沙箱中执行，不安装测试框架，不调用微信接口，也不发送数据。沙箱解决不同工程模块加载方式的差异，不替业务函数伪造结果。

```bash
node examples/wechat-mini-program/appointment/verify.cjs
```

以下是同一验证思路的精简版，可保存为独立练习目录的 `verify.cjs`，与 `utils` 并列。完整示例的验证文件还覆盖容量、重复标识、非法备注及恢复副本。

```javascript
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const filename = path.join(__dirname, 'utils/domain.js');
const sandbox = { module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
const { create, cancel, decode, encode } = sandbox.module.exports;
const now = new Date(2026, 9, 23, 8).getTime();
const input = {
  serviceId: 'consult', day: '2026-10-24', slot: '09:00', note: '  demo  '
};
const previous = [];
const first = create(previous, input, now, 'test-1');
assert.equal(previous.length, 0);
assert.equal(first.length, 1);
assert.equal(first[0].note, 'demo');
assert.throws(() => create(first, input, now, 'test-2'), /重复/);
assert.throws(() => create([], { ...input, day: '2026-02-30' }, now, 'bad'), /日期/);
const cancelled = cancel(first, 'test-1');
assert.equal(cancelled[0].status, 'cancelled');
assert.equal(first[0].status, 'active');
assert.deepEqual(decode(encode(cancelled)), cancelled);
assert.throws(() => decode({ version: 2, items: [] }), /存储/);
console.log('Domain checks passed');
```

先写一条创建断言，观察缺少实现时失败，再实现最小行为并运行通过。随后添加重复、非法日期和取消等边界。在测试失败时先核对输入和需求，不把错误预期改成实现当前结果。为了让测试通过而允许非法日期、移除重复检查或用固定成功响应，都破坏了验证价值。

## 平台边界怎样注入故障

平台 API 不在 Node 中存在，所以请求和存储边界测试可以注入受控适配器。注入的不是“永远成功”的假业务，而是平台可能发生的行为：HTTP 五百零三进入 success、abort 后仍触发 fail、两次写入完成顺序不同、同步存储抛错。断言页面与模块在这些输入下怎样收尾。

第五章请求模块要验证总预算而不只是单次 timeout。使用可控制的计时器和请求适配器，检查等待重试期间取消不会发下一次请求，过时响应不能覆盖新列表，POST 不自动重发。协议注入测试应标为本地边界测试，不能称为已经验证 DNS、证书或微信网络栈。

第八章存储故障重点是保护旧数据。故障发生在“生成下一状态”和“采用下一状态”之间时，页面必须仍显示前一份已保存状态；坏缓存读取应停止写入，而不是自动恢复成空集合。故障解除后重试应可恢复。测试不要把抛错方法改成永远成功来避开这一分支。

## 开发工具自动化环境

官方快速开始给出的 Node 大于八、基础库不低于 `2.7.3`、工具不低于 `1.02.1907232` 是历史能力最低要求，不能当作二〇二六年的默认安装建议。本专题采用索引中核验的 Stable 工具和维护中的 Node 系列。自动化 SDK 当前精确版本需在独立测试工程核实并固定，不凭工具版本猜测。[cite:1]

按官方说明开启开发工具安全设置中的 CLI 与 HTTP 调用。只在可信本机环境开放调用，不把调试端口暴露到外网。自动化可能关闭工具、重新启动页面或修改测试存储，使用独立教学项目和测试账号，不能对真实用户数据执行清空或预约操作。

```bash
# 在独立自动化练习目录查询发行信息，然后固定所选版本
npm view miniprogram-automator version engines --json
# 将 <verified-version> 替换为上一步核实并记录的精确版本
npm install --save-dev --save-exact miniprogram-automator@<verified-version>
```

尖括号是必须替换的参数说明，不是能直接执行的 shell 文本。安装后保存自己的锁文件。工具 CLI 路径、项目路径和测试账号属于运行输入，应记录实际值，不能从其他机器的默认目录推断。第一次运行先验证工具能够打开工程，再验证页面业务，避免混合诊断两类问题。

## 自动化页面断言

以下保存为 `smoke.cjs`，传入真实项目路径和 CLI 路径。测试重新启动示例页，确认边界说明存在，再修改备注并检查页面数据；它没有替代 picker 真正选择，也没有声称完成整个预约路径。已有记录可能存在，因此不依赖列表最初一定为空。

```javascript
const assert = require('node:assert/strict');
const automator = require('miniprogram-automator');
const path = require('node:path');
async function main() {
  const projectPath = process.env.MINIPROGRAM_PROJECT;
  if (!projectPath) throw new Error('Set MINIPROGRAM_PROJECT');
  const miniProgram = await automator.launch({
    projectPath: path.resolve(projectPath),
    ...(process.env.WECHAT_CLI ? { cliPath: process.env.WECHAT_CLI } : {})
  });
  try {
    const page = await miniProgram.reLaunch('/pages/index/index');
    await page.waitFor('.notice');
    const notice = await page.$('.notice');
    assert.ok(notice);
    assert.match(await notice.text(), /当前设备/);
    await page.setData({ note: 'automator draft' });
    assert.equal(await page.data('note'), 'automator draft');
  } finally {
    await miniProgram.close();
  }
}
main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
```

真正交互验收应继续操作日期、时段、创建、取消和重开恢复。`page.setData` 可以定位渲染问题，但不能证明用户输入事件绑定正确；`page.callMethod` 也不能证明按钮可见、可点或未被键盘遮挡。测试报告应注明使用了哪种操作，不能把方法调用包装成真实点击证据。

## 真机矩阵与复现记录

至少按目标用户覆盖安卓、苹果以及实际需要的桌面或鸿蒙端。每条记录保存设备型号、系统版本、微信客户端版本、基础库版本、工具版本、构建标识和网络条件。工具版本不能代替客户端版本，基础库“日志最新条目”也不能代表该用户已经运行那一版本。

必测交互包括小屏和大字号、长备注、键盘弹出、后台切换、从分享或扫码进入、弱网、权限拒绝和重新打开。触控尺寸、安全区、输入法以及相机返回路径在真机可能与工具不同。只有业务能够完成且失败后能够恢复，才算该设备上的关键路径通过。

## 按证据缩小问题

遇到白屏先确认工程路径、编译错误与页面注册，再确认 WXML 和组件注册，不直接归咎于基础库。页面正常但数据不更新，检查 `setData`、实例是否已隐藏与旧请求世代；请求失败则依次检查域名、证书、HTTP 状态、响应结构与授权。每一步都尽量减少输入，避免同时更换工具、代码与账号。

只在某端失败时，先保留同一构建在其他端的对照证据。不要通过永久关闭域名校验、忽略 Promise 拒绝或禁用安全检查制造成功。日志只包含阶段、错误类别和匿名操作标识，不记录 code、token、坐标、手机号或完整响应。

## 作业与验收

作业是写一张包含创建、重复、取消、恢复、坏缓存和弱网的验收表。每行必须有前置状态、具体操作、预期结果、实际结果和证据位置。没有执行的设备标为待测，不填写“预计通过”。纯逻辑验证输出与工具自动化截图分别存放，保持证据来源清楚。

第二项作业是故意破坏一条规则，例如移除重复检查，确认领域断言确实失败，再恢复实现。如果测试仍通过，说明覆盖没有触及该规则，应先修正测试。最终验收不仅是全部绿色，还应能解释每种绿色证明的范围，以及发布前仍缺少的账号、网络和真机证据。

## 官方依据

<a id="source-1"></a>[cite:1] [自动化快速开始](https://developers.weixin.qq.com/miniprogram/dev/devtools/auto/quick-start)：最低能力要求与开启条件。

- [Automator](https://developers.weixin.qq.com/miniprogram/dev/devtools/auto/automator)：启动与连接。
- [Page](https://developers.weixin.qq.com/miniprogram/dev/devtools/auto/page)：等待、数据与页面操作。
- [兼容处理](https://developers.weixin.qq.com/miniprogram/dev/framework/compatibility.html)：基础库能力判断与兼容策略。

上一章：[位置、媒体与能力降级](./09-location-media)；下一章：[分包、发布与安全](./11-subpackages-release-security)。
