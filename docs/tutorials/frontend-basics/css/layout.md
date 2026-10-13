---
title: CSS：Flex 与 Grid 布局
description: 用一维和二维布局实现响应式工作区，解释收缩、断点与溢出。
---

# CSS：Flex 与 Grid 布局

## 学习目标

- 按排列需求选择 Flex 或 Grid，而不是根据标签名称选择。
- 理解主轴、交叉轴、轨道、间隙和内容的最小尺寸。
- 写出随视口宽度变化的完整布局，并排查长文本溢出。

前置：[层叠与盒模型](./cascade-box.md)。
响应式 Web 使用同一套 DOM 适应桌面和手机视口，不需要另建原生移动应用。

## 为什么需要两种布局

Flex 主要解决一条轴上的分配，例如工具栏、按钮组和单行列表。
Grid 同时定义列与行，适合整体工作区、数据面板和对齐明确的二维区域。
它们可以嵌套：Grid 管页面区域，Flex 管区域内的控件。

不要把绝对定位作为主要排版方式。
绝对定位会脱离普通流，内容增长时相邻区域不会自动避让。
正常布局更适合标题换行、翻译变长和列表条目增加等情况。

## 机制与边界

Flex 的主轴由 `flex-direction` 决定，`justify-content` 沿主轴分配剩余空间。
`align-items` 沿交叉轴对齐；`gap` 是项目间隙，不是容器外边距。
`flex: 1 1 16rem` 表示允许增长、允许收缩、初始分配基准为 16rem。
收缩分配与基准尺寸有关，不是每项一定减去相同像素数。

Grid 的 `fr` 分配剩余空间，不是无条件占容器总宽度的固定百分比。
`minmax(0, 1fr)` 允许轨道缩到内容固有最小尺寸以下。
Flex/Grid 项默认 `min-width: auto` 可能保护长文本的最小宽度，导致溢出。
对允许收缩的项目设置 `min-width: 0`，再决定文本如何折行。

`repeat(auto-fit, minmax(15rem, 1fr))` 会依据空间自动决定列数并扩展已有列。
`auto-fill` 会保留可容纳的空轨道，两者在项目较少时差异更明显。
本例进一步用 `min(100%, 15rem)` 防止最小轨道比容器还宽。
CSS 的视觉重排不应改变阅读逻辑；DOM 顺序需要先保持合理。

## 运行步骤

1. 创建 `layout/index.html` 与 `layout/style.css`。
2. 启动练习服务器，打开 `/layout/`。
3. 分别调整视口为约 1280px、1000px、800px、390px 宽。
4. 在 DevTools 的 Layout 面板开启 Grid 与 Flex 覆盖层。
5. 不需要脚本，布局应由 CSS 自己完成。

## 完整示例

::: code-group

```html [index.html]
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>学习工作区</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <header class="topbar">
    <h1>学习工作区</h1>
    <nav aria-label="工作区导航">
      <a href="#courses">课程</a>
      <a href="#notes">笔记</a>
    </nav>
  </header>
  <div class="workspace">
    <aside class="sidebar" aria-labelledby="progress-title">
      <h2 id="progress-title">当前进度</h2>
      <p>已完成 HTML，正在学习 CSS。</p>
      <ol>
        <li>结构</li>
        <li>盒模型</li>
        <li>布局</li>
      </ol>
    </aside>
    <main>
      <section id="courses" aria-labelledby="courses-title">
        <div class="toolbar">
          <h2 id="courses-title">课程列表</h2>
          <form action="#courses" method="get" class="search">
            <label for="query">检索词（演示提交）</label>
            <input id="query" name="query" type="search">
            <button type="submit">提交检索词</button>
          </form>
        </div>
        <p>此章只演示布局，提交会将检索词写入地址，不执行过滤。</p>
        <div class="course-grid">
          <article class="course">
            <h3>HTML 结构</h3>
            <p>了解语义化、标题层级和浏览器解析。</p>
            <a href="../structure/">打开 HTML 实验</a>
          </article>
          <article class="course">
            <h3>CSS 盒模型</h3>
            <p>解释宽度、内边距、边框与外边距。</p>
            <a href="../cascade-box/">打开盒模型实验</a>
          </article>
          <article class="course">
            <h3>长文本压力测试</h3>
            <p class="resource">course-resource-identifier-without-spaces-1234567890</p>
            <a href="#notes">查看练习笔记</a>
          </article>
        </div>
      </section>
      <section id="notes" class="notes">
        <h2>练习笔记</h2>
        <p>缩小窗口时，工具栏换行，网格减少列数，正文保持可读。</p>
      </section>
    </main>
  </div>
</body>
</html>
```

