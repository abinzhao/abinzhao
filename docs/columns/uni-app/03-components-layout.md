---
title: '03 · 组件、布局与跨端样式'
description: 使用内置组件建立可复用服务选择器，明确 props 与事件边界，处理 rpx、长文本、触控、安全区及不同渲染器的布局差异。
date: '2026-10-23'
category: uni-app 开发
tags: [uni-app, Vue 3, 组件, rpx, 跨端布局]
series:
  order: 3
---

# 03 · 组件、布局与跨端样式

## 共享模板不等于共享 DOM

标准 uni-app 的 `view`、`text`、`button`、`input`、`picker` 等内置组件有自己的属性与事件契约。浏览器元素和内置组件可能看起来相似，但事件对象、默认样式、焦点和原生能力并不相同。先查内置组件文档，再写业务组件；直接把网页的 `div`、文件输入和 DOM 测量搬过来，很容易只在 Web 工作。[cite:1]

`text` 负责文本，`view` 负责区域，`button` 负责明确动作。点击一个容器不自动具有按钮的键盘行为与可访问语义，不能为统一外观把所有按钮都改成 `view`。一整张卡可选择时，也应给出清楚的选中状态和独立动作，避免嵌套点击造成一次触发两个请求。

## 定义组件契约

服务选择器接收候选服务、当前服务 ID 和禁用状态，向父层发出新的服务 ID。它不读全局登录、不调用预约接口，也不直接修改传入数组。父层负责合法状态与提交，组件负责表达和交互；职责分开后，同一组件可以用于创建页和修改草稿页，不必复制网络行为。

候选 ID 必须唯一。`v-for` 的 key 表示节点身份，不应使用可变索引代替业务 ID；列表插入后索引变化会把输入焦点和组件内部状态配到另一项。显示名可以变化，身份不应跟着翻译或排序改变。禁用既体现在按钮属性，也体现在事件函数中，避免程序调用绕过交互状态。

下面两个文件构成完整练习。在标准工程建立组件目录，将第一个保存为 `components/ServiceSelector.vue`，再在首页显式导入。先使用显式导入理解依赖；后续需要 easycom 时再研究规则，不让自动扫描掩盖名称冲突与隐藏依赖。[cite:2]

```vue
<script setup lang="ts">
type Service = { id: string; name: string; durationMinutes: number }
const props = defineProps<{
  items: readonly Service[]
  modelValue: string
  disabled?: boolean
}>()
const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()
function choose(id: string) {
  if (props.disabled || !props.items.some(item => item.id === id)) return
  emit('update:modelValue', id)
}
</script>

<template>
  <view class="options">
    <button
      v-for="item in items"
      :key="item.id"
      class="option"
      :class="{ selected: modelValue === item.id }"
      :disabled="disabled"
      @click="choose(item.id)"
    >
      <text class="name">{{ item.name }}</text>
      <text class="meta">{{ item.durationMinutes }} 分钟</text>
      <text v-if="modelValue === item.id" class="state">已选择</text>
    </button>
    <text v-if="items.length === 0">暂无可选服务</text>
  </view>
</template>

<style scoped>
.options { display: flex; flex-direction: column; gap: 16rpx; }
.option {
  display: flex; flex-direction: column; align-items: flex-start;
  width: 100%; min-height: 44px; margin: 0; padding: 24rpx;
  line-height: 1.5; text-align: left; background: #fff; color: #172033;
  border: 1px solid #ccd2dc; border-radius: 12rpx; box-sizing: border-box;
}
.option::after { border: 0; }
.selected { border-color: #2459b8; background: #edf3ff; }
.name { font-size: 32rpx; overflow-wrap: break-word; }
.meta { font-size: 26rpx; color: #515e73; }
.state { font-size: 26rpx; font-weight: 600; color: #2459b8; }
</style>
```

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import ServiceSelector from '../../components/ServiceSelector.vue'
const services = [
  { id: 'consult', name: '学习咨询（组件练习）', durationMinutes: 30 },
  { id: 'review', name: '作品评审与下一阶段建议', durationMinutes: 60 }
]
const selected = ref('consult')
const selection = computed(() => services.find(item => item.id === selected.value))
</script>

<template>
  <view class="page">
    <text class="heading">选择服务</text>
    <ServiceSelector v-model="selected" :items="services" />
    <text class="summary">当前选择：{{ selection?.name ?? '尚未选择' }}</text>
  </view>
</template>

