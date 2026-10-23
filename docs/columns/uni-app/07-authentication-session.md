---
title: '07 · 身份认证与安全会话'
description: 区分微信小程序 code、App OAuth 和 Web 会话入口，建立服务端交换、过期与退出协议，避免旧用户信息方案、客户端秘密及跨账号数据污染。
date: '2026-10-23'
category: uni-app 开发
tags: [uni-app, 微信登录, OAuth, 会话, 安全]
series:
  order: 7
---

# 07 · 身份认证与安全会话

## 平台凭据不是业务会话

微信小程序的登录 code、App OAuth 授权码与 Web Cookie 不是同一种凭据。平台授权证明用户完成了特定平台过程，业务服务器还要验证、关联业务账号并发出自己的会话。客户端看到 `uni.login` 成功，不代表用户已经拥有预约权限；隐藏按钮也不能替代服务器鉴权。[cite:1]

本章采用最少信息原则：登录不要求昵称、头像或手机号。需要联系方式时，在明确用途、用户主动提交与隐私说明后独立处理。旧版自动获取用户信息的教程不能作为当前身份基础，也不能通过“读不到头像”判定登录失败。登录、资料完善与敏感能力授权是三个不同业务动作。

AppID 可以出现在客户端配置，AppSecret、OAuth 服务端秘密和会话签名密钥不能进入前端源码、manifest 或打包资源。编译和混淆不构成秘密保护；攻击者能分析客户端。微信 `session_key` 用于服务端相关校验，不应作为业务 token 下发到页面，更不应该直接写入普通本地存储。[cite:2]

## 微信小程序的交换流程

用户触发需要身份的动作，客户端调用平台登录取得短期 code，然后通过已配置的 HTTPS 接口提交服务器。服务器使用自己的 AppID 与秘密调用微信登录凭证校验接口，取得平台标识并映射业务账号。业务会话只包含本系统需要的信息，权限在每次访问记录和库存时再次核验。

code 是短期且有使用约束的凭据，失败不能无限重用同一个值。交换超时后，客户端应通过明确协议恢复或重新取得 code；服务器需要处理可能已经建立会话但响应丢失的情境。不要将 code 持久化为“免登录 token”，也不要在日志打印 code 以便排错。

## 条件编译获取凭据

下面模块只负责获得平台 code，不进行虚构服务器交换。标准 uni-app 的微信目标使用 `MP-WEIXIN`，App 使用 `APP-PLUS`；Web 不调用 `uni.login`，而走自己的服务器会话入口。App 示例的 `onlyAuthorize: true` 是为了取得授权 code 交给服务器，实际提供者和基座须已配置。[cite:1]

```typescript
// auth/platformCode.ts
export type PlatformCode = {
  platform: 'wechat-mini-program' | 'wechat-app'
  code: string
}
export function getPlatformCode(): Promise<PlatformCode> {
  // #ifdef MP-WEIXIN
  return new Promise((resolve, reject) => {
    uni.login({
      success(result) {
        if (typeof result.code !== 'string' || result.code.length === 0) {
          reject(new Error('平台未返回登录凭据'))
          return
        }
        resolve({ platform: 'wechat-mini-program', code: result.code })
      },
      fail() { reject(new Error('微信登录未完成，可重试或返回')) }
    })
  })
  // #endif
  // #ifdef APP-PLUS
  return new Promise((resolve, reject) => {
    uni.login({
      provider: 'weixin',
      onlyAuthorize: true,
      success(result) {
        if (typeof result.code !== 'string' || result.code.length === 0) {
          reject(new Error('App 授权未返回 code，请检查提供者与基座'))
          return
        }
        resolve({ platform: 'wechat-app', code: result.code })
      },
      fail() { reject(new Error('App 授权未完成，未建立业务会话')) }
    })
  })
  // #endif
  // #ifndef MP-WEIXIN
  // #ifndef APP-PLUS
  return Promise.reject(new Error('当前目标需使用独立的会话入口'))
  // #endif
  // #endif
}
```

条件编译后每个目标只留下对应分支。未经预处理的 TypeScript 语法检查不能证明实际产物只含一个平台调用，应检查目标输出。App 微信登录还需要开放平台配置、签名、包标识和包含模块的基座；通用测试基座与正式包不一定具有相同授权资格，不能把前者结果写成后者保证。

## 服务器交换契约

接口由真实业务服务器实现，以下表格是待实现契约，不是已返回的数据。客户端发送平台类别与 code，服务器验证后返回本系统会话与当前用户的最少标识。不同平台标识是否合并账号，需要产品与安全规则确认，不能仅凭昵称相同自动合并。

| 接口动作 | 服务器职责 | 客户端处理 |
|---|---|---|
| 交换 code | 校验平台、关联账号、建立会话 | 校验响应后采用，不保存 code |
| 查询当前会话 | 判断过期、撤销与当前权限 | 展示登录态或明确失效 |
| 刷新会话 | 校验刷新凭据并旋转 | 单通道刷新，失败后退出 |
| 退出 | 撤销服务器会话 | 清理内存与本身份缓存 |

