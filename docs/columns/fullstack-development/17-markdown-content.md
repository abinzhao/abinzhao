---
title: "第 17 章：Markdown 文章管理"
description: "建立文章元数据、Markdown 内容目录和本地预览写作流程。"
date: '2026-10-23'
category: 项目实战
tags: [Markdown, 内容管理, 静态站点]
series:
  order: 18
---
## 第 17 章 Markdown 文章管理

### 17.1 文章元数据：`posts/index.json`

```json
[
  {
    "slug": "hello-world",
    "title": "从零开始的 CSS 布局",
    "date": "2026-10-15",
    "excerpt": "Flexbox 和 Grid 各自适合什么场景？这篇笔记用几个实际例子说明选择依据。",
    "tags": ["CSS", "布局"],
    "readingTime": 8
  },
  {
    "slug": "browser-render",
    "title": "浏览器渲染流程速查",
    "date": "2026-09-28",
    "excerpt": "从 HTML 到屏幕像素，中间到底发生了什么？为什么 transform 动画比 width 动画流畅？",
    "tags": ["浏览器", "性能"],
    "readingTime": 12
  }
]
```

每新增一篇文章，就在这个文件里加一条。`slug` 必须和 `posts/` 目录下的 `.md` 文件名一致。

### 17.2 Markdown 文件示例：`posts/hello-world.md`

````markdown
## 为什么需要 Flexbox

在 Flexbox 出现之前，用 `float` 做布局需要处理清除浮动、高度塌陷、垂直居中困难等问题。

## 一维与二维

Flexbox 控制**一行或一列**内元素的排布。

```css
.row {
  display: flex;
  gap: 16px;
}
```

Grid 同时控制**行和列**。

```css
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
```

## 怎么选

| 场景 | 选择 |
|---|---|
| 导航栏、按钮组、表单行 | Flexbox |
| 卡片列表、整页布局、仪表盘 | Grid |
| 不确定 | 先用 Flexbox，需要行列同时控制再换 Grid |

## 完整例子

```html
<div class="cards">
  <article class="card">A</article>
  <article class="card">B</article>
  <article class="card">C</article>
</div>
```

```css
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
  gap: 24px;
}
```

不需要任何媒体查询，容器宽度变化时列数自动调整。
````

### 17.3 本地预览

纯静态项目最简单的预览方式：

```bash
# Python 3 自带
python3 -m http.server 8000

# 或 Node
npx serve@14.2.6 .

# 或 VSCode 的 Live Server 插件，右键 → Open with Live Server
```

然后打开 `http://localhost:8000`。

**必须用 HTTP 服务器，不能直接双击 HTML 文件。** 原因：

- `file://` 协议下 `fetch('posts/index.json')` 会被 CORS 拦截
- ES Modules（`<script type="module">`）在 `file://` 下无法加载
- `localStorage` 在部分浏览器下受限

### 17.4 写文章的流程

1. 在 `posts/` 下新建 `my-new-post.md`
2. 在 `posts/index.json` 里加一条记录，`slug` 填 `my-new-post`
3. 刷新页面，卡片自动出现

如果想自动化，可以写一个 Node 脚本在构建时扫描 `posts/*.md` 自动生成 `index.json`。v1 阶段手动维护就够，文件多了再考虑自动化。

### 内容来源与迁移

Markdown 外层示例用四个反引号，才能完整展示内部三个反引号的代码块。发布前同时验证 JSON、slug 唯一性与文件存在，正文标题重复时锚点要去重。阅读时间是估算值，不应写成精确承诺。

v3 迁移时，不把用户输入的 Markdown 当作可信 HTML；数据库保存原始内容，展示层使用明确白名单净化。附件链接、图片来源和外链协议也要限制，见 [文件安全](./48-files-object-storage)。

### 17.5 元数据、正文和 URL 的一致性

文章索引承担目录职责，Markdown 文件承担正文职责，slug 连接二者。索引不是任意可执行配置：至少检查标题和 slug 是字符串、日期采用约定格式、标签为字符串数组，slug 唯一且不能包含路径穿越。不要仅凭 TypeScript 类型声明信任运行时 JSON；加载阶段应验证结构，失败时报告对应字段和文件。

文件名、索引 slug 与页面查询参数需要采用同一映射。标题可以重复，URL 标识不能重复；修改 slug 相当于修改公开地址，旧链接需要迁移策略，不能只把文章从列表中换个名字。章节引用也需校验目标存在，标题变化可能改变自动锚点，重要锚点可采用稳定 id 并纳入链接检查。

日期不应让时区转换意外改变发布日期。纯日期适合保存为明确的 `YYYY-MM-DD` 并按日展示；事件时间才使用带时区的时间戳。阅读时间依据分词、代码与图表数量只是估算，比较不同语言内容时应说明口径。索引排序要有稳定的次级条件，避免同一天发布的文章在刷新后互换位置。

### 17.6 渲染安全与坏内容恢复

Markdown 是内容格式，不是安全边界。解析器可能生成链接、HTML 和图片资源，净化器需要在解析后使用；净化后再用字符串拼接插入未验证的 HTML，会重新引入风险。禁止执行文章中的脚本，外链限制协议，图片请求也要考虑隐私和加载失败。需要原样展示 HTML 示例时使用代码围栏，让解析器将它作为代码而非页面结构。

同一标题产生多个相同锚点、代码围栏未闭合、索引 JSON 损坏和正文 404 都是应主动制作的故障夹具。把错误限制在当前文章或当前加载步骤，显示可读信息并保留导航；不能捕获异常后返回空列表，制造“没有文章”的假象。文章加载中途切换 slug 时，还要阻止旧响应覆盖新页面。

练习写两篇同名文章、一篇包含嵌套代码围栏的文章和一份恶意链接样本。验证目录唯一、正文完整、锚点可跳转、安全样本不执行，并让缺失正文返回明确状态。随后刷新深链接，检查列表与详情使用同一份元数据。完成标准是能够从内容源定位一次真实断链或渲染错误，且坏文章不会使其余页面不可用；“解析成功”不能证明语义、链接和安全都通过。

官方参考：[CommonMark](https://spec.commonmark.org/)、[marked 文档](https://marked.js.org/)、[serve registry](https://registry.npmjs.org/serve)。

---
