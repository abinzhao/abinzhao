---
title: '06 · 类型安全请求与取消'
description: 正确获得 RequestTask，解析 unknown 响应，区分传输、状态码、数据与取消错误，控制重试预算并防止旧响应回写当前页面。
date: '2026-10-23'
category: uni-app 开发
tags: [uni-app, RequestTask, TypeScript, 取消, 重试]
series:
  order: 6
---

# 06 · 类型安全请求与取消

## 先区分四种失败

请求失败可能是传输没有完成、HTTP 状态不符合契约、响应字段不合法，或者用户主动取消。它们需要不同恢复。网络中断可在预算内重试只读请求，未授权需要会话处理，字段不合法需要检查服务契约，主动取消一般不应弹出错误。把所有问题变成“网络不好”会让用户反复执行无效动作。

`uni.request` 的返回形式与回调有关。提供 `success`、`fail` 或 `complete` 之一时，可以取得 `RequestTask`；只使用 Promise 形式时，不能把返回 Promise 当成带 `abort` 的任务。本章显式使用回调并自行构建业务 Promise，让取消对象保留在调用方。[cite:1]

跨端仍有不同网络约束。Web 受 CORS、Cookie 与浏览器策略影响，微信小程序需要合法域名和目标 AppID 的配置，App 还涉及证书、权限与网络环境。关闭开发工具域名校验只能用于指定开发排查，不能成为发布方案；Web 请求成功也不证明微信域名已经配置正确。

## 定义可信响应

服务列表契约为对象中的 `items` 数组，每项有安全 ID、名称和分钟时长；设置字段与集合长度上限。服务器仍需实现真实数据和授权，下面没有虚构响应或演示公网地址。把模块放到 `services/readServices.ts`，由调用方提供已授权、已配置的 HTTPS 地址。

```typescript
export type Service = { id: string; name: string; durationMinutes: number }
export type RequestFailure =
  'cancelled' | 'timeout' | 'transport' | 'http' | 'data'
export class ReadError extends Error {
  constructor(public kind: RequestFailure, message: string, public status?: number) {
    super(message)
  }
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function parseServices(raw: unknown): Service[] {
  if (!object(raw) || !Array.isArray(raw.items) || raw.items.length > 100) {
    throw new ReadError('data', '服务集合不符合约定')
  }
  const ids = new Set<string>()
  return raw.items.map(item => {
    if (!object(item) || typeof item.id !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id) || ids.has(item.id) ||
        typeof item.name !== 'string' || item.name.length < 1 || item.name.length > 80 ||
        typeof item.durationMinutes !== 'number' ||
        !Number.isInteger(item.durationMinutes) ||
        item.durationMinutes < 1 || item.durationMinutes > 480) {
      throw new ReadError('data', '服务字段不符合约定')
    }
    ids.add(item.id)
    return { id: item.id, name: item.name, durationMinutes: item.durationMinutes }
  })
}
export function readServices(url: string): {
  promise: Promise<Service[]>; cancel: () => void
} {
  if (!/^https:\/\/[^/\s]+(?:\/|$)/.test(url)) throw new Error('需要已配置的 HTTPS 地址')
  let task: UniApp.RequestTask | undefined
  let finished = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let rejectPending: (reason: Error) => void = () => {}
  function finish() {
    if (finished) return false
    finished = true
    if (timer !== undefined) clearTimeout(timer)
    return true
  }
  const promise = new Promise<Service[]>((resolve, reject) => {
    rejectPending = reject
    timer = setTimeout(() => {
      if (!finish()) return
      reject(new ReadError('timeout', '读取超过本次时间预算'))
      task?.abort()
    }, 8000)
    try {
      task = uni.request({
        url, method: 'GET', timeout: 8000,
        success(response) {
          if (!finish()) return
          if (response.statusCode !== 200) {
            reject(new ReadError('http', '服务器未返回约定状态', response.statusCode))
            return
          }
          try { resolve(parseServices(response.data as unknown)) }
          catch (error) {
            reject(error instanceof ReadError ? error : new ReadError('data', '响应解析失败'))
          }
        },
        fail() {
          if (finish()) reject(new ReadError('transport', '未完成读取，请检查网络后重试'))
        }
      })
    } catch {
      if (finish()) reject(new ReadError('transport', '请求无法启动'))
    }
  })
  function cancel() {
    if (!finish()) return
    rejectPending(new ReadError('cancelled', '本次读取已取消'))
    task?.abort()
  }
  return { promise, cancel }
}
```

