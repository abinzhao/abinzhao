---
title: 综合项目：本地任务看板
description: 用完整单文件实现任务增删改查、过滤、持久化、数据校验与失败恢复。
---

# 综合项目：本地任务看板

## 学习目标

把前面各章串成一条可解释的流程：用户输入 → 校验 → 状态更新 → 保存 → 重绘。
项目包含新增、编辑、完成切换、删除、关键词与状态过滤，以及刷新恢复。
不依赖框架、第三方包、后端接口或远程素材。

前置：[DOM 事件](../browser/dom-events.md)、[存储](../browser/storage-workers.md)。
请先能独立解释数组的 map/filter、事件委托和 JSON 的异常处理。

## 为什么状态必须有唯一来源

如果直接修改 DOM，同时又在数组中保存另一份任务，就容易出现显示与保存不一致。
本项目以 tasks 为唯一业务状态，筛选只计算可见集合，不删除真实任务。
每条任务有稳定 ID，不能使用数组下标识别，因为删除和过滤都会改变下标。

localStorage 仅保存版本化 JSON，不保存 HTML。
每次读回都检查结构、字段、长度和 ID 唯一性，避免坏数据进入页面。
保存失败时仍允许在本页继续操作，但用独立告警明确说明刷新会丢失未保存变化。
如果读取失败，不自动覆盖旧值，需要用户明确恢复存储后才重新写入。

## 运行步骤

1. 创建独立的 `task-board/index.html`，放入下面整个代码块。
2. 从练习根目录运行 `node serve.mjs`，打开 `/task-board/`。
3. 初次打开应该是空看板，没有预置远程请求。
4. 添加两条任务，完成、编辑、筛选，再刷新验证保存。
5. 调试数据只使用此页面专属键 `frontend-basics-task-board-v1`，不要清空整个源的存储。

