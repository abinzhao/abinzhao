---
title: 全栈开发教程
description: 从语言原理到完整产品，系统学习前端、后端、浏览器插件、桌面应用与创意编程。
aside: false
pageClass: tutorial-overview
---

# 全栈开发教程

<p class="content-lead">
从零开始，理解原理，写出能运行、能验证的完整产品。
</p>

<div class="tutorial-intro">
  <span class="tutorial-kicker">LEARN / BUILD / UNDERSTAND</span>
  <div><a href="./git/setup/terminal">第一次写代码？从这里开始 →</a><span>原理讲解 · 完整代码 · 故障排查 · 实战验收</span></div>
</div>

<TutorialCatalog />

## 如何沿着这条路线学习

<ConceptFlow :steps="['读懂原理', '运行示例', '改变条件', '验证结果']" caption="先观察正常结果，再主动制造错误，理解代码工作的边界。" />

零基础先走环境与 Git、HTML、CSS、JavaScript 和浏览器 API，完成任务看板；再学习工程化、后端与数据库，完成全栈笔记应用。插件、Electron、图形和 AI 是在这些基础之上的能力分支。

每章明确文件名和运行方式。浏览器示例使用本地静态服务器，Node 示例标明最低版本。安装依赖后保存锁文件；不要把不同章节的文件直接混进同一个项目。

## 代码阅读与效果验证

代码区支持深浅主题高亮、行号、一键复制、多文件切换、重点行及差异标记。可交互演示用于观察参数变化，完整代码与边界解释位于各自章节。

::: code-group
```js [重点行]
const items = ['HTML', 'CSS', 'JavaScript'];
const result = items.map(item => item.toLowerCase()); // [!code highlight]
console.log(result);
```
```js [差异对照]
const count = '2' + 1; // [!code --]
const count = Number('2') + 1; // [!code ++]
console.log(count);
```
:::

视觉演示支持暂停，并遵循系统“减少动态效果”设置。遇到错误时记录操作、输出和控制台信息，再缩小范围；每章的“效果验证”和“常见错误”提供核对入口。
