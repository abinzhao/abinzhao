---
title: 01 前端基础：从页面到应用
description: 中文零基础渐进教程，从 HTML、CSS、JavaScript 到浏览器能力与完整任务看板。
---

# 01 前端基础：从页面到应用

<p class="content-lead">
先写一个有结构的页面，再让它有样式与交互，最后处理异步、存储与失败。本阶段不依赖框架，所有实验都在本地静态页面运行。
</p>

## 前置知识

不要求已有编程经验，但需要会创建文件夹、使用文本编辑器保存 UTF-8 文件。
准备桌面浏览器、开发者工具和 Node.js **22.13+**；Node 只用于本地静态服务和可选数据实验。
不需要给主站添加依赖，也不需要执行任何构建、部署或配置修改。

HTML 描述内容关系，CSS 决定呈现，JavaScript 处理状态与行为。
浏览器提供 DOM、事件、网络与存储，它们不是 JavaScript 语言本身的一部分。
每章先理解“为什么”，再复制完整示例运行，最后改动并验证边界。

<ConceptFlow :steps="['内容结构','样式布局','数据与交互','浏览器能力','完整应用']" caption="阶段之间逐步叠加能力，前面的机制会在后面的项目反复使用。" />

## 学习路线

| 阶段 | 章节 | 阶段产物 |
| --- | --- | --- |
| A：理解内容 | [结构、解析与语义](./html/structure.md) · [表单与媒体](./html/forms-media.md) | 有标题层级、标签与校验的页面 |
| B：理解呈现 | [层叠与盒模型](./css/cascade-box.md) · [Flex 与 Grid](./css/layout.md) · [过渡与关键帧](./css/motion.md) | 随桌面窗口调整的工作区与可暂停动画 |
| C：理解语言 | [类型与数据操作](./javascript/fundamentals.md) · [闭包、this 与原型](./javascript/closures-prototypes.md) · [异步、取消与竞态](./javascript/async.md) | 可验证的数据规则与不会倒退的搜索状态 |
| D：理解浏览器 | [DOM 与事件](./browser/dom-events.md) · [存储与 Worker](./browser/storage-workers.md) · [HTTP 与调试](./browser/network-devtools.md) | 安全列表、后台计算与可解释的请求失败 |
| E：综合实现 | [完整任务看板](./projects/task-board.md) | 单文件 CRUD、过滤、持久化与异常恢复 |

建议按顺序学习，而不是一次把所有示例粘到同一页。
同名 `main.js` 属于各自实验目录，不应互相覆盖。
同一套 Web 页面应适应不同视口；课程中的响应式布局也需要在 390px 手机宽度下验证。

## 运行准备

在主站工作区以外建立独立练习根目录，例如 `frontend-practice`。
下面的命令由学习者在自己的练习目录执行，不是主站构建命令。
服务器只读取文件，绑定 localhost，不写入 dist、不监听外网。

```bash
node --version
mkdir frontend-practice
cd frontend-practice
```

用编辑器在这个目录创建 `serve.mjs`，内容完整如下。
脚本支持 HTML、CSS、JS、JSON 与 SVG，并使用 ETag 演示 HTTP 缓存校验。
这是学习服务器，不是生产托管、安全网关或后端 CRUD 服务。

