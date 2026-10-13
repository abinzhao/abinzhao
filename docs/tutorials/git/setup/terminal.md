---
title: 终端、路径与开发环境
description: 认识文件、目录、进程与端口，建立可以重复运行的本地环境。
---

# 终端、路径与开发环境

## 学习目标

用终端创建一个项目，启动本地服务器，在浏览器打开页面，并能解释“找不到文件”和“端口被占用”的原因。

## 先理解你正在操作什么

终端是输入输出窗口，Shell 是解释命令的程序。编辑器修改文件，浏览器展示页面，服务器接收请求；它们通常是不同进程。关闭浏览器标签不会停止服务器，关闭服务器后页面已经加载的内容可能仍然显示。

绝对路径从文件系统根开始，例如 `/Users/demo/hello-web`；相对路径从当前目录开始，例如 `./index.html`。`..` 表示上一级，不是“项目根”。命令结果与当前目录有关，先用 `pwd` 确认位置。

| 概念 | 例子 | 解决的问题 |
| --- | --- | --- |
| 当前目录 | `pwd` | 这条命令在哪个目录执行 |
| 文件 | `index.html` | 代码存在哪里 |
| 进程 | 静态服务器 | 谁正在运行代码 |
| 端口 | `5173` | 请求交给哪个监听进程 |
| URL | `http://localhost:5173/` | 协议、主机、端口、资源路径 |

<ConceptFlow :steps="['编辑文件', '本地服务器', '浏览器请求', '页面呈现']" caption="浏览器通过 HTTP 获取项目文件；Shell 中的当前目录决定服务器公开哪一层文件。" />

## 操作步骤

安装 Node.js 的受支持 LTS 版本与 Git。这里的浏览器示例只需要现代浏览器；后续 `node:sqlite` 示例要求 Node 22.13 或更高。

```bash
node --version
npm --version
git --version
```

输出应分别包含版本号。不要仅因为安装程序结束就假定命令可用，Shell 的 `PATH` 决定实际运行哪个程序。

macOS/Linux 创建目录：

```bash
mkdir hello-web
cd hello-web
pwd
```

Windows PowerShell 同样支持 `mkdir`、`cd` 和 `pwd`。列出文件使用 `Get-ChildItem`；macOS/Linux 使用 `ls`。带空格的路径加双引号，例如 `cd "my projects"`。

用编辑器在该目录创建以下文件。确保名称是 `index.html`，而非 `index.html.txt`。

## 完整代码

```html [index.html]
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>第一个本地页面</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        padding: 24px;
        display: grid;
        place-items: center;
        background: #101827;
        color: #eaf0ff;
        font-family: system-ui, sans-serif;
      }
      main { width: min(600px, 100%); }
      button {
        min-height: 44px;
        padding: 0 18px;
        border: 0;
        border-radius: 8px;
        background: #a6b8ff;
        color: #101827;
        cursor: pointer;
      }
      button:focus-visible { outline: 3px solid #5ce0be; outline-offset: 4px; }
    </style>
  </head>
  <body>
    <main>
      <h1>你好，本地开发</h1>
      <p id="status" aria-live="polite">页面已经通过 HTTP 加载。</p>
      <button id="button" type="button">验证 JavaScript</button>
    </main>
    <script>
      const button = document.querySelector('#button');
      const status = document.querySelector('#status');
      button.addEventListener('click', () => {
        status.textContent = `运行成功，当前路径：${location.pathname}`;
      });
    </script>
  </body>
</html>
```

在同一目录启动静态服务器。`npx` 首次会询问是否下载 `serve`，检查包名后继续：

```bash
npx serve . --listen 5173
```

终端进入运行状态是正常现象，它正在监听请求。打开 `http://localhost:5173/`，停止服务器使用 `Ctrl+C`。`localhost` 指本机，不代表其他设备也能使用这个地址。

## 效果验证

1. 浏览器标题是“第一个本地页面”，地址以 `http://` 开头。
2. 点击按钮显示“运行成功”及当前路径。
3. 打开开发者工具 Network，刷新后看到 HTML 请求；Console 没有脚本错误。
4. 调整为 390px 宽度，页面不产生横向滚动。
5. 停止服务器后重新加载，浏览器无法再次取得页面。缓存可能掩盖结果，使用禁用缓存后刷新。

## 常见错误

`command not found`：命令未安装或 PATH 不包含它。重新打开终端并检查版本；不要通过不断换目录解决安装问题。

`EADDRINUSE`：另一个进程已监听端口。停止自己之前启动的服务器，或改用 `--listen 5174` 并打开对应 URL。不要随意杀掉不知道用途的进程。

404：核对当前目录、文件名和 URL 路径。服务器不会自动知道你希望展示哪个项目。

双击文件打开的 `file://` 页面不是本地 HTTP 环境。模块脚本、请求和权限 API 的行为可能不同，后续统一通过服务器运行。

## 练习与验收

添加 `about.html`，写一段个人介绍，从首页建立 `<a href="./about.html">关于</a>` 链接。验收：点击导航和浏览器返回均正常，刷新关于页仍可访问；终端输出和浏览器 URL 能解释资源如何被找到。

## 延伸阅读

- [Node.js 下载与版本](https://nodejs.org/en/download)
- [MDN：文件处理](https://developer.mozilla.org/zh-CN/docs/Learn_web_development/Getting_started/Environment_setup/Dealing_with_files)
- [Git 官方安装说明](https://git-scm.com/book/zh/v2/起步-安装-Git)

下一章：[提交、差异与撤销](../workflow/version-control)。
