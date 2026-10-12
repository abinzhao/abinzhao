---
title: 现代 CSS 系统：变量、容器查询与可阅读光感材质
description: 建立语义变量与组件级响应式，并在沉浸光感界面中保护正文对比。
type: tutorial
topic: css
section: frontend
order: 30
level: advanced
status: published
tags:
  - CSS
  - 自定义属性
  - 容器查询
  - 视觉材质
  - 可访问性
prerequisites:
  - /tutorials/css/foundations.html
  - /tutorials/css/layouts.html
comments: true
---

# 现代 CSS 系统：变量、容器查询与可阅读光感材质

现代 CSS 系统的价值不在于堆叠新语法，而在于让主题、组件空间和视觉效果各有边界。变量表达稳定设计意图，容器查询让组件根据自身空间变化，渐变与透明层提供光感，但正文仍须拥有可靠的阅读表面。本篇构建一份深色学习面板，说明如何组织这些能力，以及为什么漂亮背景不能代替对比度与状态设计。

## 前置知识与适用范围

先掌握 [CSS 基础](./foundations.html) 与 [Flex、Grid 布局](./layouts.html)，能解释继承、层叠层和最小尺寸。创建独立目录，入口为 `index.html`，另有 `styles.css`。示例全部视觉效果由 CSS 生成，不下载外部图片，不使用第三方库，直接打开入口即可。

本文使用自定义属性、尺寸容器查询、渐变和可选背景模糊，适用于支持这些功能的现代浏览器。容器查询与模糊有明确增强或回退路径，基础单列内容不依赖它们。目标支持范围应查官方兼容资料并实测，不将“现代”当成任何版本都必然支持的保证，也不声称这里代表最新 CSS 标准的全部能力。

## 变量为什么应该表达用途而不只是颜色

自定义属性参与层叠并默认继承，可以在根节点定义主题，在组件或局部范围覆盖。`--text-primary` 表达正文用途，`--surface-reading` 表达阅读表面，比大量按色号命名的变量更能说明修改影响。色板可以作为基础，但业务规则最好消费语义变量，这样切换主题不必逐个寻找元素。

变量不是编译时字符串常量。浏览器在使用属性值时解析它，值不适合目标属性时，最终声明可能无效。`var()` 的回退值主要处理变量缺失或无效自定义属性情况，并不会替你判断所有属性语法。例如把宽度变量设成一种颜色，即使变量存在，应用到宽度仍不合法。应给变量清晰的用途与值类型约定。

继承也意味着范围要谨慎。根节点的字号、间距变量可能影响整页，而仅用于某张卡片的细节应在组件范围定义。不要为只出现一次的数值创建几十个泛化变量；真正的系统来自稳定关系，而不是变量数量。层叠层可以把基础主题、组件与明确覆盖分开，减少样式依赖选择器升级。

## 第一步：建立同组件不同容器的页面

将以下代码写入 `index.html`。两份学习面板结构相同，分别处于宽区域和窄区域。页面上没有依赖脚本的死按钮，操作入口是语义正确的真实教程链接。独立本地打开时，站内导航依赖站点服务器；观察组件布局本身不需要点击这些地址。

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>光感学习面板</title>
    <link rel="stylesheet" href="./styles.css">
  </head>
  <body>
    <main class="page">
      <h1>光感学习面板</h1>
      <p class="intro">背景负责氛围，正文负责清晰。</p>
      <div class="showcase">
        <section class="panel-host" aria-label="主要学习面板">
          <article class="learning-panel">
            <div class="panel-summary">
              <p class="eyebrow">学习目标</p>
              <h2>理解组件自己的空间</h2>
              <p>同样的内容放在主区域和侧栏时，应依据容器宽度选择布局。</p>
            </div>
            <div class="reading-surface">
              <h3>本次实践</h3>
              <p>使用语义变量组织颜色与间距，保留足够的不透明正文表面。</p>
              <a href="/tutorials/css/layouts.html">复习布局机制</a>
            </div>
          </article>
        </section>
        <section class="panel-host" aria-label="窄区域学习面板">
          <article class="learning-panel">
            <div class="panel-summary">
              <p class="eyebrow">学习目标</p>
              <h2>保持侧栏可读</h2>
              <p>页面很宽不代表每个组件都很宽，侧栏依然可能需要单列。</p>
            </div>
            <div class="reading-surface">
              <h3>检查方法</h3>
              <p>缩窄容器，检查文字、边框和焦点是否仍然可见。</p>
              <a href="/tutorials/html/accessibility.html">阅读可访问性教程</a>
            </div>
          </article>
        </section>
      </div>
    </main>
  </body>
