---
title: MV3 扩展内容脚本、消息通信与本地存储
description: 实现可采集、读取和清除的标题笔记工具，建立消息契约、持久状态与完整错误反馈。
type: tutorial
topic: browser-extensions
section: platform
order: 20
level: intermediate
status: published
tags:
  - Manifest V3
  - 消息通信
  - Storage
  - 内容脚本
prerequisites:
  - /tutorials/browser-extensions/fundamentals.html
comments: true
---

# MV3 扩展内容脚本、消息通信与本地存储

上一章只统计数量，不需要长期状态。本章实现“标题笔记”：用户打开 popup，主动采集当前页标题，之后读取最近一次结果，也能清除记录。这个小工具同时需要页面 DOM、扩展 UI 和可重启后台，适合学习跨上下文的数据契约。

## 前置条件、功能范围与隐私边界

需要完成[MV3 清单与权限基础](/tutorials/browser-extensions/fundamentals.html)，继续使用桌面 Chrome 120 及以上。建议新建 `heading-notebook` 目录，不覆盖上一章实验。扩展包含五个文件：清单、popup HTML、popup 脚本、后台和内容脚本，不使用打包依赖。

采集只处理主文档 h1、h2、h3，记录总数、最多 50 个非空标题、每项最多 200 字符和采集时间。不读取 iframe、不保存 URL、不上传服务器。页面标题也可能包含私人信息，因此必须由用户点击触发，界面明确说明保存在本机，并提供清除操作。

“本机保存”不等于加密保险箱。`storage.local` 适合扩展状态，不应用来保存密码；系统用户、备份和恶意软件仍可能影响它。示例不用 sync，避免把标题笔记同步到其他设备。弹窗关闭之后还未完成的操作可能继续在后台推进，界面下一次打开应能通过持久存储恢复结果。

## 设计调用链与清单

调用链是 popup 发出采集请求，后台注入内容脚本，再向目标主 frame 发消息，内容脚本返回结构化标题，后台校验并保存，最后 popup 用纯文本渲染。后台不直接访问 DOM，popup 不把网页数据当 HTML 执行。读取和清除也通过后台统一入口。

清单如下，`default_popup` 改变了 action 点击行为，不再使用上一章的 `onClicked`：

```json
{
  "manifest_version": 3,
  "name": "Local Heading Notebook",
  "version": "0.2.0",
  "minimum_chrome_version": "120",
  "description": "Save a small heading snapshot after an explicit user action.",
  "permissions": ["activeTab", "scripting", "storage"],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_title": "Local Heading Notebook",
    "default_popup": "popup.html"
  }
}
```

没有 tabs 权限，因为本例只查询当前标签 ID、发送消息和注入。也没有常驻 `content_scripts`，而是在主动操作后按需注入。添加 storage 是功能真实需要的能力，不应为了省一个字段把状态塞回不能持久的全局变量。

## 内容脚本：最小数据与重复注入

创建 `content.js`。每次注入先移除同一上下文旧的处理函数，再注册新函数，避免用户多次采集累计多个监听器。这个状态只用于当前页面上下文去重，不承担长期存储：

```js
(() => {
  const key = "__localHeadingNotebookListener";
  if (globalThis[key]) {
    chrome.runtime.onMessage.removeListener(globalThis[key]);
  }

  const listener = (message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || message?.type !== "READ_HEADINGS") {
      return false;
    }
    const headings = [...document.querySelectorAll("h1, h2, h3")];
    const items = headings
      .map((node) => (node.textContent || "").trim().slice(0, 200))
      .filter(Boolean)
      .slice(0, 50);
    sendResponse({ total: headings.length, items });
    return false;
  };

  globalThis[key] = listener;
  chrome.runtime.onMessage.addListener(listener);
})();
```

响应只含可 JSON 序列化的数据，不传 DOM、函数或复杂对象。Chrome 扩展消息使用 JSON 序列化语义，不能假设 Date、Map 或循环引用会原样保留。页面可能动态更新，所以采集是点击时的快照，不是永远同步的索引。

`textContent` 的结果仍是不可信文本，后台与 UI 都要遵守数据边界。空标题计入总数但不加入列表，列表上限不会改变总数。页面上的孤立全局状态不能说明操作成功，真正的成功要以后台保存完成后的响应为准。

## 后台：消息校验、异步响应与持久化

创建 `background.js`。消息入口只接受本扩展的 popup，避免把来自内容脚本的任意请求变成高权限执行命令。内容脚本不能自行指定任意 URL让后台访问，示例也没有通用网络代理。

