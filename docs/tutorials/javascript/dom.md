---
title: JavaScript DOM 实践：事件委托、fetch 与页面状态
description: 构建本地资料搜索页，贯通 DOM 更新、事件传播、请求取消与错误反馈。
type: tutorial
topic: javascript
section: frontend
order: 30
level: advanced
status: published
tags:
  - JavaScript
  - DOM
  - 事件
  - fetch
  - 状态管理
prerequisites:
  - /tutorials/javascript/language.html
  - /tutorials/javascript/async.html
comments: true
---

# JavaScript DOM 实践：事件委托、fetch 与页面状态

页面交互把语言模型与浏览器环境连接起来：用户事件启动操作，异步请求提供数据，状态决定 DOM 如何变化。若只在点击处理器里不断拼字符串，就容易出现重复监听、旧响应覆盖、新节点无法操作和错误信息丢失。本篇建立一个本地资料搜索页，把数据、请求生命周期和 DOM 渲染分开，同时保留原生表单与键盘行为。

## 前置知识与适用范围

先学习 [语言模型](./language.html) 与 [异步控制](./async.html)，理解闭包、Promise、取消信号和错误传播。练习目录包含 `index.html`、`main.js`、`records.json`。使用 HTTP 服务访问，避免文件协议下 `fetch` 的安全限制。本文面向常见现代浏览器的 DOM、Fetch 和 AbortController，不依赖框架或某个最新版本。

如果本机已有 Python 3，在练习目录启动临时服务，再访问 `http://127.0.0.1:8000/`。这个服务只用于读取本地演示文件，不提供生产接口和权限控制。不要把含私密文件的目录作为练习服务根目录；仅放入示例所需文件，结束后按 Ctrl+C 关闭。

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

## 事件传播与默认行为为何要区分

事件通常经历捕获、目标和冒泡阶段。`event.target` 表示事件最初发生的节点，`event.currentTarget` 表示当前正在运行监听器的节点。点击按钮内的图标或文字包装元素时，目标可能不是按钮本身，因此委托处理器常用 `closest()` 从目标向上找到操作元素。

`preventDefault()` 阻止浏览器的默认行为，例如表单导航提交，但不会停止事件传播。`stopPropagation()` 阻止继续传播，不会自动取消默认行为。为了修复重复点击就到处停止传播，可能破坏其他区域的快捷操作或统计；应先查重复监听是否来自初始化重复或错误的拥有边界。

事件委托把监听器放在稳定父节点，处理内部动态生成的子节点。不是所有事件都以同样方式冒泡，选择事件时应查规则。对点击按钮，本例使用冒泡委托；表单则监听 `submit`，而不是只监听提交按钮点击，这样鼠标与键盘 Enter 都进入同一个业务路径。

## 第一步：创建完整入口与本地数据

