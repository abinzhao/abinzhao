---
title: IndexedDB 本地优先的可靠边界：版本迁移、多标签页与离线应用壳
description: 用原生 IndexedDB 和 Service Worker 实现本地草稿与待同步队列，解释升级事务、blocked/versionchange、写入提交和离线缓存的真实限制。
date: "2026-10-17"
category: 数据工程
tags: [IndexedDB, Local-first, Service Worker, 离线存储]
featured: false
---

# IndexedDB 本地优先的可靠边界：版本迁移、多标签页与离线应用壳

“数据放进 IndexedDB，页面就能离线使用”只说对了一半。数据库保存数据，浏览器却可能没有缓存页面脚本；新标签页运行了新代码，旧标签页还握着旧数据库连接；一条写请求报告成功，同一事务后面的请求仍可能失败。离线系统的难点不是替换 `localStorage`，而是界定代码版本、数据版本与持久化承诺。

本文解决一个实质问题：怎样让本地草稿在升级和多标签页竞争中不悄悄丢失，并准确表达“已保存本机”与“等待同步”。示例使用浏览器原生 IndexedDB、Service Worker 和一个真实静态 HTTP 服务器，不安装数据库包装库，不用内存对象模拟浏览器事务，也不制造一个永远成功的同步接口。

## 先拆开三种容易混淆的成功

请求成功、事务提交和远端同步是三个独立事件。`put().onsuccess` 表示该请求得到结果，不表示整个事务不会在之后中止。只有事务的 `complete` 才能作为本地操作成功的主要依据；即便如此，也不能夸大为所有浏览器和硬件断电条件下都保证已经刷入物理介质。

本地草稿与待同步意图在同一事务里写入，可以避免只有草稿没有同步记录，或者只有同步记录没有对应草稿。但队列里有记录不代表同步已经完成。远端确认、去重、冲突和删除语义仍需要另一套协议；本文明确没有远端服务器，页面一直把队列标记为待同步。

IndexedDB 使用结构化克隆保存值，而不是 JSON 字符串。它能保存一些 JSON 无法直接表达的类型，却也不能保存任意函数和 DOM 节点。持久化类型应当独立于组件对象：不要把含方法的类实例、活跃句柄或 UI 状态对象直接当成稳定数据契约。数据从旧版本读取时，同样需要运行时检查。

MDN 的 [Using IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB) 对版本升级、请求事件和多窗口交互有完整说明。本例采用原生 API，是为了让关键事务时机可见，而不是因为所有包装库都不可靠。使用包装库时仍要核验它是否会延长事务、如何报告中止和如何处理升级阻塞。

## 迁移是 versionchange 事务，不是异步初始化函数

数据库版本是整数，结构变更只在 `onupgradeneeded` 中进行。该回调拥有升级事务，创建对象仓库、创建索引以及迁移记录必须属于这次事务。`oldVersion < 1`、`oldVersion < 2` 的累计步骤，让从空库和从旧版本升级都能走到同一目标结构。

不能在升级回调中先等待网络请求，再继续操作对象仓库。IndexedDB 事务只在特定任务时机保持活动，没有待处理请求时会自动结束；任意 `await fetch()` 之后回来可能已经得到 `TransactionInactiveError`。微任务和库封装的细节不能成为跨浏览器可靠性的假设，外部计算应在事务开始前完成。

迁移大量数据也不是把事务拉得越长越好。结构升级会阻止其他连接继续使用数据库。大数据重写可以采用短升级创建新仓库，再通过可恢复的后台分批迁移及兼容读取完成；但这需要记录迁移进度和读写政策。本例迁移少量草稿，选择一次游标遍历，在任何坏记录出现时中止整个升级。

事务中止应保留旧版本，而不是删除数据库“修好启动”。一旦把失败恢复写成 `deleteDatabase`，用户最需要保住的离线数据反而会成为排障牺牲品。旧程序打开更高版本的库得到 `VersionError` 时，应提示更新代码，不应强行降级或重建。

## 原生数据库模块

创建独立目录，以下文件直接由 Node `22.22.0` 的静态服务器提供。文件 `db.js`：

