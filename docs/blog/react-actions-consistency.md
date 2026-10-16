---
title: React 19 Actions 的一致性边界：乐观更新、未知结果与服务端幂等
description: 通过 React 19 useActionState、useOptimistic 和真实 SQLite 写入，解释异步 Action 的顺序、失败恢复、幂等重试及认证边界。
date: "2026-10-17"
category: 前端工程
tags: [React, Actions, 乐观更新, 幂等性]
featured: true
---

# React 19 Actions 的一致性边界：乐观更新、未知结果与服务端幂等

提交按钮变灰，并不意味着消息只能写入一次。用户可以打开两个标签页，客户端可以超时重试，代理也可能在服务器提交成功后丢失响应。React 19 的 Actions 改善了异步交互的状态组织，但没有接管数据库事务、用户认证或网络的至少一次投递问题。

本文解决的实质问题是：一个乐观显示的消息，怎样在真实后端写入、明确拒绝和结果未知之间保持可解释的一致性。示例采用 React `19.3.1`、Vite `7.3.7`、Node `22.22.0` 和 Node 内置 SQLite，版本是可安装的发布包，不使用假的延迟函数代替后端。它是单用户本机程序，不是可直接开放到互联网的聊天服务。

## Actions 提供的是交互调度，不是全局串行化

`useActionState` 返回当前状态、派发函数和 `isPending`。Action 的第一个参数是上一次返回的状态，第二个参数才是表单数据或派发载荷。把原来接受一个 `FormData` 的函数直接接进来而不调整参数，是非常实际的迁移错误。

React 官方 [useActionState](https://react.dev/reference/react/useActionState) 文档说明，同一个 Hook 的多次派发按队列顺序执行，后一个 Action 得到前一个的结果。这种顺序属于这个 Hook 实例，不覆盖其他组件、另一个标签页或另一台设备。它也不表示数据库按客户端的渲染顺序提交。多写者仍需要服务端约束，覆盖更新还需要版本比较。

派发函数应该交给表单的 `action` 属性，或者在 Action/Transition 中调用。它不是返回服务端结果的普通 Promise，不能通过 `await dispatch(...)` 获得提交结果。需要等待的网络操作写在 Action 函数内部；预期内的校验失败返回状态，真正意外的异常交给错误边界。官方文档还说明，抛错会影响排队中的 Actions，因而不能把每个普通输入错误都处理成未捕获异常。

`useOptimistic` 是暂时投影，不是另一份权威数据库。传入已确认状态和纯 reducer，Action 内加入临时操作，待 Action 结束后以权威状态为准。若权威状态期间发生变化，乐观计算要能基于新的状态重放，因此 reducer 不能发送请求、生成随机数或依赖可变的全局计数器。

`await` 后的状态更新与 Transition 上下文还有需要注意的边界。本例对等待后清空输入和更换操作键的更新显式使用 `startTransition`。不要据此宣称所有普通状态更新都必须在 Transition 内，也不要误认为调用了它就能消除网络乱序。它解决的是 React 调度的语义，不是业务提交的互斥。

## “失败”必须拆成两个不同状态

首次尝试返回 400，可以明确表示输入未接受；返回 401，表示这一次请求身份不满足条件；相同幂等键对应不同正文返回 409。首次尝试被明确拒绝时，客户端可以恢复编辑。超时、断连、无法解析成功响应，以及部分服务端错误则不同：请求可能已经提交，客户端只是没有获得确认。若原操作已进入结果未知状态，重试返回 401 或其他拒绝不能证明首次请求没有提交，必须继续保留原正文和键，重新认证后确认同一个操作。

结果未知时若重新生成键再提交，就把同一个意图变成两个操作。示例保留原正文和幂等键，锁定编辑，只允许重试这一操作。成功后才清空输入并生成新键。这样的 UI 稍保守，却不会用“发送失败”的错误文案诱导用户制造重复消息。

服务端以认证主体和操作键建立唯一约束。同一个键、同一份规范化正文返回当前权威列表；同一个键、不同正文返回冲突。记录的唯一性必须和业务写入在同一个事务中完成，不能先检查一个内存 Map，再异步插入数据库。服务重启和多进程都会打破内存去重。

这里的“幂等”指逻辑操作的效果最多一次，不承诺重试响应逐字节相同。重试时其他操作可能已经增加了消息，返回的列表可以更新。支付类接口若要保证原始响应重放，应另行持久化响应及状态，并明确幂等键的保留期限；这些政策不是一个 UUID 自动提供的。

## 可运行的后端：认证、事务与幂等键一起落地

在独立目录安装前端依赖：

```sh
mkdir react-actions-example
cd react-actions-example
npm init -y
npm install --save-exact react@19.3.1 react-dom@19.3.1 vite@7.3.7
```

文件 `server.mjs` 使用真实 SQLite 文件。Node 22 的 `node:sqlite` 可能输出实验性提示，不需要第三方原生编译依赖：

```js
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual,
  createHash } from 'node:crypto';

const password = process.env.LOCAL_PASSWORD;
if (!password || password.length < 12) {
  throw new Error('Set LOCAL_PASSWORD to at least 12 characters');
}
const salt = randomBytes(16);
const passwordHash = scryptSync(password, salt, 32);
const hash = (text) => createHash('sha256').update(text).digest('hex');
const db = new DatabaseSync('messages.sqlite');
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 2000;
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, expires INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    op_key TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    text TEXT NOT NULL,
    PRIMARY KEY (user_id, op_key)
  );
`);
const list = () => db.prepare(`
  SELECT id, op_key AS opKey, text FROM messages
  WHERE user_id = 1 ORDER BY rowid
`).all();
const fault = (status, code) => Object.assign(new Error(code), { status, code });

