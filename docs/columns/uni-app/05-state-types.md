---
title: '05 · 状态模型与类型边界'
description: 分离表单、页面、业务和会话状态，构建只读状态入口与运行时解析，避免 any、全局可写对象和派生字段造成跨端数据不一致。
date: '2026-10-23'
category: uni-app 开发
tags: [uni-app, TypeScript, 状态管理, unknown, 领域模型]
series:
  order: 5
---

# 05 · 状态模型与类型边界

## 先划分状态的寿命

表单输入属于当前编辑任务，加载状态属于当前请求，预约记录属于业务集合，会话属于当前身份。它们的寿命不同，不能放入一个任意可写对象后让所有组件直接修改。离开页面可能保留草稿，但不该保留失效请求；退出账号应清理会话相关业务状态，不应连公共服务说明也删除。

区分原始与派生状态同样重要。预约数组是原始状态，有效条数、按日期分组和状态文案都是派生结果。把有效数量存为独立字段，需要每次创建、取消、恢复都同步更新，漏一条就会矛盾。优先用计算结果，而不是再建立一套人工维护的计数协议。

本章不默认安装状态库。一个小型学习项目可以用 Vue 响应式与明确动作入口完成；团队已经采用 Pinia 时遵循其模式，且不要再引入平行状态系统。是否使用库取决于共享范围、调试和持久化需求，不取决于“跨端应用一定要有全局 store”。[cite:1]

## 业务类型与输入类型不同

界面输入的日期和服务 ID 仍是字符串，不能因为 TypeScript 写了联合类型就自动合法。来自网络、存储、路由和平台事件的值应先视为未知，再经过运行时解析。类型系统描述可信程序内部的约束，解析器负责外部数据是否满足约束，两者不能相互替代。

预约输入包含服务、日期、时段和备注；业务记录还包含 ID、状态和创建时间。客户端不应该自行填写服务器确认状态与用户归属。生产状态最好区分草稿、发送中、结果未知、服务器已确认和取消，而非一个 `success: true`。每个状态都要回答事实来源以及允许的下一步动作。

## 完整的读取模型

下面模块用于解释网络记录的边界，可保存为 `domain/record.ts`。只允许已声明字段进入业务对象，数组有容量上限，ID 与日期经过检查。示例状态是端侧教学状态，不代表真实预约确认；后端接入时应改用明确的服务器模型，而非把这两个字符串重命名就上线。

```typescript
export type RecordRow = {
  id: string
  serviceId: string
  day: string
  status: 'active' | 'cancelled'
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
}
export function parseRows(value: unknown): RecordRow[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('记录集合不合法')
  const ids = new Set<string>()
  return value.map(item => {
    if (!object(item) || typeof item.id !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id) ||
        typeof item.serviceId !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,64}$/.test(item.serviceId) ||
        !validDay(item.day) ||
        (item.status !== 'active' && item.status !== 'cancelled') ||
        ids.has(item.id)) {
      throw new Error('记录字段不合法')
    }
    ids.add(item.id)
    return { id: item.id, serviceId: item.serviceId, day: item.day, status: item.status }
  })
}
```

这个解析器不会验证服务 ID 是否属于服务器服务集合，也不会验证记录当前用户是否有权限访问；那是业务和服务器职责。它确保应用不会把任意对象、非法日期或重复 ID 当作可信列表。边界要说明能证明什么，否则读者会把格式合法误解为真实性与授权都合法。

## 创建只读 store

状态工厂返回只读视图和明确的动作。恢复动作先解析整批，再采用，避免解析到一半留下半份数据；取消返回新数组，不直接改某个嵌套对象。不同页面共享同一个实例时，由应用入口显式创建和传递，不让模块顶层自动生成一个无法重置的状态容器。

```typescript
// stores/createRecordStore.ts
import { computed, readonly, ref } from 'vue'
import { parseRows } from '../domain/record'
import type { RecordRow } from '../domain/record'
export function createRecordStore() {
  const rows = ref<RecordRow[]>([])
  const activeCount = computed(() => rows.value.filter(row => row.status === 'active').length)
  function replace(raw: unknown) {
    const parsed = parseRows(raw)
    rows.value = parsed
  }
  function cancel(id: string) {
    if (!rows.value.some(row => row.id === id)) throw new Error('记录不存在')
    rows.value = rows.value.map(row => row.id === id ? { ...row, status: 'cancelled' } : row)
  }
  function reset() {
    rows.value = []
  }
  return { rows: readonly(rows), activeCount, replace, cancel, reset }
}
```

只读视图减少误修改，不是安全隔离机制。客户端代码与数据仍可被分析和修改，服务器必须再次校验写请求。store 动作也不是事务数据库：如果动作还需要存储，应在存储成功后采用内存状态，或者实现明确的乐观回滚与未知状态，第八章会解释这种顺序。

## 用页面连接状态

