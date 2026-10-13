---
title: Manifest V3 与最小 Popup
description: 从三个文件开始，实际加载一个不申请额外权限的浏览器扩展。
---

# Manifest V3 与最小 Popup

## 目标与边界

完成后，你能在 Chrome 工具栏打开一个计数器，解释清单、扩展页面与生命周期的关系。
本章只操作扩展自己的 DOM，不读取网页、不请求网络，所以不需要 `permissions` 或 `host_permissions`。
使用支持 MV3 的桌面 Chrome；这是独立实验目录，不是在教程主站中安装插件。

## 先理解执行位置

`manifest.json` 是 Chrome 读取的声明，不是 JavaScript 入口。`manifest_version: 3` 选择扩展平台版本，
`version` 是扩展发布版本，`action.default_popup` 指向用户点击工具栏图标时打开的 HTML。
Popup 是短生命周期的扩展页面，有自己的 `document`；它不是当前标签页，也不是后台 Service Worker。

```text [执行关系]
Chrome 读取 manifest.json
  → 用户点击 action
  → 创建 popup.html 文档
  → 执行 popup.js
  → 用户点到弹窗外，文档被销毁
```

因此变量会随弹窗关闭而消失。需要持久化时用下一章的 `chrome.storage`，不要假定 Popup 一直存在。
本例没有后台任务，无须为了“完整插件”加入空的 Service Worker。

## 目录与完整代码

在工作区之外建立 `mv3-popup`，将下面三个文件放在同一层。文件名大小写必须与清单完全一致。

```text [目录]
mv3-popup/
  manifest.json
  popup.html
  popup.js
```

::: code-group
```json [manifest.json] {2,7}
{
  "manifest_version": 3,
  "name": "Local Popup Counter",
  "version": "1.0.0",
  "description": "A counter that lives only inside the popup.",
  "action": {
    "default_popup": "popup.html",
    "default_title": "Open local counter"
  },
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

```html [popup.html]
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>本地计数器</title>
  <script src="popup.js" defer></script>
</head>
<body>
  <h1>本地计数器</h1>
  <p>关闭弹窗后计数归零。</p>
  <output id="count" aria-live="polite">0</output>
  <button id="add" type="button">加一</button>
  <button id="reset" type="button">重置</button>
</body>
</html>
```

```js [popup.js]
'use strict';
const output = document.querySelector('#count');
const add = document.querySelector('#add');
const reset = document.querySelector('#reset');
let count = 0;
function render() {
  output.textContent = String(count);
}
add.addEventListener('click', () => {
  count += 1;
  render();
});
reset.addEventListener('click', () => {
  count = 0;
  render();
});
render();
```
:::

外部脚本配合 `defer`，保证 DOM 解析后才查询元素。MV3 扩展页面禁止普通内联脚本和 `onclick` 属性；
不要通过加入 `'unsafe-inline'` 绕开限制。`textContent` 将字符串作为文本呈现，不会解释成 HTML。

## 实际加载

1. 打开 `chrome://extensions`，启用右上角“开发者模式”。
2. 点击“加载已解压的扩展程序”，选择 `mv3-popup` 文件夹，不是选择清单文件。
3. 打开工具栏的扩展菜单，固定 `Local Popup Counter`，点击它。
4. 点击三次“加一”，输出应为 `3`；点“重置”，应为 `0`。
5. 关闭弹窗再打开，应为 `0`。这证明变量属于这次文档实例。
6. 修改文件后，在扩展管理页点击重新加载，再重新打开弹窗。

不用 `npm install`、打包器或主站构建。可先运行 JSON 语法检查：

```bash [终端：在 mv3-popup 中]
node -e "JSON.parse(require('node:fs').readFileSync('manifest.json','utf8')); console.log('manifest JSON OK')"
node --check popup.js
```

## 常见故障

| 现象 | 排查与原因 |
| --- | --- |
| 清单不存在 | 选错目录层级；根目录必须直接包含 `manifest.json` |
| 点击没有弹窗 | 核对 `action.default_popup` 拼写，并重新加载扩展 |
| CSP 拒绝脚本 | 将内联代码移到 `popup.js`，不引入 CDN 脚本 |
| 修改后无变化 | 已打开的 Popup 不会自动替换；关闭、重载、重开 |
| 普通网页运行失败 | 扩展必须由 Chrome 加载；直接打开 HTML 不是安装 |

右键弹窗选择“检查”查看 Console；这个调试窗口可能改变弹窗关闭行为，生命周期验收时应关闭它。
图标不是开发加载的必要条件，商店发布所需素材放到[发布章节](./release)准备。

## 可验收练习

增加一个“减一”按钮，要求数值最低为零，且所有事件仍在外部脚本注册。
验收：零时连续点击不出现负数，增减顺序正确，重开归零，Console 无错误，清单仍无权限声明。
解释为什么刷新普通标签页不会重置一个仍打开的 Popup，并说明关闭 Popup 为什么会重置。

## 官方资料

- [Chrome：Hello World 与加载已解压扩展](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world)
- [Manifest 文件格式](https://developer.chrome.com/docs/extensions/reference/manifest)
- [Action API](https://developer.chrome.com/docs/extensions/reference/api/action)
- [扩展页面 CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)

下一章：[消息、存储与 Service Worker 恢复](./messaging-storage)。
