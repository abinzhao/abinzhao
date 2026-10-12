---
title: Vue 3 组合式逻辑：可取消查询与生命周期清理
description: 提取一个完整查询 composable，理解侦听源、响应式返回值、异步竞态和资源释放。
type: tutorial
topic: vue
section: frameworks
order: 20
level: intermediate
status: published
tags:
  - Vue
  - Composition API
  - 异步
  - 生命周期
prerequisites:
  - /tutorials/vue/reactivity.html
comments: true
---

# Vue 3 组合式逻辑：可取消查询与生命周期清理

组合式函数，也称 composable，是使用 Vue 响应式 API 封装有状态逻辑的函数。它不是把所有函数都改成 `use` 前缀，也不是一个天然共享的全局仓库。合理的组合式函数让使用者清楚地看到输入、输出与资源边界，并且在组件离开时释放订阅、定时器和请求。

本篇实现一个可取消的课程查询。输入变化会触发延迟查询，旧查询不能覆盖新输入，隐藏查询面板会卸载组件并停止资源。代码适用于 Vue 3，使用 `watch` 回调第三个参数提供的 `onCleanup`，不要求 Vue 3.5 才有的 `onWatcherCleanup`，也不依赖实验 API。

## 前置准备与模块职责

先完成[响应式入门](/tutorials/vue/reactivity.html)，或使用 Node 24 在独立目录创建项目。保留模板入口，但将其简化为导入 `App.vue` 并挂载到 `#app`，不要保留影响页面的演示样式。

```bash
npm create vite@latest vue-query-lab -- --template vue
cd vue-query-lab
npm install
npm run dev
```

项目新增三个文件：`src/queryCourses.js` 负责不依赖 Vue 的查询协议；`src/useCourseSearch.js` 负责响应式输入、异步状态与清理；`src/SearchPanel.vue` 负责可见界面。最后替换 `src/App.vue`，用它验证挂载与卸载。拆分依据是职责而不是文件长度，普通数据转换不需要变成 composable。

输入契约只接收一个 `ref`，这样侦听源可直接传入 `watch`。输出是一个普通对象，其中每个状态成员仍是 ref 或 computed；解构这个对象不会丢失响应式关联。如果返回的是一个 `reactive` 对象，再解构其中的基本属性，就需要额外处理关联，这与上一篇讨论的代理规则一致。

## 第一步：建立确定的异步查询

在 `src/queryCourses.js` 写入以下内容。短输入故意慢一些，让读者可以稳定地观察乱序条件；数据明确是本地样本，不代表真实接口字段或服务延迟。

```js
const courses = [
  { id: 'react', title: 'React 状态与副作用' },
  { id: 'vue', title: 'Vue 组合式逻辑' },
  { id: 'node', title: 'Node 文件与流' },
];

export function queryCourses(keyword, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('已取消', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      if (keyword.trim().toLowerCase() === 'error') {
        reject(new Error('教学查询错误，请修改输入后重试。'));
        return;
      }
      const query = keyword.trim().toLowerCase();
      resolve(courses.filter(course =>
        course.title.toLowerCase().includes(query),
      ));
    }, keyword.length < 2 ? 1000 : 200);

    function onAbort() {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(new DOMException('已取消', 'AbortError'));
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
```

这个模块不导入 Vue，因此也容易独立测试。完成时移除监听，取消时清除计时器并拒绝 Promise。若换成真实 `fetch`，传入相同信号，并显式检查 HTTP 状态和响应结构；取消请求不保证撤销服务端已经执行的写操作，因此这个模型主要针对读取请求。

## 第二步：封装查询 composable

在 `src/useCourseSearch.js` 写入完整实现。每轮侦听都有自己的控制器与有效性标记，清理注册在异步任务开始之前。

