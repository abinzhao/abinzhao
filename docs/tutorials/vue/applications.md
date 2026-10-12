---
title: Vue 3 应用实践：组件表单、事件协议与任务管理
description: 用完整任务管理应用理解父子组件职责、v-model 协议、表单校验和派生视图。
type: tutorial
topic: vue
section: frameworks
order: 30
level: advanced
status: published
tags:
  - Vue
  - 组件
  - 表单
  - 应用实践
prerequisites:
  - /tutorials/vue/composition.html
comments: true
---

# Vue 3 应用实践：组件表单、事件协议与任务管理

将一个页面拆成组件之后，最大的变化不是文件变多，而是数据更新需要跨越边界。父组件拥有任务，表单组件拥有草稿，输入组件只表达新的输入值，列表行表达完成或删除意图。边界清晰之后，验证一个按钮的行为就不必搜索整个项目中的对象修改。

本篇构建本地任务管理应用，包含新增、长度和范围校验、完成切换、筛选、统计与删除。适用于 Vue 3，使用普通 `defineProps`、`defineEmits` 和 `modelValue` 协议，不依赖 Vue 3.4 才引入的 `defineModel`。数据存在内存，刷新清空，示例不假装完成后端持久化或账号权限。

## 前置环境与组件契约

先阅读[组合式逻辑](/tutorials/vue/composition.html)，确保理解 ref、computed 和资源清理。使用 Node 24，或者满足当前构建工具要求的 Node 22，在独立目录运行：

```bash
npm create vite@latest vue-task-lab -- --template vue
cd vue-task-lab
npm install
npm run dev
```

将 `src/main.js` 替换为简洁入口，不导入模板 CSS：

```js
import { createApp } from 'vue';
import App from './App.vue';

createApp(App).mount('#app');
```

应用新增 `TextField.vue`、`TaskForm.vue`、`TaskRow.vue`，最后替换 `App.vue`。它们分别负责文本输入协议、表单提交、单条任务展示和整体状态。不要让所有组件都接触一个可随意改写的全局对象，否则拆分只改变文件位置，没有真正建立责任。

Vue 的属性遵循单向传递。属性本身只读，但传入对象的嵌套属性仍可能被子组件修改，从而直接影响父状态。技术上能够修改不意味着设计上应该这样做。本文让子组件只发送编号和意图，由父组件生成新的任务集合，便于追踪变化并为未来接入接口留下明确入口。

## 第一步：实现兼容 Vue 3 的输入组件

在 `src/TextField.vue` 写入以下内容。组件上的 `v-model` 默认对应 `modelValue` 属性和 `update:modelValue` 事件；它不是直接修改属性的语法许可。

```vue
<script setup>
const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  modelValue: { type: String, required: true },
  error: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue']);

function update(event) {
  emit('update:modelValue', event.target.value);
}
</script>

<template>
  <div>
    <label :for="props.id">{{ props.label }}</label>
    <input
      :id="props.id"
      :value="props.modelValue"
      :aria-invalid="Boolean(props.error)"
      :aria-describedby="props.error ? `${props.id}-error` : undefined"
      @input="update"
    />
    <p v-if="props.error" :id="`${props.id}-error`" role="alert">
      {{ props.error }}
    </p>
  </div>
</template>
```

脚本保留 `props` 对象，不解构基本属性，避免依赖不同 Vue 次版本对编译宏解构的支持差异。`defineProps` 和 `defineEmits` 是单文件组件编译宏，在 `script setup` 中不需要导入。它们不等同于可以在任意普通 JavaScript 文件里使用的全局函数。

标签通过唯一 `id` 关联输入，错误文字通过描述属性关联。若在同一页面放置两份表单，必须为实例分配不同编号，不能复制相同的输入 `id`。无障碍属性不是装饰，它们决定辅助技术能否获知字段名称与错误。

## 第二步：实现完整提交表单

在 `src/TaskForm.vue` 写入下面的组件。草稿字符串与正式记录分开，提交成功才构造业务数据。

```vue
<script setup>
import { reactive, ref } from 'vue';
import TextField from './TextField.vue';

const emit = defineEmits(['create']);
const title = ref('');
const minutes = ref('25');
const errors = reactive({ title: '', minutes: '' });
const message = ref('');

function submit() {
  message.value = '';
  const normalizedTitle = title.value.trim();
  const duration = Number(minutes.value);
  errors.title = normalizedTitle.length < 2 || normalizedTitle.length > 40
    ? '名称需要二到四十个字符。'
    : '';
  errors.minutes = !Number.isInteger(duration) || duration < 1 || duration > 480
    ? '分钟数需要是一到四百八十之间的整数。'
    : '';
  if (errors.title || errors.minutes) return;

  emit('create', { title: normalizedTitle, minutes: duration });
  title.value = '';
  minutes.value = '25';
  message.value = '任务已添加。';
}
</script>

<template>
  <form @submit.prevent="submit" novalidate>
    <TextField
      id="task-title"
      v-model="title"
      label="任务名称"
      :error="errors.title"
    />
    <label for="task-minutes">预计分钟数</label>
    <input id="task-minutes" v-model="minutes" type="number" />
    <p v-if="errors.minutes" role="alert">{{ errors.minutes }}</p>
    <button type="submit">添加任务</button>
    <p role="status">{{ message }}</p>
  </form>
</template>
```