下面首页显式创建一个页面级 store，恢复固定教学输入并允许取消。输入明确标为练习，不模拟服务器返回成功。它可以验证只读展示与动作效果；关闭页面后状态不持久，这是当前寿命定义，而不是待修复的数据丢失。

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { createRecordStore } from '../../stores/createRecordStore'
const store = createRecordStore()
const message = ref('')
function loadLesson() {
  store.replace([
    { id: 'lesson-1', serviceId: 'consult', day: '2026-10-24', status: 'active' }
  ])
}
function cancel(id: string) {
  try { store.cancel(id) }
  catch (error) { message.value = error instanceof Error ? error.message : '操作失败' }
}
const rows = store.rows
const activeCount = store.activeCount
</script>

<template>
  <view class="page">
    <text>只读状态练习：{{ activeCount }} 条本地有效记录</text>
    <button @click="loadLesson">载入固定教学输入</button>
    <view v-for="row in rows" :key="row.id">
      <text>{{ row.day }} · {{ row.status }}</text>
      <button :disabled="row.status === 'cancelled'" @click="cancel(row.id)">本地取消</button>
    </view>
    <text v-if="message">{{ message }}</text>
  </view>
</template>

<style scoped>
.page { padding: 32rpx; }
button { min-height: 44px; margin: 24rpx 0; }
</style>
```

## 会话代际与异步结果

身份变化时不仅清空 token，还要防止上一账号的异步结果回来。维护会话代际，每次登录、退出或身份切换递增；请求捕获开始代际，回写前比较。如果用户甲请求尚未返回就登录用户乙，甲的结果必须丢弃，不能只依靠列表已经清空。

公共服务列表与用户记录应分开。公共缓存可以在不同身份间复用，但用户数据必须按身份分区，并在退出时清理内存与必要持久数据。匿名草稿不能未经确认自动上传给新账号；用户同意迁移后，再校验当前服务器服务与时段，避免把过期草稿当成可提交订单。

## 类型设计中的常见陷阱

`as RecordRow[]` 不会执行任何验证，`any` 会让错误沿调用链扩散。泛型 `request<T>` 若直接将响应断言为 T，只提供编译器幻觉。更好的接口接收一个 `unknown -> T` 解析函数，由它验证结构；解析失败属于数据契约错误，不当作暂时网络故障无限重试。

只读数组不能保证其中所有对象来自可信源，联合类型也不保证服务器接受某个状态。客户端状态应尽可能由动作推导，服务端状态由服务端返回。别用“展示方便”往持久模型塞服务名称、格式化日期和按钮文字；翻译或服务名改变后，旧记录就会混用新旧展示。

数字与时间也要定义单位。毫秒时间戳、秒时间戳、当地日历和服务器时区不是同一种数值。使用命名与解析说明单位，在测试中注入时间，不读取系统当前日期来决定断言。真实预约以门店时区与服务器时间为准，设备日期只能服务于本地提示和草稿体验。

## 状态迁移与所有权

一个记录数组不应同时由页面、存储回调和网络回调任意覆盖。确定唯一采用入口，所有外部集合先解析，再根据来源版本和会话决定是否采用。网络版本较旧时不能覆盖刚完成的取消；生产协议应提供版本或更新时间比较，而不是凭客户端回调到达顺序判断新旧。

测试还要检查对象所有权。恢复函数返回新对象，修改恢复结果不能污染原始输入；取消不能修改调用前的数组。这样失败后能保留上一份可信状态，也能在调试中比较变化。不可变更新并非越深复制越好，只复制业务变化的必要层级，避免大列表每次输入都整体序列化。

## 排错与实践

有效计数错误先检查是否保存了重复派生字段，状态串账号先检查会话代际与缓存分区，取消后刷新复原先检查有没有持久化或服务器动作。列表展示正确而解析仍失败，应看真实数据契约，而不是放宽校验到任何对象都能通过。

基础作业给 `parseRows` 写出重复 ID、非法闰日、未知状态和非数组输入的失败断言，再加入状态筛选 computed。进阶作业设计用户切换时的 reset 与代际，列出旧请求晚到的结果。验收要求解析失败不改变已有集合，筛选不修改存储源，取消幂等且不会增加记录。

独立测试应验证状态前后的内容，而不是只断言一个函数被调用。只读视图、运行时解析和服务端授权分别记录验证结论；本章代码只建立前两者的程序边界，没有执行真实会话切换或服务器权限测试。完整端侧领域与可执行断言将在第十二章给出。

## 官方依据

<a id="source-1"></a>[cite:1] [uni-app Vue 3 基础](https://uniapp.dcloud.net.cn/tutorial/vue3-basics.html)与[Vue 状态管理](https://cn.vuejs.org/guide/scaling-up/state-management.html)：响应式状态的组织方式。

<a id="source-2"></a>[cite:2] [TypeScript unknown](https://www.typescriptlang.org/docs/handbook/2/functions.html#unknown)：未知值与类型缩小。

上一章：[组合式 API 与生命周期](./04-composition-lifecycle)。下一章：[类型安全请求与取消](./06-request-cancellation)。
