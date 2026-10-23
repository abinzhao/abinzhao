---
title: '02 · WXML、WXSS 与类型边界'
description: 建立完整服务列表，理解模板表达式、事件数据、列表标识和跨层类型验证，处理空态、错误与长文本布局。
date: '2026-10-23'
category: 小程序开发
tags: [微信小程序, WXML, WXSS, TypeScript]
series:
  order: 2
---

# 02 · WXML、WXSS 与类型边界

## 从数据到界面，而不是从节点到业务

原生小程序的模板描述“当前状态应该显示什么”，页面脚本决定“哪个事件可以改变状态”。本章做一个可搜索、可选择的服务列表，不使用 DOM 操作。验收时要能够区分三种没有卡片的情况：原始服务为空、搜索没有匹配项、输入数据不合法。它们对应不同用户动作，不能统一显示“暂无数据”让用户猜测发生了什么。

服务列表包含稳定标识、名称、时长和整数金额。金额以分为单位，避免二进制浮点直接累计元数；时长以分钟为单位，界面格式化不改变业务含义。示例输入是明确的教学数据，不代表服务器提供过这些服务。真正接入服务器后，仍需经过同一个解析入口，不能因为 TypeScript 写了接口就省略校验。

## 模板表达式与事件边界

WXML 的双花括号读取渲染层状态，不运行任意 JavaScript 方法。复杂计算在逻辑层完成，再写入展示字段。事件中的 `currentTarget` 指向绑定处理器的节点，`target` 可能是被点击的子节点。读取服务标识应使用前者，否则把按钮内的文字包一层就可能改变行为。事件 `dataset` 属于外部输入，仍需要检查标识是否存在于当前服务集合。

列表使用稳定的业务 ID 作为 `wx:key`，不要使用筛选后数组下标。下标代表当前位置，不代表对象身份；搜索或排序后位置变化，组件内部状态可能被错误复用。`wx:if` 控制创建与销毁，`hidden` 主要控制显示；前者适合状态互斥的页面区域，后者适合需要保留内部状态的频繁切换。选择依据应是生命周期和更新频率，而不是语法长度。

## 可运行页面脚本

在第一章建立的 TypeScript 模板中，用下面三个页面文件替换首页。模板生成的微信类型声明需要保留。`parseServices` 的参数故意为 `unknown`，因为 JSON 解析成功只能证明语法有效，不能证明字段和值满足业务契约。解析失败返回具体错误，不把损坏的两条记录静默过滤成空列表。

```typescript
// pages/index/index.ts
interface Service {
  id: string;
  name: string;
  minutes: number;
  priceFen: number;
}
interface ServiceView extends Service {
  priceText: string;
}
type Result =
  | { ok: true; value: Service[] }
  | { ok: false; message: string };

function parseServices(input: unknown): Result {
  if (!Array.isArray(input)) return { ok: false, message: '服务数据不是数组' };
  const ids = new Set<string>();
  const value: Service[] = [];
  for (const item of input) {
    if (typeof item !== 'object' || item === null) {
      return { ok: false, message: '服务记录格式错误' };
    }
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(row.id) ||
        typeof row.name !== 'string' || !row.name.trim() ||
        row.name.length > 80 || typeof row.minutes !== 'number' ||
        !Number.isInteger(row.minutes) || row.minutes <= 0 ||
        row.minutes > 480 || typeof row.priceFen !== 'number' ||
        !Number.isSafeInteger(row.priceFen) || row.priceFen < 0) {
      return { ok: false, message: '服务字段不满足约定' };
    }
    if (ids.has(row.id)) return { ok: false, message: '服务标识重复' };
    ids.add(row.id);
    value.push({
      id: row.id, name: row.name.trim(),
      minutes: row.minutes, priceFen: row.priceFen
    });
  }
  return { ok: true, value };
}

const input: unknown = [
  { id: 'consult', name: '开发问题咨询', minutes: 30, priceFen: 9900 },
  { id: 'review', name: '项目代码评审', minutes: 60, priceFen: 19900 }
];

function project(rows: Service[], query: string): ServiceView[] {
  const word = query.trim().toLocaleLowerCase();
  return rows
    .filter(row => row.name.toLocaleLowerCase().includes(word))
    .map(row => ({ ...row, priceText: (row.priceFen / 100).toFixed(2) }));
}

Page({
  data: {
    source: [] as Service[],
    visible: [] as ServiceView[],
    query: '', selectedId: '', selectedName: '',
    error: '', hasServices: false
  },
  onLoad() {
    const result = parseServices(input);
    if (!result.ok) {
      this.setData({ error: result.message });
      return;
    }
    this.setData({
      source: result.value,
      visible: project(result.value, ''),
      hasServices: result.value.length > 0
    });
  },
  search(event: WechatMiniprogram.Input) {
    const query = event.detail.value;
    this.setData({ query, visible: project(this.data.source, query) });
  },
  choose(event: WechatMiniprogram.TouchEvent) {
    const id: unknown = event.currentTarget.dataset.id;
    if (typeof id !== 'string') return;
    const row = this.data.source.find(item => item.id === id);
    if (!row) {
      wx.showToast({ title: '服务已变更，请重新选择', icon: 'none' });
      return;
    }
    this.setData({ selectedId: row.id, selectedName: row.name });
  }
});
```

