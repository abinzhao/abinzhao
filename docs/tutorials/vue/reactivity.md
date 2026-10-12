---
title: Vue 3 响应式入门：用购物清单理解 ref 与 computed
description: 从可运行的购物清单掌握响应式代理、ref、computed、watch 和 DOM 更新时机。
type: tutorial
topic: vue
section: frameworks
order: 10
level: beginner
status: published
tags:
  - Vue
  - 响应式
  - computed
prerequisites: []
comments: true
---

# Vue 3 响应式入门：用购物清单理解 ref 与 computed

Vue 的响应式系统让界面自动跟随数据变化，但“自动”并不意味着任何 JavaScript 变量都具有响应性。理解读取依赖、修改触发和批量更新，才能解释为什么某个值改变了页面却没有变化，以及什么时候应该使用计算属性而不是侦听器。本篇用一个购物清单展示完整的数据到界面路径。

示例适用于 Vue 3，使用单文件组件和 Composition API，不依赖较新版本的响应式属性解构行为。你需要了解 JavaScript 对象、数组方法和模块导入，认识 HTML 表单元素。金额统一使用整数“分”保存，显示时再转换为元，避免把格式化字符串当成计算数据。

## 前置环境与运行入口

使用 Node 24，或者满足所选 Vite 版本最低要求的 Node 22。在新的学习目录创建普通 Vue 模板，不要在现有应用里直接替换入口。

```bash
node --version
npm create vite@latest vue-cart-lab -- --template vue
cd vue-cart-lab
npm install
npm run dev
```

模板应安装 Vue 3。工具链的 Node 要求与 Vue 响应式 API 的版本边界是两件事，不能因为 Vue 3 支持某个 API，就推断当前 Vite 能在任意旧 Node 上运行。保留脚手架生成的锁文件，后续通过同一套依赖重现学习环境。

将 `src/main.js` 替换为下面的入口，避免模板演示样式干扰实验。`App.vue` 是根组件，`mount` 将它挂到 `index.html` 中的根节点。

```js
import { createApp } from 'vue';
import App from './App.vue';

createApp(App).mount('#app');
```

## ref、reactive 与普通变量

`ref` 把一个值放进带有 `.value` 的容器，既能容纳基本类型，也能容纳对象。脚本中读写使用 `.value`，模板中顶层 ref 通常自动解包，所以可以直接写 `selectedCount`。自动解包有边界，例如响应式数组或集合中的 ref 元素不能一概省略 `.value`。

`reactive` 返回对象的代理，读取属性时收集依赖，写入属性时触发依赖它的计算。代理与原对象不是同一个引用，应长期使用代理作为状态入口。把代理赋给普通变量是可以的，但把某个基本类型属性解构成普通变量，会得到当前值的副本，而不是继续追踪原属性。

例如 `const { keyword } = filters` 在常规 `reactive` 对象上取得的是当时的字符串。后续修改 `filters.keyword` 不会改变那个局部字符串。如果确实需要解构后保留属性关联，可以用 `toRefs(filters)`，或者始终通过 `filters.keyword` 访问。本文采用后者，让数据来源直接可见。

不要轻易用新的普通对象替换一个原本由 `reactive` 管理的局部引用。既有计算和侦听可能仍关联旧代理。可以按明确字段修改代理，也可以使用 `ref` 包装整个对象，在需要整体替换时写入 `.value`。选择的依据是更新模型，不是认为某个 API 天生更“高级”。

## 分步实现完整购物清单

在 `src/App.vue` 写入完整内容。商品数据属于本地教学样本；数量变化和勾选状态都在响应式数组中，筛选条件放在单独的代理对象里。

