---
title: 第六十六章：Web、IDE、桌面与附件交付
description: 将多端显示、运行状态与耐久附件分离，用内容身份和授权读取完成可验证交付。
date: '2026-10-23'
category: 智能体工程
tags: [客户端, 附件]
series:
  order: 66
---

# 第六十六章：Web、IDE、桌面与附件交付

回答里出现一个链接，不等于文件已经交付。浏览器对象 URL 可能刷新就失效，宿主临时路径可能仅在某台机器存在，附件也可能先写入会话引用后才上传失败。本章把交付拆成生成内容、持久化对象、登记引用、授权读取和客户端呈现五个动作，避免“聊天成功、产物丢失”的假完成。

## 显示层与权威状态

Web、IDE 和桌面可以共享同一个任务，但每个客户端只持有某个时刻的投影。界面上的运行中动画不是权威状态，流式文字也不是已完成结果。客户端需要区分草稿、已受理、运行、等待、失败和完成，并在连接恢复时重新读取宿主快照。两个窗口显示不同进度时，应按服务器修订收敛，不由最后渲染的文字决定业务状态。

不同端的能力不能互相假定。Web 可以使用浏览器文件上传，IDE 可能访问工作区编辑器，桌面可能允许打开本地文件；每种能力都应协商并受权限控制。宿主不应把一个绝对路径广播给所有端，也不能为了让浏览器下载而直接暴露完整文件系统。界面操作和任务副作用应分别获得授权。

## 插件 UI、资源与输入的生命周期

DeepSeek 固定 Web Client 使用 Slots 组织扩展界面。槽位声明属于具体的父组件注册；插件在有效声明中贡献 UI，卸载时释放自己的注册。单个区域、列表和处理链有不同基数，不能把所有贡献都“最后一个覆盖”。插件不直接导入另一个功能的 React 组件，而是通过声明与 props 连接。这种组合支持替换功能，同时要求启动图、注册失败和清理顺序都可诊断。

客户端资源以 `dsh-resource://` 地址和 provider 协议解析，订阅拥有 pins 与释放规则。资源地址是可寻址身份，不等于文件权限；sidebar 的 tab、导航地址与底层资源也不是同一个对象。断线后应从宿主快照重新建立视图，不能把浏览器里上一次缓存状态当作当前文件事实。插件热重载时旧订阅需释放，否则同一消息可能被多次渲染，或已经关闭的标签仍持有资源。

| 输入或资源 | 固定实现需要关注的边界 | 教学项目范围 |
| --- | --- | --- |
| Slots / Client Modules | 声明所有权、启动图、卸载与注入 | 没有动态客户端插件 |
| Client Resources / Sidebar | 地址解析、订阅、pin 与释放 | 只有文本事件页面 |
| 语音输入 | 临时音频、识别器、草稿修订检查 | 不采集麦克风 |
| 翻译 | 显式 provider、匿名文本、输入范围 | 不请求翻译服务 |
| Office 预览 | 授权转换、类型验证、资源上限 | 不执行文档转换 |

语音识别结果回到草稿时尤其需要修订检查：用户在识别期间已经修改文本，迟到结果不能覆盖新输入。音频是临时输入，并不因为识别成功就自动成为耐久附件。翻译也应由用户明确触发并限制文本范围；客户端展示语言与用户原始内容分别保存，不能让翻译结果改写执行授权。上述语音与翻译服务在固定版本属于实验能力，需按 provider 与当前产品支持验收。

`2026-10-23` 对 `0.2.1-rc.2` 的复核进一步区分临时输入与后台准备：麦克风由浏览器拥有，取消、Escape 或隐藏页面会丢弃录音；模型资源 preparation 则由 Host 拥有，关闭 observer 不等于取消下载。识别回填通过带 revision 的 selection 插入，拒绝时保留 transcript 供显式插入，而不是覆盖新草稿。

