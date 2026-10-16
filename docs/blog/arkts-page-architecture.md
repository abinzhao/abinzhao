---
title: 构建可维护的 ArkTS 页面架构
description: 从 ArkUI V2 的状态所有权、组件输入输出和异步生命周期出发，建立可验证且适合跨端演进的页面边界。
date: "2026-10-17"
category: 鸿蒙开发
tags: [ArkTS, ArkUI, 状态管理, 跨端架构]
featured: true
---

# 构建可维护的 ArkTS 页面架构

页面架构的难点不是把一个大文件拆成几个小文件，而是让每一次状态变化都有明确的所有者。一个收藏列表可能只有输入框、列表和按钮，却同时涉及输入草稿、列表数据、持久化、页面恢复和异步刷新。如果这些状态都通过对象引用在组件树中自由流动，文件数量增加并不会让修改更容易。

本文面向已经能编写 ArkTS 页面的开发者，讨论 ArkUI 状态管理 V2 下的页面组织，并联系 Web、原生移动端的共同架构问题。完整示例使用 API version 12 起提供的 `@ComponentV2`、`@Local`、`@Param`、`@Event`，适用于支持这些能力的 Stage 模型 ArkTS 工程。具体编译 SDK、最低兼容版本和设备支持仍须由项目确认。示例是真实的内存收藏操作，不包含伪造接口，也不声称实现了持久化收藏服务。

## 页面边界先于组件目录

先把状态分成三类，而不是直接决定是否引入全局状态库。

| 状态 | 示例 | 合理的所有者 |
| --- | --- | --- |
| 交互临时状态 | 输入草稿、展开项、当前选择 | 使用它的最小组件或页面 |
| 页面展示状态 | 收藏列表、加载状态、错误提示 | 页面编排层或页面级模型 |
| 领域事实 | 已保存的收藏、登录身份、同步版本 | 仓储或领域服务，不由视图决定 |

输入框里的文字不是已经保存的收藏。加载失败不是空列表。登录身份也不是为了避免传参就随手放进组件的普通字段。区分这些概念，才能回答关闭页面后哪些状态允许丢失、哪些必须恢复，以及两个页面能否同时修改同一份数据。

组件拆分至少应满足一个理由：它拥有独立交互、它在多个地方复用、它需要单独验证，或它封装了稳定的展示契约。把每一行都拆成组件、再把整个页面模型传给每个组件，实际上只是给所有子组件增加了访问全部状态的能力。反过来，一个只服务于当前页面的简单统计区域，也不必为了目录整齐建立抽象接口。

页面编排层可以知道收藏仓储存在，但收藏行不应该知道数据库名称、网络地址或页面路由。行组件输出的是“切换阅读状态”或“删除这一项”的意图，是否允许删除、如何保存和失败后如何反馈，都由拥有状态的层处理。

## 装饰器表达同步机制，不替代设计约束

华为官方的[状态管理概述](https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/arkts-state-management-overview)区分了 V1 和 V2。V1 中，`@State` 表达组件内状态，`@Prop` 建立父到子的单向同步，`@Link` 建立双向同步。它们不是 V2 装饰器的简单别名，不应通过全局搜索替换完成迁移。

在 V2 中，`@Local` 适合组件拥有的状态，不能由组件外部初始化；`@Param` 表达外部输入；`@Event` 表达输出回调。推荐的数据路径是：

```text
页面拥有状态
    ↓ 输入值
子组件展示
    ↓ 事件意图
页面校验并修改状态
    ↓ 新输入值
子组件重新展示
```

这里有两个容易被忽略的事实。第一，`@Param` 禁止在子组件中直接给被装饰的变量重新赋值，但它不是对象深冻结。对象类型输入仍可能通过成员修改影响父组件的数据源。第二，调用 `@Event` 后，父组件的修改与子组件接收新输入不是同一个同步步骤；官方示例明确展示了子组件在事件回调之后立即读取时仍可能读到旧值。相关规则见 [@Param](https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/arkts-new-param) 和 [@Event](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/arkts-new-event)。