会话响应同样属于 unknown，不能直接断言为用户类型。校验过期时间单位、标识格式和允许字段，再更新状态。客户端不需要得到平台所有个人信息；服务器也不应因调试便利回传完整微信响应。鉴权失败与资料未完善分别处理，避免一个可选资料字段阻塞所有业务。

## Web 会话与跳转安全

Web 通常由自己的服务器登录或 OAuth 回调建立会话。采用 Cookie 时由服务器设置适当的 HttpOnly、Secure 与 SameSite 策略，跨域凭据还涉及服务端 CORS 和客户端携带规则；状态改变请求需要相应 CSRF 防护。标准 uni 的 Web 页面不能读取 HttpOnly Cookie，这正是安全设计，不是缺失能力。

OAuth 回调必须校验 state 等关联信息，需要时采用 PKCE，并限制允许的返回页面。不能接受一个任意 `returnUrl` 后直接跳外站，避免开放重定向。回调后的身份以服务器查询为准，URL 中的“已登录”参数不可信。不要把访问 token 长期放入查询字符串或通过分享传播。

App 或小程序是否持久会话要权衡可恢复性与暴露面。普通 storage 不是安全密钥库，不应声称加了一个编码就是加密保护。确需长期凭据时，使用目标平台允许的安全存储并评估插件支持；无法满足时缩短会话、限制权限和提供重新登录，而不是编造跨端统一保险箱。

## 用代际防止退出后的回写

下面纯 TypeScript 模型说明内存会话所有权，不保存真实 token，也不实现服务器协议。登录、退出或身份变化都递增代际，请求在开始时捕获代际，采用结果前比较。真实 token 只应在受控会话边界管理，不能暴露给每个展示组件。

```typescript
export function createIdentityScope() {
  let generation = 0
  let userId: string | null = null
  return {
    adopt(id: string) {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error('用户标识不合法')
      generation += 1
      userId = id
    },
    logout() { generation += 1; userId = null },
    capture() { return { generation, userId } },
    accepts(snapshot: { generation: number; userId: string | null }) {
      return snapshot.generation === generation && snapshot.userId === userId
    }
  }
}
```

退出还要取消用户相关请求、解除订阅、清空内存列表并处理当前用户的持久缓存。不要调用全局清空存储而删除其他学习工具或公共配置。退出时服务器撤销失败需要说明本设备已退出与服务器撤销状态的区别，必要时提供安全恢复，不将本地清空冒充服务器会话已撤销。

## 并发登录与会话刷新

用户快速点击登录应共享一个进行中的任务或采用互斥，不同时交换多份 code。多个接口发现过期时只启动一次刷新，等待者在刷新成功后按各自读写语义继续；写请求结果未知时不能因为刷新成功就自动重发。刷新凭据旋转也要防止旧响应覆盖新凭据。

会话失效提示应保留可恢复业务输入，但清除私人列表。用户重新登录不同账号后，不能未经确认继承前一个账号的草稿或上传内容。匿名草稿转为登录草稿需要明确确认与重新校验，不能利用登录回调顺手发送所有本地信息。

## 失败定位与验收

微信没有 code 先看目标、工具登录和平台错误，交换失败再看服务器平台类别与过期策略。App 提供者不存在先看 manifest、基座和平台配置，而不是改成读取旧用户信息。Web 调用登录 API 不支持，应回到 Web 会话路径。日志只记录错误类别与匿名关联标识，不输出 code、token 或用户资料。

基础作业画出微信 code 交换、App OAuth 与 Web Cookie 三条调用链，标出每项秘密保存位置。进阶作业用显式测试身份验证代际：甲请求开始、退出、乙登录、甲结果返回，旧结果必须被拒绝。验收覆盖拒绝授权、交换超时、过期、退出失败与身份切换，不仅是登录成功。

本章没有执行真实微信授权、App OAuth、服务器会话或 Web Cookie 配置。代码与官方支持表不能证明账号合并、隐私合规或权限已经成立；正式接入前需有真实服务器、平台资格与设备验收，并按实际业务范围审核收集目的。

## 官方依据

<a id="source-1"></a>[cite:1] [uni.login](https://uniapp.dcloud.net.cn/api/plugins/login.html)：平台差异与 App 授权参数。

<a id="source-2"></a>[cite:2] [微信登录](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html)与[凭证校验](https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-login/code2Session.html)：code 和服务端职责。

<a id="source-3"></a>[cite:3] [manifest 配置](https://uniapp.dcloud.net.cn/collocation/manifest.html)：平台模块与应用配置。

上一章：[请求与取消](./06-request-cancellation)。下一章：[存储、表单与离线恢复](./08-forms-storage-offline)。
