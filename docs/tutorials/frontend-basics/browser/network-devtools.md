---
title: 浏览器：HTTP、fetch 与调试
description: 用本地 JSON 请求理解 HTTP 状态、CORS、缓存、取消和开发者工具。
---

# 浏览器：HTTP、fetch 与调试

## 学习目标

- 区分网络失败、HTTP 失败、解析失败和数据格式错误。
- 解释同源策略、CORS 与缓存校验，不用关闭安全机制来“修复”请求。
- 从 Network 与 Console 找到请求失败的证据。

前置：[异步与取消](../javascript/async.md)。
所有请求都访问本地静态文件，不依赖远程服务或真实个人数据。

## 为什么 fetch 没有自动抛出 404

HTTP 请求包含方法、地址、请求头和可选请求体。
响应包含状态码、响应头和可选响应体。
GET 用于获取资源；真实 CRUD 接口通常还使用 POST、PATCH、DELETE。
静态服务器不会因为页面发了 POST 就自动保存文件。

fetch 在成功获得响应时通常 fulfilled，即使响应是 404 或 500。
网络不可达、CORS 拒绝、主动中止等才会让 Promise rejected。
因此先检查 `response.ok`，再解析响应体，再校验数据结构。
响应体是流，读一次后不能任意再读；确有双读需求应提前 clone。

| 状态 | 常见含义 | 本章如何观察 |
| --- | --- | --- |
| 200 | 成功返回内容 | 请求 lessons.json |
| 204 | 成功但没有响应体 | 不应无条件调用 json |
| 304 | 缓存校验后内容未变化 | 第二次加载或请求时观察 Network |
| 404 | 资源不存在 | 请求 missing.json |
| 500 | 服务端处理失败 | 静态实验不模拟 |

## 同源与 CORS 的边界

源由协议、主机和端口组成，localhost 与 127.0.0.1 也不是同一个主机。
同源策略限制脚本读取某些跨源响应，不代表所有跨源资源都不能加载。
CORS 是服务端通过响应头允许读取，不是前端添加请求头就能授权自己。
部分方法或请求头触发 OPTIONS 预检；简单跨源请求也仍需要响应许可。

`mode: 'no-cors'` 得到的 opaque 响应不可读，并不是 JSON 请求的修复办法。
携带凭据时不能用通配符许可读取，还需准确源与 credentials 配置。
开发代理可以让浏览器访问同源地址，但部署时仍要安排真实服务关系。
本章只观察限制，不配置代理、不修改浏览器安全设置。

## 缓存不是“始终不请求”

`Cache-Control: max-age=30` 可允许响应在新鲜期内复用。
`no-cache` 允许存储，但使用前要重新校验；`no-store` 要求不要存储。
ETag 标识资源版本，后续请求可带 If-None-Match，未变化时返回 304。
浏览器把缓存正文和 304 合并后，fetch 常看到正常可读的成功响应。
因此 Network 的传输状态和脚本看到的 Response 不一定完全相同。

索引提供的服务器使用 `no-cache` 与 ETag，适合观察重新校验。
缓存命中、强制刷新与 DevTools Disable cache 会改变请求行为。
不能只靠“我刷新过了”证明服务端已经返回最新内容。

## 运行步骤

1. 创建 `network-devtools/`，放入下面三个文件。
2. 从练习根目录运行 `node serve.mjs`，打开 `/network-devtools/`。
3. 打开 Network，选择 Fetch/XHR，保留日志，取消勾选 Disable cache。
4. 加载两次正常数据，再分别选择缺失文件和 HTML 文件。
5. 需要观察 CORS 时，在第二个终端从同一练习根目录运行 `node serve.mjs 8081`。

## 完整请求示例

::: code-group

```html [index.html]
<!doctype html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>本地 HTTP 实验</title></head>
<body>
  <main>
    <h1>本地 HTTP 实验</h1>
    <label for="resource">资源</label>
    <select id="resource">
      <option value="./lessons.json">正常 JSON</option>
      <option value="./missing.json">不存在的文件</option>
      <option value="./index.html">HTML，不是 JSON</option>
      <option value="http://localhost:8081/network-devtools/lessons.json">另一个端口（CORS）</option>
    </select>
    <button id="load" type="button">加载</button>
    <button id="cancel" type="button">取消</button>
    <p id="status" role="status">尚未加载。</p>
    <ul id="lessons"></ul>
  </main>
  <script src="./main.js" defer></script>
</body>
</html>
```

