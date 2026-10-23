---
title: '05 · 可取消请求与受限重试'
description: 保留 RequestTask 的取消能力，校验 HTTP 与 JSON 契约，设置总耗时预算和只读重试边界，处理页面离开与写操作未知结果。
date: '2026-10-23'
category: 小程序开发
tags: [微信小程序, 网络请求, 取消, 重试, TypeScript]
series:
  order: 5
---

# 05 · 可取消请求与受限重试

## 请求成功有几层含义

`wx.request` 的 `success` 表示拿到了响应，不代表 HTTP 状态一定成功，也不代表响应结构符合业务契约。服务器返回四百或五百系列状态仍可能进入该回调。JSON 语法正确的响应也可能缺少字段、返回过期协议或携带错误类型。网络层、协议层、业务层必须依次判断，不能收到回调就显示“预约成功”。

本章目标是提供一套可取消、可收尾、类型明确的请求模块。真实集成前需要自己的 HTTPS 服务、合法请求域名和服务端契约。文中 `api.example.invalid` 是不可用的占位域名，读者必须替换为自有服务；代码能静态检查不代表已经连通后台。开发时关闭域名校验也不能证明发布环境可以请求。

## Promise 与任务句柄不是二选一

原生 `wx.request` 使用回调，并返回 `RequestTask`。把它简单包装为 Promise 可以方便串联，却容易丢掉 `abort`。本章返回 `{ promise, cancel }`，让页面持有取消能力，让业务代码使用 Promise 表达结果。主动取消、超时和失败都必须只结算一次，避免 `abort` 后的 `fail` 回调把取消提示覆盖为网络错误。

取消请求不代表服务器没有收到请求，更不代表服务器已经撤销写操作。客户端关闭连接后，服务器可能已经提交数据库事务。预约创建遇到断网或超时，状态应该是“结果待确认”，随后按客户端操作 ID 查询；不能直接允许用户不停再次创建。幂等键需要服务端唯一约束和同参数重复规则，单靠前端按钮禁用无法提供幂等保证。

## 契约与预算

示例只自动重试 `GET` 的 `429`、`502`、`503`、`504`，最多一次；传输失败不自动重试，`POST` 永远不自动重发。这是保守教学策略，不是所有系统的最佳固定配置。即便名为 GET，接口若有写入副作用也不应重试。生产环境需确认端点语义，处理服务器限流协议和各客户端行为。

总预算为八秒，包含两次尝试与中间等待。每次重试重新给八秒会把总体等待放大，导致页面看似一直加载。教学重试间隔为二百五十毫秒，不解析服务端 `Retry-After`；真实限流策略要求更长等待时应停止本次自动重试，并给用户明确反馈，而不是越过总预算。以下代码采用应用级计时器提供明确的总超时分类。

重试还要考虑调用方数量。多个页面同时失败后按相同间隔重试，可能在同一时刻再次压垮服务；生产策略通常需要退避与随机抖动，并遵守服务端指示。是否启用这些策略必须结合端点负载和总预算，不是机械增加重试次数。用户手动重试同样应结束旧操作并建立新世代，避免两个请求同时竞争页面状态。

