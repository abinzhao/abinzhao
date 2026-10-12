---
title: React 函数组件：从 JSX 到可复用的交互列表
description: 用一个可运行的课程列表理解函数组件、属性、渲染、事件与稳定的列表身份。
type: tutorial
topic: react
section: frameworks
order: 10
level: beginner
status: published
tags:
  - React
  - 组件
  - JSX
prerequisites: []
comments: true
---

# React 函数组件：从 JSX 到可复用的交互列表

React 组件不是一段只执行一次的模板，而是根据输入描述界面的函数。本篇把一个课程列表拆成几个函数组件，再加入筛选和收藏。重点不在于背诵语法，而在于建立可以解释界面变化的工作模型：数据从哪里来，谁可以修改它，重新渲染之后为什么某些内容保留、某些内容变化。

教程主要适用于 React 18 及以上版本，只使用函数组件、属性、事件和稳定的状态 API。你需要认识 JavaScript 数组、对象、解构、箭头函数和模块导入，也需要能阅读基本 HTML。若这些语法还不熟，先逐行解释示例中的普通 JavaScript，再处理 JSX；不要把所有困惑都归因于框架。

## 前置准备与独立实验目录

准备现代浏览器和 Node 24，或者满足所选 Vite 要求的 Node 22。当前 Vite 文档列出 Node 22.12+ 等最低要求，模板还可能提出更高要求；安装时出现引擎警告应核对具体依赖。所有命令都在一个新的学习目录执行，不要直接覆盖已有业务项目。

```bash
node --version
npm --version
npm create vite@latest react-course-lab -- --template react
cd react-course-lab
npm install
npm install react@18 react-dom@18
npm run dev
```

这里显式使用 React 18，方便观察跨版本通用的行为；React 与 React DOM 应保持匹配的主版本。生成工具和开发依赖会随时间变化，创建完成后保留生成的锁文件，后续安装使用它复现环境。普通 React 模板即可，本篇不依赖 React Compiler、服务端组件或实验 API。

保留模板的 `index.html` 与 Vite 配置。下面会完整替换 `src/main.jsx` 和 `src/App.jsx`。入口不再导入模板样式，因此原有演示 CSS 不影响观察。终端输出的本地地址才是实际访问地址，端口被占用时不要机械假定它一定为 5173。

## 组件、属性与渲染到底是什么

函数组件名称以大写字母开头，接收属性对象，返回 JSX。小写标签代表浏览器元素，大写标签代表组件。JSX 中的花括号用于嵌入 JavaScript 表达式，不是任意语句区域；循环通常先用 `map` 得到一个元素数组，分支则使用条件表达式或在函数中提前返回。

属性是父组件给子组件的输入，不是子组件拥有的数据副本。子组件不应直接修改属性对象或其中的数组。需要改变数据时，子组件通过回调表达意图，由数据拥有者执行更新。这样能沿着组件树找到每次变化的来源，而不是依靠不同位置偷偷修改同一个对象。

React 的渲染过程可以分成触发、计算和提交。状态更新触发计算，组件函数描述下一份界面，React 再把必要变化提交到 DOM。组件被重新调用不等于整页 DOM 都被销毁，也不意味着浏览器必须立即完成绘制。理解这一区别，才能判断性能问题来自 JavaScript 计算、DOM 更新还是浏览器布局。

渲染必须保持纯粹：相同的属性和状态应产生相同的描述，不在函数体内发请求、写存储或修改外部数组。开发模式可能重复调用组件，未来的渲染也可能被中断或舍弃。如果渲染带有外部副作用，尚未显示的计算就可能已经产生不可撤销的变化。

## 分步实现课程列表

第一步，在 `src/main.jsx` 写入完整入口。`createRoot` 是 React 18 的客户端入口；`StrictMode` 帮助暴露不纯的渲染和缺少清理的副作用，并不是生产环境重复提交用户操作的开关。

```jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

第二步，在 `src/App.jsx` 写入以下内容。列表数据在组件外定义，意味着它不会在每次渲染中重新创建；交互状态则属于 `App` 实例。这里的数据只是学习用课程，不涉及真实账号和远端接口。

```jsx
import { useState } from 'react';

const courses = [
  { id: 'components', title: '组件与属性', category: '基础' },
  { id: 'state', title: '状态与副作用', category: '进阶' },
  { id: 'app', title: '表单应用', category: '进阶' },
];

function Panel({ title, children }) {
  return (
    <section aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function CourseRow({ course, saved, onToggle }) {
  return (
    <li>
      <strong>{course.title}</strong>：{course.category}{' '}
      <button
        type="button"
        aria-pressed={saved}
        onClick={() => onToggle(course.id)}
      >
        {saved ? '取消收藏' : '收藏'}
      </button>
    </li>
  );
}

export default function App() {
  const [category, setCategory] = useState('全部');
  const [savedIds, setSavedIds] = useState([]);
  const visibleCourses = courses.filter(
    course => category === '全部' || course.category === category,
  );

  function toggleSaved(id) {
    setSavedIds(previous =>
      previous.includes(id)
        ? previous.filter(savedId => savedId !== id)
        : [...previous, id],
    );
  }

  return (
    <main>
      <h1>课程收藏夹</h1>
      <label>
        分类
        <select
          value={category}
          onChange={event => setCategory(event.target.value)}
        >
          <option>全部</option>
          <option>基础</option>
          <option>进阶</option>
        </select>
      </label>
      <p>已收藏 {savedIds.length} 门课程</p>
      <Panel title="课程列表">
        {visibleCourses.length === 0 ? (
          <p>当前分类没有课程。</p>
        ) : (
          <ul>
            {visibleCourses.map(course => (
              <CourseRow
                key={course.id}
                course={course}
                saved={savedIds.includes(course.id)}
                onToggle={toggleSaved}
              />
            ))}
          </ul>
        )}
      </Panel>
    </main>
  );
}
```

第三步，阅读数据流而不是急着加样式。`Panel` 不理解课程业务，只负责标题和内容位置；`children` 是父组件放在标签之间的内容。`CourseRow` 负责展示一门课程，通过 `onToggle` 通知父组件。`App` 拥有收藏状态，因为总数与每一行都要使用它，这个位置是它们最近的共同祖先。

第四步，注意事件处理器传递的是函数。若在 JSX 中直接调用 `toggleSaved(course.id)`，更新会发生在渲染期间，可能形成重复渲染。箭头函数把调用推迟到点击发生时。函数式更新中的 `previous` 则由 React 提供，避免连续操作依赖一份过时的闭包状态。

## 列表身份与组件边界

`key` 用于区分同一父节点下的兄弟元素，应该来自数据的稳定身份。它不必在整个应用全局唯一，但不能随着筛选、排序或渲染次数改变。数组下标表示当前位置；删除第一行后，下标会对应另一门课程，行内的局部状态和 DOM 可能被错误复用。

不要在渲染时用随机数生成 `key`。这样每次更新都会把旧组件替换为新组件，可能造成输入失焦、局部状态重置和不必要的挂载。`key` 也不会作为普通属性传入子组件；如果子组件需要编号，像示例一样通过 `course.id` 或独立的 `id` 属性传递。

组件拆分应对应明确责任，而不是每个标签都独立成文件。只有一处简单文字不需要通用抽象；拥有重复结构、独立交互或可解释输入输出的部分更适合拆分。也不要在 `App` 函数内部定义有状态的子组件，那会在父组件重新渲染时创建新的组件类型，影响状态保留。

## 从一次点击追踪完整数据流

以收藏第二门课程为例，浏览器先触发按钮处理器，行组件把课程编号交给父级回调。父级根据上一个编号集合产生新集合，请求下一次渲染。重新计算时，收藏总数和各行的 `saved` 输入都来自同一个集合，因此不会出现总数已经变化、按钮仍使用另一份数据的同步矛盾。

如果把每行是否收藏单独存进子组件，而总数又存在父级，就必须额外设计双向同步。隐藏再显示行时，子组件可能重新挂载并回到初始值，总数却仍保留。当前模型将真正的收藏事实放在共同祖先，子组件只接收展示输入，避免这种重复状态。只有不影响其他区域的临时交互，例如行内展开提示，才更适合放在行组件里。

调试时可以按输入、意图、更新、展示四个位置逐步检查，不必在每个标签旁增加日志。先核对点击传来的编号，再核对新集合包含哪些编号，最后检查过滤条件与子组件输入。如果同一数据事实在多个位置都有 setter，应重新确认谁才是所有者；组件复用不意味着每个组件都应该维护自己的业务副本。

还要区分属性传递与安全授权。隐藏某个按钮或不给子组件某个回调，只影响当前界面，不构成真实权限控制。课程收藏例子没有受保护资源；若以后改成删除服务器课程，服务端必须验证身份与权限，不能因为按钮只有管理员能看见就假定请求安全。

## 验证与预期结果

保持开发服务器运行，打开终端给出的地址，按以下步骤检查实际交互。

1. 首次进入应显示三门课程，收藏总数为零，分类为“全部”。
2. 收藏“组件与属性”，总数应变为一，对应按钮变为“取消收藏”。
3. 切换到“进阶”，基础课程应隐藏，总数仍为一，因为收藏不依赖当前筛选结果。
4. 切回“全部”，原课程仍显示为已收藏；取消后总数归零。
5. 使用键盘 Tab 到分类与按钮，按方向键或空格完成同样操作，检查焦点没有意外丢失。

再打开控制台，检查是否存在列表 `key` 警告、无限更新错误或模块加载失败。开发模式中的额外渲染日志不能直接当作生产性能结论。需要观察性能时，应使用生产构建和 React 开发者工具，再定位具体耗时，而不是凭调用次数加入缓存。

## 常见问题与排错顺序

页面空白时，先看终端是否成功启动，再看浏览器控制台的第一个错误。核对 `main.jsx` 的导入大小写、文件扩展名，以及 `index.html` 中根节点的 `id`。组件名称以小写开头可能被当作未知 HTML 元素；JSX 标签未闭合则会在编译阶段报错。

点击立即无限更新，通常是把处理器调用写在 JSX 里。收藏数据变化但页面不变，通常是直接 `push` 原数组后把相同引用交回状态。示例用展开和 `filter` 产生新数组，并保留旧状态快照，这不是形式要求，而是保证更新可被解释的关键。

列表中的输入内容错位时，优先排查身份而非增加 Effect。筛选后的下标、重复编号和随机 `key` 都会改变复用关系。另一方面，隐藏行并不会删除 `App` 中的收藏数据；如果预期切换分类清空收藏，应把这个业务规则放进明确的事件处理，而不是依赖组件偶然卸载。

## 练习与官方来源

练习一：增加“仅看收藏”选项，仍然从 `courses` 与 `savedIds` 推导展示列表，不另存一份筛选结果。验收时先收藏两门、切换分类、取消一门，确认计数与实际收藏一致。

练习二：增加“清空收藏”按钮，收藏为空时禁用。练习三：新增一门课程并放到列表最前面，验证原收藏不会转移到新课程。完成后解释为什么这三项需求不需要网络请求，也不需要 `useEffect`。

下一篇继续学习[状态与副作用](/tutorials/react/state.html)，将渲染快照扩展到异步请求与清理边界。

- [React：你的第一个组件](https://react.dev/learn/your-first-component)
- [React：向组件传递属性](https://react.dev/learn/passing-props-to-a-component)
- [React：渲染与提交](https://react.dev/learn/render-and-commit)
- [React：渲染列表](https://react.dev/learn/rendering-lists)
- [Vite：开始使用](https://vite.dev/guide/)