```js [main.js]
'use strict';
const select = document.querySelector('#resource');
const load = document.querySelector('#load');
const cancel = document.querySelector('#cancel');
const status = document.querySelector('#status');
const list = document.querySelector('#lessons');
let active = null;
let version = 0;

async function loadLessons() {
  const current = ++version;
  if (active) active.abort();
  const controller = new AbortController();
  active = controller;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 5000);
  status.textContent = '正在加载。';
  list.replaceChildren();
  list.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch(select.value, {
      signal: controller.signal,
      cache: 'no-cache'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}：资源请求失败`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error('响应不是 JSON，请检查地址和 Content-Type');
    }
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows.every(row =>
      row !== null && typeof row === 'object' &&
      typeof row.title === 'string' && row.title.length <= 80
    )) throw new Error('JSON 结构不符合课程数组约定');
    if (current !== version) return;
    const fragment = document.createDocumentFragment();
    for (const row of rows) {
      const item = document.createElement('li');
      item.textContent = row.title;
      fragment.append(item);
    }
    list.replaceChildren(fragment);
    status.textContent = `已加载 ${rows.length} 门课程。`;
  } catch (error) {
    if (current !== version) return;
    status.textContent = controller.signal.aborted
      ? timedOut ? '请求超过 5 秒，已中止。' : '请求已取消。'
      : `加载失败：${error instanceof Error ? error.message : '未知错误'}`;
  } finally {
    clearTimeout(timeout);
    if (current === version) {
      list.removeAttribute('aria-busy');
      active = null;
    }
  }
}
load.addEventListener('click', loadLessons);
select.addEventListener('change', () => {
  version += 1;
  if (active) active.abort();
  active = null;
  list.removeAttribute('aria-busy');
  list.replaceChildren();
  status.textContent = '资源已切换，请重新加载。';
});
cancel.addEventListener('click', () => {
  version += 1;
  if (active) active.abort();
  active = null;
  list.removeAttribute('aria-busy');
  status.textContent = '已取消等待；已显示的结果保留。';
});
```

```json [lessons.json]
[
  { "title": "HTML 结构" },
  { "title": "CSS 布局" },
  { "title": "JavaScript 异步" }
]
```

:::

## 效果验证与调试路径

正常请求显示三门课程；缺失文件显示 HTTP 404。
HTML 文件会被 Content-Type 检查拒绝，不会当作数据展示。
把 lessons.json 临时改成 `{ "title": "单个对象" }`，应报告结构不符。
故意去掉 JSON 的一个引号，再加载，应出现解析错误；测试后恢复文件。

先在 Network 确认 URL、方法、状态、响应头和 Preview。
再在 Console 查脚本错误与 CORS 诊断，必要时使用 Sources 断点。
Timing 显示排队、连接与传输阶段，不是全部 JavaScript 执行耗时。
本地请求很快，测试取消与超时需要使用网络限速；不能声称每次点击取消都抢先成功。
另一个端口运行后，服务器能收到请求，但页面不能读取响应，Console 应指出 CORS。

## 常见错误

“Failed to fetch” 不足以证明服务端坏了，先区分网络、CORS 与取消。
只看 json 是否解析成功会漏掉合法 JSON 中的错误字段。
把所有错误转换成空数组，会混淆“没有课程”和“没有拿到数据”。
缓存问题不要先清空所有用户数据，应先核对请求头、ETag 与响应来源。

## 练习与验收标准

增加“重试”按钮，但只由用户触发，不自动无限重试。
验收：失败有明确提示；重试可恢复；连续加载不会被旧结果覆盖。
用 Disable cache 开关比较两次请求，记录真实状态和传输大小，不凭印象判断。

## 延伸资料

- [MDN：使用 fetch](https://developer.mozilla.org/zh-CN/docs/Web/API/Fetch_API/Using_Fetch)
- [MDN：CORS](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Guides/CORS)
- [MDN：HTTP 缓存](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Guides/Caching)
- [Chrome：Network 面板](https://developer.chrome.com/docs/devtools/network)

下一章：[完整任务看板](../projects/task-board.md)。
