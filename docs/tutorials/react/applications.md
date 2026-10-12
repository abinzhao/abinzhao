---
title: React 应用实践：任务表单、路由懒加载与性能边界
description: 构建一个本地任务应用，串联受控表单、跨页状态、延迟加载、异常恢复和性能判断。
type: tutorial
topic: react
section: frameworks
order: 30
level: advanced
status: published
tags:
  - React
  - 表单
  - 路由
  - 性能
prerequisites:
  - /tutorials/react/state.html
comments: true
---

# React 应用实践：任务表单、路由懒加载与性能边界

一个应用是否完整，不取决于组件数量，而取决于用户能否从输入走到结果，并在错误之后继续操作。本篇建立一个本地任务应用：填写名称与预计用时，新增任务，切换到统计页，再回到列表删除任务。数据仅存在当前浏览器页面内存中，刷新会清空；这是明确的学习边界，不是可靠的持久化方案。

示例使用 React 18+ 与 React Router 6 的稳定客户端 API。主要组件全部采用函数形式，只有错误边界使用 React 官方目前支持的类组件接口。不引入实验 API，也不把 Suspense 当成任意异步函数的自动加载管理器。你需要先理解[状态与副作用](/tutorials/react/state.html)中的状态快照和竞态问题。

## 前置环境与路由选择

在独立目录创建项目，使用 Node 24，或满足当前 Vite 要求的 Node 22。React、React DOM 与路由库的主版本要明确，不要照搬其他主版本的配置示例。

```bash
npm create vite@latest react-task-lab -- --template react
cd react-task-lab
npm install
npm install react@18 react-dom@18 react-router-dom@6
npm run dev
```

本篇选用 `HashRouter`，因为它把客户端路径放在 URL 的片段部分，静态服务器收到的仍是入口文件路径。它适合不方便配置回退规则的学习站点，但不代表所有生产应用都应使用哈希路由。若改成 `BrowserRouter`，必须同时考虑服务端深层路径回退和部署目录下的 `basename`。

把 `src/main.jsx` 替换为下面的入口，不导入模板演示样式。根路由组件不会因为页面切换而卸载，因此它持有的任务数据可以跨页使用。

```jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
```

## 先设计状态和表单契约

任务记录包含稳定编号、名称和分钟数。任务集合由 `App` 持有，表单的草稿与校验错误由表单组件持有。这样列表和统计页共享正式数据，输入过程不会每次按键都改变任务集合。表单离开页面后会卸载，因此未提交的草稿会丢失；如果业务要求保留草稿，应明确提升草稿状态或持久化，而不是指望路由偶然保留 DOM。

受控输入的 `value` 始终来自状态，`onChange` 将用户输入写回状态。数字输入编辑过程中可能暂时为空，所以草稿先用字符串保存，提交时再转换为数值。过早把空字符串转成零，会让用户难以清空输入，也会掩盖“没有填写”与“填写零”的区别。

校验分成输入规范和业务规则。名称去除前后空白之后长度必须在二到四十之间，用时必须是一个到四百八十之间的整数。同名任务本篇允许存在，因为名称不是身份。客户端校验用于改善反馈；接入真实接口后，服务端仍应重新校验并生成可信记录编号。

## 第一步：实现任务页和懒加载边界

将 `src/App.jsx` 替换为以下完整内容。React 的 `lazy` 在模块顶层声明，首次渲染统计页时才调用动态导入。错误边界是必要的例外：函数组件本身不能直接实现 `getDerivedStateFromError`。

