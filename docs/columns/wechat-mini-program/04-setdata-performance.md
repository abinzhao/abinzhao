---
title: '04 · setData 与运行时性能'
description: 从跨层序列化成本分析 setData，实现局部路径更新、短窗口合并、有限视图数据和旧结果保护，建立可测量的性能实验。
date: '2026-10-23'
category: 小程序开发
tags: [微信小程序, setData, 性能, 异步竞态]
series:
  order: 4
---

# 04 · setData 与运行时性能

## 慢在哪里，先确定边界

一个列表输入时卡顿，可能是筛选计算太重、跨层数据太大、视图节点太多，也可能是图片解码或其他任务占用执行时间。只说“`setData` 很慢”不能指导修复。原生页面的逻辑层和渲染层分离，一次更新需要准备可序列化的数据、传输更新并在渲染端处理。调用频率、载荷大小和变化范围共同决定成本。

本章不提供虚构的毫秒数字。实验需要记录设备、客户端、基础库、样本规模、具体交互与测量工具。开发者工具能帮助观察通信和渲染，但模拟器主机性能与手机不同；比较应在相同环境、相同数据和相同动作下重复运行。优化结论要对应具体瓶颈，不能把一次更快的偶然结果称为提升百分之多少。

## 业务状态与展示状态分离

页面 `data` 只放模板需要的字段。完整服务说明、内部索引、请求任务、集合和函数留在逻辑层实例中。为一次选择同步所有服务详情，会把与画面无关的对象跨层复制；把 `Set` 或 `Map` 放进 `data` 也不适合作为渲染协议。视图只需要“某一行当前是否已选”，不需要知道业务索引怎样实现。

`setData` 支持路径更新，例如 `rows[2].selected`。它避免每次传整个数组，但数组位置必须仍对应同一对象。筛选、排序或分页后，旧位置可能指向另一行，所以不能在未来回调里盲目沿用旧下标。完整列表替换与路径补丁混用时，应先完成或丢弃旧补丁，再建立新的视图集合；稳定业务 ID 用于重新定位，而不是把下标当身份。

`setData` 的回调表示相关界面更新完成后的时点，不等于服务器处理成功，也不等于用户看到像素的绝对时间。测量时要说明所测范围；结束回调前后的时间可作诊断，但不能直接包装为端到端用户延迟。业务逻辑不要依赖两个 `setData` 回调之间的偶然排序实现最终一致性。

## 一个有限数据、局部更新的页面

下面页面显示最多三十条搜索结果，并单独显示总匹配数。它没有实现完整分页，剩余条目暂不展示，界面会明确说明。教学输入生成在端侧；搜索延迟用于模拟异步计算完成，不冒充网络或服务器性能。保留第二章 TS 模板，替换三个首页文件即可运行。