```js
export const DB_NAME = 'blog-local-first-20261017';

export function openDatabase(notify) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onblocked = () => notify('升级被其他连接阻塞，请关闭旧页面');
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = request.transaction;
      if (event.oldVersion < 1) {
        db.createObjectStore('notes', { keyPath: 'id' });
      }
      if (event.oldVersion < 2) {
        const queue = db.createObjectStore('outbox', { keyPath: 'opId' });
        queue.createIndex('by_note', 'noteId', { unique: false });
        const cursor = tx.objectStore('notes').openCursor();
        cursor.onsuccess = () => {
          const current = cursor.result;
          if (!current) return;
          const value = current.value;
          if (!value || typeof value.id !== 'string' ||
              typeof value.text !== 'string' ||
              !Number.isFinite(value.updatedAt)) {
            tx.abort();
            return;
          }
          current.update({ ...value, revision: 0 });
          current.continue();
        };
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        notify('连接已为新版本关闭，请重新加载页面', true);
      };
      db.onclose = () => notify('数据库连接意外关闭，请重新加载', true);
      resolve(db);
    };
  });
}

function complete(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

export async function snapshot(db) {
  const tx = db.transaction(['notes', 'outbox'], 'readonly');
  const done = complete(tx);
  const notes = tx.objectStore('notes').getAll();
  const count = tx.objectStore('outbox').count();
  await done;
  return { notes: notes.result, pending: count.result };
}

export async function saveNote(db, id, text, expectedRevision) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id) ||
      !text.trim() || text.length > 2000 ||
      (expectedRevision !== null &&
        (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0))) {
    throw new Error('草稿格式无效');
  }
  const opId = crypto.randomUUID();
  const now = Date.now();
  const tx = db.transaction(['notes', 'outbox'], 'readwrite');
  const done = complete(tx);
  const store = tx.objectStore('notes');
  const request = store.get(id);
  let failure;
  let saved;
  request.onsuccess = () => {
    const old = request.result;
    const revision = old ? old.revision : null;
    const nextRevision = (revision ?? 0) + 1;
    if (revision !== expectedRevision ||
        !Number.isSafeInteger(nextRevision)) {
      failure = new Error('版本冲突，请重新读取后再编辑');
      tx.abort();
      return;
    }
    saved = { id, text: text.trim(), updatedAt: now, revision: nextRevision };
    store.put(saved);
    tx.objectStore('outbox').add({
      opId, noteId: id, revision: saved.revision,
      text: saved.text, createdAt: now,
    });
  };
  try {
    await done;
  } catch (error) {
    throw failure ?? error;
  }
  return saved;
}
```

`complete(tx)` 在发出请求前注册终止事件，避免漏掉事务最终结果。所有实际数据库请求都在创建事务后同步排入，或者在活动的请求回调中继续排入。时间和操作 ID 在事务外生成，不在事务中等待异步摘要算法。

这里同时实现本地版本比较。两个标签页都读取修订一时，先提交的写入产生修订二，后提交的事务再读取当前记录会发现预期修订不符。IndexedDB 对相关仓库的写事务进行调度，但它不会替应用判断“覆盖别人编辑”是不是合法，所以仍要加入这个领域条件。

版本迁移给旧草稿补修订零，不会自动创建远端写入意图。旧数据是否应该首次上传，必须由产品定义；本例不凭迁移自行触发同步。真实同步队列还要定义任务保留、重试退避、操作顺序和服务器幂等键，离线期间删除的记录也需要墓碑而不是简单从本机消失。

## 页面只承诺本地保存

文件 `index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8"><title>本地草稿事务</title></head>
  <body>
    <h1>本地草稿</h1>
    <button id="open">打开数据库</button>
    <button id="refresh" disabled>刷新列表</button>
    <button id="persist">申请持久存储</button>
    <p id="status" role="status"></p>
    <p id="cache" role="status"></p>
    <p id="queue"></p>
    <form id="editor">
      <label>标识<input id="id" value="note_1" required></label>
      <label>正文<textarea id="text" maxlength="2000" required></textarea></label>
      <button id="save" disabled>保存本机</button>
    </form>
    <ul id="list"></ul>
    <script type="module" src="/app.js"></script>
  </body>
</html>
```