```js
chrome.storage.local.setAccessLevel({
  accessLevel: "TRUSTED_CONTEXTS"
}).catch(() => console.warn("Storage access restriction failed"));

function validSnapshot(value) {
  return value?.schemaVersion === 1
    && Number.isInteger(value.total) && value.total >= 0
    && Array.isArray(value.items) && value.items.length <= 50
    && value.items.length <= value.total
    && value.items.every((item) => typeof item === "string" && item.length <= 200)
    && Number.isFinite(value.collectedAt) && value.collectedAt > 0;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id
      || sender.url !== chrome.runtime.getURL("popup.html")) {
    sendResponse({ ok: false, error: "Untrusted message source" });
    return false;
  }
  handle(message).then(
    (data) => sendResponse({ ok: true, data }),
    () => sendResponse({
      ok: false,
      error: "Operation failed. Use a normal HTTP page and try again."
    })
  );
  return true;
});

async function handle(message) {
  if (message?.type === "GET_LAST") {
    const { lastSnapshot } = await chrome.storage.local.get("lastSnapshot");
    if (lastSnapshot === undefined) return null;
    if (!validSnapshot(lastSnapshot)) throw new Error("Invalid stored data");
    return lastSnapshot;
  }
  if (message?.type === "CLEAR_LAST") {
    await chrome.storage.local.remove("lastSnapshot");
    return null;
  }
  if (message?.type !== "COLLECT"
      || !Number.isInteger(message.tabId) || message.tabId < 0) {
    throw new Error("Invalid request");
  }

  await chrome.scripting.executeScript({
    target: { tabId: message.tabId },
    files: ["content.js"]
  });
  const result = await chrome.tabs.sendMessage(
    message.tabId,
    { type: "READ_HEADINGS" },
    { frameId: 0 }
  );
  const snapshot = {
    schemaVersion: 1,
    total: result?.total,
    items: result?.items,
    collectedAt: Date.now()
  };
  if (!validSnapshot(snapshot)) throw new Error("Invalid page response");
  await chrome.storage.local.set({ lastSnapshot: snapshot });
  return snapshot;
}
```

监听器顶层立即注册，不等待 storage 设置完成。`setAccessLevel` 限制 local storage 的直接访问上下文；本例只保存有限文本，若项目涉及高敏感数据，还需把权限设置失败纳入明确的阻断策略，不能只打印警告。内容脚本从不直接读写 storage。

监听器不是 async 函数，而是返回字面 `true` 保留异步响应通道，再调用 `sendResponse`。这适用于本文最低版本范围，不依赖较新 Chrome 才提供的 Promise 监听器行为。每个请求只有一个响应入口，避免多个监听器竞争回复。

存储先成功才回应采集成功，因此 UI 不会在写入失败时显示“已保存”。`storage.local` 是异步键值存储，不提供这里所需之外的事务保证。两个 popup 并发采集时以最后完成写入的快照为准，不能当作原子计数器；清除和采集并发时也可能重新出现记录，实际产品需要定义更强的并发契约。

## Popup：可运行的界面与闭环

创建 `popup.html`，脚本使用独立文件加载，不写内联执行代码：

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>标题笔记</title>
  <style>
    body { width: 320px; font: 14px system-ui; margin: 16px; }
    button { padding: 8px; margin: 4px 0; }
    li { overflow-wrap: anywhere; margin-bottom: 6px; }
  </style>
  <script src="popup.js" defer></script>
</head>
<body>
  <h1>本地标题笔记</h1>
  <p>主动采集最多 50 个标题，仅存本机，可随时清除。</p>
  <button id="collect" type="button">采集当前页</button>
  <button id="read" type="button">读取最近记录</button>
  <button id="clear" type="button">清除记录</button>
  <p id="status" role="status">尚未操作</p>
  <ul id="items"></ul>
</body>
</html>
```

创建 `popup.js`：

```js
const status = document.querySelector("#status");
const items = document.querySelector("#items");
const buttons = [...document.querySelectorAll("button")];

function render(snapshot) {
  items.replaceChildren();
  if (!snapshot) {
    status.textContent = "没有保存的记录";
    return;
  }
  status.textContent = `总标题 ${snapshot.total}，展示 ${snapshot.items.length}，`
    + new Date(snapshot.collectedAt).toLocaleString();
  for (const title of snapshot.items) {
    const li = document.createElement("li");
    li.textContent = title;
    items.append(li);
  }
}

