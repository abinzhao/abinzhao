---
title: CSS 响应式布局：用 Flex 与 Grid 管理空间
description: 从主轴、轨道和最小内容尺寸理解 Flex、Grid 与移动端响应式布局。
type: tutorial
topic: css
section: frontend
order: 20
level: intermediate
status: published
tags:
  - CSS
  - Flex
  - Grid
  - 响应式
prerequisites:
  - /tutorials/css/foundations.html
comments: true
---

# CSS 响应式布局：用 Flex 与 Grid 管理空间

响应式布局不是给桌面页面再加一个手机宽度，而是让内容在不同可用空间里保持合理顺序、阅读宽度和操作尺寸。Flex 擅长管理一条轴上的分配关系，Grid 擅长管理二维轨道；二者可以在不同层级协作。真正让页面溢出的，往往是内容的最小尺寸、固定宽度或不合理顺序。本篇通过学习资料列表解释这些机制，并给出可以逐步缩窄验证的完整页面。

## 前置知识与适用范围

先学习 [层叠与盒模型](./foundations.html)，了解类选择器、内边距和 `border-box`。新建独立目录，入口 `index.html` 引用 `styles.css`。直接用浏览器打开入口，不需要 JavaScript、包管理器或构建工具。示例只使用长期稳定的 Flex、Grid、媒体查询和逻辑属性，适用于常见现代浏览器。

本文的断点是练习内容的空间决策，不是所有项目必须采用的设备标准。实际页面应在内容开始拥挤时改变布局，而不是凭某款手机名称设置条件。正文使用相对单位，允许用户字体设置影响空间；最终仍须在目标设备、放大比例和真实长内容下检查。

## Flex 与 Grid 如何分配剩余空间

Flex 容器有主轴与交叉轴，`flex-direction` 决定主轴方向。默认横向排列时，`justify-content` 管理主轴对齐，`align-items` 管理交叉轴对齐；改成列方向后，两者对应的视觉方向也会变化。因此记“一个水平一个垂直”会在方向调整后出错。开启换行后，每行分别分配空间，并不是整个二维表格共享列线。

项目的 `flex-basis` 提供初始尺寸，`flex-grow` 分配正剩余空间，`flex-shrink` 参与不足空间的缩减。项目最终能否缩小还受最小尺寸限制。很多 Flex 项默认不会缩到比其最小内容尺寸更小，长文本因此可能撑开容器。明确允许某个内容项 `min-width: 0`，并选择合适的断行策略，比随意设置隐藏溢出更有解释力。

Grid 将容器划分为行列轨道，项目可以占据一条或多条轨道。`fr` 分配可用剩余空间，不是固定百分比；间距、固定轨道和最小尺寸都参与计算。`minmax(0, 1fr)` 明确允许轨道下界为零，常用于避免长内容把本来可伸缩的列撑宽，但内部文本仍须具备合理换行策略。

`auto-fit` 可以在可用空间里建立尽可能多的轨道，并折叠没有项目占用的空轨道；`auto-fill` 通常保留相应空轨道。卡片列表常使用前者，让实际卡片利用空间。二者不是永远能互换的简写，应通过项目数量少于列数的情况观察差别。

## 第一步：建立有真实内容的页面

将下面代码写入 `index.html`。文档先提供标题和导航，再提供筛选说明与资料列表；窄屏可以按这个顺序自然阅读。这里的链接只使用真实的组内教程地址，作为内容示例；在独立本地文件练习中，完整站内地址不一定有服务器可解析，因此布局验收不依赖点击后的站点导航。

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>前端学习资料布局</title>
    <link rel="stylesheet" href="./styles.css">
  </head>
  <body>
    <header class="toolbar">
      <p class="brand">前端学习资料</p>
      <nav aria-label="教程导航">
        <a href="/tutorials/">全部教程</a>
        <a href="/tutorials/css/foundations.html">CSS 基础</a>
      </nav>
    </header>
    <main class="shell">
      <aside class="guide" aria-labelledby="guide-title">
        <h2 id="guide-title">阅读建议</h2>
        <p>先解释空间关系，再选择布局属性。</p>
        <ul>
          <li>检查源代码阅读顺序。</li>
          <li>缩窄窗口寻找拥挤点。</li>
          <li>检查长内容能否换行。</li>
        </ul>
      </aside>
      <section aria-labelledby="list-title">
        <h1 id="list-title">布局实践资料</h1>
        <div class="cards">
          <article class="card">
            <h2>Flex 空间分配</h2>
            <p>适合工具栏、按钮组和一维列表，理解主轴与最小尺寸尤其重要。</p>
            <a href="/tutorials/css/layouts.html">阅读布局教程</a>
          </article>
          <article class="card">
            <h2>Grid 轨道管理</h2>
            <p>适合二维列表与页面骨架，列轨道可以共享稳定的对齐关系。</p>
            <a href="/tutorials/css/foundations.html">复习尺寸计算</a>
          </article>
          <article class="card">
            <h2>响应式阅读</h2>
            <p>长内容样本：responsive-layout-with-a-very-long-unbroken-name</p>
            <a href="/tutorials/html/accessibility.html">检查阅读与键盘路径</a>
          </article>
        </div>
      </section>
    </main>
  </body>