```vue
<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue';

const products = ref([
  { id: 'notebook', name: '练习本', priceCents: 1200, quantity: 1, selected: true },
  { id: 'pen', name: '签字笔', priceCents: 500, quantity: 2, selected: true },
  { id: 'folder', name: '文件夹', priceCents: 800, quantity: 1, selected: false },
]);
const filters = reactive({ keyword: '', selectedOnly: false });
const totalElement = ref(null);
const notice = ref('尚未修改清单。');

const visibleProducts = computed(() => {
  const keyword = filters.keyword.trim();
  return products.value.filter(product =>
    product.name.includes(keyword) &&
    (!filters.selectedOnly || product.selected),
  );
});
const selectedCount = computed(() =>
  products.value.filter(product => product.selected).length,
);
const totalCents = computed(() =>
  products.value.reduce((sum, product) =>
    sum + (product.selected ? product.priceCents * product.quantity : 0), 0),
);

function formatMoney(cents) {
  return `¥${(cents / 100).toFixed(2)}`;
}

function changeQuantity(id, delta) {
  const product = products.value.find(item => item.id === id);
  if (!product) return;
  product.quantity = Math.min(99, Math.max(1, product.quantity + delta));
}

async function selectAll() {
  products.value.forEach(product => { product.selected = true; });
  await nextTick();
  totalElement.value?.focus();
}

watch(totalCents, (current, previous) => {
  notice.value = `合计从 ${formatMoney(previous)} 变为 ${formatMoney(current)}。`;
});
</script>

<template>
  <main>
    <h1>学习用品清单</h1>
    <label>
      商品名称
      <input v-model="filters.keyword" />
    </label>
    <label>
      <input v-model="filters.selectedOnly" type="checkbox" />
      仅看已选
    </label>
    <ul v-if="visibleProducts.length">
      <li v-for="product in visibleProducts" :key="product.id">
        <label>
          <input v-model="product.selected" type="checkbox" />
          {{ product.name }}，单价 {{ formatMoney(product.priceCents) }}
        </label>
        <button
          type="button"
          :disabled="product.quantity === 1"
          @click="changeQuantity(product.id, -1)"
        >减少 {{ product.name }}</button>
        <span>数量 {{ product.quantity }}</span>
        <button
          type="button"
          :disabled="product.quantity === 99"
          @click="changeQuantity(product.id, 1)"
        >增加 {{ product.name }}</button>
      </li>
    </ul>
    <p v-else>没有匹配商品，请调整筛选条件。</p>
    <p ref="totalElement" tabindex="-1">
      已选 {{ selectedCount }} 种，合计 {{ formatMoney(totalCents) }}
    </p>
    <button type="button" @click="selectAll">全选并查看合计</button>
    <p role="status">{{ notice }}</p>
  </main>
</template>
```

第一步先观察初始数组与合计。第二步点击数量按钮，沿着 `product.quantity` 的写入追踪 `totalCents` 的重新计算。第三步输入筛选词，确认只影响显示而不改变购物清单本身。第四步切换选中状态，确认计算属性读取到的依赖发生变化，合计随之更新。

本例允许直接修改代理中的嵌套属性，因为 Vue 3 会追踪这些读写。这与 React 的不可变状态更新方式不同，不应把另一框架的规则生搬到 Vue。真正需要保持一致的是状态所有权：代理由当前组件拥有，后续拆成子组件时不应让子组件偷偷修改父级传入的对象。

## computed 与 watch 的选择

`computed` 描述一个可由其他状态推导出的值，并按响应式依赖缓存结果。合计、选中数量和筛选列表都属于派生数据。计算函数应保持纯粹，不在其中写回状态、请求网络或操作 DOM，否则读取一个值就可能触发额外变化，造成难以解释的循环。

`watch` 适合在某个输入变化之后执行副作用。本例用它记录合计变化提示，而不是把合计再存进另一个状态。侦听 ref 或 computed 时直接传入容器；侦听 `reactive` 的某个基本属性时，应传 getter，例如 `() => filters.keyword`，不能把当时的字符串值作为侦听源。

默认侦听器会批量处理同步变化，因此一次全选可能只产生一次合计提示。这不是遗漏用户操作，而是当前副作用关心最终合计。若必须记录每次业务操作，应在操作入口记录事件，不依赖侦听器推断全部操作历史。深度侦听也不等于获取独立的旧对象快照，嵌套修改时新旧参数可能指向同一个代理。

## 依赖收集与数据来源检查

响应式依赖由实际读取决定，不是每个对象字段都无条件订阅。计算合计时，只对选中商品读取价格和数量；未选商品的数量变化可能不需要重新计算当前合计，因为它对当前结果没有影响。之后勾选该商品会触发新的计算，并读取此时的最新数量。这种按执行路径建立依赖的方式，是理解计算缓存的关键。