翻译也不能一概写成“匿名端点”：当前支持 Bing/Google 匿名路径与明确选择的付费原生 Flash 路由。付费路径需 Session；已有成功翻译可从缓存读取，新的无缓存请求要求 active Session。失败不自动切换提供商，原文始终保留。翻译保留记录、付费 usage 与语音准备需要分别披露，不能用“只是显示功能”免除数据出站和费用确认。

多端体验的最小成功标准是同一任务状态能收敛、草稿不会被过期结果覆盖、资源关闭后不再更新、产物仍可按授权取回。美观界面之外，还应以键盘、屏幕阅读器、移动视口与断线重连测试这些行为；本章的内存实验只检验内容身份。

## 固定实现中的附件机制

DeepSeek Harness `0.2.1-alpha.5`、提交 `1517a4dbca0a2789ff1d41ba439600f8547d23fa` 的 attachment 文档明确把二进制对象所有权与会话日志分开。生产者先交付 bytes，对象耐久后才发布不可变内容引用；会话事件和模型可见块保留引用与元信息，而不是 browser object URL、临时路径、provider URL 或 base64。

其 `AttachmentId` 是 opaque identity。当前本地后端可产生带摘要的形式，但消费者不得解析身份并自行拼文件路径。对象位于哪里由 provider 解析，工具是否能读对应路径再由执行文件系统边界决定。内容地址解决完整性与去重，不解决授权；知道摘要不能获得读取许可，也不代表对象永远不会被回收。

```text
用户草稿/工具产物
  -> 大小与类型检查
  -> 对象存储耐久提交
  -> 不可变引用 + 元信息
  -> 会话/交付记录
  -> 按当前用户授权读取
  -> 客户端预览或下载
```

附件和 deliverable 也不同：附件是可引用的内容对象，交付物是面向任务的产物角色，可能关联多个对象、状态与说明。应先确认最终内容，再登记交付关系，避免模型仅声称“已生成报告”却没有实际文件。客户端可下载只证明运输成功，内容正确还需业务验收。

### rc.2 的变更卡片不是耐久附件

当前固定 `deliverables.md` 还有一个容易被“持久化”概念掩盖的限制：`present` 产生 log-only 的 `deliverables/presented` 事件；工作区变更产生 log-only 的 `workspace/changes`，但变更 summary 本身**不在日志里**，只由 Host 服务提供至 Session dispose。Host 重启后重新打开旧会话，不会自动恢复旧 turn 的 changed-files 卡片。这与附件对象先耐久后引用是两条不同合同。

