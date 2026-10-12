---
title: React 状态与副作用：快照、依赖和异步竞态
description: 通过可取消的课程查询理解状态更新、Hook 规则、Effect 清理与过期响应隔离。
type: tutorial
topic: react
section: frameworks
order: 20
level: intermediate
status: published
tags:
  - React
  - 状态
  - Hooks
  - 异步
prerequisites:
  - /tutorials/react/components.html
comments: true
---

# React 状态与副作用：快照、依赖和异步竞态

交互页面中的难题往往不是如何更新一次数字，而是如何保证快速操作、延迟响应与组件卸载之后，界面仍然对应用户当前的意图。本篇用本地课程查询实验串起状态快照、函数式更新、派生数据、Effect 依赖以及请求取消。实验数据由独立模块模拟，不需要远端服务，延迟是刻意设置的教学条件。

适用范围是 React 18+。你应已经理解函数组件和属性，能使用 `async`、`await` 与 Promise。这里不使用较新版本才有的 Effect Event、服务端数据 API 或实验特性；异步边界通过普通 `useEffect`、`AbortController` 与实例级清理实现。

## 前置环境与状态快照

沿用[组件入门](/tutorials/react/components.html)的独立项目，保留 `src/main.jsx`，替换 `src/App.jsx`，新增 `src/searchCourses.js`。如果尚未建立项目，可以独立创建：

```bash
npm create vite@latest react-state-lab -- --template react
cd react-state-lab
npm install
npm install react@18 react-dom@18
npm run dev
```

使用 Node 24，或符合具体工具版本要求的 Node 22。脚手架生成后保留锁文件，不要将工具链主版本差异误判为状态 API 的变化。

每次渲染看到的状态是一份快照。调用 setter 是请求后续渲染，并不会让当前函数里的变量立刻变成新值。如果在同一个点击处理器里连续执行两次 `setCount(count + 1)`，两次计算都可能基于同一个 `count`，并不是累加两次。需要累计时传入 `previous => previous + 1`，让 React 按更新队列处理前一个结果。

对象和数组也遵循快照模型。直接修改旧对象会让先前闭包持有的数据悄悄变化，难以追踪；应该创建新对象或新数组。筛选结果、数量、校验提示通常可以从已有状态计算，不必各存一份状态再用 Effect 同步。减少重复状态，比事后修补同步顺序更可靠。

## Hook 与 Effect 的责任边界

Hook 应在函数组件或自定义 Hook 顶层调用，不放在条件、循环或提前返回之后。React 依赖稳定的调用顺序关联每个状态槽位。条件变化时跳过一次 Hook，会使之后的调用与先前记录错位。条件业务可以放到 Effect 内部，或者拆成明确的子组件，而不是条件性调用 Hook。

事件处理描述“用户做了什么”，Effect 描述“组件现在需要与什么外部系统保持同步”。用户提交付款、发送消息、导出文件属于明确事件，不应仅因为状态变化就自动执行。订阅、定时器、与查询条件同步的请求则适合 Effect。本文把输入状态直接当作查询条件，因此查询会随着它变化。

Effect 依赖数组不是随意选择运行频率的开关，而是同步过程实际读取的响应式输入。遗漏输入会使用旧闭包；每次都新建对象作为依赖又可能频繁重启同步。这里把查询函数放到模块外，只依赖字符串 `query`，让同步边界清楚可见。

清理发生在依赖变化、重新建立同步之前，也发生在卸载时。它不只表示“组件销毁”。在开发 `StrictMode` 下，还可能额外经历一次建立、清理、重新建立，用来检查资源是否配对。订阅要取消、定时器要清除、过期请求要隔离，这些要求不会因为关闭严格模式而消失。

## 第一步：实现支持取消的查询模块

在 `src/searchCourses.js` 写入完整实现。一次查询持有自己的计时器和取消监听；成功完成后也移除监听，避免把已经完成的工作继续挂在信号上。

```js
const courses = [
  { id: 'r1', title: 'React 组件' },
  { id: 'r2', title: 'React 状态' },
  { id: 'v1', title: 'Vue 响应式' },
];

export function searchCourses(query, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('查询已取消', 'AbortError'));
      return;
    }

    const delay = query.length < 2 ? 1200 : 250;
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      const normalized = query.trim().toLowerCase();
      resolve(courses.filter(course =>
        course.title.toLowerCase().includes(normalized),
      ));
    }, delay);

    function onAbort() {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(new DOMException('查询已取消', 'AbortError'));
    }

    signal.addEventListener('abort', onAbort, { once: true });
  });
}
```

较短输入响应更慢，用于制造“先发请求后返回”的条件。真正的 HTTP 请求可以用 `fetch(url, { signal })` 接收同一个信号，并且必须检查 `response.ok`；HTTP 错误状态不会自动成为网络异常。本地模拟不是生产缓存层，也不隐含任何服务端取消保证。

## 第二步：接入完整查询页面

在 `src/App.jsx` 写入以下代码。`result` 将数据、错误和状态放在同一对象中，每次提交的是一致结果。`query` 是用户当前输入，`result.query` 是结果所属的查询，两者不同就表示结果尚未赶上输入。

