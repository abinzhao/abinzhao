---
title: Electron 导航、IPC 与输入安全
description: 用固定资源协议、准确来源校验和有限文件名建立可测试的系统能力边界。
---

# Electron 导航、IPC 与输入安全

## 安全目标
本章给出独立 `electron-secure` 项目：页面只能打开一个官方文档 URL，
或在应用专用目录**新建**小文本文件，不读取任意路径，不覆盖既有文件，不执行命令。
与 `file://` 示例相比，自定义协议只暴露显式资源映射，避免把整个文件目录当作可浏览资源。

Renderer 视为可能被攻击；按钮限制不是授权，preload 参数校验也不代替 main 校验。
威胁包括导航到恶意网站、子 frame 调 IPC、`javascript:`/凭据 URL、路径穿越和超大内容。
这不是系统级攻击防护：操作系统用户、恶意本地程序或已被攻陷的 main 仍可能改动专用目录。

## 完整项目
所有文件在根目录，Node 22+；安装 Electron 后，Node 系统 API 只在 main 使用。
::: code-group
```json [package.json]
{
  "name": "electron-secure-lab", "version": "1.0.0", "private": true,
  "main": "main.cjs", "scripts": { "start": "electron ." }
}
```
```js [main.cjs] {30-32}
const { app, BrowserWindow, ipcMain, protocol, session, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
protocol.registerSchemesAsPrivileged([{
  scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true }
}]);
const pageURL = 'app://bundle/index.html';
const docsURL = 'https://www.electronjs.org/docs/latest/tutorial/security';
const csp = "default-src 'none'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-src 'none'";
const assets = new Map([
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/renderer.js', ['renderer.js', 'text/javascript; charset=utf-8']]
]);
let window = null;
let notesRoot;
function allowedDocs(raw) {
  if (typeof raw !== 'string' || raw.length > 300) return false;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password &&
      !url.port && !url.search && !url.hash && url.href === docsURL;
  } catch { return false; }
}
function senderOK(event) {
  return window && !window.isDestroyed() && event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === pageURL;
}
function notePath(name) {
  if (typeof name !== 'string' || !/^[a-z0-9_-]{1,32}\.txt$/.test(name) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])\.txt$/i.test(name)) throw new Error('Invalid name');
  const target = path.resolve(notesRoot, name);
  if (path.dirname(target) !== notesRoot) throw new Error('Outside notes root');
  return target;
}
ipcMain.handle('docs:open', async (event, raw) => {
  if (!senderOK(event) || !allowedDocs(raw)) throw new Error('Rejected URL or sender');
  await shell.openExternal(docsURL);
  return true;
});
ipcMain.handle('note:create', async (event, name, text) => {
  if (!senderOK(event)) throw new Error('Sender rejected');
  const target = notePath(name);
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 8192) throw new Error('Invalid text');
  const file = await fs.open(target, 'wx', 0o600);
  try { await file.writeFile(text, 'utf8'); await file.sync(); }
  finally { await file.close(); }
  return { name };
});
function createWindow() {
  window = new BrowserWindow({ width: 700, height: 440, webPreferences: {
    preload: path.join(__dirname, 'preload.cjs'),
    contextIsolation: true, sandbox: true, nodeIntegration: false
  } });
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-frame-navigate', event => event.preventDefault());
  window.webContents.on('will-redirect', event => event.preventDefault());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (allowedDocs(url)) shell.openExternal(docsURL).catch(error => console.error(error.message));
    return { action: 'deny' };
  });
  window.on('closed', () => { window = null; });
  window.loadURL(pageURL).catch(error => { console.error(error.message); app.quit(); });
}
app.whenReady().then(async () => {
  const root = path.join(app.getPath('userData'), 'tutorial-notes');
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  notesRoot = await fs.realpath(root);
  protocol.handle('app', async request => {
    try {
      const url = new URL(request.url);
      const asset = assets.get(url.pathname);
      if (request.method !== 'GET' || url.host !== 'bundle' || url.username ||
          url.password || url.search || url.hash || !asset) return new Response('Not found', { status: 404 });
      const bytes = await fs.readFile(path.join(__dirname, asset[0]));
      return new Response(bytes, { headers: { 'Content-Type': asset[1], 'Content-Security-Policy': csp } });
    } catch { return new Response('Resource failed', { status: 500 }); }
  });
  session.defaultSession.setPermissionRequestHandler((w, p, reply) => reply(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  createWindow();
  app.on('activate', () => { if (!window) createWindow(); });
}).catch(error => { console.error(error.message); app.quit(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
```
```js [preload.cjs]
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('safeApp', {
  openDocs: url => ipcRenderer.invoke('docs:open', url),
  createNote: (name, text) => ipcRenderer.invoke('note:create', name, text)
});
```
```html [index.html]
<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>安全边界</title>
<script src="renderer.js" defer></script></head><body>
<label>文件名 <input id="name" value="demo.txt"></label>
<label>文本 <textarea id="text">本地教学笔记</textarea></label>
<button id="create">新建笔记</button><button id="docs">官方安全文档</button>
<output id="status" aria-live="polite">等待操作</output>
</body></html>
```
```js [renderer.js]
const status = document.querySelector('#status');
async function run(task) {
  try { await task(); status.textContent = '操作成功'; }
  catch { status.textContent = '操作被拒绝或失败；文件可能已存在'; }
}
document.querySelector('#create').addEventListener('click', () => run(() =>
  window.safeApp.createNote(document.querySelector('#name').value, document.querySelector('#text').value)));
document.querySelector('#docs').addEventListener('click', () => run(() =>
  window.safeApp.openDocs('https://www.electronjs.org/docs/latest/tutorial/security')));
```
:::