<style scoped>
.page { padding: 32rpx; padding-bottom: calc(32rpx + env(safe-area-inset-bottom)); }
.heading { display: block; font-size: 40rpx; margin-bottom: 24rpx; }
.summary { display: block; margin-top: 24rpx; }
</style>
```

## 样式单位与容器边界

`rpx` 根据屏幕宽度换算，设计稿常以七百五十为参照。它适合跟随宽度的间距，但不代表所有字号和按钮高度都应缩放。小屏上单纯设置八十 rpx 的按钮可能达不到四十四像素触控要求；示例使用 `min-height: 44px` 保持动作下限，同时用 rpx 控制视觉间距。[cite:3]

平板和桌面浏览器不应无限放大手机排版。先让核心容器宽度有边界，再使用流式宽度、换行和合理列数。不要用绝对定位把每个控件钉在设计稿坐标；文本变化、系统字号放大和键盘出现后，坐标方案会产生覆盖。主流程优先单列，确实需要并列时再验证最窄可用宽度。

长服务名、连续英文、错误信息和备注会突破正常演示文本。容器需要允许子项缩小与换行，必要时使用 `min-width: 0`。不支持的 CSS 规则可能被忽略，所以降级后仍需保留可读内容；若目标渲染器不支持某项布局能力，应选兼容布局，不用一个 Web 截图宣称全端一致。

## 安全区、滚动与键盘

底部固定操作区容易被系统手势条或软键盘覆盖。安全区需要参考目标能力与实际设备，`env(safe-area-inset-bottom)` 只是样式层的一种处理，不能证明所有宿主都返回正确值。固定区域必须给内容预留空间；否则最后一条记录被遮挡，用户无法取消，功能就没有闭环。

普通页面滚动通常比多层嵌套 `scroll-view` 更简单。只有明确需要局部独立滚动时才引入滚动容器，确定其高度、触摸方向和加载触发条件。垂直滚动区域中再嵌横向控件，应在真机检查手势争抢；模拟器鼠标滚轮不能证明触摸滚动和键盘弹出时可用。

表单可使用内置输入的焦点、确认和键盘相关属性，但属性支持情况要按目标查看。不要只监听 Web 的全局 resize。用户输入时保留当前值，滚动到错误字段，不要因焦点变化重建整个表单。原生输入层的覆盖、光标和选区往往是平台特有问题，应记录设备与组件，而非只贴 CSS 修正。

## props、事件和组合

父组件向下传数据，子组件向上发业务事件。传入 `modelValue` 的组件不能直接赋值 props，也不能偷偷修改其中嵌套对象；这样会使父层无法追踪状态变化。需要修改复杂对象时，发出明确变更或新值，由父层经过校验后采用，而不是共享一个随意可写引用。

事件名称表达业务含义，例如选择、取消或重试，不把原生 event 完整透传到所有层。组件接触的是平台事件，业务层接收的是已解析字段，两者分开后可以独立测试。跨端事件对象不完全一样，`event.target.value` 的网页习惯不能替代 `event.detail.value` 的文档契约。

插槽适合可替换标题、说明或尾部动作，但不应让组件承担未知页面布局。一个只使用一次的片段不需要立即拆为万能组件。复用从稳定边界开始：输入输出、禁用状态、错误展示和样式职责已经清楚，再抽取组件；大量布尔开关通常意味着组合边界尚未确定。

## 样式作用域与主题责任

`scoped` 用于减少组件样式影响其他区域，不是完整的样式隔离沙箱。内置组件、子组件和平台生成节点的命中行为需要目标验证。页面负责整体背景与布局，选择器负责内部选项样式；不要让组件用全局选择器改写所有页面按钮，避免一个局部视觉需求影响登录或取消动作。

主题先保留清楚的文字层级、边框和状态反馈，再添加装饰。暗色主题要重新检查输入背景、禁用文字和默认按钮，不仅将背景变黑。加载时保持组件区域稳定，减少跳动；错误信息出现在相关区域并允许换行，不通过短暂浮层承担唯一失败说明。用户阅读慢时，反馈仍须可见。

## 失败路径与调试

父层数据更新而组件不变，先检查是否错误地把 prop 初始值复制到一个不再同步的 ref。点击产生两次事件，检查嵌套区域和父层监听，不先加防抖掩盖传播。列表内容串行，检查 key 是否唯一稳定。组件只在 Web 可见，检查是否依赖 DOM 或目标不支持的样式。

文字被截断时不要第一反应减小字号。先看固定高度、默认行高、容器宽度与 flex 收缩。按钮使用默认伪元素边框，定制时可以在组件作用域处理，但不要全局删除所有按钮视觉状态。禁用、选中和错误不能仅靠颜色，应有文字或形状差异，保证色觉差异下仍可判断。

## 实践与验收

基础作业加入一条很长的服务名与空候选列表，验证组件有可读空状态、没有横向溢出、选择不修改候选。进阶作业让父层在请求期间禁用选择，请求失败后恢复；子组件不能自行调用服务器。再将服务顺序反转，确认选中项跟随 ID 而非索引。

验收覆盖三百九十像素手机宽度、更窄窗口、长英文、系统大字号、底部安全区与键盘显示。每个可操作控件保持至少四十四像素触控区域，用户能看见当前选择和失败提示。Web、微信与 App 的实际布局分别记录；未安装的目标保持待验证，不以“用了内置组件”替代设备检查。

## 官方依据

<a id="source-1"></a>[cite:1] [内置组件](https://uniapp.dcloud.net.cn/component/)：组件与平台支持。

<a id="source-2"></a>[cite:2] [Vue 3 基础](https://uniapp.dcloud.net.cn/tutorial/vue3-basics.html)与[pages 配置](https://uniapp.dcloud.net.cn/collocation/pages.html)：组件使用与 easycom。

<a id="source-3"></a>[cite:3] [尺寸单位与样式](https://uniapp.dcloud.net.cn/tutorial/syntax-css.html)：rpx 和平台样式差异。

上一章：[pages 与导航](./02-pages-manifest-routing)。下一章：[组合式 API 与生命周期](./04-composition-lifecycle)。
