---
title: Vue 3 响应式与 React 对照
description: 用完整 SFC 理解 ref、reactive、computed、watchEffect 依赖追踪和清理。
---

# Vue 3 响应式与 React 对照

## 学习目标与独立项目

本节实现计数、课程过滤和自动计时，观察哪些读取成为依赖、哪些写入会触发更新。
目标是理解 Vue 的追踪机制，不是把 React 的 setter 机械替换成 `.value`。
使用 Node 22.12+ 的 22.x 或受当前 Vite 支持的 LTS，新建独立项目：

```bash
npm create vite@latest vue-lab -- --template vue-ts
cd vue-lab
npm install
npm run dev
```

保留模板的 `tsconfig`、Vite Vue 插件配置和依赖，替换以下三个文件。
SFC 是 Single File Component，由插件分别处理 script、template 和 style，不是浏览器直接执行 `.vue`。

## 1. ref、reactive 与 computed 各管理什么

`ref` 是带 `.value` 的容器，适合数字、字符串和需要整体替换的值；对象 ref 默认也会深层响应化。
`reactive` 返回 Proxy，拦截属性读写并追踪依赖；修改原始对象而绕过 Proxy 不会正确通知订阅者。
从 reactive 解构一个数字会得到当时的普通值；用 getter、toRef 或 toRefs 保留属性关联。
本例保留 `settings.auto` 的属性访问，不解构它，也不替换整个 settings 引用。

`computed` 声明纯派生值：只有依赖失效后再次读取时才重新求值，并缓存计算结果。
它不适合请求、定时器或写其他状态；这些副作用属于 watch / watchEffect。
模板会解包顶层 ref，所以模板写 count，脚本写 count.value；集合内部 ref 不要假设同样自动解包。

## 2. 完整计数与过滤 SFC

::: code-group
```html [index.html]
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Vue 响应式实验</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

```ts [src/main.ts]
import { createApp } from 'vue';
import App from './App.vue';

const root = document.getElementById('app');
if (!root) throw new Error('缺少 #app 挂载节点');
createApp(App).mount(root);
```

```vue{21-28} [src/App.vue]
<script setup lang="ts">
import { computed, reactive, ref, watchEffect } from 'vue';

const count = ref(0);
const query = ref('');
const settings = reactive({ auto: false, seconds: 1 });
const lessons = [
  { id: 'v1', title: 'Vue 响应式' },
  { id: 'r1', title: 'React 状态快照' },
  { id: 't1', title: 'TypeScript 类型边界' },
];
const filtered = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase();
  return lessons.filter((lesson) => lesson.title.toLocaleLowerCase().includes(keyword));
});
const summary = computed(() => `计数 ${count.value}；匹配 ${filtered.value.length} 门课`);

watchEffect(() => {
  document.title = `计数：${count.value}`;
});

watchEffect((onCleanup) => {
  if (!settings.auto) return;
  const seconds = settings.seconds;
  const timer = window.setInterval(() => {
    count.value += 1;
  }, seconds * 1000);
  onCleanup(() => window.clearInterval(timer));
});
</script>

<template>
  <main>
    <h1>Vue 响应式实验</h1>
    <p role="status">{{ summary }}</p>
    <button type="button" @click="count += 1">增加一次</button>
    <button type="button" @click="count += 2">增加两次</button>
    <button type="button" @click="count = 0">重置计数</button>
    <label>
      <input v-model="settings.auto" type="checkbox" />
      自动计数
    </label>
    <label>
      计时间隔
      <select v-model.number="settings.seconds">
        <option :value="1">1 秒</option>
        <option :value="2">2 秒</option>
      </select>
    </label>
    <label>
      搜索课程
      <input v-model="query" type="search" />
    </label>
    <ul>
      <li v-for="lesson in filtered" :key="lesson.id">{{ lesson.title }}</li>
    </ul>
    <p v-if="filtered.length === 0">没有匹配课程</p>
  </main>
</template>