async function operate(type) {
  buttons.forEach((button) => { button.disabled = true; });
  status.textContent = "处理中";
  try {
    const message = { type };
    if (type === "COLLECT") {
      const [tab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true
      });
      if (typeof tab?.id !== "number") throw new Error("找不到当前标签");
      message.tabId = tab.id;
    }
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) throw new Error(response?.error || "没有收到后台响应");
    render(response.data);
  } catch (error) {
    items.replaceChildren();
    status.textContent = `失败：${error.message}`;
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

document.querySelector("#collect").addEventListener("click", () => operate("COLLECT"));
document.querySelector("#read").addEventListener("click", () => operate("GET_LAST"));
document.querySelector("#clear").addEventListener("click", () => operate("CLEAR_LAST"));
operate("GET_LAST");
```

页面文本通过 `textContent` 展示，即使标题包含标记也不会执行。操作中禁用按钮能避免同一个 popup 连续触发多次，但不能防止另一个窗口的 popup 并发，因此上文仍明确最后写入者语义。失败时显示错误而不是假装得到空记录，先前存储也不被隐式删除。

## 调试与可观察验证

在扩展管理页加载 `heading-notebook`，打开上一章三标题的本地 HTTP 页面。popup 首次应显示没有记录，点击采集后应显示总数 3 和三条文本；关闭 popup 再打开，自动读取应恢复同一快照。点击清除后再关闭重开，应仍无记录。

多次采集同一页，预期每次一组结果而不是累计重复条目。刷新页面后内容脚本上下文重建，下一次采集应重新注入并注册。修改源码后重新加载扩展，已有内容脚本可能出现上下文失效，开发时也刷新目标页再试，不把旧注入环境当作新代码。

后台调试在扩展管理页进入 Service Worker，popup 调试可右键弹窗检查。普通页面 Console 观察内容脚本时要选择正确执行上下文。`Receiving end does not exist` 常表示尚未注入、页面已导航、目标 frame 不对或旧上下文失效，不是应该通过增加所有权限来修复。

关闭后台 DevTools 后让 worker 停止，再打开 popup 读取记录，应仍能从 storage 恢复。不能用全局变量里还存在数据来证明持久化，也不能在调试窗口一直开着时宣称休眠恢复已通过。存储验证可在后台 Console 查询示例键，但不要把真实标题数据贴到公开日志。

```js
const stored = await chrome.storage.local.get("lastSnapshot");
console.log({
  exists: stored.lastSnapshot !== undefined,
  schemaVersion: stored.lastSnapshot?.schemaVersion
});
```

这里只输出存在性和结构版本，不打印正文。操作清除后应不存在该键。`local` 与 `sync` 有不同配额和生命周期，不能假设无限容量；本例通过条数和长度上限控制数据量，真实配额仍应查看对应 API 文档。

## 一次性消息、端口与状态更新

本例每个操作只需要一次请求和一次响应，使用 sendMessage 足够。连续进度、实时订阅或多轮协作可以使用 `runtime.connect` / `tabs.connect` 的 Port，但要处理断开、页面导航、多个 frame 与重复连接。端口不是持久存储，也不保证后台永远不会终止。

如果增加进度 UI，必须区分“页面已读到”“存储已提交”和“界面已收到”三个状态。popup 提前关闭时，后台可能已成功保存而 UI 没有展示，下次读取是恢复入口。不能因界面没收到回复就自动重做所有具有外部副作用的操作，本例只保存单份本地快照所以风险有限。

`storage.onChanged` 可以让仍打开的扩展页面响应其他上下文写入，但监听后应检查 storage 区域与键名，不对所有变化无条件重渲染。这个事件说明观察到存储变化，不能提供跨多个键的事务锁。若以后保存多份笔记，应定义索引、记录和清除的关系，而不是简单把多个 set 当原子组合。

## 页面导航与请求目标的时间差

popup 查询到 tab ID 后，注入前目标可能导航；注入成功后，发送消息前页面也可能刷新。示例在这些情况下进入失败分支，不把空结果当成功。用户重试前应确认目标页面稳定，开发者则要根据产品需要决定是否使用更具体的文档身份与导航状态校验。

单页应用不一定触发完整文档导航，内容可能在同一个上下文内变动，所以采集时间只是快照时间，不是文档创建时间。标题列表变化后自动保存并非本例功能，不应为了“保持最新”悄悄加入常驻 MutationObserver 和全页收集。

来自 DOM 的文本长度被限制，但总数也可能很大。上限减少保存内容，不代表扫描成本恒定；`querySelectorAll` 仍检查匹配元素。极大型页面需要评估延迟与可取消交互，不应宣称这段小代码在任意页面都没有性能影响。权限与资源成本都属于功能边界。

## 常见错误、练习与完成标准

后台消息挂起时检查是否忘了 `return true`，不要把 async 回调行为想当然。状态刷新后丢失，检查是否真的 await storage 写入。内容脚本无法读页面全局变量，是 isolated world 的正常隔离；需要与页面主环境交流时必须设计额外可信边界，不能直接执行页面提供的字符串。

练习给演示页加入空 h2 和含标记文本的 h3，确认总数与非空列表定义一致，渲染仍是文字。再加超过 50 个标题，确认列表最多 50 项、总数仍准确。对浏览器内部页面采集应出现失败，不覆盖上一份有效记录。

完成标准是采集、读取、清除三个操作闭环，页面重载与后台重启后行为明确，消息来源与数据结构都校验，UI 不执行网页字符串，并且保存成功以写入完成为证据。接下来进入[MV3 调试、打包与发布](/tutorials/browser-extensions/delivery.html)，检查交付边界而不是直接上传商店。

## 官方参考

- [Chrome 消息传递](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)：一次性消息、序列化和异步响应。
- [Chrome storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)：存储区域、配额与访问级别。
- [Chrome tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs)：查询、消息与权限差异。
- [内容脚本](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)：注入和上下文。
- [扩展 CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)：脚本加载边界。
- [扩展 Service Worker](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers)：事件入口和后台设计。
