---
title: '04 · 组合式 API 与生命周期'
description: 用 ref、computed 与 watch 表达状态，区分组件挂载和页面显示生命周期，管理计时器、监听与请求清理，避免隐藏页面继续回写。
date: '2026-10-23'
category: uni-app 开发
tags: [uni-app, Vue 3, 组合式 API, 生命周期, 清理]
series:
  order: 4
---

# 04 · 组合式 API 与生命周期

## 把响应式状态与副作用分开

`ref` 保存可变化的值，`computed` 表达由现有值推导的结果，`watch` 在变化时执行副作用。把所有逻辑塞进一个监听器会让状态难以解释：字段改动触发请求，请求又改字段，随后再次触发请求。先列出原始输入、派生显示和外部任务，才能决定使用哪种 API。[cite:1]

例如服务 ID 与日期是原始输入，提交是否可用是派生值，保存草稿和加载时段是副作用。提交是否可用不应再保存为另一个可写布尔值，否则某条异常路径忘记更新就会矛盾。派生计算必须保持纯净，不在 getter 中发网络请求、写存储或显示弹窗；读取次数不应改变系统行为。

标准 Vue 3 的模板会处理常见 ref 展开，而脚本仍需 `.value`。从 reactive 对象直接解构原始字段，可能失去连接；需要保持响应式时使用适当引用或 getter。不要通过复制整个状态对象来“修复不更新”，这可能覆盖用户刚输入的字段，并扩大不必要的渲染范围。

## 页面显示不等于组件挂载

Vue 组件生命周期与 uni 页面生命周期是两组概念。页面 `onLoad` 处理创建入口，`onShow` 处理重新显示，`onHide` 处理暂时隐藏，`onUnload` 处理销毁；组件的挂载和卸载负责自身资源。切换到另一个页面，原页面可能只隐藏而没有卸载，因此仅在 `onUnmounted` 清理计时器会让隐藏页继续工作。[cite:2]

初始化和刷新也应不同。`onLoad` 解析 ID，不反复覆盖编辑草稿；`onShow` 可以根据过期策略刷新服务器状态，但必须考虑首次显示与回到页面两种情况。应用进入后台再回来，设备时钟、网络和会话可能变化，不能假定离开期间什么都没发生，也不应该无条件重置全部输入。

## 一个完整的可见时钟

下面组合函数只在页面可见时更新时间。开始函数幂等，停止函数幂等，显示时立即取当前时间，再启动周期任务。隐藏、卸载和组件卸载均调用清理；重复清理不会产生异常。它没有业务网络调用，可以先用这个练习观察生命周期，再接入更复杂任务。

```typescript
// composables/useVisibleClock.ts
import { computed, onUnmounted, ref } from 'vue'
import { onHide, onShow, onUnload } from '@dcloudio/uni-app'
export function useVisibleClock() {
  const now = ref(Date.now())
  const running = ref(false)
  let timer: ReturnType<typeof setInterval> | undefined
  function stop() {
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
    running.value = false
  }
  function start() {
    stop()
    now.value = Date.now()
    running.value = true
    timer = setInterval(() => { now.value = Date.now() }, 1000)
  }
  onShow(start)
  onHide(stop)
  onUnload(stop)
  onUnmounted(stop)
  const label = computed(() => {
    const date = new Date(now.value)
    return `${String(date.getHours()).padStart(2, '0')}:` +
      `${String(date.getMinutes()).padStart(2, '0')}:` +
      String(date.getSeconds()).padStart(2, '0')
  })
  return { label, running }
}
```

```vue
<script setup lang="ts">
import { useVisibleClock } from '../../composables/useVisibleClock'
const { label, running } = useVisibleClock()
function openNext() {
  uni.navigateTo({ url: '/pages/detail/detail?id=clock-lesson' })
}
</script>

<template>
  <view class="page">
    <text>本地设备时间：{{ label }}</text>
    <text>{{ running ? '可见时更新' : '已停止' }}</text>
    <button @click="openNext">打开另一页后再返回</button>
  </view>
</template>

<style scoped>
.page { padding: 32rpx; display: flex; flex-direction: column; gap: 24rpx; }
button { min-height: 44px; margin: 0; }
</style>
```

组合函数在页面 setup 中调用，才能将页面事件绑定到正确实例。不是任何普通组件调用页面钩子都天然得到独立页面生命周期。需要给普通组件提供可见性时，可以由父页面传入状态或调用明确的开始停止接口，避免组件自己猜测整个应用当前显示哪页。

## watch 的粒度和清理

监听具体字段或稳定 getter，而非整个巨大表单的深度遍历。一个日期输入变化不应序列化所有列表。监听异步副作用时要取消上一轮任务，并在回写前确认本轮仍有效；取消是资源管理，序号是状态正确性，二者作用不同。第六章会给出 RequestTask 包装。

