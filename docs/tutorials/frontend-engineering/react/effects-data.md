---
title: React effect 与请求生命周期
description: 用依赖、cleanup、AbortController 和提交守卫处理请求竞态与卸载。
---

# React effect 与请求生命周期

## 学习目标与前置

本节做一个本地目录请求器：选择文件、显示加载与错误、重试、快速切换、卸载。
你要证明“最后完成的请求”不一定是“当前需要的请求”，并保证旧请求不会覆盖新页面。
沿用[组件章节](./components-state.md)创建的 `react-lab`，无需新依赖。

## 1. effect 是同步外部系统，不是通用计算器

组件渲染根据状态计算 UI；effect 在提交后让网络、订阅、定时器等外部系统与本次状态对齐。
依赖变化时，先执行旧 effect 的 cleanup，再用新依赖 setup；卸载也会 cleanup。
React 用 `Object.is` 比较依赖项；每次新建对象或函数可能使依赖一直变化。
依赖是 effect 实际读取的响应式值，不是“希望执行几次”的开关。

不写数组会在每次提交后运行；空数组表示不读取变化的响应式值，不代表绝对只运行一次。
开发 StrictMode 会额外 setup → cleanup → setup，用来暴露没清理的订阅和请求。
effect 不在服务端渲染中执行；本例是浏览器端教学，不提供 SSR 数据预加载。

## 2. 先建立可重复的数据边界

在 `react-lab/public` 新建以下文件，替换 `src/App.tsx` 与 `src/main.tsx`。
Vite 将 public 文件按原路径提供，本例请求同源 JSON，不依赖外部 API 或 CORS。
“缺失目录”故意没有文件，用来验证非 2xx 响应路径。

::: code-group
```json [public/catalog-a.json]
[
  { "id": 1, "title": "状态快照" },
  { "id": 2, "title": "更新队列" }
]
```

```json [public/catalog-b.json]
[
  { "id": 3, "title": "副作用清理" },
  { "id": 4, "title": "请求竞态" }
]
```

```tsx [src/main.tsx]
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const root = document.getElementById('root');
if (!root) throw new Error('缺少 #root');
createRoot(root).render(<StrictMode><App /></StrictMode>);
```

```tsx{48-51} [src/App.tsx]
import { useEffect, useState } from 'react';

type Item = { id: number; title: string };
type State =
  | { status: 'loading' }
  | { status: 'success'; items: Item[] }
  | { status: 'error'; message: string };
function parseItems(value: unknown): Item[] {
  if (!Array.isArray(value)) throw new Error('目录必须是数组');
  const ids = new Set<number>();
  return value.map((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null ||
      !('id' in entry) || !('title' in entry) ||
      typeof entry.id !== 'number' || !Number.isSafeInteger(entry.id) ||
      entry.id < 1 || ids.has(entry.id) || typeof entry.title !== 'string' ||
      entry.title.trim().length === 0) throw new Error('目录字段或 ID 不合法');
    ids.add(entry.id);
    return { id: entry.id, title: entry.title };
  });
}

function Catalog({ file }: { file: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ status: 'loading' });
    async function load() {
      try {
        const response = await fetch(file, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const raw: unknown = await response.json();
        const items = parseItems(raw);
        if (active) setState({ status: 'success', items });
      } catch (error: unknown) {
        if (!active || controller.signal.aborted) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : '请求失败',
        });
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [file, attempt]);
  return (
    <section aria-label="目录结果">
      {state.status === 'loading' && <p role="status">正在读取目录</p>}
      {state.status === 'error' && (
        <div role="alert">
          <p>{state.message}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>重试</button>
        </div>
      )}
      {state.status === 'success' && (
        <ul>{state.items.map((item) => <li key={item.id}>{item.title}</li>)}</ul>
      )}
    </section>
  );
}

export default function App() {
  const [file, setFile] = useState('/catalog-a.json');
  const [visible, setVisible] = useState(true);
  return (
    <main>
      <h1>目录请求实验</h1>
      <label>
        选择目录
        <select value={file} onChange={(event) => setFile(event.target.value)}>
          <option value="/catalog-a.json">目录 A</option>
          <option value="/catalog-b.json">目录 B</option>
          <option value="/catalog-missing.json">缺失目录</option>
        </select>
      </label>
      <button type="button" onClick={() => setVisible((value) => !value)}>
        {visible ? '隐藏目录' : '显示目录'}
      </button>
      {visible && <Catalog key={file} file={file} />}
    </main>
  );
}
```
:::

## 3. 取消资源与禁止旧结果提交是两件事

AbortController 请求浏览器取消 fetch 以及尚未完成的响应体读取，减少无用工作。
它不能撤销已到达服务器的业务写入，也不能自动取消任意 Promise 或第三方 SDK。
`active` 是提交守卫：即使异步流程不能取消、或已进入后续处理，cleanup 后也不能再写状态。
两者结合分别管理资源和结果所有权；不能只根据“有没有报卸载警告”判断正确性。

不能把 effect 回调直接声明为 async，因为 async 返回 Promise，而 React 需要 cleanup 函数或 undefined。
本例在 setup 中定义并启动异步函数，同步返回 cleanup，因此卸载不需要等网络完成。
`response.ok` 与 JSON 字段校验缺一不可：fetch 遇到 HTTP 404 不一定 reject，200 也可能返回错误结构。

这里的 `key={file}` 让切换文件立即重建结果组件，不会短暂显示旧目录；旧实例卸载时仍须取消请求。
移除 key 后实例可以复用，但需要给结果状态记录来源并在渲染时隐藏来源不匹配的旧结果。
教学例保留明确的重置边界；真实列表可能选择保留旧结果、显示刷新提示，需按交互要求决定。

## 4. 操作验证与失败修复

运行 `npm run dev`，A 应显示“状态快照”，B 应显示“副作用清理”。
在 Network 禁用缓存、开启慢速限流，快速 A → B → A，最终只显示最后选择的 A。
检查被替换请求是否标记取消；开发 StrictMode 的第一次取消属于正常清理验证。
请求未结束时点“隐藏目录”，等待后重新显示，不能闪出卸载前的旧结果。
选择缺失目录，应看到错误且有重试按钮；Vite 可能返回 404 或 HTML 回退，后者会触发 JSON 解析错误。

| 现象 | 修复方向 |
| --- | --- |
| 切换后显示旧响应 | 缺 cleanup/提交守卫；不要按响应完成顺序写全局状态 |
| 请求无限循环 | effect 依赖每次新建的对象；移到 effect 内或依赖稳定原始值 |
| loading 被旧 finally 清除 | finally 也需检查本次请求是否仍 active |
| 首次开发请求被取消 | StrictMode 在压力检查；修复清理，不关闭模式掩盖问题 |

多个页面共享查询、缓存、去重、SSR 或并行加载时，手写 effect 会重复复杂逻辑。
可选框架加载器或查询库，但本节不增加依赖；先理解其要管理的生命周期和缓存失效问题。

## 练习与验收

把目录 B 的 title 改成数字，验收页面显示结构错误且不渲染非法条目；修复文件后重试恢复。
再加入“自动刷新”定时器，独立 effect 注册并在 cleanup `clearInterval`，不要在渲染中注册。
验收：切换与隐藏后不遗留刷新任务；快速选择只提交最后结果；错误可恢复；类型检查无误。

## 官方资料

- [React useEffect](https://react.dev/reference/react/useEffect)
- [React effect 生命周期](https://react.dev/learn/lifecycle-of-reactive-effects)
- [MDN AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
- [MDN Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)

下一节：[受控表单与 URL 路由](./forms-routing.md)。