```typescript
// utils/request.ts
export type ErrorKind = 'cancelled' | 'timeout' | 'network' | 'http' | 'schema';
export class RequestError extends Error {
  constructor(
    public kind: ErrorKind,
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = 'RequestError';
  }
}
export interface RequestOptions<T> {
  url: string;
  method?: 'GET' | 'POST';
  data?: Record<string, unknown>;
  header?: Record<string, string>;
  parse(input: unknown): T;
}
export interface Operation<T> {
  promise: Promise<T>;
  cancel(): void;
}

export function request<T>(options: RequestOptions<T>): Operation<T> {
  let task: WechatMiniprogram.RequestTask | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let budgetTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let attempts = 0;
  let rejectPromise: (reason: RequestError) => void = () => {};
  const method = options.method ?? 'GET';
  const deadline = Date.now() + 8000;
  function clean() {
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    if (budgetTimer !== undefined) clearTimeout(budgetTimer);
  }
  const promise = new Promise<T>((resolve, reject) => {
    function fail(error: RequestError) {
      if (closed) return;
      closed = true;
      clean();
      reject(error);
    }
    rejectPromise = fail;
    function attempt() {
      if (closed) return;
      if (Date.now() >= deadline) {
        fail(new RequestError('timeout', '请求超过总预算'));
        return;
      }
      attempts += 1;
      try {
        task = wx.request({
          url: options.url,
          method,
          data: options.data,
          header: options.header,
          timeout: Math.max(1, deadline - Date.now()),
          success(response) {
            if (closed) return;
            const status = response.statusCode;
            const retryable = [429, 502, 503, 504].includes(status);
            if (method === 'GET' && attempts < 2 && retryable &&
                deadline - Date.now() > 250) {
              retryTimer = setTimeout(attempt, 250);
              return;
            }
            if (status < 200 || status >= 300) {
              fail(new RequestError('http', '服务器返回失败状态', status));
              return;
            }
            let value: T;
            try {
              value = options.parse(response.data as unknown);
            } catch {
              fail(new RequestError('schema', '响应结构不满足约定'));
              return;
            }
            closed = true;
            clean();
            resolve(value);
          },
          fail() {
            if (closed) return;
            const timedOut = Date.now() >= deadline;
            fail(new RequestError(
              timedOut ? 'timeout' : 'network',
              timedOut ? '请求超过总预算' : '请求未完成'
            ));
          }
        });
      } catch {
        fail(new RequestError('network', '请求无法启动'));
      }
    }
    budgetTimer = setTimeout(() => {
      fail(new RequestError('timeout', '请求超过总预算'));
      task?.abort();
    }, 8000);
    attempt();
  });
  return {
    promise,
    cancel() {
      if (closed) return;
      rejectPromise(new RequestError('cancelled', '用户取消请求'));
      task?.abort();
    }
  };
}
```

原生接口的超时回调与应用计时器可能在相邻时刻触发，模块保证只结算一次，不依赖某个固定 `errMsg` 文本判断全部客户端错误。未达到应用总截止时间的原生失败统一归类为传输失败。生产监控可额外记录安全的错误码和阶段，但不要直接展示包含域名、令牌或个人数据的原始错误对象。

## 页面集成与运行时解析

下面假定服务接口返回数组，每行包含 `id` 和 `name`。解析函数只创建允许的字段，拒绝重复标识；其他额外字段不进入视图。给 TypeScript 写 `request<Service[]>` 不是验证，它只是类型参数；真正验证由 `parse` 完成。服务器返回包裹对象时必须修改契约和解析，不能用断言让编译器安静。

```typescript
// pages/index/index.ts
import { request, Operation, RequestError } from '../../utils/request';
type Service = { id: string; name: string };
function parse(input: unknown): Service[] {
  if (!Array.isArray(input)) throw new Error('array expected');
  const ids = new Set<string>();
  return input.map(value => {
    if (typeof value !== 'object' || value === null) throw new Error('row expected');
    const row = value as Record<string, unknown>;
    if (typeof row.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(row.id) ||
        typeof row.name !== 'string' || !row.name.trim() || row.name.length > 80 ||
        ids.has(row.id)) throw new Error('invalid service');
    ids.add(row.id);
    return { id: row.id, name: row.name.trim() };
  });
}
type Data = { rows: Service[]; busy: boolean; message: string };
type Methods = {
  operation: Operation<Service[]> | undefined;
  version: number;
  load(): void;
  cancel(): void;
};
Page<Data, Methods>({
  data: { rows: [], busy: false, message: '' },
  operation: undefined,
  version: 0,
  onShow() { this.load(); },
  onHide() { this.cancel(); },
  onUnload() { this.cancel(); },
  cancel() {
    this.version += 1;
    this.operation?.cancel();
    this.operation = undefined;
  },
  load() {
    this.cancel();
    const version = this.version;
    this.setData({ busy: true, message: '' });
    const operation = request({
      url: 'https://api.example.invalid/services',
      parse
    });
    this.operation = operation;
    operation.promise.then(rows => {
      if (version === this.version) this.setData({ rows });
    }).catch(error => {
      if (version !== this.version) return;
      const message = error instanceof RequestError && error.kind === 'http' &&
        error.status === 401 ? '请重新登录' : '读取失败，可手动重试';
      this.setData({ message });
    }).finally(() => {
      if (version !== this.version) return;
      this.operation = undefined;
      this.setData({ busy: false });
    });
  }
});
```

