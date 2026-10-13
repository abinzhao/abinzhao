---
title: React 组件、状态与身份
description: 理解 props、状态快照、更新队列、渲染提交以及 key 对组件身份的影响。
---

# React 组件、状态与身份

## 学习目标与准备

你将做一个可以编辑、排序和重置的名单，观察状态到底属于哪一个组件。
验收重点不是点击后数字变了，而是能解释批处理、函数式更新，以及排序为何不能乱用数组下标作 key。
需要熟悉函数、数组映射和 TS 类型；使用 Node 22.12+ 的 22.x 或受当前 Vite 支持的 LTS。

新建独立练习项目，后续 React 章节沿用它，每节替换自己的 App，不累积重复入口：

```bash
npm create vite@latest react-lab -- --template react-ts
cd react-lab
npm install
npm run dev
```

保留模板生成的 `index.html`、`tsconfig` 和 Vite 配置；模板 HTML 必须包含 `id="root"`。
以下代码不依赖模板 CSS，替换 `src/main.tsx` 与 `src/App.tsx` 即可。
模板的 `npm run build` 通常包含 TS 项目检查；核对实际脚本，不要把 Vite 本身误当成类型检查器。

## 1. props 是输入，state 是渲染快照

React 调用组件函数，函数根据当前 props 和 state 返回 UI 描述，不是直接命令浏览器怎么改。
props 由父组件传入，不应由子组件修改；子组件通过回调报告用户动作，由状态所有者更新。
state 在一次渲染中是快照。调用 setter 是排队请求下一次状态，不会修改当前事件闭包里的值。
普通局部变量每次执行组件都会重新创建，改变它不会通知 React。

渲染阶段计算下一棵树，提交阶段才更新必要 DOM；调用组件不等于每个节点都重新创建。
渲染必须保持纯粹，因为 React 可以重试或丢弃一次计算；网络请求和 DOM 操作不应放在组件函数主体。
Hook 在组件顶层按固定顺序调用，不能放进条件、循环或普通事件函数。

## 2. 完整名单实验

::: code-group
```tsx [src/main.tsx]
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const root = document.getElementById('root');
if (!root) throw new Error('缺少 #root 挂载节点');
createRoot(root).render(<StrictMode><App /></StrictMode>);
```

```tsx{34-37} [src/App.tsx]
import { useState } from 'react';

type Person = { id: string; name: string };
type RowProps = {
  person: Person;
  onRemove: (id: string) => void;
};
const initialPeople: Person[] = [
  { id: 'p1', name: '林舟' },
  { id: 'p2', name: '许宁' },
];

function PersonRow({ person, onRemove }: RowProps) {
  const [note, setNote] = useState('');
  return (
    <li>
      <label>
        {person.name}的备注
        <input value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      <button type="button" onClick={() => onRemove(person.id)}>删除{person.name}</button>
    </li>
  );
}

export default function App() {
  const [people, setPeople] = useState(initialPeople);
  const [count, setCount] = useState(0);
  const [revision, setRevision] = useState(0);
  const summary = `共 ${people.length} 人，累计增加 ${count} 次`;
  function addTwo() {
    setCount(count + 1);
    setCount(count + 1);
  }
  function addTwoCorrectly() {
    setCount((previous) => previous + 1);
    setCount((previous) => previous + 1);
  }
  function remove(id: string) {
    setPeople((previous) => previous.filter((person) => person.id !== id));
  }
  return (
    <main>
      <h1>名单与状态实验</h1>
      <p role="status">{summary}</p>
      <button type="button" onClick={addTwo}>快照加两次</button>
      <button type="button" onClick={addTwoCorrectly}>队列加两次</button>
      <button type="button" onClick={() => setPeople((previous) => previous.slice().reverse())}>
        反转名单
      </button>
      <button type="button" onClick={() => setRevision((previous) => previous + 1)}>
        重置所有备注
      </button>
      <ul>
        {people.map((person) => (
          <PersonRow
            key={`${person.id}:${revision}`}
            person={person}
            onRemove={remove}
          />
        ))}
      </ul>
    </main>
  );
}
```
:::

