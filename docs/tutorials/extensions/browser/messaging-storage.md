---
title: 消息、存储与 Service Worker 恢复
description: 建立有限消息协议，持久化网页标题，并验证后台终止后的恢复。
---

# 消息、存储与 Service Worker 恢复

## 目标与通信边界

这个独立 MV3 插件只在 `http://localhost:8123/` 注入“保存标题”按钮。
Content Script 能访问网页 DOM，但默认位于隔离世界，不能直接读取网页脚本的变量；
隔离不意味着 DOM 数据可信。Service Worker 没有 `document`，只负责验证消息和存储。
Popup 通过 `runtime.sendMessage` 找后台；后台若要找标签页中的 Content Script，应使用 `tabs.sendMessage`。

```text [数据流]
网页标题 → content.js → runtime.sendMessage
  → worker.js 验证类型、发送者、长度 → storage.local
popup.js → runtime.sendMessage → worker.js → 返回已保存标题
```

本章保存一个最新标题，不累计次数，避免把并发的“读后加一”误写成原子事务。
`storage.local` 异步持久化，不是加密保险箱；不放密码或密钥。

## 完整独立插件

建立 `mv3-messages`，以下五个文件均在根目录。Chrome 102+ 支持本例的存储访问级别接口。

::: code-group
```json [manifest.json]
{
  "manifest_version": 3,
  "minimum_chrome_version": "102",
  "name": "Local Title Saver",
  "version": "1.0.0",
  "permissions": ["storage"],
  "background": { "service_worker": "worker.js" },
  "action": { "default_popup": "popup.html" },
  "content_scripts": [{
    "matches": ["http://localhost:8123/*"],
    "js": ["content.js"],
    "all_frames": false
  }]
}
```

```js [worker.js] {35}
const ready = chrome.storage.local.setAccessLevel({
  accessLevel: 'TRUSTED_CONTEXTS'
});
const popupURL = chrome.runtime.getURL('popup.html');
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return false;
  const fromPopup = sender.id === chrome.runtime.id && sender.url === popupURL;
  let fromPage = false;
  try {
    fromPage = sender.id === chrome.runtime.id && sender.tab !== undefined &&
      sender.frameId === 0 && new URL(sender.url).origin === 'http://localhost:8123';
  } catch { fromPage = false; }
  if (!['save-title', 'get-title', 'clear-title'].includes(message.type)) return false;
  (async () => {
    await ready;
    if (message.type === 'save-title') {
      if (!fromPage || typeof message.title !== 'string' || message.title.length > 200) {
        throw new Error('Invalid title or sender');
      }
      const item = { title: message.title, savedAt: Date.now() };
      await chrome.storage.local.set({ latest: item });
      return { ok: true, item };
    }
    if (!fromPopup) throw new Error('Popup only');
    if (message.type === 'clear-title') {
      await chrome.storage.local.remove('latest');
      return { ok: true, item: null };
    }
    const { latest = null } = await chrome.storage.local.get('latest');
    return { ok: true, item: latest };
  })().then(sendResponse, () => {
    sendResponse({ ok: false, error: 'Request rejected or storage failed' });
  });
  return true;
});
```

```js [content.js]
const button = document.createElement('button');
button.textContent = '保存标题到扩展';
button.type = 'button';
document.body.append(button);
button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'save-title', title: document.title.slice(0, 200)
    });
    button.textContent = result?.ok ? '已保存，可再点击' : '保存失败';
  } catch {
    button.textContent = '扩展已重载，请刷新网页';
  } finally { button.disabled = false; }
});
```

```html [popup.html]
<!doctype html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>标题记录</title>
<script src="popup.js" defer></script></head>
<body>
<output id="status" aria-live="polite">读取中</output>
<button id="clear" type="button">清除记录</button>
</body>
</html>
```

```js [popup.js]
const status = document.querySelector('#status');
const clear = document.querySelector('#clear');
async function request(type) {
  try {
    const result = await chrome.runtime.sendMessage({ type });
    if (!result?.ok) throw new Error('Rejected');
    status.textContent = result.item?.title ?? '没有记录';
  } catch { status.textContent = '通信失败，请重载扩展'; }
}
clear.addEventListener('click', () => request('clear-title'));
request('get-title');
```
:::

## 异步响应与恢复机制

监听器在顶层同步注册，不能等待读取配置后才注册，否则唤醒事件可能错过处理器。
监听器本身不是 `async`：异步任务结束再调用 `sendResponse`，立刻返回**字面量 `true`**保持响应通道。
较新的 Chrome 支持返回 Promise，但跨版本仍可采用此模式；无关消息返回 `false`，不抢其他处理器的响应。

`return true` 不保证永不终止。后台通常在空闲约 30 秒后停止，长任务也有生命周期限制；
全局变量、计时器、未完成工作会丢失。此例每次唤醒重新建立 `ready`，从存储恢复，而不是缓存标题。
只有 `storage.set` 完成才回复成功；进程若在写入后、回复前终止，发送方仍可能报错。
真实任务应带请求 ID、持久化任务状态并设计幂等重试；不能把消息当作“恰好执行一次”的队列。

## 运行与验收

准备任意独立静态网页目录 `local-page`，在该目录运行：

```bash [终端：local-page]
python3 -m http.server 8123 --bind 127.0.0.1
```

按[上一章](./manifest)加载 `mv3-messages`，访问 `http://localhost:8123/`，点击网页底部按钮，
再打开 Popup，应显示该页标题。扩展重载后先刷新网页，否则旧 Content Script 的上下文失效。
关闭后台 DevTools，等待空闲，再打开 Popup，标题仍在；也可在 `chrome://serviceworker-internals`
找到扩展 worker 并点击 Stop，再发消息验证唤醒。调试面板保持打开可能干扰自动终止测试。

## 权限与故障

静态 `content_scripts.matches` 只允许指定站点的注入；不需要另加 `<all_urls>`、`tabs` 或 `scripting`。
扩展上下文跨域请求另受 `host_permissions` 管理；Content Script 的请求仍受网页来源/CORS 规则约束。
`setAccessLevel` 禁止 Content Script 直接读写此存储区，但它仍可发送受验证的业务消息。
`sync` 有同步与配额限制，`session` 不跨浏览器重启，`local` 卸载通常被删除；均不能当事务数据库。
“接收端不存在”检查清单 worker 路径和顶层语法；“没有按钮”检查端口、URL、重载和网页刷新。

## 可验收练习与官方资料

新增仅 Popup 可调用的 `get-saved-time`，输出时间但不暴露任意 key 查询。
验收：网页来源调用被拒绝，错误类型没有副作用，Stop 后仍读到原值，清除后显示“没有记录”。

- [Chrome 消息与序列化](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [Service Worker 生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Storage API 与配额](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Content Script 隔离世界](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