function reply(res, status, body, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

async function body(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) throw fault(413, 'body_too_large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true })
      .decode(Buffer.concat(chunks)));
  } catch {
    throw fault(400, 'invalid_json');
  }
}

function authenticate(req) {
  const token = /(?:^|;\s*)session=([a-f0-9]{48})(?:;|$)/
    .exec(req.headers.cookie ?? '')?.[1];
  if (!token || !db.prepare(
    'SELECT 1 FROM sessions WHERE token_hash = ? AND expires > ?',
  ).get(hash(token), Date.now())) throw fault(401, 'login_required');
}

async function handle(req, res) {
  if (req.method === 'POST' &&
      req.headers.origin !== 'http://127.0.0.1:5177') {
    throw fault(403, 'origin_rejected');
  }
  if (req.method === 'POST' && req.url === '/api/login') {
    const input = await body(req);
    if (!input || typeof input.password !== 'string' ||
        input.password.length > 256 ||
        !timingSafeEqual(scryptSync(input.password, salt, 32), passwordHash)) {
      throw fault(401, 'login_failed');
    }
    const token = randomBytes(24).toString('hex');
    db.prepare('INSERT INTO sessions VALUES (?, ?)')
      .run(hash(token), Date.now() + 3600000);
    reply(res, 200, { messages: list() }, {
      'set-cookie': `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`,
    });
    return;
  }
  authenticate(req);
  if (req.method === 'GET' && req.url === '/api/messages') {
    reply(res, 200, { messages: list() });
    return;
  }
  if (req.method !== 'POST' || req.url !== '/api/messages') {
    throw fault(404, 'not_found');
  }
  const input = await body(req);
  if (!input || Array.isArray(input) ||
      Object.keys(input).some((key) => !['opKey', 'text'].includes(key)) ||
      typeof input.opKey !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(input.opKey) ||
      typeof input.text !== 'string' ||
      !input.text.trim() || input.text.length > 500) {
    throw fault(400, 'invalid_message');
  }
  const text = input.text.trim();
  const payloadHash = hash(text);
  db.exec('BEGIN IMMEDIATE');
  let created = false;
  let messages;
  try {
    const existing = db.prepare(
      'SELECT payload_hash FROM messages WHERE user_id = 1 AND op_key = ?',
    ).get(input.opKey);
    if (existing && existing.payload_hash !== payloadHash) {
      throw fault(409, 'idempotency_conflict');
    }
    if (!existing) {
      db.prepare('INSERT INTO messages VALUES (?, 1, ?, ?, ?)')
        .run(randomUUID(), input.opKey, payloadHash, text);
      created = true;
    }
    messages = list();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  reply(res, created ? 201 : 200, { messages });
}

const server = http.createServer((req, res) => {
  void handle(req, res).catch((error) => {
    if (res.destroyed) return;
    reply(res, error.status ?? 500, { code: error.code ?? 'internal_error' });
  });
});
server.listen(3002, '127.0.0.1', () => console.log('listening:3002'));
process.once('SIGTERM', () => {
  server.close(() => db.close());
  server.closeAllConnections();
});
```

这是实际的密码校验和会话，不是通过表单中的 `userId` 假装登录。固定主体一来自这个单用户应用的设计，真实多用户系统要建立用户表，并把主体从会话查询带入所有 SQL 条件。生产还需要登录速率限制、注销、会话清理、密码治理和审计，本例没有实现这些能力。

Cookie 在本机 HTTP 上没有 `Secure`，部署必须切换 HTTPS 并启用该属性。SameSite 不是唯一的 CSRF 防线；示例对写请求显式检查精确 Origin，不设置通配 CORS。使用代理后也要保留这一验证，而不是相信浏览器表单中的身份信息。幂等键同样不是认证凭证，任何业务写入都先认证再访问去重记录。

数据库事务中没有 `await`，同步 SQLite 调用按当前进程顺序执行，并通过唯一约束与 `BEGIN IMMEDIATE` 防止其他连接同时通过检查。同步 API 会阻塞事件循环，适合这个小型验证程序；高吞吐服务要评估异步驱动、事务锁等待和请求并发，不能把本机功能正确推导成容量足够。

## 前端：把未知结果保留为可重试操作

文件 `vite.config.mjs`：

```js
export default {
  server: {
    host: '127.0.0.1',
    port: 5177,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:3002' },
  },
};
```

文件 `index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8"><title>消息提交一致性</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.jsx"></script>
  </body>
</html>
```

文件 `main.jsx`，不需要额外的 React 插件才能运行这个最小页面：

```jsx
import React, { useActionState, useOptimistic, useState,
  startTransition } from 'react';
import { createRoot } from 'react-dom/client';

function validMessages(value) {
  return Array.isArray(value) && value.every((item) =>
    item && typeof item.id === 'string' &&
    typeof item.opKey === 'string' && typeof item.text === 'string');
}

function Messages({ initial }) {
  const [text, setText] = useState('');
  const [opKey, setOpKey] = useState(() => crypto.randomUUID());
  const [state, dispatch, pending] = useActionState(async (previous, form) => {
    const input = { opKey: form.get('opKey'), text: form.get('text') };
    optimistic({ id: input.opKey, ...input, pending: true });
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        const unknown = previous.phase === 'unknown' || response.status >= 500;
        return {
          ...previous,
          phase: unknown ? 'unknown' : 'rejected',
          message: `HTTP ${response.status}：${unknown
            ? '原操作仍未确认，请保留正文与操作键' : '本次请求被拒绝，可修改或重新登录'}`,
        };
      }
      const data = await response.json();
      if (!validMessages(data.messages)) throw new Error('Invalid response');
      startTransition(() => {
        setText('');
        setOpKey(crypto.randomUUID());
      });
      return { items: data.messages, phase: 'ok', message: '服务器已确认' };
    } catch {
      return { ...previous, phase: 'unknown', message: '结果未知，请原样重试' };
    }
  }, { items: initial, phase: 'idle', message: '' });
  const [items, optimistic] = useOptimistic(state.items, (current, item) => [
    ...current.filter((old) => old.opKey !== item.opKey), item,
  ]);
  const locked = pending || state.phase === 'unknown';
  return (
    <main>
      <h1>消息</h1>
      <ul>{items.map((item) => (
        <li key={item.opKey}>{item.text} {item.pending ? '（待确认）' : ''}</li>
      ))}</ul>
      <form action={dispatch}>
        <input type="hidden" name="opKey" value={opKey} />
        <label>正文
          <textarea name="text" required maxLength={500}
            value={text} readOnly={locked}
            onChange={(event) => {
              setText(event.target.value);
              setOpKey(crypto.randomUUID());
            }} />
        </label>
        <button disabled={pending}>
          {pending ? '提交中' : state.phase === 'unknown' ? '原样重试' : '发送'}
        </button>
      </form>
      <p role="status">{state.message}</p>
      {state.phase === 'unknown' && <p>
        若会话过期，请在新标签页登录，然后回到本页原样重试；不要刷新本页。
      </p>}
      {state.phase === 'rejected' && <p>登录失效时刷新页面后重新登录。</p>}
    </main>
  );
}