因此，不能把“使用了单向输入装饰器”当成“子组件无法修改业务数据”的证明。安全的边界来自窄输入、受控事件和明确的对象修改策略。子组件需要新的计算结果时，应由父组件下一轮输入提供，而不是发送事件后马上读取自己的旧输入继续计算。

## 一个可以在 ArkUI 工程运行的页面

下面是完整的 `entry/src/main/ets/pages/Index.ets`。在 DevEco Studio 中创建 Empty Ability 工程，确认使用支持 V2 的 SDK，并保留工程生成的 `pages/Index` 页面配置；替换该页面源码后，通过 IDE 的构建和运行入口启动。

代码仅依赖系统组件，不需要第三方库。收藏由用户实际输入产生，数据保存于当前页面实例的内存中；应用重启后不会恢复。这是示例的产品边界，不是缺失接口被假数据掩盖。

```typescript
class ReadingItem {
  id: number;
  title: string;
  read: boolean;

  constructor(id: number, title: string, read: boolean = false) {
    this.id = id;
    this.title = title;
    this.read = read;
  }
}

@ComponentV2
struct ReadingRow {
  @Param title: string = '';
  @Param read: boolean = false;
  @Event onToggle: () => void = () => {};
  @Event onRemove: () => void = () => {};

  build() {
    Row({ space: 12 }) {
      Text(this.title).layoutWeight(1)
      Button(this.read ? '标为未读' : '标为已读')
        .onClick(() => this.onToggle())
      Button('删除')
        .onClick(() => this.onRemove())
    }
    .width('100%')
    .padding(12)
  }
}

@Entry
@ComponentV2
struct Index {
  @Local draft: string = '';
  @Local items: ReadingItem[] = [];
  @Local error: string = '';
  private nextId: number = 1;

  private add(): void {
    const title: string = this.draft.trim();
    if (title.length === 0 || title.length > 80) {
      this.error = '标题不能为空，且不能超过 80 个 UTF-16 代码单元';
      return;
    }
    this.items = this.items.concat(
      [new ReadingItem(this.nextId++, title)]
    );
    this.draft = '';
    this.error = '';
  }

  private toggle(id: number): void {
    this.items = this.items.map((item: ReadingItem) => {
      if (item.id === id) {
        return new ReadingItem(item.id, item.title, !item.read);
      }
      return item;
    });
  }

  private remove(id: number): void {
    this.items = this.items.filter(
      (item: ReadingItem) => item.id !== id
    );
  }

  build() {
    Column({ space: 12 }) {
      Text('阅读收藏').fontSize(24)
      TextInput({ text: this.draft, placeholder: '输入收藏标题' })
        .onChange((value: string) => {
          this.draft = value;
        })
      Button('添加收藏').onClick(() => this.add())
      if (this.error.length > 0) {
        Text(this.error).fontColor(Color.Red)
      }
      Text(`共 ${this.items.length} 项，已读 ${
        this.items.filter((item: ReadingItem) => item.read).length
      } 项`)
      if (this.items.length === 0) {
        Text('尚未添加收藏')
      }
      List() {
        ForEach(this.items, (item: ReadingItem) => {
          ListItem() {
            ReadingRow({
              title: item.title,
              read: item.read,
              onToggle: () => this.toggle(item.id),
              onRemove: () => this.remove(item.id)
            })
          }
        }, (item: ReadingItem) => item.id.toString())
      }
      .layoutWeight(1)
      .width('100%')
    }
    .width('100%')
    .height('100%')
    .padding(16)
  }
}
```

输入“状态边界”并点击添加，预期列表出现一项，统计为“共 1 项，已读 0 项”；点击“标为已读”后变为“共 1 项，已读 1 项”；删除后回到空态。只输入空格时不新增数据，而显示校验错误。这里的长度规则刻意写明是 UTF-16 代码单元，不把 `string.length` 误称为用户感知字符数；需要按字素计数时，应另行明确输入规范和实现。

示例通过替换数组和被修改的对象来更新状态，行组件只接收字符串与布尔值，所以不依赖深层对象观测。`ForEach` 使用稳定业务标识作为键，而不是数组下标。删除第一行时，后续行不会因为索引移动而被错误地视为另一条记录。

