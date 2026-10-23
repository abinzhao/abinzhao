---
title: '06 · 登录、服务端会话与隐私'
description: 使用 wx.login 的一次性 code 建立自定义服务端会话，处理并发登录、失效与退出，分清隐私同意、能力授权和主动头像昵称填写。
date: '2026-10-23'
category: 小程序开发
tags: [微信小程序, 登录, 会话, 隐私, 安全]
series:
  order: 6
---

# 06 · 登录、服务端会话与隐私

## 身份不是昵称，也不是一个本地布尔值

登录需要回答“服务器如何确认这个请求属于谁”。头像、昵称和页面上的 `isLoggedIn` 无法回答这个问题：用户能主动编辑资料，客户端状态也可能被修改。小程序通常通过 `wx.login` 获得临时 code，服务器再用自身持有的 AppID 与 AppSecret 调用 `code2Session`，把微信身份映射为自己的用户并发放自定义会话。

code 是一次性交换材料，不是长期访问令牌，不能跨多次请求重复使用。`session_key` 是服务器侧敏感材料，AppSecret 更不能下发客户端。客户端不应该直接调用带密钥的微信服务端接口；打包时“隐藏常量”、混淆代码和 HTTPS 都不能让公开客户端里的密钥变安全。本章使用自建服务端契约，不伪造已经登录的响应。

## 登录链路的职责分配

客户端先获取 code，再向自己的 HTTPS 会话接口提交。服务端交换微信结果、处理失效 code 和上游错误、创建或关联用户，然后返回短期自定义 token 与有效时长。后续请求携带 token，服务端每次验证有效性、用户状态和资源权限。`openid` 本身不是可直接当密码使用的访问凭据，更不能仅凭客户端提交的 openid 就承认身份。

`wx.checkSession` 检查微信登录态相关状态，不等于你的业务 token 仍有效。业务服务器可能主动撤销会话、封禁用户或轮转认证方式。客户端令牌过期时间只是减少无效请求的提示，最终仍以服务器响应为准。四百零一可以触发一次集中恢复，但不能对失败的预约 POST 无条件重发；登录恢复和业务幂等需要分别设计。

## 并发门闩与退出竞态

多个页面同时需要身份时，若各自调用 `wx.login` 并交换会话，会产生多份令牌和难解释的覆盖关系。模块保留一个正在执行的 Promise，其他调用等待同一次结果。失败后必须清空门闩，否则所有后续调用都会拿到永久失败的旧 Promise。成功后也清空进行中对象，只保留有效会话。

退出时还可能有旧登录尚未完成。下面用世代号阻止旧结果重新写入缓存：退出增加世代并清空当前会话，晚到结果明确拒绝。如果需要服务器注销，必须调用自身注销接口撤销 token；这里只清理客户端内存，不能声称远端会话已撤销。页面离开可忽略界面回写，应用级身份请求是否继续则由会话模块集中决定。

```typescript
// utils/session.ts，依赖第五章 utils/request.ts
import { request } from './request';
type Session = { token: string; expiresAt: number };
let current: Session | undefined;
let pending: Promise<Session> | undefined;
let generation = 0;

function loginCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.login({
      timeout: 10000,
      success(result) {
        if (typeof result.code === 'string' && result.code.length > 0) {
          resolve(result.code);
        } else reject(new Error('未取得登录凭据'));
      },
      fail() { reject(new Error('微信登录暂不可用')); }
    });
  });
}

function parseSession(input: unknown): { token: string; expiresInSeconds: number } {
  if (typeof input !== 'object' || input === null) throw new Error('session expected');
  const row = input as Record<string, unknown>;
  if (typeof row.token !== 'string' || row.token.length < 16 ||
      row.token.length > 4096 || !/^[A-Za-z0-9._~-]+$/.test(row.token) ||
      typeof row.expiresInSeconds !== 'number' ||
      !Number.isInteger(row.expiresInSeconds) ||
      row.expiresInSeconds < 30 || row.expiresInSeconds > 86400) {
    throw new Error('invalid session');
  }
  return { token: row.token, expiresInSeconds: row.expiresInSeconds };
}

export function ensureSession(): Promise<Session> {
  if (current && current.expiresAt - Date.now() > 15000) {
    return Promise.resolve({ ...current });
  }
  if (pending) return pending;
  const version = generation;
  const job = (async () => {
    const code = await loginCode();
    if (version !== generation) throw new Error('登录已被退出操作终止');
    const result = await request({
      url: 'https://api.example.invalid/sessions/wechat',
      method: 'POST', data: { code }, parse: parseSession
    }).promise;
    if (version !== generation) throw new Error('登录结果已失效');
    current = {
      token: result.token,
      expiresAt: Date.now() + result.expiresInSeconds * 1000
    };
    return { ...current };
  })();
  pending = job;
  const clear = () => { if (pending === job) pending = undefined; };
  void job.then(clear, clear);
  return job;
}

export function forgetLocalSession(): void {
  generation += 1;
  current = undefined;
  pending = undefined;
}
```

