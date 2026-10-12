---
title: Chrome MV3 扩展清单、执行上下文与最小权限
description: 制作一个点击后统计页面标题的扩展，理解清单、内容脚本、后台生命周期和授权边界。
type: tutorial
topic: browser-extensions
section: platform
order: 10
level: beginner
status: published
tags:
  - Chrome
  - Manifest V3
  - 权限
prerequisites: []
comments: true
---

# Chrome MV3 扩展清单、执行上下文与最小权限

浏览器扩展能够读取页面、增加界面并调用浏览器专用 API，因此它的权限模型比普通网页更重要。先决定功能真正需要访问什么，再选择清单字段和执行上下文，比先申请所有权限、最后再删减更容易保持边界。

## 前置条件与版本范围

本文使用桌面 Chrome 120 及以上、Manifest V3，代码统一采用 `chrome.*` API 和 Promise 写法。Chrome 衍生浏览器可能支持相近接口，但不能据此承诺一致行为；Firefox 的扩展后台和 API 细节也需单独适配。移动浏览器并非本文目标。

读者需要会创建文本文件、理解基本 JavaScript 函数和 DOM 查询。示例不需要打包器或 npm 包，制作“点击扩展图标后，统计当前页标题数量”的最小扩展。权限只包含 `activeTab` 和 `scripting`，没有全站常驻读取、外部请求或数据上传。

建议使用专门的演示浏览器配置，不在支付、邮箱或管理后台测试未知扩展。扩展源码也属于软件供应链，加载之前应阅读代码与清单。本文的本地开发步骤不涉及应用商店发布，不改变浏览器企业策略，也不要求关闭任何安全机制。

## Manifest 描述能力，不只是项目配置

`manifest.json` 位于扩展根目录，声明名称、版本、入口和权限。它是严格 JSON，不能写注释、尾随逗号或单引号。`manifest_version` 描述清单规范，`version` 描述这个扩展的发布版本，两者不是同一回事。名称用于用户识别，不是 API 命名空间。

`action` 表示工具栏入口，可以绑定图标点击处理或打开 popup。设置 `default_popup` 后，点击通常打开 popup，而不是触发同一个 action 的 `onClicked` 事件。因此更换 UI 入口时要一起检查事件流，不能以为加了 popup 后原点击逻辑仍自动运行。

`permissions` 常用于 API 能力，`host_permissions` 用于特定主机访问授权，`content_scripts.matches` 则决定声明式内容脚本注入范围。它们关联但不互相等价。`tabs` 不表示任意读取网页 DOM，访问部分标签敏感属性才需要相应授权；获取当前标签 ID 并不需要为了保险申请完整 tabs 权限。

`activeTab` 在用户执行特定扩展操作后，为当前标签授予临时主机访问能力，适合“用户点击才作用于当前页”。它不是后台随时读取所有标签的许可，同源导航与跨源导航的授权变化也要考虑。受保护页面如 `chrome://` 和某些商店页面仍不可随意注入。

## 三种上下文如何分工

内容脚本靠近网页 DOM，可以读取和修改页面结构，默认处在 isolated world。它与页面共享 DOM，但 JavaScript 全局变量和原型环境通常隔离；页面的 `window.someAppState` 不会自然出现在内容脚本里。隔离不意味着 DOM 数据可信，网页仍可以制造任意标签与文本。

扩展页面如 popup、选项页拥有自己的 DOM 和扩展来源，可以展示 UI 并调用被授权的 API。popup 关闭后页面上下文会销毁，未完成的工作不应假设永远继续。界面临时状态和持久设置要分别设计，不能把变量留在 popup 就当保存成功。

MV3 后台使用扩展 Service Worker，没有普通页面的 `document` 和 `window`。它监听事件、协调消息和浏览器 API，不负责直接查询网页 DOM。生命周期由浏览器管理，空闲时可能终止，后续事件再唤醒；全局变量不能当长期数据库。