`submit.prevent` 阻止浏览器原生表单导航，但不等于校验已经通过。这里关闭原生验证以展示统一的教学反馈，并在 JavaScript 中明确实现全部规则。实际项目可以结合原生约束和业务校验，重要的是不要只展示错误样式却仍然提交非法数据。

组件事件是同步通知父组件，不会自动等待父级异步请求。因此这里的“已添加”仅在父级同步添加内存数据的契约下成立。接入真实接口时，应把提交中与结果状态交给负责请求的层，或者制定明确的异步操作接口；不能把 `emit` 当作一个可以等待成功结果的 Promise。

## 第三步：实现条目与父级应用

在 `src/TaskRow.vue` 写入单行展示。子组件不直接给 `task.done` 赋值，而是发出带编号的切换事件。

```vue
<script setup>
const props = defineProps({
  task: { type: Object, required: true },
});
const emit = defineEmits(['toggle', 'remove']);
</script>

<template>
  <li>
    <label>
      <input
        type="checkbox"
        :checked="props.task.done"
        @change="emit('toggle', props.task.id)"
      />
      {{ props.task.title }}，{{ props.task.minutes }} 分钟
    </label>
    <button type="button" @click="emit('remove', props.task.id)">
      删除 {{ props.task.title }}
    </button>
  </li>
</template>
```

再将 `src/App.vue` 替换为完整应用。集合更新、编号生成与筛选都在可定位的入口完成，正式任务状态不会被输入组件隐式改变。

```vue
<script setup>
import { computed, ref } from 'vue';
import TaskForm from './TaskForm.vue';
import TaskRow from './TaskRow.vue';

const tasks = ref([]);
const filter = ref('全部');
const visibleTasks = computed(() => tasks.value.filter(task =>
  filter.value === '全部' ||
  (filter.value === '已完成' ? task.done : !task.done),
));
const remainingMinutes = computed(() => tasks.value.reduce(
  (sum, task) => sum + (task.done ? 0 : task.minutes), 0,
));
const completedCount = computed(() =>
  tasks.value.filter(task => task.done).length,
);

function createTask(draft) {
  tasks.value = [
    ...tasks.value,
    { ...draft, id: crypto.randomUUID(), done: false },
  ];
}

function toggleTask(id) {
  tasks.value = tasks.value.map(task =>
    task.id === id ? { ...task, done: !task.done } : task,
  );
}

function removeTask(id) {
  tasks.value = tasks.value.filter(task => task.id !== id);
}
</script>

<template>
  <main>
    <h1>本地任务管理</h1>
    <TaskForm @create="createTask" />
    <label>
      显示范围
      <select v-model="filter">
        <option>全部</option>
        <option>未完成</option>
        <option>已完成</option>
      </select>
    </label>
    <p>已完成 {{ completedCount }} 条，剩余 {{ remainingMinutes }} 分钟。</p>
    <ul v-if="visibleTasks.length">
      <TaskRow
        v-for="task in visibleTasks"
        :key="task.id"
        :task="task"
        @toggle="toggleTask"
        @remove="removeTask"
      />
    </ul>
    <p v-else>当前范围没有任务。</p>
    <p>数据仅保存在当前页面内存中，刷新将清空。</p>
  </main>
</template>
```

Vue 也允许修改本组件拥有的响应式对象属性，本例选择集合替换只是为了突出父级的操作入口，并非 Vue 强制要求不可变更新。稳定 `key` 必须来自任务身份，不能来自筛选位置。`crypto.randomUUID` 需要现代浏览器与安全上下文，正式站点应使用 HTTPS；服务端编号与权限仍需由服务端负责。

## 数据所有权与真实提交协议

输入组件管理的只是文本呈现协议，表单组件才理解名称长度与用时范围，父组件才拥有正式集合。这三个层次如果混在一起，输入组件就会逐渐知道任务、网络和列表刷新，难以复用。保持输入输出具体，不必为了可能的未来需求建立全功能表单框架。

组件事件也不应携带一个可以被任意修改的内部对象引用。本例提交时构造新的草稿对象，父组件再添加正式编号和完成状态。编辑流程可以用相同原则：复制需要编辑的字段，用户取消就丢弃草稿，确认后由父级更新指定编号。若直接绑定传入任务对象，弹窗里的每次输入就可能已经改变列表。