因此“事件还在”不能证明“变更比较还能下载”。需要长期审计的应用应另行持久保存经过授权的内容和比较证据，不将实时 workspace card 当归档。OpenCode `1.19.1` 以后也已停用 session sharing；旧分享 URL 不应成为跨端交付后备通道，见[第六十四章](./64-opencode-server.md#已停用的分享与残留类型)。

操作验收应将附件读取、present 文件与 changed-files 比较分开：关闭浏览器再打开只测试视图；Session dispose 和 Host 重启才测试服务寿命。某个可视 summary 消失不等于附件丢失；事件存在但对象无法授权取回，也不能宣称交付成功。

## 自包含内容身份实验

下面是内存对象存储示意，不是 DeepSeek 附件 API，不提供耐久性。它用摘要验证内容，用对象归属验证读取，再记录会话引用。实验不会创建文件、上传数据或打开浏览器。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const objects = new Map();
const references = [];
function store(owner, bytes) {
  const id = digest(bytes);
  objects.set(`${owner}:${id}`, Buffer.from(bytes));
  return { id, bytes: bytes.length, mediaType: 'text/plain' };
}
function attach(owner, reference) {
  if (!objects.has(`${owner}:${reference.id}`)) throw new Error('object-not-ready');
  references.push({ owner, ...reference });
}
function read(owner, reference) {
  const bytes = objects.get(`${owner}:${reference.id}`);
  if (!bytes) throw new Error('access-denied-or-missing');
  if (digest(bytes) !== reference.id) throw new Error('integrity-failed');
  return Buffer.from(bytes);
}
assert.throws(() => attach('alice', { id: 'missing' }), /not-ready/);
const ref = store('alice', Buffer.from('verified report'));
attach('alice', ref);
assert.throws(() => read('bob', ref), /denied/);
assert.equal(read('alice', ref).toString(), 'verified report');
objects.set(`alice:${ref.id}`, Buffer.from('tampered'));
assert.throws(() => read('alice', ref), /integrity/);
console.log(JSON.stringify({ references: references.length, checks: 'passed' }));
NODE
```

实际对象提交应将“可读且耐久”作为发布引用的前提。上传已成功而引用写失败时，可以产生待清理孤儿对象；反过来先写引用再存内容，则产生无法取回的悬空交付。前者可通过引用扫描与保留窗口治理，后者会直接破坏完成承诺。实验的 Map 不能验证掉电耐久，生产必须测试真实存储。

## 安全失败场景

上传文件名含路径穿越时，不可拿文件名拼接存储路径。伪造 MIME、压缩炸弹、巨大图片和复杂文档解析都需要资源限制；办公格式转 PDF 也应隔离执行，不能把预览转换当成无风险操作。渲染模型 Markdown 或附件 HTML 时，要避免执行脚本和任意外链；基础示例使用 `textContent`，不是完整富文本渲染安全方案。

下载链接还可能成为长期凭据。应限定有效期、受众与对象，避免 Token 出现在遥测 URL、引用文本或聊天日志。拒绝读取时可以返回不泄露对象存在性的统一结果。清理对象之前要计算会话、Fork 与交付记录的引用关系，不能仅根据原窗口是否关闭决定删除。

## 可观察验收

运行实验应拒绝对象未就绪时登记、其他 owner 读取与篡改内容，并允许原 owner 读取原始内容。真实客户端验收应测刷新后附件可取回、断线上传不出现已完成、旧窗口不能覆盖新状态、权限撤销后链接失效，以及取消后仍存活的下载或订阅是否按合同释放。

第十二章的 Web 入口只验证本机文本与 SSE；本章没有给它加入附件、多端同步、远程认证或桌面能力。生产交付测试需要浏览器和目标客户端运行时验证，不能用 Node 内存实验代替。最终报告应同时列出交付身份、内容摘要、实际读取结果和未覆盖的预览类型，不能只贴一个路径。

练习：画出浏览器关闭、Session dispose、Host 重启后三种资源的存活表。给录音期间修改草稿、翻译失败、旧分享 URL 各设计一个失败用例，断言保留原文、不覆盖新输入，也不登记假交付。

## 固定来源

- [rc.2 附件](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/subsystems/attachment.md)、[交付与变更卡片](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/subsystems/deliverables.md)、[Slots](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/subsystems/slots.md)、[语音](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/subsystems/voice-input.md)与[翻译](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/subsystems/translation.md)：当前寿命、修订与 provider 契约，核验于 `2026-10-23`；下列 alpha.5 链接是历史基线。
- [DeepSeek attachment](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/attachment.md)：对象先耐久、引用后发布及身份边界。
- [DeepSeek deliverables](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/deliverables.md)：交付角色与能力契约。
- [DeepSeek web-client](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/web-client.md)：多端投影阅读入口。
- [Slots](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/slots.md)、[Client Resources](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/client-resources.md)、[Sidebar](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/sidebar-right.md)、[语音输入](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/voice-input.md)与[翻译](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/subsystems/translation.md)：客户端组合、草稿与 provider 生命周期。
- [Node.js 22 crypto](https://nodejs.org/docs/latest-v22.x/api/crypto.html)：实验摘要实现。

上一章：[第六十五章：ACP、A2A 与 Agent 互操作](./65-acp-a2a.md)

下一章：[第六十七章：契约测试、故障注入与回归](./67-contract-fault-tests.md)