`summary` 是已有状态的派生值，直接计算，不要再维护另一份 state 并用 effect 同步。
`slice().reverse()` 先复制再排序；直接 `people.reverse()` 会修改旧快照，破坏状态不可变约定。
更复杂对象更新需要复制从根到变化位置的路径，浅复制不能修复被修改的嵌套对象。

## 3. 为什么两次 setter 有两种结果

从 0 点击“快照加两次”，结果是 1。当前闭包里的 `count` 一直是 0，两次都请求替换为 1。
点击“队列加两次”则增加 2；两个 updater 依次接收队列中的前一个结果，而非同一个旧快照。
React 会批处理很多同一事件中的更新，减少无必要提交；不要用“setter 被调用几次”推断渲染次数。
updater 必须纯粹，不能在里面发请求、记录一次性业务事件或修改外部对象。

开发环境的 StrictMode 可重复调用组件和 updater 来检查纯度，不意味着一次点击应增加四次。
不要依赖精确的开发渲染次数做业务判断；测试最终用户行为，而不是组件调用次数。
当需要依赖前一状态时用函数式更新，不需要依赖时可以直接传目标值。

## 4. key 改变的是身份，不只是警告

React 在同一父节点下结合位置、组件类型和 key 匹配前后两次树中的组件身份。
稳定 key 让备注跟着 `person.id` 走；它只要求在同级唯一，不要求全站唯一。
`key` 不会作为普通 props 传入，所以本例仍显式传入 `person`。

先给林舟输入“学习 React”，点击“反转名单”。备注应仍在林舟行，而不是留在第一行。
临时把 key 换成映射下标，重复实验：输入可能跟着位置走到另一个人身上。
随机 key 每次渲染都变化，会导致反复卸载、重建、丢失输入和焦点，不能用于“消除警告”。
恢复稳定 key 后，点击“重置所有备注”：revision 改变 key，明确要求创建新身份，所以备注清空。

这个重置同时会销毁子树状态和重新建立副作用；只想改某个值时应更新状态，不应随意换 key。
删除后再加入同 ID 行也不会凭空恢复已卸载的局部状态；需持久保留草稿时把状态提升到父组件或存储层。

## 5. 常见失败与修复

| 现象 | 根因与修复 |
| --- | --- |
| setter 后打印还是旧值 | 当前闭包仍持有快照；观察下一次渲染或计算明确的 next 值 |
| 改对象字段页面不更新 | 重用了旧对象引用；创建新对象并调用 setter |
| 输入不可编辑 | 传了 value 却没有 onChange；受控输入必须同步更新 state |
| 排序后备注错位 | 下标 key 描述位置而非实体；换成稳定 ID |
| 父子数据不一致 | 同一事实被存了两份；确定唯一状态所有者，通过 props 和回调协作 |

不要把所有状态都提升到根组件。只被一行使用的临时备注可以留在行内，需要多处共享时再提升。
也不要先给每个组件添加 memo；先测出昂贵渲染，再判断引用稳定性与比较成本是否值得。

## 练习与验收

添加“删除第一人”和“恢复初始名单”两个动作，复用已有 ID，不用随机 key。
验收：反转不串备注；删除正确实体；恢复被删除行时该行备注为空，未删除行备注按稳定身份保留。
再把备注提升为父组件中按 ID 保存的映射，验收删除再恢复后草稿可恢复。
解释这两个版本的状态生命周期为何不同；不要只交一张成功截图。
最后在练习项目运行 `npm run build`，并用浏览器完成上述操作，编译通过不能替代交互验收。

## 官方资料

- [React 状态快照](https://react.dev/learn/state-as-a-snapshot)
- [React 更新队列](https://react.dev/learn/queueing-a-series-of-state-updates)
- [保留与重置状态](https://react.dev/learn/preserving-and-resetting-state)
- [渲染与提交](https://react.dev/learn/render-and-commit)

下一节：[effect 与请求生命周期](./effects-data.md)。