```xml
<!-- pages/index/index.wxml -->
<view class="page">
  <text class="heading">选择服务</text>
  <view wx:if="{{error}}" class="notice" role="alert">{{error}}</view>
  <block wx:else>
    <input class="search" value="{{query}}" maxlength="80"
      placeholder="输入服务名称" bindinput="search" />
    <text wx:if="{{!hasServices}}" class="notice">尚未配置可预约服务</text>
    <text wx:elif="{{visible.length === 0}}" class="notice">没有匹配服务，请修改搜索词</text>
    <view wx:for="{{visible}}" wx:key="id" class="service">
      <view class="summary">
        <text class="name">{{item.name}}</text>
        <text class="meta">{{item.minutes}} 分钟 · ¥{{item.priceText}}</text>
      </view>
      <button size="mini" data-id="{{item.id}}" bindtap="choose">
        {{selectedId === item.id ? '已选择' : '选择'}}
      </button>
    </view>
    <text wx:if="{{selectedId}}" class="notice">当前选择：{{selectedName}}</text>
  </block>
</view>
```

```css
/* pages/index/index.wxss */
.page { padding: 32rpx; color: #17202a; background: #f4f6f8; min-height: 100vh; box-sizing: border-box; }
.heading { display: block; font-size: 40rpx; font-weight: bold; margin-bottom: 24rpx; }
.search { background: #fff; padding: 20rpx 24rpx; min-height: 88rpx; box-sizing: border-box; border: 2rpx solid #c9d2db; border-radius: 12rpx; }
.service { display: flex; align-items: center; gap: 20rpx; margin-top: 20rpx; padding: 24rpx; background: #fff; border-radius: 16rpx; }
.summary { flex: 1; min-width: 0; }
.name { display: block; overflow-wrap: break-word; font-weight: bold; }
.meta { display: block; margin-top: 12rpx; color: #536273; }
.service button { flex-shrink: 0; margin: 0; min-height: 88rpx; display: flex; align-items: center; }
.notice { display: block; padding: 24rpx 0; line-height: 1.6; }
```

页面为了教学把原始列表也放入 `data`，便于在工具中对照；列表变大时应把原始业务集合放在逻辑层实例字段，只传渲染需要的数据，第四章会进一步讨论。这个取舍不影响类型边界：事件只带 ID，页面从当前可信集合查找对象，不把按钮携带的金额作为结算依据。服务器仍需按服务 ID 重新计算实际价格。

## 样式单位与可用性

`rpx` 基于设计宽度缩放，适合间距与常规版式，但不能自动解决平板、桌面和长文本问题。宽屏上整页无限拉伸会让服务名与按钮距离过远；可以给内容容器设置合理最大宽度并居中。窄屏测试不仅改变模拟器尺寸，还要增加最长中文名称、连续英文和大系统字号。只有正常短名称好看，不是响应式验收。

Flex 子项默认最小宽度可能让长文本把按钮挤出屏幕，所以这里为文字区域设置 `min-width: 0`，为按钮设置不压缩。按钮至少保留足够触控高度；不能通过只显示一个极小图标来缩短卡片。信息不能只用颜色表达，“已选择”文本让色觉差异和低对比场景仍能理解状态。辅助能力需要在目标客户端确认，不能因为写了属性就声称无障碍全通过。