返回 token 的长度和字符集是本例服务器契约，实际服务若使用其他令牌格式，应按真实协议调整解析器。有效期使用服务端返回的秒数建立本地缓存，客户端时钟变化仍可能影响判断，因此服务器不得依赖客户端截止时间。示例只保存在内存，应用重启重新交换；如果选择持久化，需要评估共享设备、存储读取、用户隔离和退出清除风险。

## 服务端应实现什么

会话接口接受单个 code，不接受客户端自报用户 ID。服务器调用微信接口后不要把原始结果完整透传；只返回业务需要的字段和自定义会话。上游错误要转换为稳定、安全的错误类别，日志不包含 code、密钥和 session_key。创建用户与绑定身份需要唯一约束，避免并发交换产生多个业务账号。

服务器应控制会话有效期、撤销和访问频率，授权按当前用户与资源关系计算。订单查询、取消、上传凭据都需要独立鉴权。把前端页面隐藏或不显示取消按钮，当作服务端权限控制是错误的。绑定手机号、支付和第三方账号是另一组敏感流程，不应为了教程“完整”默认自动完成或用示例成功值代替真实接口。

## 隐私同意与能力授权分开

隐私协议说明处理哪些信息、为何处理和怎样撤回；能力授权决定当前操作是否允许访问定位等能力；系统权限又受手机系统管理。这三层不能互相替代。用户同意协议，不代表已经授权定位；定位被拒绝，也不意味着用户不能查看服务列表。设计应把必要与可选能力分开，让用户拒绝可选能力后仍能完成核心流程。

截至 2026-10-23，隐私相关接口按官方说明检查基础库支持，`getPrivacySetting`、`requirePrivacyAuthorize` 从 `2.32.3` 起支持。隐私检查已经全量启用，不使用历史 `__usePrivacyCheck__` 开关绕过。需要在微信后台真实填写声明并匹配代码处理行为；只放一个自制弹窗不能代替后台声明。本例不注册自定义隐私监听，使用平台默认交互。

```typescript
// utils/privacy.ts
export function confirmPrivacy(): Promise<void> {
  if (!wx.canIUse('requirePrivacyAuthorize')) {
    return Promise.reject(new Error('当前客户端不支持此隐私确认流程，请更新微信'));
  }
  return new Promise((resolve, reject) => {
    wx.requirePrivacyAuthorize({
      success() { resolve(); },
      fail() { reject(new Error('尚未同意隐私处理，相关能力未启用')); }
    });
  });
}
```

不要在首屏立即请求所有能力。将确认放在用户明确触发的功能入口，说明目的，然后调用对应平台接口。不能支持的低版本应停用依赖该流程的可选能力并给出替代路径，不能静默当作已同意。具体权限声明、类目资格、基础库兼容和系统开关需要在真实账号与目标设备验证，游客项目无法覆盖。

## 主动填写头像昵称

新方案使用用户主动选择头像和输入昵称，不把 `getUserInfo` 或 `getUserProfile` 当作自动获得真实资料的通用入口。资料不是登录证明，也不必成为创建所有预约的前置条件。本例只保存页面内草稿，不上传，不把临时头像路径当永久地址；第九章再讨论上传与临时文件的生命周期。