后台监听器应在脚本顶层同步注册。如果先等待网络或读取 storage，再在异步回调里添加监听器，唤醒时某些事件可能没有处理入口。初始化数据可以异步进行，事件注册不应该被它阻塞。也不要用计时器或心跳试图让后台永不休眠，可靠设计应适应重启。

## 创建可加载的最小扩展

新建私人实验目录 `heading-counter`，其中只放下面两个文件。首先是 `manifest.json`：

```json
{
  "manifest_version": 3,
  "name": "Local Heading Counter",
  "version": "0.1.0",
  "minimum_chrome_version": "120",
  "description": "Count headings after an explicit toolbar click.",
  "permissions": ["activeTab", "scripting"],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_title": "Count headings on this page"
  }
}
```

再创建 `background.js`：

```js
chrome.action.onClicked.addListener((tab) => {
  if (typeof tab.id !== "number") return;
  countHeadings(tab.id).catch(async () => {
    try {
      await chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
      await chrome.action.setTitle({
        tabId: tab.id,
        title: "This page cannot be inspected. Try a normal HTTP page."
      });
    } catch {
      // The tab may have closed while the request was in flight.
    }
  });
});

async function countHeadings(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => document.querySelectorAll("h1, h2, h3").length
  });
  const count = results[0]?.result;
  if (!Number.isInteger(count) || count < 0) {
    throw new Error("Invalid heading count");
  }
  await chrome.action.setBadgeBackgroundColor({
    tabId,
    color: "#2457a7"
  });
  await chrome.action.setBadgeText({
    tabId,
    text: count > 999 ? "999+" : String(count)
  });
  await chrome.action.setTitle({
    tabId,
    title: `Headings found: ${count}`
  });
}
```

`executeScript` 中的函数在目标页面执行环境中运行，不能依赖后台函数闭包里的任意变量。这里函数只有 DOM 查询，不依赖外部值；要传数据时使用可序列化的 `args`。默认只针对主 frame，不统计所有 iframe，因此数量的定义明确是主文档的 h1、h2、h3。

错误路径以 `!` 和工具栏提示告诉用户页面不可检查，不把异常静默当零个标题。标签可能在异步操作期间关闭，第二层 catch 只处理此时无法更新 UI 的情况，并不把主操作误报成功。示例也没有记录页面 URL、正文或真实账号数据。

## 准备页面、加载扩展并验证

为避免真实网站结构变化，用一个本地页面测试。创建 `demo.html`：

```html
<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<title>扩展实验页</title>
<h1>扩展实验</h1>
<h2>第一个小节</h2>
<h2>第二个小节</h2>
<p>预期统计三个标题，不包括普通段落。</p>
</html>
```

有 Node.js 22 及以上时，可在页面所在目录创建 `serve.mjs` 并运行。页面不必放进扩展目录，服务只返回固定演示内容：

```js
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
const page = readFileSync(new URL("./demo.html", import.meta.url));
createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(page);
}).listen(8080, "127.0.0.1", () => {
  console.log("Open http://127.0.0.1:8080");
});
```

```bash
node --version
node serve.mjs
```

打开 `chrome://extensions`，启用开发者模式，选择“加载已解压的扩展程序”，只选 `heading-counter` 根目录。打开本地 HTTP 页面，固定工具栏图标后点击。预期徽标显示 3，鼠标悬停提示数量；在浏览器内部页面点击则预期显示不可检查提示，而不是成功统计。

如果没有 Node，也可以用已有可信静态服务器提供同一 HTML，但要记录实际启动方式与端口。直接使用 `file:` 页面可能还要求手工启用文件 URL 访问，而且授权行为不同，不作为本章默认验证路径。结束服务按 Ctrl+C，演示扩展可以暂时保留供下一章升级。