这并不意味着所有项目都应该不可变更新。规模较大的列表若频繁修改对象属性，可以采用 `@ObservedV2` 与 `@Trace`，但应明确哪些字段参与观测、哪一层允许写入，避免整个领域模型都变成任意组件可以修改的共享对象。

## 什么时候需要页面模型与仓储

对上述内存页面，再加一层 ViewModel 并不会自动提升质量。真正的分层信号是：页面开始编排持久化、多个异步来源、权限判断或可复用业务规则。

例如，收藏需要保存到关系型数据库时，仓储应接收明确的命令并返回已保存的数据，而不是接收 `ReadingRow` 或组件上下文。页面模型负责把“正在保存”“保存失败”“保存成功”转换为展示状态；视图负责显示状态和收集意图。仓储抛出的存储错误不能被转换为空列表，因为空列表表示成功读取且没有数据。

```text
ReadingPage
  ├─ ReadingRow：标题、状态、事件
  └─ ReadingPageModel：加载、保存、错误、请求版本
       └─ ReadingRepository：读取与提交领域记录
            └─ ArkData / HTTP：平台与基础设施适配
```

这里的接口应从实际业务需要长出来。只需要读取与添加时，没有必要提前设计同步冲突、订阅总线和通用实体仓储。页面也不应把 UIAbility 的完整上下文传入领域规则；需要数据库或文件能力时，由基础设施层构造对应依赖。

持久化时还要分清“已经更新屏幕”和“已经提交数据”。乐观更新必须保留失败恢复路径，且回滚只影响对应操作，不能把较晚提交的其他修改一起覆盖。对低频收藏操作，提交成功后再更新列表通常比复杂的乐观补偿更容易验证。

## 状态恢复不能直接重建整个组件

页面重新创建之后，恢复什么应当由状态的语义决定。搜索条件、滚动位置和尚未提交的草稿，可以按产品约定恢复；“正在加载”这样的运行状态不能直接从上一次会话复制，因为对应请求可能早已不存在。保存一个页面对象的全部字段，再在启动时原样还原，很容易产生永远显示加载中的页面。

持久记录也不应该直接等同于可观察对象。仓储返回的是领域数据，页面模型将其转换成适合展示的对象；存储格式则有独立版本和校验规则。这样修改一个观测字段或页面布局，不会同时改变数据库协议。恢复遇到非法记录时，应区分可以忽略的旧展示偏好和必须提示的业务数据损坏。

导航参数适合携带标识与有限条件，不适合携带整棵可变对象树。详情页根据标识读取当前数据，能够避免“列表传入的旧对象”和“仓储中的新记录”各自成为真相源。若业务要求打开时快照，应明确传递的是不可变快照，并说明它与当前记录可能不同，而不是暗中依赖引用是否仍然共享。

错误也需要拥有者。行组件可以展示“本项正在删除”，但数据库写入失败应由发起操作的页面模型接收，并绑定到具体记录或操作标识。简单地使用一个全局错误字符串，会让不同请求互相覆盖；把所有错误都推给系统 Toast，又会失去可重试的页面上下文。

页面变复杂后，可以为状态转换写一张小表，而不是引入通用流程引擎：

| 当前状态 | 事件 | 下一状态 | 必须保留的信息 |
| --- | --- | --- | --- |
| 未加载 | 开始读取 | 加载中 | 请求版本 |
| 有数据 | 开始刷新 | 刷新中 | 已有列表与请求版本 |
| 刷新中 | 当前请求失败 | 有数据且显示错误 | 旧列表与重试入口 |
| 任意可用状态 | 页面销毁 | 关闭 | 不再接受异步结果 |

尤其是刷新失败时保留旧列表，与首次读取失败时显示错误页，是不同的产品状态。用一个 `items = []` 加一个布尔值很难表达这种区别；先明确状态语义，再决定使用类、枚举或分支对象，更容易保持实现简单。

## 异步生命周期是另一条状态边界

搜索页面常见的错误是请求 A 较慢、请求 B 较快，最终 A 覆盖了 B。防抖只能减少请求次数，不能证明响应按发起顺序返回。取消请求可以节省资源，但取消也不总能阻止已经完成或正在排队的回调。