```js
import { computed, readonly, ref, watch } from 'vue';
import { queryCourses } from './queryCourses.js';

export function useCourseSearch(keyword) {
  const retryCount = ref(0);
  const state = ref({
    keyword: '',
    status: 'loading',
    items: [],
    error: '',
  });

  watch([keyword, retryCount], ([current], _previous, onCleanup) => {
    const controller = new AbortController();
    let active = true;
    onCleanup(() => {
      active = false;
      controller.abort();
    });

    state.value = {
      keyword: current,
      status: 'loading',
      items: [],
      error: '',
    };

    async function load() {
      try {
        const items = await queryCourses(current, controller.signal);
        if (active) {
          state.value = { keyword: current, status: 'success', items, error: '' };
        }
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        state.value = {
          keyword: current,
          status: 'error',
          items: [],
          error: error instanceof Error ? error.message : '查询失败',
        };
      }
    }
    load();
  }, { immediate: true });

  const pending = computed(() =>
    state.value.keyword !== keyword.value || state.value.status === 'loading',
  );

  function retry() {
    retryCount.value += 1;
  }

  return { state: readonly(state), pending, retry };
}
```

`watch` 明确列出关键词与重试计数，它不会自动把回调中读取的所有值变成依赖。`immediate` 让初次挂载也查询。`readonly` 让使用组件读取结果而不直接改写内部状态，正式变化统一由 composable 的操作入口管理。

另一种 API 是 `watchEffect`，它自动收集同步执行期间读取的响应式值，但异步函数中第一个 `await` 之后读取的值不被自动收集。多依赖逻辑需要确定触发条件时，显式 `watch` 更容易检查。不要以为写在异步回调里的任何 ref 都会自动被订阅。

取消用于停止可取消工作，有效性标记用于阻止失效轮次提交，二者各有责任。只设置一个全局 loading 布尔值不能隔离请求，因为旧请求仍可能把新请求的加载状态清除。这里将结果与来源关键词放在一起，也能避免输入刚变时短暂展示不属于它的旧结果。

## 第三步：接入面板与卸载入口

在 `src/SearchPanel.vue` 写入完整组件。composable 在同步 setup 期间创建侦听器，所以它与当前组件绑定，卸载时 Vue 会停止侦听并执行清理。

```vue
<script setup>
import { ref } from 'vue';
import { useCourseSearch } from './useCourseSearch.js';

const keyword = ref('');
const { state, pending, retry } = useCourseSearch(keyword);
</script>

<template>
  <section>
    <h2>课程查询面板</h2>
    <label>
      关键词
      <input v-model="keyword" />
    </label>
    <button type="button" :disabled="pending" @click="retry">重新查询</button>
    <div aria-live="polite" :aria-busy="pending">
      <p v-if="pending">正在查询……</p>
      <p v-else-if="state.status === 'error'" role="alert">{{ state.error }}</p>
      <p v-else-if="state.items.length === 0">没有匹配课程。</p>
      <ul v-else>
        <li v-for="course in state.items" :key="course.id">{{ course.title }}</li>
      </ul>
    </div>
  </section>
</template>
```

将 `src/App.vue` 替换为下面的父组件。`v-if` 会卸载面板，而 `v-show` 只改变显示状态，不能用于同样的卸载验证。

```vue
<script setup>
import { ref } from 'vue';
import SearchPanel from './SearchPanel.vue';

const visible = ref(true);
</script>

<template>
  <main>
    <h1>组合式查询实验</h1>
    <button type="button" @click="visible = !visible">
      {{ visible ? '关闭面板' : '打开面板' }}
    </button>
    <SearchPanel v-if="visible" />
  </main>
</template>
```

不要在 `setTimeout` 或随意的 Promise 回调里才调用这个 composable。异步创建的侦听器不一定绑定当前组件，必须管理返回的停止句柄。生命周期 Hook 同样应在活动组件的同步 setup 上下文调用；本文选择同步创建，避免给使用者隐含的资源责任。

## 组合式函数的实例、输入与输出

每次调用都会执行函数体并创建新的状态与侦听器，因此两个面板通常得到两份查询状态。它们复用的是逻辑定义，不是同一个结果对象。如果希望共享缓存，应明确缓存归属和失效策略，再选择共享层，不能在模块外放一个结果 ref 就认为完成了请求去重。

同步调用的另一个意义是资源所有权清楚。面板挂载时创建同步过程，面板卸载时停止它。某个普通工具函数仅格式化字符串，不需要生命周期；某个连接函数开启订阅，则必须说明由谁关闭。判断是否需要 composable，先看是否需要响应式状态和组件资源边界，而不是函数名字是否带前缀。

输入也可以设计成 getter，允许使用者提供表达式，但那是不同契约，需要在侦听时明确读取，并说明返回类型。本例只接收 ref，不接受普通字符串或任意对象，因此调用方法最容易验证。公开接口越灵活，运行时校验和测试组合越多；一个单次使用的实验没有必要兼容所有可能输入形式。

