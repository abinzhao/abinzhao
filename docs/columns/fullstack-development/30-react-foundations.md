---
title: "第 30 章：React 19 组件、Props 与 JSX"
description: "创建 React 19 + TypeScript 项目，掌握函数组件、Props、JSX、条件与列表渲染。"
date: "2026-10-15"
category: React
tags: [React 19, JSX, Props]
series:
  order: 31
---
## 第 30 章 React 组件基础

React 用组件描述“状态对应什么界面”。数据变化后，React 重新执行组件，并把新的描述同步到 DOM。不要把它理解为模板里嵌入 JavaScript，而应理解为用 JavaScript 组合界面。

### 30.1 学习目标

- 使用 Vite 创建 React 19 + TypeScript 项目。
- 编写职责单一的函数组件。
- 用 Props 定义组件输入和回调。
- 理解 JSX 表达式、属性和事件语法。
- 正确完成条件渲染和稳定的列表渲染。

### 30.2 创建项目

```bash
npm create vite@latest blog-v2 -- --template react-ts
cd blog-v2
npm install
npm run dev
```

确认依赖中的 React 主版本为 19：

```bash
npm list react react-dom
```

关键入口：

```tsx
// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('缺少 #root 挂载节点');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

开发环境中的 `StrictMode` 会额外执行部分逻辑，以暴露不纯渲染和缺少清理的副作用。它不会让生产环境渲染两次。

### 30.3 函数组件

组件是返回 React 节点的普通函数，名称必须以大写字母开头：

```tsx
export function SiteHeader() {
  return (
    <header className="site-header">
      <a href="/" className="site-logo">
        前端手记
      </a>
    </header>
  );
}
```

组件应保持纯粹：

```tsx
// 不要在渲染期间修改外部变量。
let renderCount = 0;

function BadComponent() {
  renderCount += 1;
  return <p>渲染次数：{renderCount}</p>;
}
```

相同 Props、State 和 Context 下，组件渲染应得到相同结果。请求、订阅和 DOM 操作放到事件处理器或 Effect 中。

### 30.4 JSX 规则

JSX 最终会转换为 JavaScript 调用，因此有几条与 HTML 不同的规则：

```tsx
export function PostMeta() {
  const publishedAt = '2026-10-15';
  const readingMinutes = 8;

  return (
    <>
      <time dateTime={publishedAt}>{publishedAt}</time>
      <span aria-hidden="true"> · </span>
      <span>{readingMinutes} 分钟阅读</span>
    </>
  );
}
```

- 返回多个相邻节点时，用父元素或 Fragment `<>...</>` 包裹。
- 属性名使用驼峰，如 `tabIndex`、`onClick`。
- CSS class 使用 `className`。
- JavaScript 表达式写在 `{}` 中。
- 标签必须闭合，如 `<img alt="" />`。
- `aria-*` 和 `data-*` 保持短横线写法。

样式对象使用数字或字符串：

```tsx
<div style={{ maxWidth: 720, marginInline: 'auto' }} />
```

业务样式优先写在 CSS 文件中，动态数值才用 `style`。

### 30.5 Props

Props 是父组件传给子组件的只读输入：

```tsx
export interface Post {
  id: string;
  slug: string;
  title: string;
  summary: string;
  tags: readonly string[];
  featured: boolean;
}

export interface PostCardProps {
  slug: string;
  title: string;
  summary: string;
  tags: readonly string[];
  featured?: boolean;
  onSelect?: (slug: string) => void;
}

export function PostCard({
  slug,
  title,
  summary,
  tags,
  featured = false,
  onSelect,
}: PostCardProps) {
  return (
    <article className="post-card">
      {featured ? <span className="post-card__badge">精选</span> : null}
      <h2>
        <a
          href={`/posts/${slug}`}
          onClick={() => onSelect?.(slug)}
        >
          {title}
        </a>
      </h2>
      <p>{summary}</p>
      <ul aria-label="文章标签">
        {tags.map((tag) => (
          <li key={tag}>{tag}</li>
        ))}
      </ul>
    </article>
  );
}
```

不要修改 Props：

```tsx
function BadPostCard(props: PostCardProps) {
  // props.tags.push('精选'); // readonly 能阻止这类修改
  return <article>{props.title}</article>;
}
```

需要改变数据时，由父组件更新状态，再通过新 Props 向下传递。

### 30.6 `children` 与组合

容器组件通过 `children` 接收嵌套内容：

```tsx
import type { ReactNode } from 'react';