```css [style.css]
* { box-sizing: border-box; }
body { margin: 0; color: #202c3a; background: #f4f6fa; font-family: sans-serif; }
a { color: #194fa3; }
input, button { font: inherit; padding: .6rem; }
input, button, a { min-height: 44px; }
.topbar a { display: inline-flex; align-items: center; }
:focus-visible { outline: 3px solid #194fa3; outline-offset: 3px; }
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 1rem 2rem;
  background: white;
}
.topbar h1 { margin: 0; font-size: 1.6rem; }
.topbar nav { display: flex; gap: 1rem; }
.workspace {
  display: grid;
  grid-template-columns: 14rem minmax(0, 1fr);
  gap: 1.5rem;
  max-width: 76rem;
  margin: 1.5rem auto;
  padding: 0 1.5rem;
}
.sidebar, .course, .notes { padding: 1rem; background: white; border: 1px solid #ccd5e2; }
main { min-width: 0; }
.toolbar { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
.toolbar h2 { flex: 1 1 12rem; margin: 0; }
.search { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; min-width: 0; }
.search input { flex: 1 1 10rem; min-width: 0; max-width: 100%; }
.course-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
  gap: 1rem;
}
.course { min-width: 0; display: flex; flex-direction: column; gap: .5rem; }
.course h3, .course p { margin: 0; }
.course a { margin-top: auto; padding-top: 1rem; }
.resource { overflow-wrap: anywhere; }
.notes { margin-top: 1.5rem; }
@media (max-width: 60rem) {
  .workspace { grid-template-columns: minmax(0, 1fr); }
  .sidebar ol { display: flex; gap: 2rem; flex-wrap: wrap; }
}
```

:::

如果尚未创建前两章实验目录，对应链接会显示 404；按章节准备后即可跳转。
课程卡片内部的 `margin-top: auto` 吸收剩余空间，使底部链接靠下。
它依赖父容器是列方向 Flex，不会在普通块布局中获得相同行为。

## 效果验证

1280px 左右：侧栏在左，正文在右，卡片列数由正文空间决定。
800px 左右：侧栏进入正文上方，工具栏可换行，没有文字被裁切。
390px：卡片单列，输入与按钮自然换行；页面没有横向滚动。viewport 声明让手机使用设备宽度，而非默认的宽页面缩放。
开启 Grid 覆盖层可看到列轨道，开启 Flex 覆盖层可看到主轴。
Console 检查 `document.documentElement.scrollWidth <= window.innerWidth`，应为 `true`。
按 Tab 的焦点顺序应仍是导航、表单、课程链接，而不是由视觉位置任意改变。

## 常见错误

`align-items: center` 不总是水平居中，先确认主轴方向。
百分比列宽再加 `gap` 可能超宽，用 `fr` 分配扣除间隙后的剩余空间。
固定卡片高度可能裁掉长标题，应让内容撑开或明确滚动区域。
不要只加 `min-width: 0`：内容是否需要换行也必须一起决定。

## 练习与验收标准

新增两门课程，保留不同长度标题，观察 `auto-fit` 列数变化。
在 390px 至 1400px 的视口宽度内逐步调整，而不是只测两个端点。
验收：无横向溢出；每个链接可聚焦；卡片内容完整；能解释 Grid 与 Flex 的职责。

## 延伸资料

- [MDN：Flex 基本概念](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_flexible_box_layout/Basic_concepts_of_flexbox)
- [MDN：Grid 基本概念](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_grid_layout/Basic_concepts_of_grid_layout)
- [Chrome：检查 CSS 布局](https://developer.chrome.com/docs/devtools/css/grid)

下一章：[动画与减少动态效果](./motion.md)。
