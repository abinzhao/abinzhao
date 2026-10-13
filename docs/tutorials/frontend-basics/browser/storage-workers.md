---
title: 浏览器：存储与 Worker
description: 比较三种本地存储，在 Worker 中计算并用 IndexedDB 保存结果。
---

# 浏览器：存储与 Worker

## 学习目标

- 根据数据大小、生命周期和访问方式选择存储。
- 用事务完成 IndexedDB 读写，处理拒绝访问与打开失败。
- 在独立 Worker 中计算，通过消息接收结果并主动终止。

前置：[异步](../javascript/async.md)、[DOM 事件](./dom-events.md)。
必须通过本地 HTTP 运行，不能依赖 `file://` 下的存储和 Worker 行为。

## 为什么不是所有数据都放 localStorage

| 能力 | localStorage | sessionStorage | IndexedDB |
| --- | --- | --- | --- |
| API | 同步字符串键值 | 同步字符串键值 | 异步事务与对象存储 |
| 生命周期 | 通常跨重启保留 | 当前顶层标签页会话 | 通常跨重启保留 |
| 适合 | 小设置、小草稿 | 临时流程状态 | 较多结构化记录、索引、Blob |
| 边界 | 大量读写阻塞主线程 | 不作为跨标签页共享状态 | 事务与升级更复杂 |

它们通常按源隔离：协议、主机、端口任一变化都可能看到不同数据。
sessionStorage 在重新加载后仍保留，关闭会话通常清除。
新标签页通常有独立会话；有 opener 的情况可能先复制一份，之后不持续同步。
隐私模式、配额、策略、用户清理都可能让数据不可用或消失。
本地存储不是可靠备份，也不是保存密码、Token 等秘密的保险箱。

## Worker 与事务的边界

Worker 在独立执行上下文中运行，没有 document，不能直接修改页面。
`postMessage` 使用结构化克隆传递数据，不是共享普通对象引用。
可转移的 ArrayBuffer 可以转移所有权；更复杂的共享内存需要额外安全条件。
本例只发送小对象，不涉及共享内存或传输优化。

IndexedDB 的写请求成功不等于事务已经提交，应等待 transaction 的 complete。
事务可能在请求之间自动变成 inactive，不要在事务中随意 await 网络操作。
版本升级会等待其他连接关闭；用 versionchange 关闭旧连接有助于升级。
Worker 终止会丢弃当前计算，不能撤销已经提交的数据库事务。

## 运行步骤

1. 创建 `storage-workers/`，放入以下三个文件。
2. 启动练习服务器，打开 `/storage-workers/`。
3. 写草稿、保存偏好、执行计算，再刷新验证恢复。
4. 在 Application 查看三个存储区域；它们没有上传到服务端。

## 完整存储与计算示例

::: code-group

```html [index.html]
<!doctype html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>存储与 Worker</title></head>
<body>
  <main>
    <h1>存储与 Worker</h1>
    <label for="draft">会话草稿（最多 80 字）</label>
    <input id="draft" maxlength="80">
    <label for="remember"><input id="remember" type="checkbox">记住显示偏好</label>
    <form id="calculate">
      <label for="count">求和上限（1 到 10000000）</label>
      <input id="count" type="number" min="1" max="10000000" step="1" value="1000000" required>
      <button id="run" type="submit">后台计算并保存</button>
      <button id="cancel" type="button">终止当前计算</button>
    </form>
    <p id="status" role="status">准备就绪。</p>
    <p id="saved"></p>
    <p id="storage-status" role="status"></p>
    <p>计算期间仍可输入草稿；终止不删除之前保存的结果。</p>
  </main>
  <script src="./main.js" defer></script>
</body>
</html>
```

