---
title: HTML：结构、解析与语义
description: 从浏览器解析过程出发，写出可阅读、可访问的完整 HTML 页面。
---

# HTML：结构、解析与语义

## 学习目标

本章不要求记住所有标签，而是建立“内容是什么，就使用什么结构”的判断方法。

- 能解释 HTML 源码、DOM 和屏幕上的页面为什么不是同一个东西。
- 能写出有标题层级、导航、正文和页脚的完整页面。
- 能使用键盘访问链接，识别语义化与可访问性的边界。

前置知识：会创建文件、保存文件，并在浏览器打开本地网页。
还没准备本地服务器时，先完成[阶段索引的运行准备](../index.md#运行准备)。

## 为什么不是所有内容都用 div

HTML 是描述内容关系的标记语言，不是控制元素位置的编程语言。
`<h1>` 表达主标题，`<a>` 表达导航，`<button>` 表达操作。
它们不仅有默认样式，还有浏览器行为和辅助技术可以理解的角色。

例如，链接可以用键盘聚焦、复制地址、在新标签页打开。
给 `div` 添加点击监听并不会自动获得这些行为。
换成正确标签，通常比补写键盘事件与 ARIA 属性更可靠。

## 浏览器如何读懂文件

<ConceptFlow :steps="['HTML 字符','解析为 DOM','结合样式布局','绘制页面']" caption="源码需要先变成节点树，才参与页面呈现。" />

1. 浏览器收到字节，依据字符编码将其解码为文本。
2. HTML 解析器识别开始标签、结束标签、文本和属性。
3. 解析器创建 Document、元素和文本节点，形成 DOM 树。
4. 样式参与计算，浏览器布局并绘制可见内容。

这个过程不是“逐行截图”。换行一般会折叠成空白，注释不会显示。
`head` 保存页面元信息，`body` 包含主要可见内容。
`title` 出现在标签页中，不等于正文里的 `h1`。

浏览器会修复部分不合法嵌套，例如在 `p` 中遇到块级段落结构时自动结束段落。
因此 Elements 面板看到的节点树可能与“查看网页源代码”不同。
这种容错不是可以依赖的编码规范：修复后的结构可能改变选择器和阅读顺序。

## 运行步骤

1. 在独立练习目录创建 `structure/index.html`。
2. 将下面的完整代码放入文件；不需要 JavaScript 或第三方依赖。
3. 从练习根目录运行索引提供的 `node serve.mjs`。
4. 打开 `http://localhost:8080/structure/`。
5. 修改正文并保存，刷新页面观察结果。

## 完整页面

```html {3}
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>周末学习记录</title>
    <meta name="description" content="一份有明确结构的 HTML 学习记录">
  </head>
  <body>
    <a href="#main">跳到正文</a>
    <header>
      <p>我的学习笔记</p>
      <nav aria-label="页内导航">
        <ul>
          <li><a href="#plan">学习计划</a></li>
          <li><a href="#record">学习记录</a></li>
        </ul>
      </nav>
    </header>
    <main id="main" tabindex="-1">
      <h1>周末学习记录</h1>
      <p>先理解结构，再添加样式和交互。</p>
      <section id="plan" aria-labelledby="plan-title">
        <h2 id="plan-title">学习计划</h2>
        <ol>
          <li>识别页面的主要内容。</li>
          <li>为内容选择有意义的标签。</li>
          <li>使用键盘验证导航。</li>
        </ol>
      </section>
      <section id="record" aria-labelledby="record-title">
        <h2 id="record-title">学习记录</h2>
        <article>
          <h3>第一次完成 HTML 页面</h3>
          <p>今天学会了标题、列表和链接。</p>
          <p>
            <time datetime="2026-10-13">2026 年 10 月 13 日</time>
            记录，耗时 <strong>30 分钟</strong>。
          </p>
        </article>
        <aside aria-labelledby="tip-title">
          <h3 id="tip-title">相关提醒</h3>
          <p>文件名区分大小写的服务器上，Index.html 不等于 index.html。</p>
        </aside>
      </section>
    </main>
    <footer>
      <p>记录者：前端学习小组</p>
      <a href="#main">返回正文</a>
    </footer>
  </body>
</html>
```

## 逐层理解与边界

`<!doctype html>` 让浏览器使用标准模式；它不是普通 HTML 元素。
`lang="zh-CN"` 帮助语音朗读与语言识别，不能自动翻译内容。
字符编码声明尽早出现，避免中文按错误编码解释。

一个页面一般有一个主要可见的 `main` 和一个清晰的主标题。
`section` 是有主题的内容分组，通常需要标题；仅为布局包一层时使用 `div`。
`article` 适合能独立理解的文章或记录，`aside` 是与正文相关的补充。
这些标签不会自动生成目录，也不能替代准确的文本。

标题按内容层级从 `h1` 到 `h2`、`h3` 递进，不要为了字号跳级。
`strong` 表达重要性；纯粹让字体加粗通常属于 CSS 的工作。
`datetime` 是机器可理解的日期，元素中的文本是读者看到的日期。

`aria-labelledby` 引用本页真实存在且唯一的 `id`。
原生标签已经表达角色时，不必再添加同名 `role`。
跳转链接与 `tabindex="-1"` 允许正文成为焦点目标，但不会把它放进常规 Tab 顺序。
语义正确只是可访问性的起点，后续仍要检查颜色对比、焦点与表单标签。

## 效果验证

1. 标签页显示“周末学习记录”，正文显示同名主标题。
2. 按 Tab，第一项是“跳到正文”；按 Enter 后地址带 `#main`。
3. 导航链接分别跳到计划与记录，不需要脚本。
4. 在 Elements 展开 `main`，能找到两个 `section` 及其标题。
5. 在 Accessibility 面板查看导航和主内容的角色、名称与标题层级。

## 常见错误

| 现象 | 原因 | 修正 |
| --- | --- | --- |
| 中文乱码 | 文件实际编码与声明不一致 | 用编辑器保存为 UTF-8 |
| 锚点没有跳转 | `href` 与 `id` 不匹配 | 对照大小写和拼写 |
| 列表布局奇怪 | 将 `li` 写在 `ul` 或 `ol` 外 | 恢复合法父子关系 |
| 点击正常但键盘不通 | 用普通容器模拟交互控件 | 优先改成链接或按钮 |

不要根据页面“看起来正常”判断结构合法。
可以将源码粘贴到官方校验器，结合 DOM 面板定位被自动修复的节点。

## 练习与验收标准

把页面扩展为“本周阅读记录”，增加两篇各有标题、日期和摘要的 `article`。
新增一个“阅读记录”导航链接，不添加 CSS 或 JavaScript。

验收：只有一个主标题；日期可机器读取；所有 `id` 唯一；链接可由键盘激活。
解释为什么摘要用 `p`，两篇独立记录用 `article`，而不是全部使用 `div`。

## 延伸资料

- [MDN：HTML 入门](https://developer.mozilla.org/zh-CN/docs/Learn_web_development/Core/Structuring_content)
- [WHATWG：HTML 解析](https://html.spec.whatwg.org/multipage/parsing.html)
- [W3C：页面结构教程](https://www.w3.org/WAI/tutorials/page-structure/)
- [W3C：HTML 校验器](https://validator.w3.org/nu/)

下一章：[表单与媒体](./forms-media.md)。
