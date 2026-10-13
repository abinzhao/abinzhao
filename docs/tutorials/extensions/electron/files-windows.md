---
title: 用户授权文件与多窗口生命周期
description: 让主进程通过 dialog 获得文件句柄，限制读写范围，并隔离每个窗口的授权。
---

# 用户授权文件与多窗口生命周期

## 目标与边界
创建多个独立的文本编辑窗口，每个窗口只能编辑自己通过系统对话框选择的 `.txt` 文件。
Renderer 仅发送文本，不发送路径；main 保存已打开的文件句柄，关闭窗口释放授权。
本例上限 64 KiB、UTF-8、最多三个窗口，只覆盖普通本地文本，不编辑配置、二进制或受保护目录。
路径来源正确仍不等于内容安全。文件可能非 UTF-8、太大、是符号链接或在外部被改动；
扩展名过滤只是对话框体验，main 必须再验证。
此教学例直接改写用户选中的文件，没有原子替换、外部变更检测或崩溃恢复，操作前用一次性测试文件。

## 完整五文件例子
建立独立目录 `electron-files`；所有文件在根目录。每个窗口用 webContents ID 对应授权状态。
::: code-group
```json [package.json]
{
  "name": "electron-files-lab", "version": "1.0.0", "private": true,
  "main": "main.cjs", "scripts": { "start": "electron ." }
}
```
```js [main.cjs] {42-44}
const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const page = path.join(__dirname, 'index.html');
const pageURL = pathToFileURL(page).href;
const limit = 64 * 1024;
const states = new Map();
function stateFor(event) {
  const state = states.get(event.sender.id);
  if (!state || state.window.isDestroyed() ||
      event.senderFrame !== state.window.webContents.mainFrame ||
      event.senderFrame.url !== pageURL) throw new Error('Sender rejected');
  return state;
}
function handle(channel, task) {
  ipcMain.handle(channel, async (event, ...args) => {
    const state = stateFor(event);
    if (state.busy) return { ok: false, error: 'Busy' };
    state.busy = true;
    try { return await task(state, ...args); }
    catch { return { ok: false, error: 'Operation rejected or I/O failed' }; }
    finally { state.busy = false; }
  });
}
handle('file:choose', async state => {
  const choice = await dialog.showOpenDialog(state.window, {
    properties: ['openFile'], filters: [{ name: 'Text', extensions: ['txt'] }]
  });
  if (choice.canceled || state.closed) return { ok: true, canceled: true };
  const selected = choice.filePaths[0];
  if (path.extname(selected).toLowerCase() !== '.txt') throw new Error('Not text');
  const entry = await fs.lstat(selected);
  if (!entry.isFile() || entry.isSymbolicLink() || entry.size > limit) throw new Error('Invalid file');
  const file = await fs.open(selected, 'r+');
  try {
    const actual = await file.stat();
    if (!actual.isFile() || actual.size > limit ||
        actual.ino !== entry.ino || actual.dev !== entry.dev) throw new Error('Changed file');
    const bytes = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await file.read(bytes, length, bytes.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > limit) throw new Error('Too large');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));
    await state.file?.close();
    if (state.closed) throw new Error('Window closed');
    state.file = file;
    return { ok: true, text, name: path.basename(selected) };
  } catch (error) { await file.close(); throw error; }
});
handle('file:save', async (state, text) => {
  if (!state.file || typeof text !== 'string' || Buffer.byteLength(text) > limit) {
    throw new Error('Invalid write');
  }
  const bytes = Buffer.from(text, 'utf8');
  await state.file.truncate(0);
  let offset = 0;
  while (offset < bytes.length) {
    const result = await state.file.write(bytes, offset, bytes.length - offset, offset);
    if (!result.bytesWritten) throw new Error('Short write');
    offset += result.bytesWritten;
  }
  await state.file.sync();
  return { ok: true };
});
handle('window:new', async () => {
  if (states.size >= 3) return { ok: false, error: 'At most three windows' };
  createWindow();
  return { ok: true };
});
function createWindow() {
  const window = new BrowserWindow({ width: 720, height: 540, webPreferences: {
    preload: path.join(__dirname, 'preload.cjs'),
    contextIsolation: true, sandbox: true, nodeIntegration: false
  } });
  const state = { window, file: null, busy: false, closed: false };
  const id = window.webContents.id;
  states.set(id, state);
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.on('closed', () => {
    state.closed = true;
    states.delete(id);
    state.file?.close().catch(error => console.error('Close failed:', error.message));
  });
  window.loadFile(page).catch(error => console.error('Load failed:', error.message));
}
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((w, p, reply) => reply(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  createWindow();
  app.on('activate', () => { if (!states.size) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
```
```js [preload.cjs]
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('files', {
  choose: () => ipcRenderer.invoke('file:choose'),
  save: text => ipcRenderer.invoke('file:save', text),
  newWindow: () => ipcRenderer.invoke('window:new')
});
```
```html [index.html]
<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; script-src 'self'; base-uri 'none'; form-action 'none'">
<title>授权文本编辑</title><script src="renderer.js" defer></script></head>
<body><button id="open">选择文本</button><button id="save">保存</button>
<button id="new">新窗口</button><p id="status" role="status">尚未选择</p>
<textarea id="text" rows="18" cols="60" aria-label="文本内容"></textarea></body></html>
```
```js [renderer.js]
const text = document.querySelector('#text');
const status = document.querySelector('#status');
const buttons = [...document.querySelectorAll('button')];
async function run(operation) {
  buttons.forEach(button => { button.disabled = true; });
  try {
    const result = await operation();
    if (!result.ok) throw new Error(result.error);
    if ('text' in result) text.value = result.text;
    status.textContent = result.canceled ? '已取消' : (result.name ?? '操作完成');
  } catch (error) { status.textContent = error.message; }
  finally { buttons.forEach(button => { button.disabled = false; }); }
}
document.querySelector('#open').onclick = () => run(() => window.files.choose());
document.querySelector('#save').onclick = () => run(() => window.files.save(text.value));
document.querySelector('#new').onclick = () => run(() => window.files.newWindow());
```
:::

## 运行、故障与验收
```bash [终端：electron-files]
npm install --save-dev --save-exact electron@latest
npm start
```
新建测试 `.txt`，选择后只显示文件名和内容，不返回路径；修改保存，再用系统编辑器确认落盘。
未选择时保存应拒绝，取消选择不丢失原授权；第二窗口未选择文件不能保存第一窗口的文件。
超过三个窗口拒绝；macOS 关闭全部后点击 Dock 会重建，其余平台退出。
只读文件因 `r+` 打开失败，这是边界，不应提权重试；无效 UTF-8、大文件和最终路径符号链接应拒绝。
句柄绑定已打开对象，避免后续 renderer 指定路径，但父目录链接、硬链接、文件系统身份与并发更改仍需产品策略。
关闭窗口可能与正在保存竞争，I/O 可能失败；本例不承诺未保存提示或无损关窗。
练习：新增关闭前未保存确认，并让授权失效；验收拒绝丢弃时窗口保留，确认关闭后不能复用旧授权。
正式编辑器应使用安全保存协议、备份及版本冲突检测，而不是把本例直接当作生产文件管理器。

- [Dialog API](https://www.electronjs.org/docs/latest/api/dialog)
- [BrowserWindow 生命周期](https://www.electronjs.org/docs/latest/api/browser-window)
- [Node FileHandle 与并发警告](https://nodejs.org/api/fs.html#class-filehandle)