```js [serve.mjs]
import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, extname, isAbsolute, sep } from 'node:path';
import { createHash } from 'node:crypto';

const root = await realpath(process.cwd());
const port = Number(process.argv[2] ?? 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('端口必须是 1 到 65535 的整数');
}
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.vtt': 'text/vtt; charset=utf-8'
};
function insideRoot(file) {
  const path = relative(root, file);
  return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}
const server = createServer(async (request, response) => {
  function fail(code, message) {
    response.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(request.method === 'HEAD' ? undefined : message);
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    fail(405, '此服务器只读取静态文件');
    return;
  }
  try {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
    catch { fail(400, '地址编码无效'); return; }
    if (pathname.includes('\0') || pathname.includes('\\')) {
      fail(400, '地址无效');
      return;
    }
    let file = resolve(root, `.${pathname}`);
    if (!insideRoot(file)) { fail(403, '不允许访问练习目录之外'); return; }
    file = await realpath(file);
    if (!insideRoot(file)) { fail(403, '不允许跨目录链接'); return; }
    if ((await stat(file)).isDirectory()) {
      file = await realpath(resolve(file, 'index.html'));
      if (!insideRoot(file)) { fail(403, '不允许跨目录链接'); return; }
    }
    const body = await readFile(file);
    const etag = `"${createHash('sha256').update(body).digest('hex')}"`;
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('ETag', etag);
    if (request.headers['if-none-match'] === etag) {
      response.writeHead(304);
      response.end();
      return;
    }
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    fail(error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500,
      '读取失败，请检查文件名和目录');
  }
});
server.on('error', error => {
  console.error(`服务器启动失败：${error.code || error.message}`);
  process.exitCode = 1;
});
server.listen(port, 'localhost', () => console.log(`练习服务器：http://localhost:${port}`));
```

将各章的示例保存到对应文件夹，再运行：

```bash
node serve.mjs
```

浏览器打开 `http://localhost:8080/structure/`；根目录没有首页时访问 `/` 显示 404 是正常的。
后续把路径改为 forms-media、cascade-box、layout、motion、fundamentals、closures-prototypes、async、
dom-events、storage-workers、network-devtools 或 task-board，均以 `/目录名/` 结尾。
服务器运行期间终端被占用，用另一个终端运行 Node 实验，结束服务按 Ctrl+C。
编辑文件后刷新页面；本服务器不会自动刷新浏览器。
若提示 EADDRINUSE，先停止自己之前的服务，或运行 `node serve.mjs 8082` 并更换地址。

## 学习方法

1. 运行原始完整示例，核对章节中描述的结果。
2. 把输入、状态与输出写下来，预测修改会影响哪个环节。
3. 每次只修改一条规则，查看 Console、Elements 或 Network 的证据。
4. 故意测试空输入、无效字段、资源失败、快速操作与存储不可用。
5. 完成练习验收后，再进入下一章。

代码组中每个标签就是实际文件名；不要把 CSS 或 JS 内容粘到 HTML 文本区域。
围栏的行高亮是阅读辅助，不是需要复制进源码的语法。
流程图只补充说明，即使没有组件渲染，正文与代码也能独立学习。

## 阶段验收

| 阶段 | 可观察的完成标准 |
| --- | --- |
| A | 键盘可访问导航与表单；必填和空格输入被区分；媒体失败有文字说明 |
| B | 能从 Styles 找到胜出规则；盒宽预测正确；390 至 1400px 视口无溢出；动画可暂停 |
| C | 数据断言通过；两个闭包状态独立；解释 this 丢失；快速搜索不会展示旧词结果 |
| D | HTML 测试文本不执行；存储错误不伪装成功；Worker 可终止；区分 404、CORS 与解析错误 |
| E | 任务 CRUD 与过滤完整；刷新恢复；坏 JSON 不被自动覆盖；键盘焦点和空状态正确 |

最终验收需要实际操作，不以“页面能打开”或“代码没有红线”为通过依据。
给每个失败场景记录现象、原因和证据；尚未验证的浏览器或媒体格式标记为未验证。
本阶段不要求部署，先在本地确认关键路径。

## 延伸与下一步

- [Vue：教程](https://cn.vuejs.org/tutorial/)：参考逐步增加能力、及时验证的学习节奏，不要求现在引入框架。
- [MDN：Web 开发学习区](https://developer.mozilla.org/zh-CN/docs/Learn_web_development)
- [Node.js：HTTP 文档](https://nodejs.org/docs/latest-v22.x/api/http.html)

下一步：[进入前端工程化](../frontend-engineering/)