```typescript
// pages/profile/profile.ts
import { ensureSession, forgetLocalSession } from '../../utils/session';
import { confirmPrivacy } from '../../utils/privacy';
type Data = { nickname: string; avatar: string; message: string; busy: boolean };
type Methods = {
  version: number;
  signIn(): Promise<void>;
  signOut(): void;
  privacy(): Promise<void>;
  avatar(event: WechatMiniprogram.CustomEvent<{ avatarUrl: string }>): void;
  nickname(event: WechatMiniprogram.Input): void;
};
Page<Data, Methods>({
  data: { nickname: '', avatar: '', message: '', busy: false },
  version: 0,
  onHide() { this.version += 1; this.setData({ busy: false }); },
  onUnload() { this.version += 1; },
  async signIn() {
    if (this.data.busy) return;
    const version = ++this.version;
    this.setData({ busy: true, message: '' });
    try {
      await ensureSession();
      if (version === this.version) this.setData({ message: '业务会话已建立' });
    } catch {
      if (version === this.version) this.setData({ message: '登录失败，可稍后重试' });
    } finally {
      if (version === this.version) this.setData({ busy: false });
    }
  },
  signOut() {
    this.version += 1;
    forgetLocalSession();
    this.setData({ nickname: '', avatar: '', busy: false, message: '已清理本机会话' });
  },
  async privacy() {
    const version = this.version;
    try {
      await confirmPrivacy();
      if (version === this.version) this.setData({ message: '隐私确认完成，能力授权仍需单独处理' });
    } catch {
      if (version === this.version) this.setData({ message: '未启用相关隐私能力' });
    }
  },
  avatar(event) {
    const path: unknown = event.detail.avatarUrl;
    if (typeof path === 'string' && path.length > 0) this.setData({ avatar: path });
  },
  nickname(event) { this.setData({ nickname: event.detail.value.trim().slice(0, 30) }); }
});
```

```xml
<!-- pages/profile/profile.wxml，在 app.json 注册后使用 -->
<view class="page">
  <button disabled="{{busy}}" bindtap="signIn">建立业务会话</button>
  <button bindtap="signOut">清理本机会话</button>
  <button bindtap="privacy">了解并确认隐私处理</button>
  <button open-type="chooseAvatar" bindchooseavatar="avatar">主动选择头像</button>
  <text wx:if="{{avatar}}">已选择临时头像，尚未上传</text>
  <input type="nickname" value="{{nickname}}" maxlength="30"
    placeholder="主动填写昵称" bindinput="nickname" />
  <text>{{message}}</text>
</view>
```

示例故意不展示头像图片，也不发送昵称；这让读者明确资料收集与身份建立是两条链路。若业务需要保存资料，后台声明、上传资格、服务端校验、删除与撤回都要对应设计。昵称还需要长度、控制字符和展示安全处理，不能因为用户输入来自微信控件就视为可信。服务器仍按业务规则决定接受与拒绝。

## 故障排查与验收

真实账号实验依次验证 code 交换失败、两个并发登录共享一次交换、token 失效、退出发生在登录完成之前、拒绝隐私确认、低版本不可用和头像选择取消。交换次数要用服务端匿名请求记录确认，不能只看前端加载动画。登录 code、令牌和微信身份不得出现在截图、版本库和问题反馈中。

验收要求不会泄露服务器密钥、不会以昵称认定身份、退出后旧结果不能恢复本机状态、失败门闩可再次尝试、拒绝可选能力仍可浏览服务。未部署服务器时只验证类型、纯逻辑和界面协议，明确真实登录与后台隐私未实测。作业是画出从微信 code 到业务资源授权的链路，标注每份数据的持有方、有效期和日志规则，再设计一次预约 POST 超时后的安全恢复。

## 官方依据

- [小程序登录](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html)、[code2Session](https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-login/code2Session.html)：客户端与服务器职责。
- [wx.checkSession](https://developers.weixin.qq.com/miniprogram/dev/api/open-api/login/wx.checkSession.html)：微信登录态检查的边界。
- [隐私协议指南](https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/PrivacyAuthorize.html)：隐私声明、平台确认与历史规则。
- [头像昵称填写](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/userProfile.html)：主动填写，不采用旧式被动资料获取。

上一章：[可取消请求与受限重试](./05-network-cancellation-retry)；下一章：[自定义组件与表单](./07-components-forms)。