正式接入服务时，可以让父组件持有提交状态，将 `pending`、字段错误和成功结果传回表单。表单收到提交中状态时禁用重复提交，但仍应允许用户了解当前进度。请求失败保留草稿，服务端字段错误映射到对应输入，通用失败放在表单区域，不把所有错误都丢到浏览器控制台。

异步提交还要考虑用户离开页面。读取请求可以取消并忽略过期结果，写入请求则可能已经被服务端接受。取消等待不等于撤销创建。需要定义业务幂等策略、结果查询或真正撤销接口，不能把前章查询 composable 的中断直接移过来就声称订单或记录没有创建。

本地成功反馈与正式保存成功是两种契约。本文同步 `emit` 后显示成功仅因为父级立刻写入内存；如果父级改成异步函数，事件发射不会自动等待它。修改这层行为时必须同时改变反馈来源和验收步骤，不应继续保留过早的“已添加”文字让用户误判。

## 组件验证的合理边界

输入组件可以独立验证标签关联、值展示和更新事件；表单验证输入规则与提交负载；应用验证新增之后列表、筛选和统计的联动。不同层次使用不同断言，避免在一个测试里既检查组件内部实现又模拟整个应用所有交互，导致微小重构也必须重写大量用例。

统计应来自正式集合而不是当前筛选列表。若选择“已完成”之后剩余分钟数归零，就要确认这是否真的是业务规则。本篇定义的是所有未完成任务剩余时间，与当前展示范围无关。把这类含义写在完成标准中，才能避免代码“看起来合理”却改变用户理解。

列表条目需要稳定身份，输入标签需要文档内唯一编号，这两种编号责任并不相同。任务名称可能重复，所以不适合作为 `key`；同一输入组件在两份表单中出现，也不能共享 DOM `id`。选择编号时先问它服务的是数据身份、组件复用还是无障碍关联，不要把一个随机值用到所有场景。

## 验证与预期结果

运行开发服务器后，先提交空名称和零分钟，应出现错误且列表保持为空。再提交“阅读文档”、二十五分钟和“整理笔记”、十五分钟，应有两条未完成任务，剩余四十分钟。勾选第一条，已完成数量应为一，剩余十五分钟。

选择“未完成”应只看到第二条，选择“已完成”应只看到第一条。删除第一条后，已完成数量应归零，当前筛选显示空状态；切回“全部”仍保留第二条。这条路径验证筛选只是派生视图，而不是将隐藏数据从正式集合中删除。

使用键盘定位输入、提交与复选框，检查关联标签和错误提示。最后在独立实验目录执行 `npm run build` 和 `npm run preview`，按预览地址复测关键路径。本文未运行这些示例，编译成功也不能替代实际表单与键盘验证。

## 排错与接入真实服务的边界

输入无法编辑，先检查输入组件是否发出正确的 `update:modelValue` 事件，是否拼错属性名称。直接给属性赋值会出现只读警告；即使嵌套对象修改没有警告，也应检查是否违反状态所有权。父组件没有收到删除事件时，检查监听是否绑定在发出事件的直接子组件，组件事件不会像原生 DOM 事件那样自动逐层冒泡。

提交后提示成功但任务没有保存，确认当前实现只是内存操作。接入接口后应处理提交中禁用、服务端校验错误、请求失败和恢复，不宜乐观地清空唯一草稿。重复提交是否创建重复任务还需要幂等策略，客户端禁用按钮只是其中一层防护。

列表变大之后，先测量渲染和 DOM 数量。computed 缓存有帮助，但不是分页和虚拟列表的替代品。异步组件可以延迟加载较少访问的独立功能，但模块切分不能解决任务查询的竞态。性能优化、错误处理与权限是不同责任，不要用一个“加载中”状态掩盖所有边界。

## 练习与官方来源

练习一：增加编辑任务弹窗或区域，编辑完成保留原编号，取消不修改正式集合。练习二：增加按用时排序，排序基于复制后的数组或计算视图，不要原地修改正式集合造成意外顺序变化。练习三：把教学异步查询接入页面，分别展示加载、失败和重试，并复用前章的取消清理模型。

- [Vue：组件基础](https://vuejs.org/guide/essentials/component-basics.html)
- [Vue：属性与单向数据流](https://vuejs.org/guide/components/props.html)
- [Vue：组件事件](https://vuejs.org/guide/components/events.html)
- [Vue：组件 v-model](https://vuejs.org/guide/components/v-model.html)
- [Vue：表单输入绑定](https://vuejs.org/guide/essentials/forms.html)
- [Vue：性能优化](https://vuejs.org/guide/best-practices/performance.html)