```jsx
import { useEffect, useState } from 'react';
import { searchCourses } from './searchCourses.js';

export default function App() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState({
    query: '',
    status: 'loading',
    items: [],
    error: '',
  });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function load() {
      setResult({ query, status: 'loading', items: [], error: '' });
      try {
        const items = await searchCourses(query, controller.signal);
        if (active) {
          setResult({ query, status: 'success', items, error: '' });
        }
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        setResult({
          query,
          status: 'error',
          items: [],
          error: error instanceof Error ? error.message : '查询失败',
        });
      }
    }

    load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [query]);

  const pending = result.query !== query || result.status === 'loading';

  return (
    <main>
      <h1>课程查询</h1>
      <label>
        课程名称
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
      </label>
      <section aria-live="polite" aria-busy={pending}>
        {pending ? (
          <p>正在查询……</p>
        ) : result.status === 'error' ? (
          <p role="alert">{result.error}</p>
        ) : result.items.length === 0 ? (
          <p>没有匹配课程，请尝试 React 或 Vue。</p>
        ) : (
          <ul>
            {result.items.map(item => <li key={item.id}>{item.title}</li>)}
          </ul>
        )}
      </section>
    </main>
  );
}
```

取消与隔离不是完全相同的能力。`abort` 请求底层工作尽早停止，但某些异步库不支持信号，某些后续转换也可能已经完成；`active` 保证已经失效的这一轮同步不能再提交结果。每次 Effect 有自己独立的局部变量，不能用一个共享全局标记代替，否则新请求可能重新激活旧请求。

Effect 回调本身不写成 `async`，因为 React 期待它返回清理函数或不返回值，而 `async` 函数返回 Promise。内部声明异步函数并调用它，才能保留同步清理契约。异常也必须在异步函数中处理，避免未处理的 Promise 拒绝。

## 从竞态推导状态设计

可以把一次查询理解为输入版本对应的一项任务。用户输入较短关键词，启动慢查询；随后输入完整关键词，启动快查询。若界面只保存结果数组，慢查询晚到时就可能覆盖快查询。结果携带来源关键词，提交前又检查这一轮是否有效，才能证明数组确实属于当前意图，而不是只证明某个请求成功了。

加载状态也需要同样的归属。常见错误是在每个请求的 `finally` 中无条件设为不加载；旧请求取消之后执行这个分支，会把新请求仍在等待的状态清除。当前例子把状态和结果一次性提交，并拒绝失效轮次的所有更新，避免只隔离数据、却忘记隔离错误和加载标记。

不需要渲染的数据可以用 ref 保存，例如用于第三方实例的句柄，但 ref 更新不会触发重新渲染。如果将页面必须展示的加载状态改成 ref，React 不会因此更新文字。反过来，把每个计时器句柄都放进 state，又会引起没有必要的渲染。选择 state 或 ref 的依据是这个值是否属于可见界面，而不是为了绕过某条依赖警告。

状态越来越多时，可以用 reducer 将事件映射到状态转换，但 reducer 仍必须纯粹，不能在里面启动请求。它适合把加载、成功、失败等合法转换集中起来，不自动取消异步资源，也不改变闭包规则。先画出允许的状态和触发事件，再决定是否需要 reducer；三个独立输入没有必要建立复杂状态机框架。

最后要区分读取与写入。查询被取消通常只影响展示，提交订单却可能已经被服务器接受。客户端只能取消等待，不应承诺已经撤销业务操作。写入流程需要幂等编号、状态查询或明确撤销接口，成功结果也应由可信服务返回；不能把本篇的查询取消直接当作支付取消实现。

## 分步验证与预期现象

启动 `npm run dev` 后，用浏览器执行以下路径，并逐项比较实际结果与预期。

1. 初次打开，先看到加载提示，约一秒后显示三门课程。
2. 输入 `v`，立刻补成 `vue`；后一个查询更快，最终只显示 Vue 课程。
3. 再等待两秒，确认较早的 `v` 请求没有把新结果覆盖。
4. 输入不存在的名称，确认出现空状态，不是空白区域或仍保留上次结果。
5. 在查询期间刷新或切换到不挂载此组件的页面，检查没有未处理取消异常。

可以暂时在开发者工具里为网络请求开启限速，但本地计时器不受网络限速控制。若要验证真实请求，应换成你控制的本地接口，分别模拟超时、非成功状态和非法响应结构，再检查 UI。不要通过随机断网来替代确定的失败场景设计。

## 排错与设计取舍

输入后出现旧结果，先检查结果是否带有来源查询，以及提交前是否检查本轮有效性。仅有 loading 状态不足以证明数据属于当前输入。频繁重复请求时，检查 Effect 是否依赖每次新建的配置对象，或把结果状态也列入依赖导致更新后再次请求。

取消显示成错误提示时，区分用户主动换条件导致的取消与真正失败。这里失效轮次直接退出，当前轮次的其他异常仍被显示。不要把所有异常都忽略，否则解析错误和程序缺陷也会被隐藏。真实服务端还要做输入验证，客户端取消不等于已经撤销服务端写入。

请求很多时，可以增加防抖，但防抖是减少频率，竞态隔离是保证正确性，二者不能相互替代。生产应用还可能需要缓存、重试和共享请求，这时优先评估现有数据层，而不是为单页复制一套越来越复杂的 Effect。性能缓存也不能承担防竞态的责任。

## 练习与官方来源

练习一：加入“重新查询”按钮，用一个重试计数作为额外同步输入，确保查询字符串不变也能重试。练习二：在查询模块为输入 `error` 明确抛出教学错误，检查错误提示与之后的恢复查询。练习三：加入 300 毫秒防抖，清理时同时取消计时器和已经开始的查询。

每个练习都应回答：谁拥有资源、何时失效、旧结果是否还能提交。下一篇[表单与路由应用](/tutorials/react/applications.html)会把这些规则放进完整页面流程。

- [React：状态是一份快照](https://react.dev/learn/state-as-a-snapshot)
- [React：将一系列状态更新加入队列](https://react.dev/learn/queueing-a-series-of-state-updates)
- [React：可能不需要 Effect](https://react.dev/learn/you-might-not-need-an-effect)
- [React：useEffect 与数据请求清理](https://react.dev/reference/react/useEffect)
- [React：Hook 规则](https://react.dev/reference/rules/rules-of-hooks)