文件 `app.js`：

```js
import { openDatabase, snapshot, saveNote } from './db.js';
const element = (id) => document.getElementById(id);
let db;
let expectedRevision = null;
const notify = (message, closed = false) => {
  element('status').textContent = message;
  if (closed) {
    db = undefined;
    element('save').disabled = true;
    element('refresh').disabled = true;
    element('open').disabled = true;
  }
};

async function refresh() {
  const state = await snapshot(db);
  element('list').replaceChildren();
  for (const note of state.notes) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.textContent = `${note.id} / 修订 ${note.revision}：${note.text}`;
    button.onclick = () => {
      element('id').value = note.id;
      element('text').value = note.text;
      expectedRevision = note.revision;
    };
    li.append(button);
    element('list').append(li);
  }
  element('queue').textContent = `待同步意图 ${state.pending} 条，本例未连接远端`;
}

element('open').onclick = async () => {
  element('open').disabled = true;
  try {
    db = await openDatabase(notify);
    await refresh();
    element('save').disabled = false;
    element('refresh').disabled = false;
    notify('数据库已打开');
  } catch (error) {
    notify(`打开失败：${error.name}，未删除原数据`);
    element('open').disabled = false;
  }
};
element('id').oninput = () => { expectedRevision = null; };
element('refresh').onclick = () => {
  void refresh().catch((error) => notify(error.message));
};
element('editor').onsubmit = async (event) => {
  event.preventDefault();
  element('save').disabled = true;
  try {
    const note = await saveNote(
      db, element('id').value, element('text').value, expectedRevision,
    );
    expectedRevision = note.revision;
    notify(`修订 ${note.revision} 已提交到本机，尚未远端同步`);
    await refresh();
  } catch (error) {
    notify(error.message);
  } finally {
    element('save').disabled = !db;
  }
};
element('persist').onclick = async () => {
  try {
    const granted = await navigator.storage.persist();
    notify(granted ? '浏览器批准持久存储，仍需备份' : '未批准，仍可能被回收');
  } catch (error) {
    notify(`持久存储申请失败：${error.name}`);
  }
};

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(async () => {
    await navigator.serviceWorker.ready;
    element('cache').textContent = '应用壳安装完成，可测试离线重新加载';
  }).catch((error) => {
    element('cache').textContent = `离线缓存不可用：${error.name}`;
  });
}
```

刷新列表不会擅自更新编辑器的预期修订，否则会把旧正文包装成新的版本并覆盖其他标签页。遇到冲突，用户点击列表中的当前记录重新加载再编辑。列表正文通过 `textContent` 渲染，避免持久化的文本被当成 HTML 执行。

为了聚焦存储边界，页面没有删除、同步或备份按钮，也没有把未实现的操作做成看起来能点的入口。生产程序必须有可恢复的数据导出策略，特别是用户关闭隐私模式、清理站点数据、换浏览器或换设备时，本地优先不自动拥有跨设备备份。

## Service Worker 保存的是应用壳

文件 `sw.js`：

```js
const CACHE = 'blog-local-first-shell-v2';
const ASSETS = ['/', '/index.html', '/app.js', '/db.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('blog-local-first-shell-') && name !== CACHE) {
        await caches.delete(name);
      }
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(event.request);
      } catch {
        return (await caches.open(CACHE)).match('/index.html');
      }
    })());
    return;
  }
  if (ASSETS.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match(url.pathname)) ?? fetch(event.request);
    })());
  }
});
```

缓存安装中的资源必须全部成功，不能下载了一半就报告应用壳就绪。本例不调用 `skipWaiting()`，更新的 Worker 等旧客户端退出后再激活，避免强行控制运行着旧代码的标签页。这会延迟升级，属于明确的安全取舍；真正产品可增加“有新版本，关闭其他页面后更新”的交互。

静态资源使用固定文件名，适合这份小程序，但生产构建最好使用带内容哈希的资源和版本化入口。否则新 HTML 可能配上旧脚本，形成代码与数据版本错配。Service Worker 版本号和 IndexedDB 版本号不必须相同，但发布流程必须规定哪些代码能读写哪些数据结构。