## 运行与攻击性验收
```bash [终端：electron-secure]
npm install --save-dev --save-exact electron@latest
npm start
```

新建 `demo.txt` 成功，再次新建拒绝，不覆盖；文件保存于系统的应用 userData 下 `tutorial-notes`。
官方按钮只在系统浏览器打开准确 HTTPS 地址，Electron 内不创建新窗口。
在开发者工具 Console 逐项执行，Promise 应拒绝，拒绝属于预期而不是要关闭安全检查的错误：

```js [开发者工具 Console]
window.safeApp.createNote('../escape.txt', 'x').catch(() => console.log('路径已拒绝'));
window.safeApp.createNote('con.txt', 'x').catch(() => console.log('设备名已拒绝'));
window.safeApp.createNote('large.txt', 'x'.repeat(8193)).catch(() => console.log('大小已拒绝'));
window.safeApp.openDocs('javascript:alert(1)').catch(() => console.log('协议已拒绝'));
window.safeApp.openDocs('https://www.electronjs.org.evil.example/').catch(() => console.log('域名已拒绝'));
window.open('https://example.com');
location.href = 'https://example.com';
```

最后两项不得创建 Electron 新窗口或离开本地页面。CSP 由协议响应头下发，限制脚本、frame、表单与资源；
使用 `textContent`，不把文档或错误解释为 HTML。CSP 不会替你校验 IPC payload。

## 边界、故障与练习

资源路径只查固定 Map，不用 URL 拼接磁盘路径；`startsWith('https://可信域名')` 不安全，
也不要给任意验证过“是 HTTPS”的地址调用 `openExternal`。URL 白名单此处是完整地址，不是域名模糊匹配。
文件名只允许小写 ASCII 和固定后缀，拒绝分隔符、设备名及穿越；`wx` 拒绝已存在目标，包括最终符号链接。
专用父目录若被本地程序替换仍有竞态，权限模式在不同系统也不相同；高风险产品须加强目录/句柄策略。
`wx` 后崩溃可能留空或部分文件，本例不承诺事务保存。频繁合法 IPC 仍可耗尽磁盘，正式产品需限频与总配额。

“未知 app 协议”检查特权注册在 ready **之前**、handle 在 ready **之后**；“脚本不执行”检查 MIME 与 CSP。
练习：加入第二个明确文档地址和总文件数配额；验收不扩大到任意 HTTPS、不接受 renderer 目录，
并用真实子 frame IPC 尝试验证 sender 拒绝，不仅看 UI 按钮。

- [Electron 安全清单](https://www.electronjs.org/docs/latest/tutorial/security)
- [自定义协议 API](https://www.electronjs.org/docs/latest/api/protocol)
- [WebContents 导航与新窗口](https://www.electronjs.org/docs/latest/api/web-contents)
- [Node 文件打开标志](https://nodejs.org/api/fs.html#file-system-flags)