</html>
```

## 第二步：先写单列，再增强布局

将以下完整代码写入 `styles.css`。基础规则面向窄屏，页面骨架先是一列。达到有足够空间的条件后，骨架再分为说明区和主体；卡片列数则由容器空间与最小卡片宽度自动决定，不再为每种数量重复写媒体查询。

```css
* { box-sizing: border-box; }
body {
  margin: 0;
  color: #182235;
  background: #f5f7fb;
  font: 1rem/1.75 system-ui, sans-serif;
}
a { color: #174ea6; text-underline-offset: 0.2em; }
a:focus-visible { outline: 3px solid #174ea6; outline-offset: 4px; }
.toolbar, .shell {
  width: min(100% - 2rem, 72rem);
  margin-inline: auto;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 2rem;
  padding-block: 1rem;
}
.brand { margin: 0; font-weight: 700; }
nav { display: flex; flex-wrap: wrap; gap: 0.75rem 1rem; }
nav a { display: inline-flex; align-items: center; min-height: 44px; }
.shell { display: grid; gap: 2rem; padding-block: 1rem 3rem; }
.shell > * { min-width: 0; }
.guide { padding: 1rem; border-inline-start: 4px solid #174ea6; }
h1 { font-size: clamp(1.6rem, 3vw, 2.3rem); line-height: 1.3; }
h2 { font-size: 1.2rem; line-height: 1.4; }
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
  gap: 1rem;
}
.card {
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 1.25rem;
  border: 1px solid #bccae0;
  border-radius: 0.75rem;
  background: white;
  overflow-wrap: anywhere;
}
.card h2 { margin-block: 0 0.75rem; }
.card p { margin-block: 0 1rem; }
.card a { margin-top: auto; min-height: 44px; display: flex; align-items: center; }
@media (min-width: 58rem) {
  .shell { grid-template-columns: 14rem minmax(0, 1fr); align-items: start; }
}
```

卡片使用列方向 Flex，让阅读链接通过自动外边距靠近底部。这样同一 Grid 行中不同正文长度的卡片可以保持入口位置相对一致，但不需要固定卡片高度。正文变长时卡片继续增长，不会被人为裁切。只有业务确实要求摘要时，才应考虑截断并提供完整内容的入口。

`min(100%, 16rem)` 限制最小卡片宽度不能超过当前容器。若直接要求每张卡片至少 16 根字号，而设备可用空间不足，会产生横向溢出。外层 `minmax(0, 1fr)` 与内部 `min-width: 0` 分别处理轨道和项目的收缩边界，不能简单认为写其中一个就能解决所有嵌套场景。

## 响应式不是视觉重排的借口

媒体查询根据视口等环境条件匹配，适合页面级布局调整。相同组件放在宽页面的狭窄侧栏时，视口很宽却不代表组件很宽；这种问题将在 [现代 CSS 系统](./systems.html) 中用容器查询解决。先分清页面空间与组件空间，可以避免断点互相打架。

不要为了视觉“左右对称”随意用 `order` 重排内容。CSS 视觉顺序不一定改变辅助技术的阅读顺序与键盘顺序。若侧栏是正文之后的补充内容，应先调整合理的 DOM，再确定桌面布局位置。本文说明区位于主体前，因为它承担先读的操作建议；实际产品可以有不同的内容责任。

固定定位和粘性定位也不是布局的默认解法。固定元素脱离普通文档流，可能遮挡焦点和正文；粘性元素受滚动容器及偏移条件影响。在内容足够简单时，普通流、Flex 和 Grid 更容易在放大与窄屏下保持完整。只有确认需要持续可见的工具时才增加这些行为，并验收遮挡情况。

## 检查结果与错误排查

先在宽窗口检查工具栏是否一行或自然换行，页面骨架是否进入双列，卡片是否按可用空间形成多列。再逐渐缩窄，预期说明区与主体回到单列，卡片列数减少，长英文串换行，横向没有被内容撑出的额外滚动。文中的断点不会保证某个指定屏幕必然正好三列，实际结果还受根字号影响。

把浏览器放大到 200%，预期布局可以重新分配列数，卡片正文不裁切，链接仍可操作。逐个使用 Tab 检查链接顺序与视觉阅读顺序是否一致。浏览器布局面板可显示 Flex 主轴和 Grid 轨道，用它确认项目实际位于哪条轨道，比盯着截图推算更可靠。

若主区域溢出，先找最宽的子元素，查看是否有固定宽度、无法断行文字或默认最小尺寸。若 Flex 项不缩小，检查 `min-width` 和 `flex-basis`，不要立即给全页加 `overflow-x: hidden`；那会隐藏问题，也可能裁掉聚焦元素。若 `gap` 不生效，确认容器确实使用对应布局，并检查属性有没有被覆盖。

若 Grid 看起来没有均分，检查剩余空间是否被最小轨道尺寸限制，以及是否存在跨列项目。若链接不能靠底部，确认卡片是列方向 Flex，并有可分配的空间；自动外边距只会吸收实际剩余空间，不会凭空创造高度。若断点未触发，查看当前视口和根字号，而不是只读取窗口外框宽度。

## 内容尺寸与对齐的进一步判断

布局需要区分容器有多少空间与内容至少需要多少空间。一个长单词、不可拆分的控件组或固有宽度图片，会抬高项目的最小内容尺寸；普通中文段落则通常能在更多位置换行。相同网格模板换成真实数据后出现溢出，并不意味着网格规则随机失效，而是内容提供了不同尺寸约束。上线前应把极端标题和长标识加入样本。

图片与视频属于替换元素，可能有固有尺寸和比例。实际列表加入这些资源时，应限制它们不能超过卡片的可用宽度，并明确是否允许裁切。保持比例、完整展示和铺满固定区域是三种不同需求，不能仅靠固定宽高同时满足。本文没有图片，但内容尺寸分析仍需预留这种真实项目中的检查责任。

对齐也需要区分项目本身和项目内部文字。`text-align` 不会把一个网格项目移到轨道中央，容器的项目对齐也不会自动让多段文字居中。为了修复一处视觉偏移把全部对齐都设为居中，会让正文阅读更困难。应先判断偏移来自轨道分配、项目边框盒还是文本排列，再选择对应属性。

最后，响应式验收不应只取两个端点截图。中间宽度可能恰好让导航出现最后一项单独换行，或者让卡片标题压成很长的窄列。逐步拖动窗口并观察拥挤点，可以发现断点附近问题；同时保持键盘焦点与正文可见，避免布局变化时出现遮挡。内容能自然增长，是比固定截图整齐更持久的目标。

## 练习与官方参考

把卡片数量增加到五个，其中一张正文扩展到三段，另一张标题使用较长中文。检查列数变化、同行高度与阅读入口位置，确认没有固定高度造成截断。再临时把 `auto-fit` 改成 `auto-fill`，在超宽窗口且卡片很少时观察空轨道的不同。

为说明区新增一个长链接，写出它是否需要 `min-width: 0` 和断行规则的理由。练习验收应至少包含宽屏、窄屏、长内容、200% 放大和键盘五种条件。这里给出的是建议检查矩阵，不是已经运行的测试报告。

官方参考：

- [MDN：Flexbox 的基本概念](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_flexible_box_layout/Basic_concepts_of_flexbox)
- [MDN：Grid 的基本概念](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_grid_layout/Basic_concepts_of_grid_layout)
- [MDN：minmax()](https://developer.mozilla.org/zh-CN/docs/Web/CSS/minmax)
- [MDN：媒体查询](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_media_queries/Using_media_queries)

布局属性是空间规则，不是截图坐标。能解释缩窄后的尺寸变化，才说明你真正掌握了响应式布局。
