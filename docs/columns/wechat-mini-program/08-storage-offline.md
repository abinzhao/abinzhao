---
title: '08 · 存储、离线与数据恢复'
description: 通过版本信封、运行时校验、有效期与用户隔离区分缓存和事实，处理坏数据、写入失败、离线草稿以及同步冲突。
date: '2026-10-23'
category: 小程序开发
tags: [微信小程序, 本地存储, 离线, 数据恢复, TypeScript]
series:
  order: 8
---

# 08 · 存储、离线与数据恢复

## 本地数据不是服务器事实

小程序本地存储适合草稿、偏好和可重建的读取缓存。它不适合证明某个预约已经得到服务器确认，也不是不可修改的安全数据库。用户切换设备、清理缓存、卸载宿主或遇到存储失败时，数据可能不再存在。真实预约应以服务器持久化为最终事实，端侧只保存可恢复的视图或待处理意图。

第五章讨论了请求超时后的未知结果。离线不是绕开这一问题的理由：客户端记录“希望预约十点”只代表意图，不代表库存已经扣减。界面必须区分本地草稿、等待提交、结果待确认、已确认和取消等状态，不能断网时生成一个本地 ID 就写“预约成功”。本章仅实现可靠草稿，第十二章会明确把完整项目限定为端侧练习。

## 存储需要一个协议

直接把页面 `data` 原样保存，会把加载状态、错误文案、临时文件路径和未来不再需要的字段一起固化。应只保存业务最小字段，并加上版本、保存时间与有效期。版本决定解析与迁移方式；时间决定缓存新鲜度；用户范围决定谁能够读取。没有版本的“反正是 JSON”会在升级后变成难以诊断的兼容问题。

存储 API 读出的对象必须重新校验，不能写 `getStorageSync(...) as Draft` 就信任它。旧版本、调试编辑、部分写入逻辑和非法字段都会使实际结构偏离 TypeScript。解析器应只创建允许字段，拒绝未知版本和无法解释的数据；读取失败与没有记录也要分开，避免故障时把空数据自动写回覆盖原有记录。[cite:1]

## 版本化草稿实现

在 `utils/draft.ts` 添加以下模块。这里限定时段集合、备注长度与七天有效期，均为教学产品规则，不是微信平台强制数值。scope 是应用控制的匿名范围或服务端给出的非敏感本地分区标识，不接受表单任意输入，不把手机号、openid 或完整 token 拼进存储 key。草稿不包含认证令牌。

```typescript
// utils/draft.ts
export type Draft = { slot: string; note: string };
type Envelope = {
  version: 1; savedAt: number; expiresAt: number; value: Draft;
};
export type ReadResult =
  | { kind: 'ready'; value: Draft; savedAt: number }
  | { kind: 'missing' | 'expired' | 'invalid' | 'unavailable' };
const allowed = ['09:00', '10:00', '14:00'];
const ttl = 7 * 24 * 60 * 60 * 1000;

function key(scope: string): string {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(scope)) throw new Error('invalid scope');
  return `booking-draft:v1:${scope}`;
}
function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}
function parseDraft(value: unknown): Draft | undefined {
  const row = object(value);
  if (!row || typeof row.slot !== 'string' || !allowed.includes(row.slot) ||
      typeof row.note !== 'string' || row.note.length > 120) return undefined;
  return { slot: row.slot, note: row.note };
}
function parseEnvelope(input: unknown): Envelope | undefined {
  const row = object(input);
  if (!row || row.version !== 1 ||
      typeof row.savedAt !== 'number' || !Number.isFinite(row.savedAt) ||
      typeof row.expiresAt !== 'number' || !Number.isFinite(row.expiresAt) ||
      row.savedAt < 0 || row.expiresAt - row.savedAt !== ttl) return undefined;
  const value = parseDraft(row.value);
  return value ? {
    version: 1, savedAt: row.savedAt, expiresAt: row.expiresAt, value
  } : undefined;
}
export function readDraft(scope: string, now = Date.now()): ReadResult {
  let raw: unknown;
  try { raw = wx.getStorageSync(key(scope)); }
  catch { return { kind: 'unavailable' }; }
  if (raw === '' || raw === undefined || raw === null) return { kind: 'missing' };
  const row = parseEnvelope(raw);
  if (!row) return { kind: 'invalid' };
  if (row.savedAt > now + 60000) return { kind: 'invalid' };
  if (now >= row.expiresAt) return { kind: 'expired' };
  return { kind: 'ready', value: row.value, savedAt: row.savedAt };
}
export function saveDraft(scope: string, value: Draft, now = Date.now()): void {
  const draft = parseDraft(value);
  if (!draft || !Number.isFinite(now) || now < 0) {
    throw new Error('草稿格式不正确');
  }
  const row: Envelope = {
    version: 1, savedAt: now, expiresAt: now + ttl, value: draft
  };
  wx.setStorageSync(key(scope), row);
}
export function removeDraft(scope: string): void {
  wx.removeStorageSync(key(scope));
}
```

这个模块没有悄悄删除坏缓存。读取异常时保留原数据，页面提示用户明确清除或重新保存。若业务确需自动迁移，应为每个旧版本定义纯迁移函数，先验证旧结构，再生成新结构，成功持久化后才采用新数据。迁移失败不能把版本号改成新值继续使用旧对象。

## 页面恢复与失败反馈