```jsx
import { Component, lazy, Suspense, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';

const Summary = lazy(() => import('./Summary.jsx'));

class PageBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <section role="alert">
          <p>页面模块加载或渲染失败，请检查连接后重载。</p>
          <button type="button" onClick={() => window.location.reload()}>
            重载应用（会清空本地任务）
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}

function TaskForm({ onAdd }) {
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState('25');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function submit(event) {
    event.preventDefault();
    setMessage('');
    const normalizedTitle = title.trim();
    const duration = Number(minutes);
    if (normalizedTitle.length < 2 || normalizedTitle.length > 40) {
      setError('名称需要二到四十个字符。');
      return;
    }
    if (!Number.isInteger(duration) || duration < 1 || duration > 480) {
      setError('预计用时需要一到四百八十之间的整数。');
      return;
    }
    onAdd({ title: normalizedTitle, minutes: duration });
    setTitle('');
    setMinutes('25');
    setError('');
    setMessage('任务已添加。');
  }

  return (
    <form onSubmit={submit} noValidate>
      <label>
        任务名称
        <input value={title} onChange={event => setTitle(event.target.value)} />
      </label>
      <label>
        预计分钟数
        <input
          type="number"
          value={minutes}
          onChange={event => setMinutes(event.target.value)}
        />
      </label>
      <button type="submit">添加任务</button>
      {error && <p role="alert">{error}</p>}
      <p role="status">{message}</p>
    </form>
  );
}

export default function App() {
  const [tasks, setTasks] = useState([]);

  function addTask(draft) {
    const task = { ...draft, id: crypto.randomUUID() };
    setTasks(previous => [...previous, task]);
  }

  function removeTask(id) {
    setTasks(previous => previous.filter(task => task.id !== id));
  }

  return (
    <main>
      <h1>本地任务工作台</h1>
      <nav aria-label="主要页面">
        <NavLink to="/">任务</NavLink>{' '}
        <NavLink to="/summary">统计</NavLink>
      </nav>
      <PageBoundary>
        <Suspense fallback={<p role="status">正在加载页面模块……</p>}>
          <Routes>
            <Route path="/" element={
              <section>
                <h2>添加与管理</h2>
                <TaskForm onAdd={addTask} />
                {tasks.length === 0 ? <p>还没有任务。</p> : (
                  <ul>
                    {tasks.map(task => (
                      <li key={task.id}>
                        {task.title}：{task.minutes} 分钟{' '}
                        <button type="button" onClick={() => removeTask(task.id)}>
                          删除 {task.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            } />
            <Route path="/summary" element={<Summary tasks={tasks} />} />
            <Route path="*" element={<p>页面不存在，请返回任务页。</p>} />
          </Routes>
        </Suspense>
      </PageBoundary>
    </main>
  );
}
```

编号在添加事件中生成，而不是在渲染列表时生成；稳定身份才能让 React 正确复用条目。`crypto.randomUUID` 需要现代浏览器与安全上下文，本地 localhost 通常满足，正式站点应使用 HTTPS。它只是本地标识，不能代替服务端授权和唯一性约束。

## 第二步：完成统计页

新增 `src/Summary.jsx`。必须导出默认组件，因为当前 `lazy` 导入需要模块的默认导出。统计完全由任务集合推导，没有必要建立额外状态并使用 Effect 同步。

```jsx
export default function Summary({ tasks }) {
  const total = tasks.reduce((sum, task) => sum + task.minutes, 0);
  const average = tasks.length === 0 ? 0 : Math.round(total / tasks.length);

  return (
    <section>
      <h2>任务统计</h2>
      <dl>
        <dt>任务数量</dt><dd>{tasks.length}</dd>
        <dt>总预计用时</dt><dd>{total} 分钟</dd>
        <dt>平均预计用时</dt><dd>{average} 分钟</dd>
      </dl>
      <p>统计仅包含当前页面会话的数据，刷新不会保留。</p>
    </section>
  );
}
```

动态导入提供模块分包机会，Suspense 提供等待该模块时的反馈，错误边界提供导入拒绝或子树渲染异常后的替代界面。三者分别解决大小、等待和失败，不能互相替代。普通点击处理器抛错、定时器异常和 `fetch` Promise 拒绝不自动被这个边界捕获，必须在对应异步流程中处理。

这里重载明确提示数据丢失，因为浏览器可能缓存失败的动态模块，简单重复渲染并不保证重新下载。如果做生产应用，应设计版本更新提示与数据恢复策略，而不是把所有错误都归为网络问题。错误边界本身抛出的错误还需要更外层边界处理。

## 从本地表单扩展到可靠业务流程

当前添加任务是同步内存操作，所以成功后立即清空草稿是可解释的。接入接口后，点击提交只是开始请求，不能马上显示已经保存。至少需要区分未提交、提交中、提交失败和提交成功；失败时保留用户唯一的输入，提供重试入口，避免让用户重新填写所有字段。

