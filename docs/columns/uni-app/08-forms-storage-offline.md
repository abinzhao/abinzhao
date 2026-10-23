---
title: '08 · 存储、表单与离线恢复'
description: 建立运行时草稿校验与版本信封，区分输入、保存、服务器确认和离线队列，处理坏缓存、容量、身份分区及失败后的内容保留。
date: '2026-10-23'
category: uni-app 开发
tags: [uni-app, 表单, storage, 离线, 草稿]
series:
  order: 8
---

# 08 · 存储、表单与离线恢复

## 离线可编辑不等于离线已预约

表单是用户意图，草稿是本地保存的意图，服务器记录才是业务确认。没有网络时可以编辑并保存，但不能根据本地时段列表宣称库存锁定。即使上次查询显示可用，其他用户也可能刚刚占用。界面必须区分“草稿已保存”和“服务器已确认”，否则恢复网络后用户才发现预约从未成立。

表单校验分为输入格式、领域规则和服务器约束。输入层检查空值与长度，领域层检查合法服务、真实日历和时段规则，服务器处理身份、库存与冲突。浏览器或内置 input 的 maxlength 只改善输入体验，不是安全边界；程序赋值、缓存恢复与请求都可能绕过控件限制。

## 使用内置事件解析输入

uni 输入事件通常从 `event.detail.value` 读取，不采用网页 `target.value` 的假设。picker 的索引也可能是字符串，应转为整数后检查范围。输入过程允许暂时不完整，提交时再给出字段错误，不因用户刚输入一个字符就跳弹窗。错误显示靠近字段，并保留原内容。[cite:1]

备注长度需要声明单位。JavaScript `length` 计算 UTF-16 编码单元，不是用户看到的字形数；表情可能占两个或更多单元。课程最小模型按该单位限制一百二十，界面与解析器一致。生产若采用字素计数，需要选择目标支持的实现与服务器一致规则，不能前端算一套、服务器算另一套。

## 草稿版本与读取规则

`uni.getStorageSync` 取出的值属于未知数据，可能来自旧版应用、开发工具编辑或损坏写入。下面模块使用固定版本信封并校验字段，只采用明确允许的内容。空缓存返回 null；未知版本抛错，不自动覆盖成空草稿。把它保存为 `storage/draft.ts`，不需要额外依赖。[cite:2]

```typescript
export type Draft = {
  serviceId: string
  day: string
  slot: string
  note: string
  savedAt: number
}
const key = 'appointment-draft:v1:anonymous'
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function parse(raw: unknown): Draft | null {
  if (raw === '' || raw === null || raw === undefined) return null
  if (!object(raw) || raw.version !== 1 || !object(raw.draft)) {
    throw new Error('草稿版本不支持，已停止覆盖')
  }
  const draft = raw.draft
  if ((draft.serviceId !== 'consult' && draft.serviceId !== 'review') ||
      typeof draft.day !== 'string' || draft.day.length > 10 ||
      typeof draft.slot !== 'string' || !['09:00', '10:00', '14:00'].includes(draft.slot) ||
      typeof draft.note !== 'string' || draft.note.length > 120 ||
      typeof draft.savedAt !== 'number' || !Number.isSafeInteger(draft.savedAt) ||
      draft.savedAt < 0) {
    throw new Error('草稿字段不正确，已停止覆盖')
  }
  return {
    serviceId: draft.serviceId, day: draft.day, slot: draft.slot,
    note: draft.note, savedAt: draft.savedAt
  }
}
export function readDraft() {
  return parse(uni.getStorageSync(key) as unknown)
}
export function saveDraft(draft: Draft) {
  const checked = parse({ version: 1, draft })
  if (!checked) throw new Error('草稿不存在')
  uni.setStorageSync(key, { version: 1, draft: checked })
}
export function removeDraft() {
  uni.removeStorageSync(key)
}
```

草稿日期允许空值或部分输入，但提交记录时必须走完整日历验证。这样恢复不会因为尚未填完的日期丢弃其他输入，同时也不会把不完整草稿直接变成预约。已恢复草稿还要根据当前服务和时段重新校验，旧服务被下线时保留用户备注并提示重新选择。

## 一个完整的保存页

下面首页连接输入、保存和恢复。页面初始化读取一次，不在每次显示时覆盖正在编辑的草稿；读取失败会阻止继续写入，重试成功后才解除。保存成功才显示本地确认，失败不清空备注。清除操作需要确认且只处理当前 key，不清空整个应用存储。

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { readDraft, removeDraft, saveDraft } from '../../storage/draft'
const note = ref('')
const blocked = ref(false)
const message = ref('')
function restore() {
  try {
    note.value = readDraft()?.note ?? ''
    blocked.value = false
    message.value = '草稿读取完成；不是服务器预约'
  } catch {
    blocked.value = true
    message.value = '读取失败，已停止覆盖。请重试或确认清除'
  }
}
onLoad(restore)
function change(event: { detail: { value: string } }) {
  note.value = event.detail.value
}
function save() {
  if (blocked.value) return
  try {
    saveDraft({
      serviceId: 'consult', day: '', slot: '09:00',
      note: note.value, savedAt: Date.now()
    })
    message.value = '匿名草稿已保存到本设备，未提交服务器'
  } catch (error) {
    message.value = error instanceof Error ? error.message : '保存失败，内容已保留'
  }
}
function clear() {
  uni.showModal({
    title: '清除此匿名草稿？',
    content: '只删除本设备的练习草稿，不影响服务器记录。',
    success(result) {
      if (!result.confirm) return
      try {
        removeDraft()
        note.value = ''
        blocked.value = false
        message.value = '草稿已清除'
      } catch { message.value = '清除失败，请稍后重试' }
    }
  })
}
</script>