interface PageSectionProps {
  title: string;
  children: ReactNode;
}

export function PageSection({
  title,
  children,
}: PageSectionProps) {
  return (
    <section className="page-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
```

使用：

```tsx
<PageSection title="最新文章">
  <PostList posts={posts} />
</PageSection>
```

组合通常比在组件上增加大量布尔 Props 更容易扩展。

### 30.7 条件渲染

提前返回适合互斥的大状态：

```tsx
interface PostListProps {
  posts: readonly Post[];
  loading: boolean;
  error: Error | null;
}

export function PostList({
  posts,
  loading,
  error,
}: PostListProps) {
  if (loading) {
    return <p role="status">文章加载中…</p>;
  }

  if (error) {
    return <p role="alert">{error.message}</p>;
  }

  if (posts.length === 0) {
    return <p>没有匹配的文章。</p>;
  }

  return (
    <div className="post-grid">
      {posts.map((post) => (
        <PostCard
          key={post.id}
          slug={post.slug}
          title={post.title}
          summary={post.summary}
          tags={post.tags}
          featured={post.featured}
        />
      ))}
    </div>
  );
}
```

小范围二选一使用三元表达式：

```tsx
{isFavorite ? '取消收藏' : '收藏'}
```

当左侧可能是 `0` 时，不要直接使用 `&&`：

```tsx
// count 为 0 时会渲染数字 0。
{count && <Badge count={count} />}

// 明确判断。
{count > 0 ? <Badge count={count} /> : null}
```

### 30.8 列表与 `key`

`key` 帮助 React 识别同一层级中的元素身份：

```tsx
{posts.map((post) => (
  <PostCard key={post.id} {...post} />
))}
```

可靠 key 应满足：

- 在兄弟节点中唯一。
- 在多次渲染之间稳定。
- 来自数据本身。

不要在可排序、可插入、可删除列表中使用数组索引：

```tsx
{posts.map((post, index) => (
  <PostCard key={index} {...post} />
))}
```

排序后，索引会对应到另一条数据，可能让输入状态、焦点或动画留在错误项目上。也不要在渲染时使用 `Math.random()` 生成 key，它会让节点每次都被当成新节点。

### 30.9 事件

传函数，不要调用函数：

```tsx
export function FavoriteButton({
  active,
  onChange,
}: {
  active: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onChange(!active)}
    >
      {active ? '已收藏' : '收藏'}
    </button>
  );
}
```

错误写法：

```tsx
// 渲染时立刻调用。
<button onClick={onChange(true)}>收藏</button>
```

表单优先监听 `onSubmit`，而不是只处理按钮点击，这样按 Enter 和辅助技术触发也能工作。

### 30.10 完整页面

```tsx
const posts: Post[] = [
  {
    id: '1',
    slug: 'react-components',
    title: '理解 React 组件',
    summary: '从函数、Props 和 JSX 建立组件模型。',
    tags: ['React', 'TypeScript'],
    featured: true,
  },
  {
    id: '2',
    slug: 'react-rendering',
    title: '条件与列表渲染',
    summary: '用状态描述不同界面。',
    tags: ['React'],
    featured: false,
  },
];

export function App() {
  return (
    <>
      <SiteHeader />
      <main>
        <h1>最新文章</h1>
        <PostList
          posts={posts}
          loading={false}
          error={null}
        />
      </main>
    </>
  );
}
```

### 30.11 效果验证

1. 启动 `npm run dev`，确认两张文章卡片出现。
2. 删除一条数据，确认 key 不依赖数组索引。
3. 依次传入加载、错误、空数据和正常数据，确认状态互斥。
4. 用键盘聚焦文章链接和收藏按钮，确认交互元素语义正确。
5. 在组件渲染中加入外部变量修改，观察 `StrictMode` 如何更容易暴露问题，再删除该副作用。

---