这个 Worker 只缓存本机应用壳，不缓存带用户身份的 API，也不拦截写请求。把所有 GET 无差别缓存会保存个人信息和过期权限结果；把 POST 离线排队则需要对正文、凭证有效期、幂等和撤销重新设计。缓存命中只能说明得到一份响应，不能说明响应代表当前服务器事实。

## 启动真实静态服务器

文件 `server.mjs`：

```js
import http from 'node:http';
import { readFile } from 'node:fs/promises';

const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/db.js': ['db.js', 'text/javascript; charset=utf-8'],
  '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
};
const server = http.createServer(async (req, res) => {
  const entry = files[new URL(req.url, 'http://127.0.0.1').pathname];
  if (req.method !== 'GET' || !entry) {
    res.writeHead(404).end();
    return;
  }
  try {
    const bytes = await readFile(new URL(entry[0], import.meta.url));
    res.writeHead(200, { 'content-type': entry[1], 'cache-control': 'no-store' });
    res.end(bytes);
  } catch {
    res.writeHead(500).end();
  }
});
server.listen(3003, '127.0.0.1', () => console.log('listening:3003'));
process.once('SIGTERM', () => {
  server.close();
  server.closeAllConnections();
});
```

在目录执行：

```sh
node server.mjs
```

打开 `http://127.0.0.1:3003`。本机回环地址可用于 Service Worker 的安全上下文测试，部署到其他主机必须使用 HTTPS。先等缓存状态就绪，再打开数据库、保存草稿，关闭网络后重新加载并再次保存。首次从未访问的站点不能凭空离线启动，这个边界不能用一张已打开页面的截图掩盖。

## 复现升级阻塞和事务冲突

使用独立浏览器配置或专门测试站点，确保这个示例数据库尚未创建。页面首次打开但还没点击“打开数据库”时，在开发者工具执行以下真实版本一创建操作：

```js
const seed = indexedDB.open('blog-local-first-20261017', 1);
seed.onupgradeneeded = () => {
  seed.result.createObjectStore('notes', { keyPath: 'id' });
};
seed.onsuccess = () => {
  window.oldConnection = seed.result;
  const tx = oldConnection.transaction('notes', 'readwrite');
  tx.objectStore('notes').put({
    id: 'legacy_note', text: '迁移前的中文草稿', updatedAt: Date.now(),
  });
  tx.oncomplete = () => console.log('版本一记录已提交，连接故意保持打开');
};
```

点击页面打开按钮，版本二请求应报告 `blocked`。控制台执行 `oldConnection.close()`，升级才有机会继续；旧草稿应保留并获得修订零，同时出现空的 outbox。这里故意不关闭旧连接是复现条件，正常应用的 `versionchange` 处理器必须关闭连接并停止接受新编辑。

再打开两个正常标签页，分别选择同一条记录，然后依次保存不同正文。后提交的标签页应提示版本冲突，而不是覆盖前者。测试必须确认 notes 与 outbox 一起变化；可在浏览器开发者工具检查两个仓库。升级中加入坏的旧记录可以验证事务中止后数据库仍保持版本一，但应在独立测试库操作，不对真实用户草稿做破坏性验证。

## 配额、回收与离线的最终边界

存储配额由浏览器、设备容量、来源和隐私政策共同决定，不能硬编码一个“所有浏览器都有”的容量。`navigator.storage.estimate()` 只能提供估计，`persist()` 返回获准也不意味着用户清理和设备损坏不会丢数据。`QuotaExceededError` 必须作为写事务失败处理，UI 保留未保存正文并提供恢复路径，不能显示保存成功。

页面关闭事件不是可靠的最后保存机会。移动系统可以直接杀死进程，后台标签页也可能冻结；保存应发生在用户操作或受控自动保存中，而不是依赖 `beforeunload`。数据库连接关闭用于允许升级，不是一次隐式提交命令，未完成事务仍要根据真正的完成事件判断结果。

本文的验证方法覆盖浏览器中的存储、连接和应用壳，不覆盖所有 Safari、Firefox、Android WebView 或低存储设备。跨浏览器发布必须重复升级、离线重载、异常关闭和配额路径。队列持久化只是同步系统的起点，不是已经实现服务器冲突合并。