只读输出让组件无法通过随手赋值更改内部状态，但它不能成为权限或安全机制。应用中的请求参数仍需要编码和校验，服务端仍要验证访问权限。返回一个错误消息也不意味着可以把原始服务端堆栈展示给用户，真实系统应区分可公开提示与受控诊断记录。

## 清理、取消与恢复是三种责任

侦听输入变化时，先清理旧同步过程，再建立新过程。旧任务可能已经在底层完成，取消不一定阻止其后续回调，因此有效性标记仍然需要存在。这个标记属于单轮闭包，不是组件范围共享的一次性开关；新任务不能让已经失效的旧任务重新获得提交资格。

清理应尽量重复调用也不会产生额外破坏。清除已经完成的计时器、取消已取消的控制器通常可以安全处理；删除输出文件、发送撤销请求等操作则有不同副作用，不能照搬同一规则。资源清理的目标是释放本轮拥有的资源，不是随意回滚整个业务状态。

失败后的恢复也需要设计。本例改关键词或点击重试就启动新一轮，加载状态会替换之前错误，成功后显示新结果。旧错误不会在新任务完成之后重新写回。若增加自动重试，应限制次数、取消等待计时器并避免用户已经换输入后仍持续重试；自动恢复不能变成无限请求循环。

保留上一次成功数据是另一种合理展示策略，但必须标注结果尚未对应当前输入。本例选择清空并显示加载，简单且不会混淆。若保留旧结果，应将旧来源与当前关键词分开，用明确的刷新提示表示过期，不能只在角落放一个 spinner 就暗示数据已经最新。

防抖、缓存和取消分别解决频率、重复工作和过期任务，不应混为一个“优化”。缓存键要包括实际影响结果的输入，不能只用一部分关键词；取消某个订阅者也不一定意味着应该取消其他组件正在共享的请求。共享数据层引入之后，资源所有权会从组件扩大到数据层，验证范围也必须相应扩大。

## 验证与排错

在开发服务器中，首次进入应先加载，再显示三门课程。输入 `v` 后迅速补成 `vue`，最终应只显示 Vue 课程，等待更久也不应被旧结果覆盖。输入 `error` 应出现明确错误；改回 `react` 后恢复正常。输入过程中关闭面板，再打开应创建新的独立状态，关键词恢复为空。

点击“重新查询”应重新出现加载状态，完成后恢复结果。两个不同面板若分别调用 composable，状态应独立；只有把 ref 放在模块顶层，才会形成共享实例。分别挂载两个面板，检查输入与结果是否互相影响。

查询不触发时，检查传入的是 ref 而非 `keyword.value` 的字符串副本。状态显示为旧值时，检查返回对象是否包含 ref，以及是否对代理基本属性做了错误解构。关闭后仍提交结果时，检查清理是否在每一轮注册，是否误用 `v-show` 代替卸载。

重复触发多次时，先检查侦听源是否过宽。直接深度侦听巨大对象可能遍历大量无关字段，也不提供可靠的旧对象快照。只侦听需要的 getter 更清楚。不要通过全局屏蔽异常解决取消问题，当前轮次的真实错误仍需要显示或上报。

## 练习与官方来源

练习一：增加防抖，在同一轮清理中取消防抖计时器和已经启动的查询。验收时连续输入应只启动最后一个查询，但最后一个失败时仍显示错误。练习二：给 composable 增加最小关键词长度，短输入直接显示“请输入更多字符”，而不是保持 loading。

练习三：提取一个窗口尺寸 composable，在 `onMounted` 订阅 `resize`，在 `onUnmounted` 移除同一个处理函数。说明为什么浏览器对象不能在服务端渲染时无条件读取，以及为什么调用两次 composable 通常意味着两份资源。

下一篇[组件与表单应用](/tutorials/vue/applications.html)将使用明确的属性和事件协议管理正式业务数据。

- [Vue：组合式函数](https://vuejs.org/guide/reusability/composables.html)
- [Vue：侦听器与副作用清理](https://vuejs.org/guide/essentials/watchers.html)
- [Vue：生命周期 Hook](https://vuejs.org/guide/essentials/lifecycle.html)
- [Vue：响应式核心 API](https://vuejs.org/api/reactivity-core.html)
