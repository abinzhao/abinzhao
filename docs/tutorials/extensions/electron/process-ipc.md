---
title: Electron 进程隔离与窄接口 IPC
description: 从完整项目理解 main、preload、renderer，以及可验证的 IPC 来源和参数边界。
---

# Electron 进程隔离与窄接口 IPC

## 目标与信任模型

构建一个只允许查询应用版本的桌面窗口。Renderer 管界面，main 管系统能力，
preload 只把指定业务函数桥接给页面。所有文件保存在独立的 `electron-ipc`，不修改静态教程站点。
使用 Node 22+ 与 npm；示例安装时锁定实际 Electron 版本，发布前仍需跟进安全更新。

```text [跨进程调用]
renderer：window.desktop.getVersion()
  → preload：只允许 app:get-version
  → IPC：复制可序列化参数/返回值，不共享普通对象引用
  → main：验证 senderFrame，再读取 app.getVersion()
  → Promise 完成，renderer 更新文本
```

`contextIsolation` 将 preload 与页面脚本放在不同 JS 世界；`sandbox` 限制 renderer 的系统能力，
`nodeIntegration: false` 禁止页面直接使用 Node。三者不是可互相替代的选项。
沙箱 preload 的 `require` 只支持有限模块，本例只引入 `electron`，文件操作留在 main。

## 完整五文件项目

::: code-group
```json [package.json]
{
  "name": "electron-ipc-lab",
  "version": "1.0.0",
  "private": true,
  "main": "main.cjs",
  "scripts": { "start": "electron ." }
}
```

```js [main.cjs] {21-23}
const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const page = path.join(__dirname, 'index.html');
const pageURL = pathToFileURL(page).href;
let window = null;
function validSender(event) {
  return window && !window.isDestroyed() &&
    event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame &&
    event.senderFrame.url === pageURL;
}
ipcMain.handle('app:get-version', event => {
  if (!validSender(event)) throw new Error('Sender rejected');
  return { version: app.getVersion() };
});
function createWindow() {
  window = new BrowserWindow({
    width: 640, height: 420,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.on('closed', () => { window = null; });
  window.loadFile(page).catch(error => {
    console.error('Load failed:', error.message);
    app.quit();
  });
}
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((contents, permission, reply) => reply(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

```js [preload.cjs]
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  getVersion: () => ipcRenderer.invoke('app:get-version')
});
```

```html [index.html]
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'self'; base-uri 'none'; form-action 'none'">
  <title>进程隔离实验</title>
  <script src="renderer.js" defer></script>
</head>
<body>
  <h1>应用版本</h1>
  <button id="query" type="button">查询版本</button>
  <output id="status" aria-live="polite">等待查询</output>
</body>
</html>
```

```js [renderer.js]
const button = document.querySelector('#query');
const status = document.querySelector('#status');
button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    const result = await window.desktop.getVersion();
    status.textContent = `版本：${result.version}`;
  } catch {
    status.textContent = '查询失败，请重新打开窗口';
  } finally { button.disabled = false; }
});
```
:::

## 安装与效果验证

```bash [终端：electron-ipc]
npm install --save-dev --save-exact electron@latest
node --check main.cjs
node --check preload.cjs
node --check renderer.js
npm start
```

点击后应显示 `1.0.0`，这是应用 package 的版本，不是 Electron 的版本。
开发时在系统菜单打开开发者工具；Console 检查 `typeof require` 应为 `"undefined"`，
`Object.keys(window.desktop)` 应只包含 `getVersion`。不要为打开 DevTools 关闭安全选项。
关闭全部窗口：Windows/Linux 退出；macOS 保持应用，点击 Dock 图标重新创建窗口。

## 为什么不暴露通用 IPC

`invoke` 与 `ipcMain.handle` 是请求/响应模式，返回 Promise。不要暴露
`send(channel, ...args)`、整个 `ipcRenderer` 或任意 `readFile(path)`；这会让页面选择系统能力。
如果加入订阅，preload 应返回取消订阅函数，并剥离事件对象，避免向页面暴露 `IpcRendererEvent`。
不在 renderer 传入 `app`、函数或 DOM 节点；这些不是跨进程业务数据。

只验证 URL 不够：不可信窗口或子 frame 也可能尝试发消息。
本例同时核对 webContents 对象、主 frame 对象和准确 URL，失败时拒绝而不是继续执行。
`will-navigate` 阻止页面导航，新窗口默认拒绝；main 自己调用 `loadURL` 不受该事件阻止，
所以 main 也不能使用未经验证的 URL。生产优先使用[安全章节](./security)的自定义协议。

## 常见故障与可验收练习

“desktop 不存在”检查 preload 的绝对路径、`.cjs` 文件名与其 Console 错误。
“require 不存在”若在 renderer 出现是正确隔离结果；不要改成 `nodeIntegration: true`。
“No handler registered”核对固定 channel 并在创建窗口前注册 handler；“Sender rejected”检查是否由主 frame 调用。
旧 Electron 版本行为不同，应对照安装的版本文档，不根据默认配置推断安全性。

练习：新增 `getPlatform()`，只返回 `process.platform`，不接受任意字段名。
验收：正常按钮成功，renderer 仍无 Node，bridge 没有通用 channel，子 frame 请求不能获得数据。
预期机制说明：preload 只提供能力入口，最终授权仍在 main，不能只在页面上隐藏按钮。

## 官方资料

- [Electron 进程模型](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [进程沙箱](https://www.electronjs.org/docs/latest/tutorial/sandbox)
- [IPC 教程](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [安全建议](https://www.electronjs.org/docs/latest/tutorial/security)