```xml
<!-- pages/index/index.wxml，沿用第一章页面样式 -->
<view class="page">
  <text wx:if="{{busy}}">正在读取服务</text>
  <text wx:if="{{message}}">{{message}}</text>
  <button disabled="{{busy}}" bindtap="load">手动重新读取</button>
  <view wx:for="{{rows}}" wx:key="id">{{item.name}}</view>
</view>
```

页面持有操作和版本，离开后取消并使旧结果失效。取消不会给隐藏页面弹错误提示；再次显示建立新的操作，恢复加载态。保留旧列表时必须标明刷新失败或数据时间，不能让用户误以为正在看最新库存。示例没有登录自动恢复：四百零一只显示提示，第六章才讨论集中会话恢复和并发门闩。

空响应同样需要契约判断。删除类接口可以约定二百零四无正文，但服务列表接口应返回明确数组，不能把所有缺失正文自动当成空集合。分页接口还应规定游标、结束标志和重复记录处理；请求模块只验证通用传输结果，不替业务决定分页语义。接口变化应更新解析器和用例，而不是让解析器接受任意对象。

## 域名、协议与安全

请求域名在微信后台配置，下载、上传和其他网络能力也有各自规则。地址必须符合平台要求，真机需要可以访问有效证书链；本地开发服务、企业代理和自签名证书可能改变模拟器表现。排错时分别核对 DNS、证书、域名配置、HTTP 状态及业务响应，不要将所有问题折叠为“网络不好”。

令牌放在授权头，避免写进查询字符串；请求日志不包含令牌和完整响应。服务器最终负责身份、资源权限、参数校验和速率限制，客户端缓存的服务价格不可信。跨域浏览器策略与小程序合法域名不是同一种机制，不要通过添加浏览器 CORS 头期待解决全部小程序请求失败。

## 写操作的未知结果

预约创建的建议协议是客户端生成操作 ID，服务器在当前用户范围内对该 ID 建唯一约束；相同 ID 与相同参数重复返回同一预约，不同参数则明确拒绝。客户端超时后查询操作状态：已完成展示预约；仍处理展示等待；确认不存在才允许按规则重试。取消预约也是写操作，需要服务器状态机检查，不应因为名称是“取消”就当成安全 GET。

按钮禁用可以避免普通连续点击，但无法阻止设备重连、应用恢复、多设备或恶意请求。页面只负责减少重复交互；幂等、防超卖和授权需要事务与服务器约束。练习中的请求模块故意不自动重发 POST，读者应先理解未知结果，再实现业务级恢复，不把网络重试库当订单一致性方案。

## 故障实验与验收

在自有测试服务器分别返回合法数组、非法结构、四百零一、五百零三和延迟响应。确认五百零三 GET 最多两次尝试，POST 只一次；在等待重试的窗口取消，确认没有下一次请求。记录服务器匿名操作 ID 与请求次数，不能只看界面 toast 判断重试次数。无服务器时可做注入式纯逻辑测试，但要标为协议测试而非网络集成。

再测试进入页面立即返回、连续刷新与弱网断开，确认旧结果不回写、加载态会收尾且不会发生未处理 Promise 拒绝。验收包括错误分类、总预算、取消幂等、运行时解析和写操作未知结果说明。真机合法域名、证书与弱网未执行时明确列为待验证，不借静态检查宣称上线可用。

## 官方依据

- [wx.request](https://developers.weixin.qq.com/miniprogram/dev/api/network/request/wx.request.html)：HTTP 状态、回调、超时与返回任务。
- [RequestTask.abort](https://developers.weixin.qq.com/miniprogram/dev/api/network/request/RequestTask.abort.html)：主动取消的接口边界。
- [网络](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)：域名、证书和平台约束。

上一章：[setData 与运行时性能](./04-setdata-performance)；下一章：[登录、服务端会话与隐私](./06-session-privacy)。