```js [main.js]
'use strict';
const draft = document.querySelector('#draft');
const remember = document.querySelector('#remember');
const status = document.querySelector('#status');
const saved = document.querySelector('#saved');
const storageStatus = document.querySelector('#storage-status');
const run = document.querySelector('#run');
let active = null;
let generation = 0;

function webStorage(area, key, value) {
  try {
    const storage = window[area];
    if (value === undefined) return storage.getItem(key);
    storage.setItem(key, value);
  } catch {
    storageStatus.textContent = 'Web Storage 不可用，草稿或偏好可能无法保存。';
  }
  return null;
}
const restoredDraft = webStorage('sessionStorage', 'tutorial-session-draft');
draft.value = typeof restoredDraft === 'string' ? restoredDraft.slice(0, 80) : '';
remember.checked = webStorage('localStorage', 'tutorial-remember') === 'true';
draft.addEventListener('input', () => webStorage('sessionStorage', 'tutorial-session-draft', draft.value));
remember.addEventListener('change', () => webStorage('localStorage', 'tutorial-remember', String(remember.checked)));

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('tutorial-worker-results', 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      request.result.createObjectStore('results', { keyPath: 'id' });
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error('数据库升级被其他页面阻塞，请关闭旧页面后刷新'));
    };
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
async function accessResult(mode, value) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('results', mode);
      const store = transaction.objectStore('results');
      const request = mode === 'readwrite' ? store.put(value) : store.get('last');
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error || new Error('事务已中止'));
      transaction.onerror = () => reject(transaction.error || new Error('事务请求失败'));
    });
  } finally { db.close(); }
}
const restoringGeneration = generation;
accessResult('readonly').then(record => {
  if (generation !== restoringGeneration) return;
  if (record && Number.isInteger(record.n) && record.n >= 1 && record.n <= 10000000 &&
      Number.isSafeInteger(record.sum) && record.sum === record.n * (record.n + 1) / 2) {
    saved.textContent = `上次保存：1 到 ${record.n} 的和为 ${record.sum}`;
  }
}).catch(error => {
  if (generation === restoringGeneration) storageStatus.textContent = `读取失败：${error.message}`;
});

document.querySelector('#calculate').addEventListener('submit', event => {
  event.preventDefault();
  const n = Number(document.querySelector('#count').value);
  if (!Number.isInteger(n) || n < 1 || n > 10000000) return;
  if (active) active.terminate();
  const current = ++generation;
  let worker;
  try { worker = new Worker('./worker.js'); }
  catch (error) { status.textContent = `Worker 启动失败：${error.message}`; return; }
  active = worker;
  run.disabled = true;
  status.textContent = '后台计算中，页面仍可输入。';
  worker.onmessage = async event => {
    if (current !== generation) return;
    worker.terminate();
    active = null;
    const { sum, error } = event.data;
    try {
      if (error || !Number.isSafeInteger(sum)) throw new Error(error || '结果格式错误');
      await accessResult('readwrite', { id: 'last', n, sum });
      if (current !== generation) return;
      saved.textContent = `上次保存：1 到 ${n} 的和为 ${sum}`;
      status.textContent = '计算完成，数据库事务已提交。';
    } catch (failure) {
      if (current === generation) status.textContent = `未保存：${failure.message}`;
    } finally { if (current === generation) run.disabled = false; }
  };
  worker.onerror = event => {
    event.preventDefault();
    if (current !== generation) return;
    worker.terminate();
    active = null;
    run.disabled = false;
    status.textContent = 'Worker 执行失败，请检查脚本路径与 Console。';
  };
  worker.postMessage({ n });
});
document.querySelector('#cancel').addEventListener('click', () => {
  generation += 1;
  if (active) active.terminate();
  active = null;
  run.disabled = false;
  status.textContent = '已终止等待；已提交或正在提交的存储写入不会被撤销。';
});
window.addEventListener('pagehide', () => { if (active) active.terminate(); });
```

```js [worker.js]
'use strict';
self.onmessage = event => {
  const n = event.data.n;
  if (!Number.isInteger(n) || n < 1 || n > 10000000) {
    self.postMessage({ error: '上限必须是 1 到 10000000 的整数' });
    return;
  }
  let sum = 0;
  for (let i = 1; i <= n; i += 1) sum += i;
  self.postMessage({ sum });
};
```

:::

## 效果验证

上限设为 10，应得到 55；刷新后仍显示 IndexedDB 保存的结果。
草稿刷新后恢复，显示偏好在同一源的另一个标签页也能读到。
取消很快的计算可能发生在计算已完成之后，不能保证每次都拦截结果。
Application 删除数据库后刷新，应重新建库，不出现未处理拒绝。
阻断 `worker.js` 请求后计算，页面应恢复按钮并报告错误。

## 常见错误

在 Worker 中访问 DOM 会报错；页面与 Worker 必须用消息沟通。
把 Web Storage 同步 API 写成 await 不会让它变为非阻塞。
忽略事务 complete，可能把随后中止的写入误报成成功。
localStorage 的 storage 事件主要通知其他文档，不能代替当前页的状态更新。

## 练习与验收标准

把结果保存扩展为历史记录，每条有独立 ID 和保存时间，限制最多 20 条。
验收：写入与清理旧记录在同一事务完成；无存储权限时报告未保存。
解释为什么终止 Worker 与取消数据库事务不是同一件事。

## 延伸资料

- [MDN：Web Storage](https://developer.mozilla.org/zh-CN/docs/Web/API/Web_Storage_API)
- [MDN：IndexedDB](https://developer.mozilla.org/zh-CN/docs/Web/API/IndexedDB_API/Using_IndexedDB)
- [MDN：Web Worker](https://developer.mozilla.org/zh-CN/docs/Web/API/Web_Workers_API/Using_web_workers)

下一章：[网络与开发者工具](./network-devtools.md)。