```typescript
// pages/index/index.ts
type Row = { id: string; name: string };
type View = Row & { selected: boolean };
type Publisher = {
  push(path: string, value: boolean | number): void;
  flush(): void;
  dispose(): void;
};
function createPublisher(send: (patch: Record<string, boolean | number>) => void): Publisher {
  let pending: Record<string, boolean | number> = {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = true;
  function flush() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (!active || Object.keys(pending).length === 0) return;
    const patch = pending;
    pending = {};
    send(patch);
  }
  return {
    push(path, value) {
      if (!active) return;
      pending[path] = value;
      if (timer === undefined) timer = setTimeout(flush, 16);
    },
    flush,
    dispose() {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      pending = {};
    }
  };
}
type Data = { rows: View[]; query: string; total: number; selectedCount: number; busy: boolean };
type Methods = {
  source: Row[];
  selected: Set<string>;
  version: number;
  job: ReturnType<typeof setTimeout> | undefined;
  publisher: Publisher | undefined;
  search(event: WechatMiniprogram.Input): void;
  startSearch(query: string): void;
  choose(event: WechatMiniprogram.TouchEvent): void;
  stop(): void;
};
Page<Data, Methods>({
  data: { rows: [], query: '', total: 0, selectedCount: 0, busy: false },
  source: [],
  selected: new Set<string>(),
  version: 0,
  job: undefined,
  publisher: undefined,
  onLoad() {
    this.source = Array.from({ length: 200 }, (_, index) => ({
      id: `service-${index}`, name: `教学服务 ${index + 1}`
    }));
    // 每个页面实例建立自己的可变集合。
    this.selected = new Set<string>();
  },
  onShow() {
    this.publisher = createPublisher(patch => this.setData(patch));
    this.startSearch(this.data.query);
  },
  onHide() { this.stop(); },
  onUnload() { this.stop(); },
  stop() {
    this.version += 1;
    if (this.job !== undefined) clearTimeout(this.job);
    this.job = undefined;
    this.publisher?.dispose();
    this.publisher = undefined;
  },
  search(event) {
    const query = event.detail.value;
    this.setData({ query });
    this.startSearch(query);
  },
  startSearch(query) {
    const version = ++this.version;
    if (this.job !== undefined) clearTimeout(this.job);
    this.publisher?.flush();
    this.setData({ busy: true });
    this.job = setTimeout(() => {
      if (version !== this.version) return;
      this.job = undefined;
      const hits = this.source.filter(row => row.name.includes(query.trim()));
      this.publisher?.flush();
      this.setData({
        rows: hits.slice(0, 30).map(row => ({
          ...row, selected: this.selected.has(row.id)
        })),
        total: hits.length, busy: false
      });
    }, query.length < 2 ? 240 : 40);
  },
  choose(event) {
    const id: unknown = event.currentTarget.dataset.id;
    if (typeof id !== 'string') return;
    const index = this.data.rows.findIndex(row => row.id === id);
    if (index < 0) return;
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
    this.publisher?.push(`rows[${index}].selected`, this.selected.has(id));
    this.publisher?.push('selectedCount', this.selected.size);
  }
});
```

```xml
<!-- pages/index/index.wxml -->
<view class="page">
  <input value="{{query}}" bindinput="search" maxlength="80" placeholder="搜索教学服务" />
  <text wx:if="{{busy}}">正在计算本地搜索结果</text>
  <text>共 {{total}} 条，最多展示前 30 条；已选 {{selectedCount}} 条</text>
  <text wx:if="{{!busy && total === 0}}">没有匹配项</text>
  <view wx:for="{{rows}}" wx:key="id" class="row">
    <text>{{item.name}}</text>
    <button data-id="{{item.id}}" bindtap="choose">
      {{item.selected ? '取消选择' : '选择'}}
    </button>
  </view>
</view>
```

```css
/* pages/index/index.wxss */
.page { padding: 32rpx; display: flex; flex-direction: column; gap: 20rpx; }
input { min-height: 88rpx; padding: 0 24rpx; border: 2rpx solid #94a3b8; }
.row { display: flex; align-items: center; justify-content: space-between; gap: 24rpx; padding: 20rpx; border-bottom: 2rpx solid #e2e8f0; }
.row text { flex: 1; min-width: 0; }
button { min-height: 88rpx; margin: 0; }
```

## 合并更新并不等于无条件延迟

发布器只在短窗口合并同一路径的最终值，适合短时间内多个局部选择变化。它不是通用状态管理器，也不允许父路径与子路径同时参与一次补丁；本例只发送叶子字段和独立计数，避免冲突。十六毫秒只是教学调度窗口，不承诺跨设备固定一帧。依赖实时触觉反馈的动作不应随意延迟，需依据业务体验和测量决定。

发布器关闭时丢弃未发送补丁，业务集合仍保存在当前页面实例。页面再次可见会从集合重新构造视图，因此不会把丢弃的展示补丁误认为业务丢失。完整列表替换前调用 `flush`，保证旧索引补丁只作用于旧列表。若采用更复杂的分页，应使用视图版本隔离批次，或者直接在换页时取消尚未发送的补丁并重建展示状态。