</html>
```

## 第二步：建立语义主题与基础回退

将以下代码写入 `styles.css`。背景使用径向渐变制造光源位置，面板边框提供轮廓，正文区域使用稳定的不透明底色。透明边缘和光斑不承担传递关键文字的职责。即使浏览器不支持容器查询或背景模糊，基础网格与单列面板仍然能够阅读。

```css
@layer theme, components, enhancements;

@layer theme {
  :root {
    color-scheme: dark;
    --surface-page: #080e1b;
    --surface-panel: #142039;
    --surface-reading: #101a2d;
    --text-primary: #f1f5ff;
    --text-secondary: #c5d1e8;
    --link: #b8d8ff;
    --focus: #ffda8a;
    --space: 1rem;
    --radius: 1rem;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: var(--text-primary);
    background:
      radial-gradient(ellipse at 12% 0%, #283969 0%, transparent 48%),
      radial-gradient(ellipse at 95% 28%, #153c48 0%, transparent 45%),
      var(--surface-page);
    font: 1rem/1.8 system-ui, sans-serif;
  }
  a { color: var(--link); text-underline-offset: 0.25em; }
  a:focus-visible { outline: 3px solid var(--focus); outline-offset: 4px; }
}

@layer components {
  .page { width: min(100% - 2rem, 76rem); margin: 2rem auto; }
  h1 { font-size: clamp(1.7rem, 4vw, 2.5rem); line-height: 1.3; }
  h2, h3 { line-height: 1.4; }
  .intro, .panel-summary p { color: var(--text-secondary); }
  .showcase { display: grid; gap: calc(var(--space) * 1.5); }
  .panel-host { min-width: 0; }
  .learning-panel {
    display: grid;
    gap: var(--space);
    padding: var(--space);
    border: 1px solid #7489b4;
    border-radius: var(--radius);
    background: var(--surface-panel);
    box-shadow: 0 1rem 3rem rgb(0 0 0 / 28%);
    overflow-wrap: anywhere;
  }
  .panel-summary, .reading-surface { min-width: 0; }
  .eyebrow { margin-top: 0; font-weight: 700; letter-spacing: 0.04em; }
  .reading-surface {
    padding: var(--space);
    background: var(--surface-reading);
    border-radius: calc(var(--radius) * 0.75);
  }
  .reading-surface h3 { margin-top: 0; }
  .reading-surface a { display: inline-flex; align-items: center; min-height: 44px; }
  @media (min-width: 64rem) {
    .showcase { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
  }
}

@layer enhancements {
  @supports (container-type: inline-size) {
    .panel-host { container-type: inline-size; container-name: learning; }
    @container learning (min-width: 34rem) {
      .learning-panel {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        padding: calc(var(--space) * 1.5);
      }
    }
  }
  @supports (backdrop-filter: blur(12px)) {
    .learning-panel {
      background: rgb(20 32 57 / 88%);
      backdrop-filter: blur(12px);
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    .learning-panel { transition: border-color 160ms ease; }
    .learning-panel:hover { border-color: #b8d8ff; }
  }
}
```

## 容器查询为什么要放在外层

媒体查询看视口，容器查询看被指定的祖先容器。这里 `panel-host` 提供查询范围，内部 `learning-panel` 响应范围的宽度。不能简单要求一个元素通过自己的尺寸查询来反过来决定自身尺寸，那容易形成循环依赖；尺寸查询需要正确的包含条件和祖先关系。

`container-type: inline-size` 建立行内方向尺寸包含，支持常见横向书写中的宽度查询，也对布局计算产生影响。容器最好由外部布局提供宽度，而不是期待完全由被查询后代撑出宽度。命名容器有助于嵌套场景明确查哪个范围，但不要随意在每层都创建相同名称，导致组件依赖最近祖先而产生意外。

在足够宽的视口里，主要区域的容器可能超过查询阈值，于是面板内部变成双列；侧栏容器仍较窄，内部保持单列。这说明响应式决策可以分层：页面媒体查询决定主要区域和侧栏怎么分，组件容器查询决定内容在局部怎么排。两者不是相互替代的竞争关系。

## 光感材质与正文对比如何共存

透明度把前景表面与背景混合，因此同一文字颜色在不同光斑位置可能有不同对比。单独测文字与某个面板色并不足以覆盖透明区域。正文区域使用不透明底色，可以把阅读关系稳定下来，背景继续承担氛围。这不是禁止透明，而是把关键阅读信息从不可控混合中分离。

`backdrop-filter` 处理元素背后的内容，需要透明或半透明表面才能明显看见。`filter` 则处理元素本身，两者作用对象不同。模糊可能增加渲染成本，尤其是面积大、滚动频繁或层层嵌套时；没有真实测量前不要宣称它“没有性能影响”，也不要为一点质感给全页反复加模糊。

示例阴影只提供深度，没有把正文变成发光文字。大范围文本光晕会模糊字形边缘，细小低对比正文尤其难读。普通正文通常应达到至少 4.5:1 的对比要求，大号文字的门槛和定义不同，应查正式标准。这里给出设计方法，不声称已经完成全部背景组合的对比测量。

颜色也不应成为状态唯一信号。链接保留下划线，键盘焦点有明确轮廓，标题层级仍在 HTML 中。`color-scheme: dark` 告知浏览器页面适配暗色，影响原生控件等表现，但它不会替你建立整套主题。系统高对比模式可能替换颜色，使用语义结构比依赖精细光效更耐变化。

## 检查结果与错误排查

先在宽屏检查主要面板与侧栏面板是否可能采取不同内部列数，再缩窄到单列页面，预期正文自然增长而不裁切。开发者工具中检查命名容器尺寸与查询是否匹配；当前视口很宽但侧栏不变双列通常是正确行为，不应立即提高选择器优先级。

临时禁用容器类型，预期面板恢复基础单列；禁用模糊，预期阅读表面仍然清楚。移动光斑或修改背景颜色后，检查摘要文字的实际对比，不要只检查内部正文。按 Tab 检查链接轮廓是否被圆角或外层裁切，放大到 200% 检查长标题和链接能否完整显示。

如果变量没有效果，检查作用范围、名称以及计算值是否合法。如果查询不触发，检查后代是否处于正确命名容器内，容器是否有确定空间，以及阈值是否按根字号换算。如果模糊看不见，检查表面是否完全不透明，但不要为了显著效果把正文底色也全部透明化。

如果背景层被遮住，检查渐变从前到后的叠放顺序以及是否被实色覆盖。如果卡片随内容发生异常收缩，检查尺寸包含和外部 Grid 轨道。若页面滚动明显变慢，应比较关闭模糊前后的真实性能记录，不能把静态外观良好当作性能证据。

## 主题变化与组件拥有边界

主题切换最好修改稳定语义变量，而不是在每个主题规则里重复整个组件布局。颜色变化不应无故改变 DOM 顺序、按钮含义和正文结构；间距需要跟随密度设置变化时，也要明确它与配色主题是不同维度。把所有视觉差异都装进一个主题类，容易让本来独立的决策互相牵制。

组件使用父容器提供的空间，但不应该偷偷改变整页主题。局部需要浅色阅读区时，应在它拥有的范围定义文字与表面变量，并验证链接、焦点和控件同样获得合适配色。只覆盖背景而保留旧正文色，会直接产生不可读组合。变量的继承减少重复，也要求开发者知道覆盖会影响哪些后代。

效果增强还应有成本预算。一个静态渐变通常比持续运动的大面积模糊更容易控制，但具体代价取决于设备、浏览器和组合方式。先明确哪些效果真的帮助理解或品牌表达，再测量关键页面；不要因为功能检测成功就认为渲染成本必然可接受。语法支持、可读性与性能需要分别提供证据。

## 练习与官方参考

新增一个局部“高对比主题”类，只覆盖语义变量，保持组件规则不变。解释哪些变量需要改变、哪些间距变量不必变化。再把侧栏放入更窄容器，确认没有页面媒体查询时组件依然能按自身空间布局。

记录四项验收：无增强回退、宽窄容器差异、正文与背景对比、键盘焦点可见性。加入光效前后分别检查正文，而不是只增加装饰截图。视觉系统的完整性来自这些稳定边界，不来自效果数量。

官方参考：

- [MDN：CSS 自定义属性](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_cascading_variables/Using_CSS_custom_properties)
- [MDN：CSS 容器查询](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries)
- [MDN：backdrop-filter](https://developer.mozilla.org/zh-CN/docs/Web/CSS/backdrop-filter)
- [MDN：prefers-reduced-motion](https://developer.mozilla.org/zh-CN/docs/Web/CSS/@media/prefers-reduced-motion)

参考资料用于核对语法、包含影响与浏览器支持。实际项目的视觉、可访问性和性能结论仍需在目标页面上分别验证。