客户端禁用提交按钮可以减少重复点击，但不能完整保证服务端不会收到重复请求。网络重试、页面恢复和多个标签页都可能重复操作。正式接口应定义幂等键或业务去重规则，并区分请求失败与结果未知：连接断开不代表服务端未执行，直接重新创建可能产生重复记录。

错误边界只保护可见子树的渲染，不负责业务校验。名称太短应该反馈在字段旁，而不是抛出渲染错误让整个页面重载。接口失败应该反馈在提交区域，保留其他页面能力。只有无法正常渲染或模块加载失败时才进入当前替代界面，这样错误的恢复成本与实际范围匹配。

路由状态也需要有清楚的保存规则。统计页和任务页共享正式任务，但表单草稿离开即丢弃。如果需要从统计返回时继续编辑，可以提升草稿到稳定父级，或保存独立草稿记录；不要为了保留状态把整个应用所有页面一直隐藏挂载。那可能保留不必要的订阅、请求和大量 DOM。

测试应用时，既要检查按钮是否执行，也要检查执行之后用户还能否继续。删除最后一条应出现空状态，随后还能新增；非法输入修改正确后应恢复；访问未知路由能返回任务页；统计模块失败后重载明确提醒丢失本地数据。恢复路径往往比单次成功路径更能暴露状态设计缺陷。

如果后续增加本地存储，应考虑版本迁移、非法内容和多标签页变化，读取时验证结构，不能把解析得到的任意对象当成可信任务。浏览器存储也不适合保存服务端秘密。持久化是新增的业务契约，需要新的完成标准，不是随便加一个 Effect 就能完成的增强。

## 验证、构建和性能判断

先在开发地址完成表单路径：输入一个字符应出现错误；输入“阅读文档”和二十五分钟后应新增一条并清空名称；添加另一个五十分钟任务后统计应显示两条、总计七十五分钟、平均三十八分钟。返回任务页删除一条，再次查看统计应立即反映新集合。

然后在独立实验项目执行生产构建与预览：

```bash
npm run build
npm run preview
```

打开预览地址，在浏览器网络面板查看首次进入统计页时是否请求独立模块。开发服务器按模块提供文件，不能据此推断最终生产分包大小。测试时关闭缓存后重载，区分首次加载与再次访问已经缓存的模块。

性能优化先定位边界。输入状态留在表单中，按键不会无条件重新计算父级任务统计，这是结构上的收益。三条任务的 `reduce` 很便宜，直接增加 `useMemo` 往往没有价值；缓存只适合经过测量的昂贵计算或引用稳定性需求。`memo` 也不能阻止组件自身状态和所消费上下文的变化。

列表达到几万条时，可能要解决 DOM 数量、分页或虚拟列表，而不是只缓存一个函数。路由懒加载缩小首屏 JavaScript，但用户进入新页可能多等待一次网络请求，应根据访问频率决定预加载策略。性能缓存可以被丢弃，不能被用来存储必须持久保留的业务数据。

## 排错、练习与官方来源

提交导致整页刷新，检查 `preventDefault` 是否在表单提交处理器中执行。输入从受控变成非受控，检查状态是否意外设为 `undefined`。统计页加载失败，检查文件名大小写和默认导出，部署后还要检查旧 HTML 是否引用了已被清理的资源。

路由切换数据消失，先确认数据是否放进会卸载的页面组件。直接刷新后消失则符合本篇内存边界，不能通过添加一个无关 Effect 解决。哈希地址正常但改用历史路由后深层地址 404，则是服务器回退配置与客户端路由的共同问题。

练习一：增加编辑任务功能，保留原编号并更新对应对象。练习二：为删除增加明确的撤销入口，用一次删除记录保存恢复所需数据。练习三：接入你控制的本地接口，增加提交中、失败与重试状态，并说明重复提交和组件卸载时的处理策略。

- [React：输入组件与受控表单](https://react.dev/reference/react-dom/components/input)
- [React：状态保留与重置](https://react.dev/learn/preserving-and-resetting-state)
- [React：lazy](https://react.dev/reference/react/lazy)
- [React：Suspense](https://react.dev/reference/react/Suspense)
- [React：错误边界接口](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)
- [React：memo 的使用边界](https://react.dev/reference/react/memo)
- [React Router：HashRouter](https://reactrouter.com/6.30.1/router-components/hash-router)