## 完整单文件

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>本地任务看板</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: sans-serif; color: #243149; background: #f2f5fa; }
    main { max-width: 64rem; margin: 2rem auto; padding: 1.5rem; }
    h1 { margin-top: 0; }
    form, .filters { display: flex; flex-wrap: wrap; align-items: center; gap: .75rem; }
    input, select, button { font: inherit; padding: .65rem; }
    input, select, button { min-height: 44px; }
    input { min-width: 0; max-width: 100%; }
    #title { flex: 1 1 18rem; }
    #query { flex: 1 1 12rem; }
    button { cursor: pointer; }
    .filters { margin-block: 1.5rem; }
    ul { padding: 0; list-style: none; }
    li { display: flex; align-items: center; flex-wrap: wrap; gap: .75rem;
      background: white; border: 1px solid #c7d2e2; padding: 1rem; margin-bottom: .75rem; }
    .task-title { flex: 1 1 20rem; min-width: 0; overflow-wrap: anywhere; }
    li[data-done="true"] .task-title { text-decoration: line-through; }
    .actions { display: flex; flex-wrap: wrap; gap: .5rem; }
    #warning { color: #922b18; font-weight: bold; }
    :focus-visible { outline: 3px solid #2459b2; outline-offset: 3px; }
    [hidden] { display: none !important; }
  </style>
</head>
<body>
  <main>
    <h1>本地任务看板</h1>
    <p>数据仅保存在当前浏览器；建议只在一个标签页操作，最多 200 项。</p>
    <form id="editor">
      <label for="title">任务标题（1 到 80 字符）</label>
      <input id="title" name="title" required maxlength="80" autocomplete="off">
      <button id="submit" type="submit">添加任务</button>
      <button id="cancel-edit" type="button" hidden>取消编辑</button>
    </form>
    <div class="filters">
      <label for="query">关键词</label>
      <input id="query" type="search" maxlength="80">
      <label for="filter">任务状态</label>
      <select id="filter">
        <option value="all">全部</option>
        <option value="open">未完成</option>
        <option value="done">已完成</option>
      </select>
    </div>
    <p id="status" role="status"></p>
    <p id="warning" role="alert"></p>
    <button id="recover" type="button" hidden>恢复此看板的存储</button>
    <p id="empty"></p>
    <ul id="tasks" aria-label="任务列表"></ul>
  </main>
  <script>
    'use strict';
    const KEY = 'frontend-basics-task-board-v1';
    const form = document.querySelector('#editor');
    const titleInput = document.querySelector('#title');
    const query = document.querySelector('#query');
    const filter = document.querySelector('#filter');
    const list = document.querySelector('#tasks');
    const status = document.querySelector('#status');
    const warning = document.querySelector('#warning');
    const recover = document.querySelector('#recover');
    const submit = document.querySelector('#submit');
    const cancelEdit = document.querySelector('#cancel-edit');
    let tasks = [];
    let editingId = null;
    let canSave = true;

    function validateData(data) {
      if (!data || data.version !== 1 || !Array.isArray(data.tasks) || data.tasks.length > 200) {
        throw new Error('存储版本或任务列表无效');
      }
      const ids = new Set();
      return data.tasks.map(task => {
        if (!task || typeof task.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(task.id) ||
            ids.has(task.id) || typeof task.title !== 'string' ||
            !task.title.trim() || task.title.length > 80 || typeof task.done !== 'boolean') {
          throw new Error('存储中的任务字段无效或 ID 重复');
        }
        ids.add(task.id);
        return { id: task.id, title: task.title.trim(), done: task.done };
      });
    }
    try {
      const raw = localStorage.getItem(KEY);
      if (raw !== null) tasks = validateData(JSON.parse(raw));
    } catch (error) {
      canSave = false;
      warning.textContent = `读取失败：${error.message}。旧数据未覆盖，当前进入临时模式。`;
      recover.hidden = false;
    }

    function save() {
      if (!canSave) return;
      try {
        localStorage.setItem(KEY, JSON.stringify({ version: 1, tasks }));
        warning.textContent = '';
        recover.hidden = true;
      } catch {
        warning.textContent = '保存失败：空间不足或存储被禁止。本页可继续操作，刷新可能丢失变化。';
        recover.hidden = false;
      }
    }
    function resetEditor() {
      editingId = null;
      form.reset();
      titleInput.setCustomValidity('');
      submit.textContent = '添加任务';
      cancelEdit.hidden = true;
    }
    function render(message = '') {
      const keyword = query.value.trim().toLowerCase();
      const visible = tasks.filter(task =>
        task.title.toLowerCase().includes(keyword) &&
        (filter.value === 'all' || (filter.value === 'done' ? task.done : !task.done))
      );
      const fragment = document.createDocumentFragment();
      for (const task of visible) {
        const item = document.createElement('li');
        item.dataset.id = task.id;
        item.dataset.done = String(task.done);
        const text = document.createElement('span');
        text.className = 'task-title';
        text.textContent = task.title;
        const actions = document.createElement('div');
        actions.className = 'actions';
        for (const [action, label] of [
          ['toggle', task.done ? '恢复' : '完成'], ['edit', '编辑'], ['remove', '删除']
        ]) {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.action = action;
          button.textContent = label;
          button.setAttribute('aria-label', `${label}：${task.title}`);
          if (action === 'toggle') button.setAttribute('aria-pressed', String(task.done));
          actions.append(button);
        }
        item.append(text, actions);
        fragment.append(item);
      }
      list.replaceChildren(fragment);
      document.querySelector('#empty').textContent = visible.length ? ''
        : tasks.length ? '没有符合当前条件的任务。' : '还没有任务，先添加一项。';
      status.textContent = `${message} 共 ${tasks.length} 项，已完成 ${
        tasks.filter(task => task.done).length
      } 项，当前显示 ${visible.length} 项。`;
    }
    function commit(next, message) {
      tasks = next;
      save();
      render(message);
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
      if (!editingId && tasks.length >= 200) {
        status.textContent = '已达到 200 项上限，请先删除不需要的任务。';
        return;
      }
      if (editingId) {
        commit(tasks.map(task => task.id === editingId ? { ...task, title } : task), '任务已编辑。');
      } else {
        commit([...tasks, { id: crypto.randomUUID(), title, done: false }], '任务已添加。');
      }
      resetEditor();
      titleInput.focus();
    });
    cancelEdit.addEventListener('click', () => { resetEditor(); titleInput.focus(); });
    query.addEventListener('input', () => render());
    filter.addEventListener('change', () => render());
    list.addEventListener('click', event => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest('button[data-action]');
      if (!button || !list.contains(button)) return;
      const item = button.closest('li[data-id]');
      const task = tasks.find(row => row.id === item?.dataset.id);
      if (!task) return;
      const action = button.dataset.action;
      if (action === 'edit') {
        editingId = task.id;
        titleInput.value = task.title;
        titleInput.setCustomValidity('');
        submit.textContent = '保存编辑';
        cancelEdit.hidden = false;
        titleInput.focus();
      } else if (action === 'toggle') {
        commit(tasks.map(row => row.id === task.id ? { ...row, done: !row.done } : row), '状态已更新。');
        const remaining = [...list.children].find(row => row.dataset.id === task.id);
        if (remaining) remaining.querySelector('button').focus();
        else titleInput.focus();
      } else if (action === 'remove' && confirm(`删除任务“${task.title}”？`)) {
        if (editingId === task.id) resetEditor();
        commit(tasks.filter(row => row.id !== task.id), '任务已删除。');
        titleInput.focus();
      }
    });
    recover.addEventListener('click', () => {
      if (!confirm('仅重置此看板的存储，并用当前页面任务覆盖。旧存储数据将丢失，继续吗？')) return;
      try {
        localStorage.removeItem(KEY);
        canSave = true;
        save();
      } catch {
        warning.textContent = '仍无法访问存储，请保持页面打开并检查浏览器权限。';
      }
    });
    render();
  </script>