<style scoped>
main { max-width: 42rem; margin: 2rem auto; padding: 1rem; }
label { display: block; margin-block: 1rem; }
button, input, select { font: inherit; min-height: 2.75rem; }
button { margin-inline-end: 0.5rem; }
:focus-visible { outline: 3px solid #2457c5; outline-offset: 3px; }
</style>
```
:::

## 3. watchEffect 的依赖是执行时读出来的

第一个 effect 读取 count.value，所以计数变化时更新标题；写入 document.title 本身不是 Vue 依赖。
第二个同步读取 auto；只有 auto 为 true 时才读取 seconds，因此关闭计数时改变间隔不会建立计时器。
interval 回调稍后才读取 count.value，不属于 watchEffect 同步追踪阶段，所以每次计数不会重建 interval。
清理会在 effect 重跑前和停止时执行；关闭 auto、改变已启用的间隔、卸载组件都会清除旧定时器。

setup 中同步创建的 watcher 绑定组件，会在卸载时自动停止。
如果在 setTimeout 或异步回调里才创建 watcher，就要保存停止句柄并手动管理，不能假设组件替你清理。
watchEffect 对异步函数只追踪首次 await 之前的读取；要显式控制来源时，使用 watch 的 source 参数。
默认 watcher 在所属组件 DOM 更新前运行，读取更新后 DOM 可用 `flush: 'post'` 或 await nextTick。

这里用参数 `onCleanup` 注册清理。Vue 3.5+ 也有 onWatcherCleanup，但它必须在同步阶段注册，不能放在 await 后。
虽然 onCleanup 参数有更宽的注册时机，本例仍同步登记，避免异步等待期间资源先失去所有者。
标题 effect 不拥有持续任务，所以无需清理；共享全局标题由应用层统一管理时应移出局部组件。

## 4. 与 React 比较的不是语法

| 关注点 | Vue 3 | React |
| --- | --- | --- |
| 状态写入 | Proxy/ref 写入触发追踪者 | setter 排队下一次渲染状态 |
| 事件读值 | ref.value 可以立即读到新值 | 当前闭包仍是旧快照 |
| 派生值 | computed 缓存且自动追踪 | 渲染中直接计算，昂贵时再考虑 useMemo |
| 副作用依赖 | watch 显式，watchEffect 同步自动追踪 | effect 显式依赖数组 |
| DOM 更新 | 也会批处理，通常等 nextTick | 渲染后提交，不等于 setter 同步改 DOM |

Vue 的可变写法不代表可以随意写原始对象，React 的不可变更新也不代表复制整个应用。
两者都需要稳定列表 key、纯派生计算、副作用清理和外部数据验证。
Vue 父组件传来的 props 不应由子组件直接修改，应 emit 动作或采用约定的双向绑定接口。

## 5. 效果验证与常见失败

初始显示 3 门课。搜索 `react` 应只显示一门，搜索不存在的词应显示空结果提示。
点击增加两次，计数应增加 2，浏览器标题同步变化；DOM 不保证在同一 JS 语句之后立即更新。
开启自动计数，再切成 2 秒，应该只剩一个新间隔；关闭后等待 3 秒，计数不再变化。
连续开关 5 次后再开启，观察 5 秒内的增量，不能因为重复 interval 而成倍加速。
在自己的 `vue-lab` 运行 `npm run build`，确认 SFC 与 TypeScript 检查通过。

| 失败 | 修复 |
| --- | --- |
| 脚本计数不变 | ref 漏了 .value，或改了普通拷贝 |
| 解构后失去更新 | reactive 原始字段被复制；用属性访问或 toRefs |
| 切换间隔后加速 | 新建 timer 却没清旧 timer；配对 onCleanup |
| computed 请求重复且结果混乱 | 把副作用放进派生计算；改 watch 并处理取消/竞态 |

## 练习与验收

把课程数组改为 ref，添加受控标题输入与新增按钮，用确定且唯一的 ID 创建课程。
验收：空白标题不可新增；新增后当前过滤结果立即正确；已有行 key 不变；自动计数仍只有一个定时器。
再在父 SFC 中用 v-if 挂载本组件，卸载后等待，确认旧定时器不继续工作，重新挂载从初始状态开始。
解释 interval 中读取 count 为什么不成为第二个 watchEffect 的依赖。

## 官方资料

- [Vue 响应式基础](https://cn.vuejs.org/guide/essentials/reactivity-fundamentals.html)
- [Vue computed](https://cn.vuejs.org/guide/essentials/computed.html)
- [Vue watcher 与清理](https://cn.vuejs.org/guide/essentials/watchers.html)
- [Vue 单文件组件](https://cn.vuejs.org/guide/scaling-up/sfc.html)

下一节：[单元测试、组件测试与 E2E](../testing/unit-e2e.md)。