页面需要一个“结果是否仍有效”的判定。下面的 `request-gate.mjs` 是可独立运行的通用逻辑，不是 ArkUI 运行时替身：

```javascript
import assert from 'node:assert/strict';

class RequestGate {
  #epoch = 0;
  #closed = false;

  begin() {
    if (this.#closed) throw new Error('page closed');
    return ++this.#epoch;
  }

  accepts(ticket) {
    return !this.#closed && ticket === this.#epoch;
  }

  close() {
    this.#closed = true;
    this.#epoch++;
  }
}

const gate = new RequestGate();
const older = gate.begin();
const newer = gate.begin();
assert.equal(gate.accepts(older), false);
assert.equal(gate.accepts(newer), true);
gate.close();
assert.equal(gate.accepts(newer), false);
console.log('request gate: ok');
```

运行 `node request-gate.mjs`，预期输出 `request gate: ok`。ArkTS 页面可以用显式类型实现相同的版本判定，但不能直接复制 Node 的导入或私有字段语法当作 ArkTS SDK 示例。

每次发起查询获取票据，在成功、失败以及结束加载的回调中都检查票据。只检查成功回调仍不够：旧请求的 `finally` 可能关闭新请求的加载提示，旧失败也可能覆盖新结果的错误状态。页面销毁时使票据失效，并释放监听、定时器和可取消任务。

“离开页面”也要明确语义。页面在导航栈中隐藏和真正销毁不是同一件事，后台刷新是否继续应由需求决定。不能假定某个可见性回调等同于对象销毁，更不能仅凭 `aboutToDisappear` 就推断所有平台资源已释放。

## 跨端复用应落在语义层

ArkUI、Vue、React 和原生界面可以共享“谁拥有状态”“什么是有效命令”“如何判定过期响应”，但并不共享渲染与观测机制。把 ArkUI 装饰器包装成一个所谓跨端状态层，往往同时丢失平台优化和静态类型约束。

适合复用的是记录标识、输入规则、错误分类、状态转换和仓储契约。必须适配的是页面生命周期、导航、键盘、无障碍、存储以及后台执行权限。Web 的浏览器缓存、鸿蒙的应用数据存储和其他移动平台的数据库，在保留期限和系统清理策略上也不能假定完全一致。

即使业务相同，也不必追求源文件逐字复用。ArkTS 有自己的语言限制与 SDK 能力；TypeScript 工具链中能执行的动态对象技巧，不一定适合 ArkTS。更可靠的跨端协作方式是共享状态转换用例和输入输出契约，各端使用符合平台习惯的实现，再以同一组行为验收。

## 验证不止于页面能够显示

状态边界至少需要三层检查。领域检查验证空输入、重复命令和非法状态转换；组件检查验证输入变化和事件输出；设备检查验证导航、后台恢复以及资源释放。截图只能验证展示，不能证明命令只执行一次。

针对示例，应在 DevEco Studio 运行上述输入路径，再添加两个同名收藏，确认它们拥有不同标识，删除其中一项不影响另一项。针对异步页面，应控制请求完成顺序，检查旧成功、旧错误与旧结束回调都不影响当前状态。针对持久化页面，应制造写入失败，确认界面不把未保存记录宣称为已保存。

本篇的独立 Node 票据逻辑可以脱离设备验证；ArkUI 页面仍需要目标 SDK 编译和模拟器或真机检查，不能用 TypeScript 编译成功代替。架构是否成立，最终看新增一次交互时能否明确指出状态所有者、执行位置、失败路径和验证方法，而不是目录看起来是否符合某个模式。

## 官方参考

- [华为：状态管理概述](https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/arkts-state-management-overview)，用于核对 V1、V2 的职责与同步关系。
- [华为：@Param 组件外部输入](https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/arkts-new-param)，特别注意对象引用与成员修改边界。
- [华为：@Event 规范组件输出](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/arkts-new-event)，包含事件后输入同步时序的说明。
- [华为：@ObservedV2 与 @Trace](https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/arkts-new-observedv2-and-trace)，用于按字段组织可观察对象。
- [华为：自定义组件生命周期](https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/arkts-page-custom-components-lifecycle)，用于核对生命周期与资源管理入口。
