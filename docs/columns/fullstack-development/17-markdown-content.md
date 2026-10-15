---
title: "第 17 章：Markdown 文章管理"
description: "建立文章元数据、Markdown 内容目录和本地预览写作流程。"
date: "2026-10-15"
category: 项目实战
tags: [Markdown, Content Management, Static Site]
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

```markdown
## 为什么需要 Flexbox

在 Flexbox 出现之前，用 `float` 做布局需要处理清除浮动、高度塌陷、垂直居中困难等问题。

## 一维与二维

Flexbox 控制一行或一列内元素的分## 一维与二维

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
```

### 17.3 本地预览

纯静态项目最简单的预览方式：

```bash
# Python 3 自带
python3 -m http.server 8000

# 或 Node
npx serve .

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

---