在扩展管理页查看错误列表和 Service Worker 检查入口。背景停止后重新点击应仍能唤醒处理，因为监听器顶层注册，且没有依赖旧全局计数。检查窗口可能使后台保持活跃，因此关闭后台 DevTools 再测试冷启动，不能只在调试窗口一直打开的状态下判断生命周期可靠。

## 权限限制与安全设计

不要给示例加 `host_permissions: ["*://*/*"]` 来绕过注入错误。用户主动点击、目标是普通页面且能力匹配时，activeTab 足以支持当前演示。若需求变成在指定站点自动运行，才考虑声明式内容脚本和匹配规则，并向用户解释读取范围和执行时机。

匹配模式中的主机、路径和 scheme 有严格格式，端口处理与普通 URL 不完全一样。限制为本地主机的模式也可能匹配该主机不同端口，因此仍需在逻辑中限制真正允许的上下文。不能只看字符串像 URL，就推断授权粒度与普通请求完全相同。

MV3 扩展页面受 CSP 约束，脚本通常应作为扩展包内文件加载，不使用内联事件属性、动态 eval 或远程下载执行代码。远程配置如果只是数据，也应限制结构，不通过字符串拼装成可执行逻辑。让所有代码可审查，是权限之外的第二层安全边界。

读取页面文本也可能触及隐私。本例只返回数量，不上传、不持久保存正文；如果以后添加标题列表，要明确保存什么、保存多久、是否跨设备同步，并让用户可清除。浏览器允许调用 API，不等于用户同意收集所有页面内容。

## 静态注入与主动注入的选择

声明式内容脚本可以按 matches 在页面生命周期的指定阶段运行，适合经过用户授权后长期增强某个站点。`document_idle` 不表示业务数据全部加载完成，单页应用仍可能之后更新 DOM；要响应动态内容，应明确观察目标和停止条件，而不是每秒扫描整个页面。

主动注入适合本例按需工具，用户操作、目标标签与结果反馈形成清楚的流程。它不会自动覆盖未来新页面，也不让权限永久扩大。跨源 iframe 可能需要另外授权与目标选择，不能把主 frame 统计结果说成完整页面所有嵌入内容的统计。

选架构时先说明触发条件、数据范围、输出和生命周期。权限范围越大，越需要解释持续访问的必要性；上下文越多，越需要明确消息与状态边界。代码只有几十行也应保留这些约束，它们决定后续扩展功能能否安全演进。

## 常见错误与练习

加载时报 JSON 错误，先查逗号、路径和文件名大小写；后台不启动，查 `service_worker` 文件是否存在以及顶层语法错误。点击没反应，核对是否意外配置了 popup。注入报错，确认当前是可注入 HTTP 页面、标签还存在且操作由用户触发。

修改后台代码后，需要在扩展管理页重新加载扩展；已经存在的页面上下文不一定自动使用新代码。示例采用每次点击动态注入，下一次操作应执行新函数，但仍应重新加载扩展并检查版本，不把文件已保存当作浏览器已采用。

练习在演示页面新增 h3，刷新后点击，预期徽标变为 4；再新增 h4，预期仍为 4，证明选择器范围。新开普通标签但不点击，确认扩展不会自行扫描。关闭后台检查窗口，等待后台休眠后再点击，记录结果，不假设固定秒数足够。

完成标准是清单可加载、用户点击后主文档数量准确、受保护页面失败可见、权限与功能一一对应，并能解释后台与页面不是同一个执行环境。继续[扩展消息、Storage 与完整交互](/tutorials/browser-extensions/implementation.html)，把最小示例升级成可恢复的工具。

## 官方参考

- [Chrome Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)：清单与后台变化。
- [Manifest 格式](https://developer.chrome.com/docs/extensions/reference/manifest)：字段定义。
- [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)：临时访问范围。
- [内容脚本](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)：隔离环境与注入。
- [Service Worker 生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)：终止、唤醒和持久状态。
- [scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting)：函数注入与目标 frame。