function App() {
  const [initial, setInitial] = useState(null);
  const [message, setMessage] = useState('');
  const [loginState, login, pending] = useActionState(async (_, form) => {
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: form.get('password') }),
        signal: AbortSignal.timeout(5000),
      });
      const data = await response.json();
      if (!response.ok || !validMessages(data.messages)) {
        return '登录未成功';
      }
      startTransition(() => {
        setInitial(data.messages);
        setMessage('');
      });
      return '';
    } catch {
      return '登录请求未完成';
    }
  }, '');
  if (initial) return <Messages initial={initial} />;
  return (
    <form action={login}>
      <h1>本机登录</h1>
      <label>密码<input name="password" type="password"
        autoComplete="current-password" required /></label>
      <button disabled={pending}>{pending ? '登录中' : '登录'}</button>
      <p role="status">{loginState || message}</p>
    </form>
  );
}

createRoot(document.getElementById('root')).render(<App />);
```

两个终端启动。密码由操作者在本机输入，不写在源码或日志中：

```sh
read -s LOCAL_PASSWORD
export LOCAL_PASSWORD
node server.mjs
```

```sh
npx vite
```

打开 `http://127.0.0.1:5177`，输入同一密码后提交正文。刷新页面会重新显示登录入口，登录后从数据库重新读取列表；页面没有伪装成拥有持久登录恢复能力。React 会转义正文的文本渲染，本例不使用 `dangerouslySetInnerHTML`。