计算属性缓存只针对响应式依赖。直接在计算函数中读取当前时间，不会让时间自行成为响应式输入；没有相关状态变化时，缓存不会每秒自动更新。若要显示时钟，应使用受管理的计时器更新 ref，并在卸载时清理，而不是认为计算属性会不断执行。外部普通对象的修改也需要明确接入响应式系统。

读取原始对象和读取代理并不总产生相同追踪结果。不要一边把代理传给模板，一边在外部直接修改最初的普通对象，再期待更新一致。调试时先确认写入是否经过代理、展示是否从同一来源读取。对于来自第三方库的大型不可变数据，可以评估浅层响应式，但它有意不追踪所有嵌套变化，需要另外的替换契约，不是通用提速开关。

状态所有权同样重要。购物清单是当前组件的数据，可以在这里调整数量；如果多个页面共享清单，应明确共享层的操作入口。不能为了跨组件共享就把每个状态放到模块顶层，否则不同应用实例甚至服务端请求之间可能发生意外共享。只有确实需要共享的事实才应提升，局部筛选仍可留在页面。

还有一个容易忽略的区别：筛选结果引用原商品对象，所以勾选展示行仍然修改正式清单。本例有意利用这种关联。若为了编辑弹窗创建独立草稿，应复制需要编辑的字段，并在确认后明确提交；取消草稿不能已经通过共享对象改变正式数据。复制深度取决于数据结构，不应随意用序列化复制所有对象。

检验模型时，可以把“更改数据”和“隐藏展示”分别操作。先增加某商品数量，再筛选隐藏它，最后全选，合计仍应包含隐藏商品的最新数量。若结果不同，检查是否把筛选数组误当成正式集合，或者在筛选时丢弃了原数据。这个验证比仅测试输入搜索词后列表变短更能证明状态边界正确。

## DOM 时机与验证方法

状态赋值后，Vue 不保证 DOM 已在下一行更新。更新会进入队列，`await nextTick()` 用于等待这一轮已安排的 DOM 更新。本例全选后再把焦点移到合计，避免把“状态已变”误认为“DOM 已完成”。如果使用侦听器读取更新后的 DOM，可按需求考虑 `flush: 'post'`，不要为所有侦听无差别启用同步模式。

启动 `npm run dev` 后执行以下步骤，逐项检查页面行为。

1. 初次进入应选中练习本与签字笔，合计为二十二元。
2. 将签字笔数量从二增加到三，合计应为二十七元。
3. 输入“文件夹”，其他商品隐藏，但合计不因隐藏而改变。
4. 勾选文件夹，合计增加八元；选择“仅看已选”仍可看到它。
5. 清空搜索并取消所有勾选，合计应为零，全选后显示三种商品且焦点到合计文字。

用浏览器控制台检查 Vue 警告和模板编译错误。焦点验证应实际使用键盘；仅看到页面数值正确，不能证明键盘行为正确。观察复杂响应式问题时，用 Vue 开发者工具查看状态来源，比在多个位置复制对象更容易定位断开的关联。

## 排错、练习与官方来源

脚本中数值一直不变，先检查是否漏写 `.value`，或将代理基本属性解构成了普通变量。模板出现容器对象文字，检查是否把 ref 放进了数组、集合等不适用顶层解包的结构。不要通过到处调用强制更新来掩盖来源错误。

合计出现字符串拼接，检查金额与数量是否仍是数字。本文通过按钮控制整数数量；若换成输入框，应处理空值、范围和非法输入，不能只依赖转换修饰符。列表状态错位则检查 `key` 是否来自稳定编号，而不是筛选后的数组位置。

练习一：添加“全部清零选择”按钮，不改变数量。练习二：为商品增加分类筛选，仍然使用一个 computed 推导显示列表。练习三：添加折扣展示，用整数计算折扣后的分，再统一格式化；验证折扣变化没有偷偷修改商品原价。

继续阅读[组合式逻辑与清理](/tutorials/vue/composition.html)，把本篇的依赖模型扩展到定时器和异步查询。

- [Vue：响应式基础](https://vuejs.org/guide/essentials/reactivity-fundamentals.html)
- [Vue：计算属性](https://vuejs.org/guide/essentials/computed.html)
- [Vue：侦听器](https://vuejs.org/guide/essentials/watchers.html)
- [Vue：列表渲染与 key](https://vuejs.org/guide/essentials/list.html)
- [Vue：nextTick](https://vuejs.org/api/general.html#nexttick)