`finish` 保证只采用一个终态。取消先结束业务状态再调用 `abort`，避免平台随后的 fail 把取消误报为网络错误；超时同理。平台自己的超时可能先进入 fail，所以这里不能根据一段平台错误文案声称所有超时都已精确识别。需要更细分类时应结合目标错误码与实际文档，不依赖英文字符串猜测。

地址正则只作格式初检，不是 SSRF 或可信域名安全策略。生产地址应来自受控配置，不接受路由或用户输入任意覆盖；跨端证书与域名限制仍由平台实施。泛型不能替代 `parseServices`，类型缩小才让外部值进入业务数组。不要返回整个 response，让页面各自猜测字段。

## 页面用序号保护回写

保存为 `composables/useServiceList.ts`，页面 setup 中调用并把 `items`、`loading` 与 `message` 展示出来，重试按钮调用 `reload`。调用时传入实际服务器地址；未准备服务器时不要执行或编造成功结果。示例同时停止旧任务与拒绝旧结果，生命周期和表单变化可以使用同一取消入口。

```typescript
import { onUnmounted, ref } from 'vue'
import { onHide, onShow, onUnload } from '@dcloudio/uni-app'
import { ReadError, readServices } from '../services/readServices'
import type { Service } from '../services/readServices'
export function useServiceList(url: string) {
  const items = ref<Service[]>([])
  const loading = ref(false)
  const message = ref('')
  let generation = 0
  let cancelCurrent: (() => void) | undefined
  function stop() {
    generation += 1
    cancelCurrent?.()
    cancelCurrent = undefined
    loading.value = false
  }
  async function reload() {
    stop()
    const current = generation
    loading.value = true
    message.value = ''
    try {
      const operation = readServices(url)
      cancelCurrent = operation.cancel
      const result = await operation.promise
      if (current === generation) items.value = result
    } catch (error) {
      if (current === generation &&
          !(error instanceof ReadError && error.kind === 'cancelled')) {
        message.value = error instanceof Error ? error.message : '读取失败'
      }
    } finally {
      if (current === generation) {
        loading.value = false
        cancelCurrent = undefined
      }
    }
  }
  onShow(reload)
  onHide(stop)
  onUnload(stop)
  onUnmounted(stop)
  return { items, loading, message, reload }
}
```

序号检查不仅在成功分支，还在 catch 和 finally。旧请求失败不能覆盖新成功提示，旧 finally 不能让当前 loading 消失。真实项目还要捕获会话代际：同一页面序号没有变化但账号已经改变时，也必须拒绝旧结果。停止与重新读取是一项明确用户动作，不应隐含无限循环。

## 重试预算与写入未知结果

只读重试要有次数、总时间和间隔预算。建议先采用最多两次尝试的保守策略，只处理明确可恢复的传输和部分服务器临时状态；解析错误、鉴权错误和取消不重试。遵循服务端限流约定与 `Retry-After`，不要同时重试所有请求形成拥塞。预算是应用策略，不是平台保证。

退避期间也必须可取消。只取消当前 RequestTask 却保留下一次定时器，会在用户离开后再发请求。总预算从用户动作开始计算，每次尝试只用剩余时间，避免“每次八秒”叠加为一分钟。自动重试仍失败时，保留可重试入口与旧数据标记，不展示空列表冒充真实无数据。