</body>
</html>
```

## 机制与边界复盘

`validateData` 返回新的、字段受控的对象，不直接信任 JSON 中的其他字段。
过滤、修改与删除都基于稳定 ID，任务标题只是显示数据。
每次 commit 更新数组后尝试保存，再重绘；保存失败不伪装成成功保存。
编辑期间切换过滤条件不会丢失编辑目标，取消编辑不会修改原任务。

`crypto.randomUUID()` 在现代浏览器的安全上下文可用，localhost 属于可信本地环境。
不要把服务器改为任意局域网 HTTP 地址后假设行为相同。
此实现每次重绘列表，适合至多 200 项的学习场景，不是大数据虚拟列表。
未实现多标签页冲突合并，两个页面同时写可能互相覆盖。
数据只属于当前源与浏览器，不提供账号同步、备份或跨设备恢复。

## 效果验证

| 操作 | 预期 |
| --- | --- |
| 新增两项再刷新 | 两项恢复，状态仍为未完成 |
| 编辑并取消 | 原标题不变，添加模式恢复 |
| 完成一项，筛选未完成 | 该项隐藏，但总数不变 |
| 搜索不匹配词 | 显示“没有符合当前条件的任务” |
| 删除时取消确认 | 数据与计数不变 |
| 输入 HTML 事件文本 | 仅显示字面文本，不生成可执行元素 |
| 在 Console 执行下方坏数据实验后刷新 | 临时模式告警，旧值没有自动被覆盖 |

只在此练习页面运行，实验结束使用页面恢复按钮：

```js
localStorage.setItem('frontend-basics-task-board-v1', '{broken-json');
location.reload();
```

也可在专用测试浏览器中禁用网站存储，验证保存失败的告警。
不要通过删除全部存储来验证一个专属键的恢复逻辑。

## 常见错误

把空结果当空数据，会在筛选时丢掉真实任务。
保存 JSON 不做结构校验，会在格式改变后触发难定位的渲染错误。
只用成功提示却不显示持久化失败，会让用户误以为刷新安全。
删除重绘后不恢复焦点，键盘用户可能回到页面开头。

## 练习与验收标准

增加任务优先级：先定义允许值，再更新新增、编辑、校验、渲染与保存版本。
验收：旧版本有明确迁移或拒绝策略；坏数据不被静默覆盖；过滤不破坏任务。
最后从空数据、坏 JSON、存储不可用和 200 项上限分别走一次主流程。

## 延伸资料

- [MDN：localStorage](https://developer.mozilla.org/zh-CN/docs/Web/API/Window/localStorage)
- [MDN：randomUUID](https://developer.mozilla.org/zh-CN/docs/Web/API/Crypto/randomUUID)
- [MDN：约束校验](https://developer.mozilla.org/zh-CN/docs/Web/HTML/Guides/Constraint_validation)

完成后返回[阶段验收](../index.md#阶段验收)，再进入前端工程化。