当前官方模板可能安装不同的 Vue 三点四兼容版本，不要无条件依赖后续版本才提供的新 API。本章使用 watch 回调第三参数提供的清理入口，这能让取消与当前监听轮次绑定。清理注册要在同步阶段建立，不等网络返回才决定上一轮如何停止。[cite:1]

```typescript
// 可加入页面 setup 的字段观察练习；没有服务器请求
import { computed, ref, watch } from 'vue'
const day = ref('')
const preview = ref('')
const valid = computed(() => /^\d{4}-\d{2}-\d{2}$/.test(day.value))
const stop = watch(day, (value, _previous, onCleanup) => {
  let current = true
  const timer = setTimeout(() => {
    if (current) preview.value = `当前草稿日期：${value}`
  }, 250)
  onCleanup(() => {
    current = false
    clearTimeout(timer)
  })
})
// stop() 用于主动结束这个监听；setup 中创建的监听会随所属组件卸载
```

这个延迟只演示监听清理，不是请求正确性的完整方案，也不是输入校验。正则只能判断格式，二月三十日仍需日历验证。不能因为输入频繁而把提交整个流程延迟；防抖适合减少草稿保存或搜索负载，真正的创建仍需要业务互斥和服务端幂等。

## 处理后台和重复显示

移动宿主可能暂停定时器，后台期间每秒递减的倒计时会漂移。倒计时应保存结束时刻，每次用当前时刻计算剩余值，显示时重新计算；但真实库存截止仍应由服务器决定，设备时间只用于提示。切回前台不能把一份旧缓存直接当成实时剩余名额。

轮询通常在可见时开始、隐藏时停止，且同一页面只允许一个任务实例。启动前清理旧任务，失败后按预算重试，不让每次 `onShow` 再叠加一个 interval。必要后台业务应使用目标平台明确允许的能力，不让一个普通页面定时器伪装成可靠后台服务。

订阅也需要精确解除。`uni.$on` 的监听若没有对应 `$off`，返回页面后可能重复处理；解除时传同一个函数引用，避免直接清除其他模块的全部监听。全局事件适合少量跨区域通知，不应变成没有类型和来源的万能状态总线。业务数据流优先通过明确状态入口管理。

## 异步错误与生命周期竞争

离开页面后响应回来，如果仍写入列表或显示错误弹窗，会影响当前页面。不要认为 Promise 无法取消就只能接受回写；可以取消底层任务，并用当前代际标记拒绝结果。错误也要归属当前任务，旧请求的失败不能把新请求的成功状态改为失败。

`try/finally` 恢复加载状态时也有竞争风险。请求甲的 finally 可能在请求乙进行中把 loading 设为 false。单一布尔值必须配合互斥，或在 finally 中检查序号。列表加载、提交和上传属于不同任务时，分别管理状态，不让一个加载标志阻塞所有页面能力。

## 排错与可观察证据

时钟越来越快，检查重复启动是否创建多个 interval；隐藏后仍有输出，检查是否只注册了组件卸载。派生值不更新，检查 getter 是否读取响应式值而非一次性副本。输入被重置，检查 `onShow` 是否重复初始化。先用简单计数与当前页标识观察，不打印用户输入和凭据。

记录钩子顺序时要包含实际动作：首次进入、打开详情、返回、切到后台、回前台、卸载。顺序可能因目标和启动方式不同，不能把模拟器单次日志写成所有设备保证。真正验收关注资源是否正确开始停止，以及当前页面有没有采用已失效结果，而非机械比较每行日志。

## 实践与验收

基础作业给时钟加上只读启动次数，连续进入详情再返回五次，每次保持一个计时器。进阶作业设计服务时段加载的代际模型，日期变更时取消旧任务，隐藏时停止，返回时按过期时间重新加载。写出旧成功、旧失败与当前成功的排列，明确允许谁回写。

验收要求隐藏期间没有继续更新可见数据，返回后时间正确，重复显示不积累任务，销毁后没有监听。输入变更后的延迟任务只采用最后一轮，清理不会删除其他订阅。真实后台、真机休眠和网络任务尚需在目标设备验证；本地函数正确不能替代宿主生命周期测试。

## 官方依据

<a id="source-1"></a>[cite:1] [Vue 3 基础](https://uniapp.dcloud.net.cn/tutorial/vue3-basics.html)与[Vue watch](https://cn.vuejs.org/guide/essentials/watchers.html)：响应式与清理。

<a id="source-2"></a>[cite:2] [页面与应用生命周期](https://uniapp.dcloud.net.cn/tutorial/page.html)：页面钩子和平台行为。

上一章：[组件与布局](./03-components-layout)。下一章：[状态模型与类型边界](./05-state-types)。