创建预约、取消预约和付款不是普通 GET。客户端超时可能意味着服务器已提交但响应丢失，应展示“结果待确认”，按操作 ID 查询，不直接自动重复写入。服务端需要幂等键、唯一约束与事务，客户端随机 ID 不能单独保证。第十二章本地项目没有服务器写入，不能借其同步成功逻辑推断真实网络一致性。

## 上传与登录不要混入通用读取器

文件上传通常返回 UploadTask 与不同响应格式，登录 code 的生命期也不同，不应塞进一个“万能请求函数”后丢失取消和解析职责。可以共享小型错误与预算工具，但保持服务契约明确。认证头从会话边界加入，日志只记录状态、耗时与匿名请求标识，不打印凭据和个人内容。

## 并发限制与错误归属

平台可能限制连接数量，页面也不应该同时为每个列表项发一个请求。先判断能否由服务器批量返回必要字段，再为确实独立的任务设置并发上限。用户切换筛选时取消无用读取，比无界增加并发更有效。缓存命中也要记录数据时效，不能把一次成功结果永久标成最新。

请求模块返回可分类错误，页面再将它转为用户文案。服务列表读取失败不应触发全应用退出，只有明确的会话失效结果才进入认证恢复。多个请求同时收到未授权时，只允许一个会话刷新过程，等待者共享结果；刷新失败后统一回到可操作入口，而不是叠加多个登录弹窗。

错误日志应区分启动失败、传输终态、HTTP 状态与解析终态，记录匿名请求标识、目标类别和耗时。不要记录完整 URL 查询、Authorization、code 或响应正文。这样能定位域名、服务与契约问题，又不会把调试变成敏感数据采集。日志字段存在性比整包打印更适合教学与生产。

## 可重复的故障实验

在受控开发服务器让第一次请求延迟、第二次立即返回不同的合法服务集合。页面连续触发两次读取，观察第二份保持不变，随后旧响应到达也不能改变列表和加载状态。再把第一份改为失败，确认旧失败不覆盖当前成功；这两种实验分别验证成功与错误分支。

主动取消实验要在八秒预算之前触发，确认 Promise 以取消结束且页面没有网络失败提示。超时实验让服务器延迟超过预算，检查只采用一个终态，并确认隐藏页面没有再启动任务。服务器仍可能继续计算，`abort` 不保证服务端工作被撤销，更不保证已执行写操作回滚。

最后关闭网络后再恢复，验证重试入口是否仍可用、用户输入是否保留、旧数据是否明确标为缓存。开发代理正常而真机失败时，分别检查设备访问地址、证书和小程序合法域名，不把本机 localhost 直接当作手机服务器。每次实验记录输入动作与预期终态，不用固定等待时间代替状态断言。

## 排错、实验与验收

返回对象没有 abort，先看是否忘记提供回调而取得 Promise。HTTP 四〇一进入 success，说明传输完成不等于业务成功，应检查状态码。字段缺失却被页面采用，检查是否直接断言 T。旧列表闪回，检查成功、失败与 finally 三个分支的序号保护，以及隐藏清理。

基础作业使用自己控制的开发服务器实现正确响应、非法字段、非二〇〇和延迟响应，不采用不受控公网接口。切换两次读取，使旧请求最后返回，确认页面只采用当前结果。进阶作业实现有总预算的两次只读尝试，取消期间不得再启动任务，并区分自动重试与用户主动重试。

验收覆盖域名限制、断网、超时、取消、状态码、数据错误和身份切换。请求在隐藏后不回写，取消不显示网络错误，加载状态只归属当前任务。这个模块的代码语法检查不证明服务已接入；CORS、微信域名、TLS、App 网络和真实服务器行为都要在目标环境补测。

## 官方依据

<a id="source-1"></a>[cite:1] [uni.request](https://uniapp.dcloud.net.cn/api/request/request.html)：回调、Promise、RequestTask 与平台差异。

<a id="source-2"></a>[cite:2] [微信网络请求](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)：小程序域名和网络约束。

上一章：[状态模型与类型](./05-state-types)。下一章：[身份认证与安全会话](./07-authentication-session)。