全局 WXSS 与页面样式会形成共同作用范围，容易出现 `.title` 被多个页面重复定义。使用语义明确的局部类名，组件再讨论样式隔离。WXSS 并非浏览器 CSS 能力的完整承诺，遇到特殊属性要核对目标渲染器与客户端；必要时采用更基础的布局兜底。不要用工具里偶然显示成功的实验属性承担核心可用性。

## 类型断言的真实作用

`as Service[]` 不会验证任何元素，也不会阻止后端把金额返回成字符串。代码只在确认对象存在后转为 `Record<string, unknown>` 以读取字段，每个字段仍然接受运行时检查。整数、非负值、长度和重复 ID 都是契约的一部分；缺其中一个，页面就可能显示负金额、同一标识两次或超长内容。

这里采用整体失败策略，适合配置类服务列表：宁可显示错误，也不悄悄改变可预约集合。如果业务允许部分记录降级，必须明确显示过滤数量、记录匿名诊断并定义哪些字段可缺省。不能仅用 `filter(Boolean)` 把所有问题掩盖。解析层不要调用 `setData` 或弹窗，保持它可以独立测试；页面层决定怎样呈现解析结果。

## 列表身份与输入恢复

列表使用稳定服务 ID 作为 key。数组下标只表达当前位置，搜索和排序后同一个下标可能指向另一条服务，不能作为长期选择身份。复现时先选择第二项，再按名称过滤第一项，恢复完整列表后确认原服务仍被选中；如果选中状态跟着位置移动，应检查 key 与保存字段，而不是重新绘制整个页面掩盖问题。

输入为空和输入空格也要有明确规则。示例搜索会规范化查询，清空后恢复原始集合；规范化只影响搜索，不修改服务名称。生产接口的字段解析与用户查询规范化属于不同职责，不能为了方便搜索而永久把所有服务器字符串转成小写并保存。

## 状态组合与常见失败

搜索改变可见集合，不删除当前选择，所以选择后搜索别的词，底部仍显示原服务。这个行为是显式设计，不是漏同步。产品若要求过滤后取消选择，应在同一次状态转换中完成，并写清提示；不要让不同事件分别更新形成短暂矛盾。把所有派生字段集中在 `project` 中，可以减少名称、金额格式在多个入口发生漂移。

故障排查时，列表不显示先看 `source`、`visible` 与 `error`，再检查 `wx:if` 分支；点击无反应先确认事件绑定节点和 `dataset`。金额异常先核对单位，不要把显示值再乘一百补救。搜索输入导致明显卡顿时，检查是否每键传整个大列表以及是否包含不必要字段，再考虑节流，不要先引入复杂搜索库。

## 作业、失败实验与验收

依次把输入改为 `[]`、重复 ID、字符串金额、负金额与超长服务名，确认每种结果都有正确反馈；再恢复两条合法记录。为解析函数列出接受与拒绝表，至少包含零金额、最小时长、非整数时长和对象为 `null`。这些用例证明运行时校验，不是证明真实服务器接口已经接通。

布局验收在窄屏、宽屏、最长名称和系统字号变化下检查文字、按钮与输入框，特别关注文档级横向溢出。功能验收要求搜索可恢复全部列表、选择只接受存在的 ID、错误数据不展示为可预约服务、金额显示与分单位一致。最后解释为什么稳定 ID 比数组下标可靠，以及为什么静态接口不能验证外部 JSON。

## 官方依据

- [WXML](https://developers.weixin.qq.com/miniprogram/dev/reference/wxml/)、[数据绑定](https://developers.weixin.qq.com/miniprogram/dev/reference/wxml/data.html)：模板与数据语义。
- [事件](https://developers.weixin.qq.com/miniprogram/dev/framework/view/wxml/event.html)：事件目标及自定义数据。
- [WXSS](https://developers.weixin.qq.com/miniprogram/dev/framework/view/wxss.html)：样式单位与样式组织。
- [Page](https://developers.weixin.qq.com/miniprogram/dev/reference/api/Page.html)：实例与页面状态。

上一章：[运行架构与工具搭建](./01-architecture-tooling)；下一章：[生命周期与页面路由](./03-lifecycle-routing)。