## 数据版本和业务修订不是同一个计数器

数据库版本二表示仓库结构具备 outbox，不表示每条草稿都是第二次编辑。记录修订用于判断同一对象的并发修改，两者应保持独立。新记录用 `null` 表示“预期不存在”，迁移后的修订零表示“已经存在的旧记录”；混用零作为两者的哨兵，会允许尚未读取的旧草稿被新建操作覆盖。

同步到远端以后，本地修订也未必等于服务器修订。服务器可能执行合并、拒绝操作或者接收另一台设备的编辑，需要分别保存本地修改标识、服务器版本和操作键。仅比较 `updatedAt` 的大小不可靠，因为设备时钟可能偏移、离线操作可能晚到，时间戳不是跨设备的并发控制协议。

用待同步队列保存每次修订，能留下操作顺序，但连续编辑也会让队列变大。若压缩为最后一份状态，必须确认业务只关心最终覆盖，且没有依赖中间版本的操作。删除、附件上传和引用关系通常不能盲目压缩。队列整理是一种语义优化，应先证明等价，再讨论减少存储。

多标签页可以通过 BroadcastChannel 通知“某条记录有更新”，让其他页面刷新列表，但通知不能替代数据库的权威读取，也不是可靠消息队列。标签页可能暂停或尚未启动，因而仍需要在保存事务里检查预期版本。浏览器中的通知提高体验，事务里的版本条件保障正确性。

## 错误恢复不能破坏离线数据

升级请求受到阻塞时，页面应该告诉用户是哪一类问题，并保持等待或明确结束等待。IndexedDB 没有通用的取消 open 请求接口；应用若自行设置等待超时，还要在请求后来成功时立即关闭已不需要的连接，避免隐藏的连接再次阻塞下一轮升级。简单 Promise 超时不会自动撤回浏览器中的请求。

升级失败时应区分结构错误、旧数据不符合迁移前提和运行条件失败。恢复方法可以是更新迁移逻辑、先导出旧记录或者在兼容代码中分批修复。删除数据虽然能让新代码打开空库，却不能满足用户希望保留草稿的目标；清空库只能是经过用户明确确认的最后动作。

配额不足也不一定只来自这份数据库。缓存的图片、离线应用壳和其他存储共享来源相关预算，应该按实际使用情况评估。可重建的缓存和不可重建的草稿有不同价值，清理政策应优先处理可恢复内容，同时让用户有机会导出个人数据，不能按目录大小直接决定删除顺序。

站点更新还可能碰到长期离线的旧客户端。服务器不能假设所有设备都已经升级数据格式，同步接口应有版本协商或明确的最低支持版本。新页面的 Service Worker 激活成功，只证明当前浏览器使用了一份新资源，不证明其他设备和远端队列都完成迁移。这些跨设备条件需要独立验证。

## 示例验证范围

在 Chromium 的真实 IndexedDB 中创建版本一草稿并保持旧连接，验证版本二打开出现 blocked，关闭旧连接后迁移保留正文并补修订零。测试了预期不存在不能覆盖旧记录、旧修订写入冲突中止以及 notes/outbox 的一致结果，没有使用内存数据库替代浏览器事务。

浏览器断网后保存中文草稿，并通过 Service Worker 离线重新加载，数据和待同步队列仍可读取。另打开多个连接请求更高版本，观察 versionchange 关闭连接并解除阻塞。未验证 Safari、Firefox、配额耗尽、断电持久性及真正远端同步；页面的待同步状态因此保持明确，不冒充服务器确认。

## 官方参考

- [MDN：Using IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB)
- [MDN：IDBTransaction 与活动期、完成和中止](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction)
- [MDN：IndexedDB blocked 事件](https://developer.mozilla.org/en-US/docs/Web/API/IDBOpenDBRequest/blocked_event)
- [MDN：Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [MDN：存储配额与回收标准](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

可靠的本地优先界面应该让用户知道：哪份数据已经在本机事务中提交，哪些操作等待远端确认，哪次代码升级需要其他连接配合。只有把这些状态分别建立证据，离线能力才不是一个模糊的“已缓存”图标。
