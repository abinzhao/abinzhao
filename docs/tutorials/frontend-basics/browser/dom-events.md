---
title: 浏览器：DOM 生命周期与事件
description: 实现安全的表单列表应用，理解脚本加载、事件传播与委托。
---

# 浏览器：DOM 生命周期与事件

## 学习目标

- 确定脚本何时可以安全查询节点。
- 用事件委托处理动态新增的列表项。
- 用 `textContent` 渲染不可信输入，避免把文本当成 HTML 执行。

前置：[HTML 表单](../html/forms-media.md)、[JavaScript 基础](../javascript/fundamentals.md)。
本章先在内存中完成交互闭环，下一章再讨论保存数据。

## 为什么查询节点有时得到 null

HTML 是逐步解析的；脚本执行时，后面的节点可能尚未创建。
普通无 async/defer 的外部经典脚本通常阻塞解析，等下载与执行后继续。
带 `defer` 的外部经典脚本并行下载，解析完成后按文档顺序执行。
模块脚本默认具有类似延后执行的行为；`async` 则下载完成即执行，不保证顺序。

DOMContentLoaded 在 HTML 解析完成及相关 deferred/module 脚本执行后触发。
它不需要等待所有图片完成；`load` 会等待更多资源。
动态加载脚本可能错过 DOMContentLoaded，因此通用初始化应检查 readyState。
本例外部脚本固定用 defer，可以直接初始化，不需要重复包一层监听。

## 事件如何找到处理者

事件先经过捕获阶段到达目标，再在可冒泡事件中向祖先传播。
`event.target` 是本次事件目标，`event.currentTarget` 是当前监听所在元素。
委托只在共同祖先上绑定监听，再根据目标找到对应操作。
新列表项无需重新绑定，自然减少重复监听与清理成本。

`preventDefault()` 取消默认行为，例如表单导航，不等于阻止冒泡。
`stopPropagation()` 阻止进一步传播，不等于取消默认行为。
不是所有事件都会冒泡：例如 focus 可改用 focusin 或捕获监听。
Shadow DOM 的目标重定向是进一步边界，本章普通 DOM 不涉及它。

## 运行步骤

1. 创建 `dom-events/index.html` 和 `dom-events/main.js`。
2. 启动练习服务器，打开 `/dom-events/`。
3. 使用鼠标与键盘添加、完成和删除事项。
4. 刷新后清空属于预期，因为这一章没有持久化。

## 完整表单列表应用

::: code-group

```html [index.html]
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>DOM 事项列表</title>
  <style>
    body { font-family: sans-serif; max-width: 44rem; margin: 2rem auto; padding: 1rem; }
    input, button { font: inherit; padding: .6rem; }
    li { margin-block: .75rem; display: flex; gap: .75rem; align-items: center; }
    li span { flex: 1; overflow-wrap: anywhere; }
    li[data-done="true"] span { text-decoration: line-through; }
    :focus-visible { outline: 3px solid #2459b2; outline-offset: 3px; }
  </style>
</head>
<body>
  <main>
    <h1>DOM 事项列表</h1>
    <form id="task-form">
      <label for="title">事项（1 到 80 个字符）</label>
      <input id="title" name="title" required maxlength="80" autocomplete="off">
      <button type="submit">添加</button>
    </form>
    <p id="status" role="status">还没有事项。</p>
    <ul id="tasks" aria-label="事项"></ul>
  </main>
  <script src="./main.js" defer></script>
</body>
</html>
```