连续点击不应读取尚未同步的 `data.rows[index].selected` 来决定下一状态，代码使用逻辑层 `Set`。如果依赖渲染层回写，有可能把两次快速点击都判断成“未选择”，最终无法取消。这个细节说明合并更新需要明确真相来源；只是把所有 `setData` 包进防抖函数，会同时延迟业务判断和界面反馈，产生新的错误。

## 旧结果保护的必要性

每次搜索递增版本号，完成时必须仍是当前版本才能回写。取消定时器可以减少无效工作，版本检查处理已经开始执行或无法取消的异步结果，两者职责不同。隐藏页面递增版本，也会使晚到结果失效。实际请求中同样需要“资源取消”和“结果有效性”两个机制，不要把 `abort` 当作取消所有后续逻辑的保证。

本地示例只保留一个待执行任务，旧任务通常会被取消。为了观察保护机制，可以在独立实验中故意不取消旧任务，再快速输入短词和长词，比较加与不加版本检查的表现。这个故障注入不得留在交付代码。对于预约写操作，版本检查只能阻止画面被覆盖，不会撤销服务器写入，未知结果必须查询业务状态恢复。

## 不该做的优化

不要把整个 `data` 再传给 `setData`，不要通过删除加载态减少节点来掩盖错误反馈，也不要在每次输入时把完整缓存同步到视图。模板未使用的数据应从渲染协议移出，而不是先压缩成难维护字符串。列表过大需要分页、按需展示或合适的组件策略，但要确保滚动位置、选择状态和可访问性仍能验收。

时间复杂度和跨层载荷是不同维度。用索引加快查找，却继续传输全部对象，可能没有改善主要瓶颈；减少载荷，却在每次按键运行昂贵排序，也可能仍卡顿。先用小、中、大三组固定样本找增长趋势，再决定改计算还是改同步。样本必须使用非敏感教学输入，不复制真实用户订单当性能测试数据。

## 测量、排错与作业

建立两版实验：基线每次选择传完整可见数组，改进版发送叶子路径。记录交互次数、每次更新字段数量、载荷估算和工具观察，再在同一真机重复。不要仅比较控制台 `Date.now` 差值：它无法完整覆盖传输、布局和显示。保留原始观察记录后才写结论，异常值要解释，不能为了好看删除较慢结果。

如果选择错误的行，优先检查列表替换与延迟路径补丁；选择计数正确但按钮错误，检查真相集合与展示同步；隐藏后仍更新，检查任务归属与版本递增；输入加载态一直不结束，检查异常路径是否收尾。作业是在不改变“最多三十条”事实声明的前提下增加下一页，并验证搜索后页码重置、选择跨页保留与旧页补丁不污染新页。

验收不要求某个宣传性能值，而要求数据职责清楚、每次选择只同步必要字段、连续点击结果正确、旧搜索不覆盖新搜索、隐藏后无悬挂更新。未执行真机测量时仅提交可复现的测量方案和静态检查结果。性能优化必须保持业务正确，不能以丢弃必要反馈或过度缓存旧数据换取表面流畅。

## 官方依据

- [合理使用数据更新方法](https://developers.weixin.qq.com/miniprogram/dev/framework/performance/tips/runtime_setData.html)：更新频率、数据量和视图成本。
- [Page](https://developers.weixin.qq.com/miniprogram/dev/reference/api/Page.html)：路径更新、限制和完成回调。
- [性能分析](https://developers.weixin.qq.com/miniprogram/dev/framework/performance/)：性能问题需要区分启动、运行和渲染阶段。

上一章：[生命周期与页面路由](./03-lifecycle-routing)；下一章：[可取消请求与受限重试](./05-network-cancellation-retry)。