将下列代码写入 `index.html`。状态提示与结果列表先存在于文档中，后续脚本只更新它们。加载期间表单仍允许新搜索，新请求会取消旧请求；取消按钮则只在存在当前请求时可用。保留标签与原生按钮，不通过普通容器模拟控件。

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>本地资料搜索</title>
    <style>
      body { max-width: 44rem; margin: 2rem auto; padding: 0 1rem; font: 1rem/1.7 system-ui; }
      input, button { min-height: 44px; font: inherit; }
      input { max-width: 100%; box-sizing: border-box; }
      :focus-visible { outline: 3px solid #174ea6; outline-offset: 3px; }
      li { margin-block: 1rem; overflow-wrap: anywhere; }
      li button { margin-inline-start: 1rem; }
    </style>
    <script src="./main.js" defer></script>
  </head>
  <body>
    <main>
      <h1>本地资料搜索</h1>
      <form id="search-form">
        <label for="query">标题关键词</label>
        <input id="query" name="query" type="search" maxlength="60">
        <button type="submit">搜索</button>
        <button id="cancel" type="button" disabled>取消加载</button>
      </form>
      <p id="status" role="status">输入关键词或直接搜索全部资料。</p>
      <ul id="results" aria-label="搜索结果" aria-busy="false"></ul>
    </main>
  </body>
</html>
```

再新建 `records.json`，提供完整且固定的本地数据。JSON 与 JavaScript 对象字面量不同：属性名必须使用双引号，不允许注释或尾随逗号。接口示例也应保持真实 JSON 格式，而不是把不合法数据称为网络故障。

```json
[
  { "id": "html", "title": "HTML 语义文档" },
  { "id": "css", "title": "CSS 布局与响应式" },
  { "id": "javascript", "title": "JavaScript 事件与异步" },
  { "id": "typescript", "title": "TypeScript 类型与边界" }
]
```

## 第二步：把数据渲染成安全的节点

先在 `main.js` 写入下面代码。解析成功的 JSON 仍然可能不符合业务结构，因此要检查数组、每个字段及标识唯一性。这里验证的范围仅针对练习结构，没有把所有未知数据强行转成预期对象。读取数据与创建 DOM 分离，便于查明失败发生在哪一层。

```javascript
const form = document.querySelector("#search-form");
const query = document.querySelector("#query");
const cancel = document.querySelector("#cancel");
const status = document.querySelector("#status");
const list = document.querySelector("#results");
let visibleItems = [];
let requestVersion = 0;
let currentController = null;

function parseRecords(value) {
  if (!Array.isArray(value)) throw new Error("资料必须是数组。");
  const ids = new Set();
  return value.map((item) => {
    if (!item || typeof item !== "object" ||
      typeof item.id !== "string" || item.id.trim() === "" ||
      typeof item.title !== "string" || item.title.trim() === "" ||
      ids.has(item.id)) {
      throw new Error("资料字段无效或标识重复。");
    }
    ids.add(item.id);
    return { id: item.id, title: item.title };
  });
}

function render(items) {
  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const row = document.createElement("li");
    const title = document.createElement("span");
    title.textContent = item.title;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.id = item.id;
    remove.textContent = "移除此项";
    remove.setAttribute("aria-label", `从本页移除：${item.title}`);
    row.append(title, remove);
    fragment.append(row);
  }
  list.replaceChildren(fragment);
}
```

`textContent` 把标题作为文字，不解释数据里的标签，因此避免将服务端或用户输入直接送入 `innerHTML`。这不代表所有 DOM 写入都安全：如果数据后来用于 URL、样式或其他上下文，仍需相应的协议与结构验证。不要把一个上下文中的安全方法推广到所有属性。

片段把新节点集中建立后替换列表。这里选择全量重建是因为列表很小、状态简单；大型列表和保留输入状态的复杂组件可能需要更细的更新策略。无论采用何种方法，都应明确焦点和用户正在编辑的状态是否会被替换，而不是只比较代码行数。

## 第三步：连接请求、取消与旧响应保护

继续在 `main.js` 末尾加入下面代码。每次搜索增加版本并取消旧控制器，新请求独立拥有清理责任。检查版本保证只有当前请求可以修改界面；取消负责减少无用工作，版本判断负责防止过时结果，两者是互补关系。

```javascript
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const version = ++requestVersion;
  currentController?.abort();
  const controller = new AbortController();
  currentController = controller;
  cancel.disabled = false;
  list.setAttribute("aria-busy", "true");
  status.textContent = "正在读取本地资料，原结果暂时保留。";
  const keyword = query.value.trim().toLocaleLowerCase();
  try {
    const response = await fetch("./records.json", {
      signal: controller.signal,
      cache: "no-store"
    });
    if (!response.ok) {
      throw new Error(`读取失败，HTTP 状态 ${response.status}。`);
    }
    const items = parseRecords(await response.json());
    if (version !== requestVersion) return;
    visibleItems = items.filter((item) =>
      item.title.toLocaleLowerCase().includes(keyword)
    );
    render(visibleItems);
    status.textContent = visibleItems.length
      ? `找到 ${visibleItems.length} 条资料。`
      : "没有匹配资料，请更换关键词。";
  } catch (error) {
    if (version !== requestVersion) return;
    status.textContent = controller.signal.aborted
      ? "加载已取消，原结果保留。"
      : error instanceof Error
        ? error.message
        : "读取时发生未知错误。";
  } finally {
    if (version === requestVersion) {
      currentController = null;
      cancel.disabled = true;
      list.setAttribute("aria-busy", "false");
    }
  }
});

cancel.addEventListener("click", () => {
  currentController?.abort();
});