<template>
  <view class="page">
    <text>匿名草稿练习</text>
    <textarea :value="note" :maxlength="-1" @input="change" />
    <text>{{ note.length }}/120 UTF-16 编码单元</text>
    <button :disabled="blocked" @click="save">保存本地草稿</button>
    <button @click="restore">重新读取</button>
    <button @click="clear">确认清除草稿</button>
    <text>{{ message }}</text>
  </view>
</template>

<style scoped>
.page { padding: 32rpx; }
textarea { width: 100%; margin: 24rpx 0; border: 1px solid #777; box-sizing: border-box; }
button { min-height: 44px; margin: 16rpx 0; }
</style>
```

## 持久化顺序与容量

小型数据同步保存简单，但会占用当前执行线程。大数据需要异步操作、分批设计或合适存储，不把图片二进制和无限记录数组塞入同步接口。平台存储额度不同，必须按目标文档和实际占用验证，不能把某一端的上限写成所有端保证。[cite:2]

保存记录时先构造候选，再写入，成功后采用内存状态。异步写入则需要串行化或版本，防止旧写入最后完成覆盖新草稿。自动保存的防抖只降低频率，无法保证卸载前最后一轮一定执行；重要编辑应有显式保存和当前状态说明，不声称退出时总能保存成功。

满额不能无声删除用户数据。设置教学上限、显示保留规则，必要时让用户主动清理。读取坏缓存也不能顺手写空对象“修复”，因为那会破坏潜在可恢复内容。生产应用应提供迁移、备份或支持路径；本地练习的显式清除只适用于不承载真实业务数据的场景。

## 迁移、身份分区与冲突

版本迁移从明确旧 schema 到新 schema，必须先校验旧结构，再生成候选新值，验证成功后才替换。未知未来版本不降级强写，避免旧客户端毁掉新客户端数据。迁移有失败策略与日志，但日志只记录版本与错误类别，不输出草稿全文。

用户草稿 key 需要按业务身份分区，匿名草稿独立。退出时处理当前账号数据，不能让新账号读到旧备注。不要将手机号作为明文 key，也不要把无法验证的路由 userId 当作缓存归属。匿名迁移给登录用户必须主动确认，再重新校验服务与日期。

离线队列比草稿复杂，因为它代表待执行动作。每个动作需要稳定操作 ID、状态、创建时间和重试预算，服务器需支持幂等与冲突查询。恢复网络后不能遍历队列无脑提交：库存、身份、服务规则可能变化。结果未知应查询，不以删除队列条目当作服务器已成功。

多设备草稿还涉及冲突。客户端最后写入并不必然是用户想保留的版本，服务端版本号与显式合并规则需要设计。预约本身不能通过合并两个状态字符串解决，必须依据服务器事务结果。先把本地草稿恢复可靠，再考虑同步，避免把数据丢失扩大到多设备。

## 草稿时效与成功后的清理

恢复草稿时展示保存时间和数据归属，过期只意味着需要重新确认，不应直接删除用户备注。服务可用状态与预约日期随时间变化，提交前从当前规则再次验证；自动将旧日期改成今天可能改变用户原意，应让用户主动选择。时效判断使用明确单位，设备时间异常时保持保守提示。

服务器确认创建后，清除对应草稿也可能失败。此时不能将已确认预约回滚为失败；应保留服务器记录事实，并提示本地草稿未清理，后续恢复时按操作标识避免重复提交。业务写入与草稿清理是两个结果，不能用一个 success 布尔值合并，否则清理错误会诱导用户再次预约。

## 故障实验与字段反馈

实验先保存备注，关闭再打开确认恢复；再输入一百二十一单元，保存应拒绝且内容保持。修改缓存版本后，页面显示阻写，点击保存不能覆盖；恢复合法缓存再重读，才解除阻写。确认清除分别测试取消和确认，取消不能改变原数据。

注入存储写失败时，检查成功文案是否错误出现、表单是否清空、内存列表是否增加。失败应保留上一份可信集合与当前输入，给出可重试动作。字段错误、存储错误与服务器冲突的提示分开，不用一个红色全局浮层承担所有恢复信息。

## 实践与验收

基础作业加入服务与日期字段，并分别处理未完成草稿和可提交输入；恢复不合法服务时保持备注并要求重选。进阶作业设计版本一到版本二迁移以及满额策略，写出旧数据合法、非法、未来版本和写入失败四条断言。不要通过放宽 parser 让坏数据静默通过。

验收要求表单错误可修复、保存失败不丢内容、读取失败不覆盖、清除需要确认、账号间不串数据。离线页面能编辑只证明端侧草稿可用，不能证明服务器库存和同步队列可靠。真实存储额度、键盘、重开与多设备冲突需要目标设备与服务器补测。

## 官方依据

<a id="source-1"></a>[cite:1] [input](https://uniapp.dcloud.net.cn/component/input.html)与[textarea](https://uniapp.dcloud.net.cn/component/textarea.html)：输入事件和属性。

<a id="source-2"></a>[cite:2] [存储 API](https://uniapp.dcloud.net.cn/api/storage/storage.html)：同步、异步与平台差异。

上一章：[身份与会话](./07-authentication-session)。下一章：[端能力与条件编译](./09-platform-capabilities)。