```js [main.js]
'use strict';
const form = document.querySelector('#task-form');
const titleInput = document.querySelector('#title');
const list = document.querySelector('#tasks');
const status = document.querySelector('#status');
let tasks = [];
let nextId = 1;

function render() {
  const fragment = document.createDocumentFragment();
  for (const task of tasks) {
    const item = document.createElement('li');
    item.dataset.id = String(task.id);
    item.dataset.done = String(task.done);
    const text = document.createElement('span');
    text.textContent = task.title;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.dataset.action = 'toggle';
    toggle.textContent = task.done ? '恢复' : '完成';
    toggle.setAttribute('aria-label', `${toggle.textContent}：${task.title}`);
    toggle.setAttribute('aria-pressed', String(task.done));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.dataset.action = 'remove';
    remove.textContent = '删除';
    remove.setAttribute('aria-label', `删除：${task.title}`);
    item.append(text, toggle, remove);
    fragment.append(item);
  }
  list.replaceChildren(fragment);
  const doneCount = tasks.filter(task => task.done).length;
  status.textContent = tasks.length
    ? `共 ${tasks.length} 项，已完成 ${doneCount} 项。`
    : '还没有事项。';
}

titleInput.addEventListener('input', () => titleInput.setCustomValidity(''));
form.addEventListener('submit', event => {
  event.preventDefault();
  const title = titleInput.value.trim();
  if (!title || title.length > 80) {
    titleInput.setCustomValidity('请输入 1 到 80 个非空白字符');
    titleInput.reportValidity();
    return;
  }
  tasks = [...tasks, { id: nextId++, title, done: false }];
  form.reset();
  render();
  titleInput.focus();
});

list.addEventListener('click', event => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest('button[data-action]');
  if (!button || !list.contains(button)) return;
  const item = button.closest('li[data-id]');
  if (!item) return;
  const id = Number(item.dataset.id);
  const action = button.dataset.action;
  if (action !== 'toggle' && action !== 'remove') return;
  if (!tasks.some(task => task.id === id)) return;
  tasks = action === 'remove'
    ? tasks.filter(task => task.id !== id)
    : tasks.map(task => task.id === id ? { ...task, done: !task.done } : task);
  render();
  if (action === 'toggle') {
    list.querySelector(`li[data-id="${id}"] button[data-action="toggle"]`)?.focus();
  } else {
    titleInput.focus();
  }
});

render();
```

:::

## 安全与状态边界

页面状态以 tasks 数组为准，DOM 是它的投影。
若只删除 li 却不更新数组，下次 render 就会把删除项重新显示。
`replaceChildren()` 清空旧节点并插入新的 fragment，不会解析用户字符串。
完整重绘也会移除旧焦点，所以示例在操作后明确恢复焦点。

用户可能输入 `<img src=x onerror=alert(1)>`。
`textContent` 会显示字面文本；`innerHTML` 会尝试创建元素并可能执行危险行为。
安全不等于只替换某几个字符：富文本、URL 属性和脚本上下文各有自己的规则。
本例只显示纯文本，不接受用户提供的 HTML、事件属性或任意链接。

`closest()` 让按钮内部未来加入图标时仍能识别按钮。
数字 ID 由应用生成，不把用户输入拼入选择器。
`document.querySelectorAll()` 返回的 NodeList 通常是静态快照，不会自动包含之后新增节点。
委托避免依赖这种一次性查询结果。

## 效果验证

1. 输入“学习 DOM”，按 Enter：出现一项，输入框被清空并保持焦点。
2. 输入全空格：不添加，并显示明确的校验信息。
3. 点击完成再恢复：计数和划线同步变化，操作按钮保持焦点。
4. 添加上述 HTML 测试文本：作为文本显示，没有弹窗，也没有新 img 节点。
5. 删除最后一项：显示“还没有事项”，焦点返回输入框。

## 常见错误

每次 render 都给列表祖先绑定监听，会导致一次点击处理多次。
使用 `event.target.dataset.action` 会漏掉按钮内部子元素，应先找 closest。
为清空状态使用 `innerHTML = userText`，会引入跨站脚本风险。
只检查原生 required 无法拒绝全空格，需要业务校验补充。

## 练习与验收标准

增加“只看未完成”复选框，使用 change 事件重新计算可见列表。
验收：过滤不删除数据；恢复显示后完成项仍在；新增项目能直接被委托操作。
再把按钮文本包进 span，验证点击 span 也只触发一次正确操作。

## 延伸资料

- [MDN：DOMContentLoaded](https://developer.mozilla.org/zh-CN/docs/Web/API/Document/DOMContentLoaded_event)
- [MDN：事件冒泡](https://developer.mozilla.org/zh-CN/docs/Learn_web_development/Core/Scripting/Event_bubbling)
- [MDN：textContent](https://developer.mozilla.org/zh-CN/docs/Web/API/Node/textContent)
- [OWASP：XSS 防御指南](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)

下一章：[存储与 Worker](./storage-workers.md)。