list.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest("button[data-id]");
  if (!button || !list.contains(button)) return;
  visibleItems = visibleItems.filter((item) => item.id !== button.dataset.id);
  render(visibleItems);
  status.textContent = `当前显示 ${visibleItems.length} 条资料。`;
  query.focus();
});
```

移除操作只改当前显示列表，不修改 JSON 文件；再次搜索会重新读取全部原始数据。删除后把焦点放到搜索框是这个小练习的明确选择，避免重建列表后焦点无处可去。实际产品若要求连续删除，应优先定位下一个结果或相邻操作，而不是机械采用本例的搜索框策略。

## fetch 为什么要分别处理三层失败

网络层失败可能让 Promise 拒绝；HTTP 404 或 500 通常仍返回响应对象，因此需要检查 `response.ok` 或具体状态。正文解析又是独立异步操作，错误 JSON 可以在请求成功后解析失败。解析完成后还存在业务结构错误，所以示例继续调用验证函数。这三层不能统一解释成“网络不好”。

响应正文通常只能消费一次，调用 `json()` 后不能随意再次调用 `text()` 读取同一主体；有确切需求时可在消费前考虑克隆，但不应无目的复制大响应。本例使用 `cache: "no-store"` 便于练习观察数据变化，不代表生产页面都应禁用缓存。正式缓存策略应结合资源变化和服务器响应头。

跨源请求还涉及 CORS，客户端添加某个“允许跨源”的请求头不会替服务端授予访问权限。`mode: "no-cors"` 也不是读取任意接口 JSON 的绕过方式，它会产生受限的响应访问。本文同源读取本地文件，先排除跨源因素再学习基本状态链。

## 检查结果与错误排查

不填关键词搜索，预期显示四条；输入 `CSS`，预期只显示布局资料；输入不存在的词，预期得到明确空状态。点击移除后当前列表减少，再次搜索应恢复对应原始项。用 Tab 和 Enter 检查搜索、取消与移除路径，焦点应保持可见。

在开发者工具中开启网络限速，再启动搜索并取消，预期保留原结果并显示取消状态。连续发起两个不同关键词搜索，预期后一次状态不会被旧响应覆盖。限速用于制造可观察等待，不是性能测量。把请求文件名临时改错，检查 HTTP 状态错误；把 JSON 改成不合法文本，检查解析失败；把字段改成数字，检查结构失败。

如果新生成按钮无法操作，检查监听器是否绑定在稳定父节点。如果点击图标失效，检查是否只认 `event.target` 的按钮类型而未向上寻找。若旧请求的清理禁用了新请求取消按钮，检查 `finally` 是否也做版本判断。若页面无结果却没有错误，检查是否吞掉异常或只在控制台输出。

## DOM 生命周期与状态一致性

DOM 查询发生在某一时刻，找到的节点以后可能被替换或删除。保存了节点引用，并不表示它仍连接在当前文档中。若请求完成后要更新某个局部视图，应同时确认任务仍有效、目标视图仍存在。页面越动态，这种拥有关系越重要；把所有查询结果永远保存在全局变量里，会让过期引用难以排查。

`querySelectorAll()` 返回的集合通常是静态快照，而某些 DOM 集合是实时变化的。遍历实时集合时同时删除成员，索引和长度可能变化，导致跳过节点。对需要批量操作的场景，应明确采用快照还是实时集合，不要只凭它们都“像数组”就假设行为一致。集合查询方式本身也是状态模型的一部分。

重新渲染可以恢复显示，却可能改变用户当前上下文。输入框内的光标位置、列表中的焦点和辅助技术的浏览位置，不会因为数据内容相似就自然恢复。本文列表没有编辑字段，因此用全量替换简化示例；增加行内编辑后，应先设计状态与焦点保存，再决定是否继续全量重建，而不是只增加一个渲染函数调用。

请求成功时还需要考虑用户是否已经改变搜索框。示例在提交时保存关键词，这表示结果对应那次明确提交，而不是不断跟随尚未提交的输入。若产品需要即时搜索，应定义防抖、取消和结果归属，并保留当前关键词提示。无论采用哪种方式，用户都应知道当前结果回答的是哪一次意图。

最后要区分本地状态与持久化状态。移除列表项只是视图变化，不应写成“删除资料成功”。真正删除需要授权、服务端确认和失败恢复，还要说明操作能否撤销。界面文案如果超出实际副作用，会给用户错误的完成感；将“从本页移除”写清楚，就是保持行为与说明一致的必要边界。

## 练习与官方参考

新增按标题排序的操作，只修改内存中的可见项目，并解释数组排序是否会改变原数组。再为每条记录增加一个有界长度的摘要，扩展结构验证与文本渲染，避免把整个未知对象直接交给模板字符串。

验收至少覆盖正常结果、空结果、HTTP 错误、JSON 错误、结构错误、取消和连续搜索。记录预期与实际差异，不把“没有控制台报错”作为唯一成功标准。请求、数据和界面各自拥有清晰状态，才能让复杂交互继续扩展。

官方参考：

- [MDN：事件冒泡](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Event_bubbling)
- [MDN：使用 Fetch](https://developer.mozilla.org/zh-CN/docs/Web/API/Fetch_API/Using_Fetch)
- [MDN：Element.closest()](https://developer.mozilla.org/zh-CN/docs/Web/API/Element/closest)
- [MDN：Node.textContent](https://developer.mozilla.org/zh-CN/docs/Web/API/Node/textContent)

本文提供完整本地示例与检查步骤，没有声称已运行目标站点、访问真实 API 或完成浏览器验收。