## 为什么成功状态不能只删除 pending 标记

临时消息以操作键关联，服务器消息还拥有自己的记录 ID。仅把临时对象的 `pending` 改成 `false`，等于让客户端凭猜测制造权威记录。示例在确认后采用服务端返回的列表，Action 结束时乐观投影随之退出；失败则回到先前确认的列表，不把临时消息当成成功数据保留下来。

这个程序没有多标签页实时订阅。另一个标签页新增的消息，在本页下一次成功提交或重新登录时才会出现。若要求持续一致的读视图，需要补充事件订阅、轮询或刷新，并规定服务端版本号。不能因为两边都用了 `useOptimistic` 就声称本地列表已经是全局最新。

对“修改已有记录”的需求，这个追加模型还不够。幂等键防止重复执行同一操作，却不防止两个不同键覆盖同一字段。应提交预期版本，服务端执行条件更新，版本不一致返回冲突，客户端再决定重新读取、人工合并或撤销。这与发送按钮的禁用状态完全是不同层次的问题。

表单 Action 不自动变成 Server Function。本例在浏览器通过 HTTP 访问后端，普通 Vite 不提供 React Server Components 的服务端调用协议。官方文档涉及的 permalink 和渐进增强，需要支持相应能力的框架；这个页面在 JavaScript 未加载时不能完成同样流程，文章不把它描述成无脚本可用。

## 验证矩阵：确认的效果与未知的结果分开测

最小 API 验证从未登录写入开始，应返回 401；写请求缺少或使用错误 Origin，应返回 403。正确密码登录后，提交固定操作键和固定正文两次，第一次是 201，第二次是 200，列表只有一条对应消息。再用原键提交不同正文，必须返回 409，列表不应变化。

验证唯一约束时要并发提交两个真实 HTTP 请求，而不是重复调用组件 reducer。还应重启后端再提交原键，确认数据库持久化承担去重职责。这个单用户服务的会话保存在 SQLite，重启后仍可用至过期，但更换本机密码不会自动撤销已有会话；生产密码变更必须定义会话失效政策。

结果未知测试应建立真实失败窗口：让服务器提交成功，但客户端在接收响应前断开，然后以同一个键重新请求，检查记录数。还要让会话在重试前过期：这次 401 必须保持 `unknown`，正文继续只读，原键不变；在另一个标签页重新登录，再回原页重试时应恢复同一条记录。浏览器离线切换通常只能证明请求没有完成，不一定证明服务端已经提交。自动化测试可以在独立测试进程控制连接关闭时机，但不要把假成功响应称为数据库验证。

UI 验证关注待确认显示、成功后正文清空、拒绝后恢复编辑，以及未知结果后正文和键保持不变。输入中文、空白和超过上限的内容，确认服务端仍独立检查。浏览器控制台不应出现 Action 上下文错误；在 React 开发模式中复查组件挂载与 reducer 的纯函数要求，不以“截图看上去对了”代替生命周期证据。

这里没有实施请求取消等于撤销写入的错误假设。浏览器的 `AbortSignal.timeout` 仅终止等待，后端可能继续完成事务。真正撤销需要独立业务操作和状态机；已提交的消息删除也应是新的经过授权的操作，而不是清理某个前端控制器。