将第七章页面改为使用 `readDraft('guest')` 与 `saveDraft('guest', ...)`，不要同时维护旧 key 和新 key 却不知道最终从哪里恢复。`guest` 表示当前匿名练习范围，不声称这是某个微信用户。实际登录工程应由会话层确定分区，并在退出时清空内存状态；删除某个用户草稿需要单独、明确的产品决策。

```typescript
// 对象方法片段：将 onLoad 字段合并到第七章 Page，其他方法保留
({
onLoad() {
  const result = readDraft('guest');
  if (result.kind === 'ready') {
    this.setData({
      ...result.value,
      message: '已恢复当前设备草稿，尚未提交预约'
    });
  } else {
    const messages = {
      missing: '',
      expired: '草稿已过期，请重新选择时段',
      invalid: '草稿格式无法识别，请确认后重新保存或清除',
      unavailable: '本地存储暂不可读取，当前内容不会自动覆盖旧草稿'
    };
    this.setData({ message: messages[result.kind] });
  }
}
});
```

恢复不能只显示一条提示而不解释状态。用户可能把昨天填写的备注误认为预约已经提交，因此页面按钮仍应叫“保存草稿”或“提交预约”，并清楚说明当前动作。过期数据不能静默继续占用时段。草稿保存时间可以辅助用户判断，但本地时钟可变化，不能作为服务器库存或支付截止时间的可信依据。

## 同步与异步 API 怎么选

同步存储适合小而低频的记录，并且能在写入成功后立刻更新页面状态。同步 API 会占用当前执行时间，不应在每次输入、每次滚动或大列表循环中调用。自动保存可合并输入并设置短暂等待，同时在主动保存按钮处提供明确确认；页面卸载时异步任务能否完成不应作为唯一保存保证。

异步 API 能减少阻塞，但必须处理顺序。假设用户先保存甲草稿再保存乙草稿，若底层写入完成顺序不同，乙可能被甲覆盖。应用需串行写入或采用版本控制，不能只把回调转成 Promise 就认为并发问题消失。当前示例使用单页、小数据、同步写入，避免为教学引入不必要队列，但应在数据规模改变时重新测量。

## 离线能力与冲突处理

`getNetworkType` 或网络状态监听可以改善提示，却不能证明某次请求一定可达。设备显示联网时仍可能 DNS 失败、证书异常、服务器不可用或账号无权限。因此“离线模式”应是明确状态提示，真正的提交结果仍来自请求链。网络恢复事件可以提醒重试，不应自动重发所有本地写操作。

若产品需要离线提交队列，每项必须有操作 ID、当前用户范围、不可变参数、创建时间和处理状态。恢复时先验证当前身份，再查询已经发送过的操作，最后按服务器幂等契约处理。服务器拒绝过期时段、价格变化或预约重复时，应把冲突交给用户修复，不能无限重试或覆盖服务器新状态。

修改本地时钟也是必要实验。将时间向前或向后调整后，草稿可能被判定过期或来自未来，页面应提示重新确认而不自动提交。真实服务器记录要携带可信业务状态与时间，缓存的有效期只影响本地展示策略。不能依赖某次本地读取通过，就认定服务端预约仍在可取消窗口内。

## 容量、退出与隐私

平台存储有容量限制，不应把大图片、完整响应和无限日志塞进 key。具体额度以官方接口和目标版本为准，不把示例的草稿大小当平台配额。临时媒体应由文件 API 管理，持久化后还要制定清理策略。记录数量达到应用上限时明确提示，不要自动删除用户尚未处理的数据来让下一次写入成功。

登录前后的草稿合并尤其容易泄露。匿名草稿不应在任意账号登录后自动上传，更不能把甲账号缓存展示给乙账号。正确流程是隔离读取，明确征求是否迁移相关草稿，并重新执行字段和库存校验。退出至少清除当前会话与页面内用户数据，服务器 token 撤销和本地草稿保留分别说明。

## 故障实验与作业

先保存合法草稿并重新打开页面，确认字段恢复；将存储版本改成未知数，页面必须显示无法识别而不崩溃；把有效期移到过去，应显示过期而不提交；注入读取异常和写入异常，分别确认没有覆盖旧数据、没有假成功。再使用两个 scope 保存不同备注，证明它们互不读取。

作业是实现显式“清除当前草稿”按钮，先展示确认说明，再调用删除 API，成功后重置页面；删除失败时保留界面内容并给出重试入口。第二项作业是为旧版本增加迁移函数，写出合法迁移与非法数据拒绝的用例。验收必须包含数据文件结构、错误提示与重新打开后的行为，不能只看控制台没有报错。

## 官方依据

<a id="source-1"></a>[cite:1] [本地存储](https://developers.weixin.qq.com/miniprogram/en/dev/framework/ability/storage.html)与[wx.getStorageSync](https://developers.weixin.qq.com/miniprogram/dev/api/storage/wx.getStorageSync.html)：缓存返回值和限制。

- [wx.setStorageSync](https://developers.weixin.qq.com/miniprogram/dev/api/storage/wx.setStorageSync.html)：同步写入与异常处理。
- [wx.onNetworkStatusChange](https://developers.weixin.qq.com/miniprogram/dev/api/device/network/wx.onNetworkStatusChange.html)：网络状态通知的边界。

上一章：[自定义组件与表单](./07-components-forms)；下一章：[位置、媒体与能力降级](./09-location-media)。