## 操作键的生命周期是产品协议

幂等键应该对应一个用户意图，而不是每次 HTTP 尝试。本例在正文变化时建立新键，在等待确认期间保持不变。若支持上传附件、收件人和金额，摘要必须覆盖所有影响业务效果的字段，并按照明确的规范化规则生成。只对正文做摘要却允许重试时更换附件，会让服务端错误地把不同操作判为相同。

随机键减少意外碰撞，但不能防止调用者故意复用。服务端必须按认证主体隔离键空间，并拒绝同键不同载荷。请求里携带的租户或用户字段不能决定去重范围，否则攻击者既可能造成跨用户冲突，也可能借查询幂等记录窥探另一个用户的操作。

键的保留期决定重试的实际保证。记录一小时后被清理，离线设备第二天用原键恢复请求时，就可能产生第二次效果。真实系统需要根据最大重试窗口确定保留期，必要时长期保留已执行操作的最小摘要。本机示例不清理去重记录，换来简单但不断增长的存储，不是可无限扩展的归档方案。

页面刷新会丢失当前未确认正文和键，这是本例的显式限制。若产品要求关闭浏览器后继续重试，应先将逻辑操作持久化，再发送请求，并在得到服务器确认后删除或标记完成。持久化队列还需要处理账号切换、敏感数据保存、旧协议升级和已经撤销的意图，不能只把表单对象写进 localStorage。

## 乐观 UI 也需要确定冲突的表达方式

乐观新增、乐观删除和乐观覆盖的失败成本不同。新增一条临时消息容易回到原列表；删除可能隐藏用户接下来需要操作的对象；覆盖复杂表单还可能丢失用户编辑。因此，不应把同一个“失败时回滚”口号机械应用到所有场景。每种操作都需要明确保留草稿、显示未确认状态和重新读取的策略。

存在多个未确认操作时，乐观 reducer 要按逻辑操作标识重放，而不是按数组下标覆盖。数组下标随着排序和服务端刷新变化，容易把确认结果应用到错误项。本例以操作键去重，权威记录 ID 用于服务端身份，两者职责不同；在实际列表中还应规定排序、分页与临时项位置。

即时反馈不代表应该隐藏网络状态。待确认的内容可以显示，但不能让其他操作把它当成已存在的服务端资源，例如立刻对临时消息发起引用或删除。依赖操作可以等待确认，也可以作为同一个服务端事务的命令提交；把临时对象 ID 直接交给后端查询会形成另一种竞态。

最后，前端和后端的完成标准必须交叉验证。前端显示一次成功但数据库写入两次，是一致性失败；数据库只写一次但 UI 永久停在待确认，也是用户流程失败。React 提供状态组织工具，唯一约束保证效果边界，HTTP 故障验证解释不确定性，三类证据一起成立，才足以评价这条交互链路。

## 示例验证范围

本机运行完整服务与真实 SQLite 文件，验证未登录拒绝、错误 Origin 拒绝、同键同载荷重放、同键不同载荷冲突和并发请求去重。独立 HTTP 转发测试在后端完成响应后关闭下游连接，随后以原键重试，数据库只有一条对应消息。

Chromium 中完成密码登录、真实发送、成功清空正文、浏览器断网后的未知状态和恢复网络后的原键重试。没有采用伪成功接口。未覆盖生产密码系统、跨进程容量、长期离线操作持久化或服务重启后全部恢复路径，不能据此声称已具备生产聊天系统的可靠性。

## 官方参考与适用限制

- [React useActionState：参数、队列、Action 上下文和异常](https://react.dev/reference/react/useActionState)
- [React useOptimistic：基准状态、纯 reducer 与乐观投影](https://react.dev/reference/react/useOptimistic)
- [React useTransition：异步 Action 与 await 后更新的限制](https://react.dev/reference/react/useTransition)
- [Node 22 SQLite：DatabaseSync 与事务执行](https://nodejs.org/docs/latest-v22.x/api/sqlite.html)
- [SQLite 事务语义](https://www.sqlite.org/lang_transaction.html)

示例没有负载基准、生产身份系统、消息分页或跨标签页订阅。它展示的是可验证的写入边界：React 管理暂时交互，服务端确定身份，数据库保存幂等效果，客户端对无法确认的结果保留原始操作。把四者的职责明确分开，比增加更多 pending 标志更能避免真实重复写入。
