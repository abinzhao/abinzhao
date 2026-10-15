---
title: "第 27 章：TypeScript 基础类型、接口与类型别名"
description: "配置严格模式，掌握类型推断、基础类型、函数、对象、interface 与 type。"
date: "2026-10-15"
category: TypeScript
tags: [TypeScript, Interface, Type Alias]
series:
  order: 28
---
## 第 27 章 TypeScript 基础

TypeScript 在 JavaScript 运行前检查类型错误，编译后仍然是 JavaScript。它不会自动验证网络响应，也不会改变浏览器运行规则。

### 27.1 学习目标

- 建立启用严格模式的 TypeScript 项目。
- 理解类型推断和显式类型标注的使用时机。
- 为数组、对象、函数和异步返回值建模。
- 正确选择 `interface` 与 `type`。
- 避免用 `any` 关闭类型检查。

### 27.2 最小项目

```bash
mkdir typescript-basics
cd typescript-basics
npm init -y
npm install -D typescript
npx tsc --init
```

教学项目的关键配置：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

检查类型：

```bash
npx tsc
```

- `strict` 开启一组严格检查。
- `noUncheckedIndexedAccess` 让数组和字典索引结果包含 `undefined`。
- `exactOptionalPropertyTypes` 区分“属性不存在”和“属性存在但值为 `undefined`”。
- `noEmit` 表示这里只做类型检查，实际构建交给 Vite 等工具。

### 27.3 类型推断

能从右侧明确推断时，不必重复标注：

```ts
const siteName = '前端手记'; // string
let page = 1;                // number
const published = true;     // true
```

函数参数通常需要标注，返回类型可以推断：

```ts
function formatReadingTime(minutes: number) {
  return `${minutes} 分钟阅读`;
}
```

公共函数建议显式写返回类型，避免内部改动意外改变对外契约：

```ts
export function formatReadingTime(minutes: number): string {
  return `${minutes} 分钟阅读`;
}
```

### 27.4 基础类型

```ts
const title: string = 'TypeScript 基础';
const views: number = 1200;
const featured: boolean = false;
const createdAt: Date = new Date();
const tags: string[] = ['TypeScript', 'Frontend'];
const scores: Array<number> = [95, 88, 91];
```

元组表示固定位置和长度：

```ts
const position: [latitude: number, longitude: number] = [
  39.9042,
  116.4074,
];
```

对象：

```ts
const post: {
  slug: string;
  title: string;
  summary?: string;
} = {
  slug: 'typescript-basics',
  title: 'TypeScript 基础',
};
```

`?` 表示属性可以不存在。读取时必须处理 `undefined`：

```ts
const summary = post.summary ?? '暂无摘要';
```

### 27.5 函数类型

```ts
function calculateReadingMinutes(
  wordCount: number,
  wordsPerMinute = 300,
): number {
  return Math.max(1, Math.ceil(wordCount / wordsPerMinute));
}
```

函数表达式类型：

```ts
type PostFilter = (post: Post) => boolean;

const isPublished: PostFilter = (post) => post.status === 'published';
```

无返回值使用 `void`：

```ts
function logPost(post: Post): void {
  console.log(post.title);
}
```

永远不会正常返回使用 `never`：

```ts
function fail(message: string): never {
  throw new Error(message);
}
```

异步函数的返回类型是 `Promise<T>`：

```ts
async function loadPost(slug: string): Promise<Post> {
  const response = await fetch(`/api/posts/${encodeURIComponent(slug)}`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json() as Promise<Post>;
}
```

最后一行只是告诉编译器预期类型，不会验证服务端数据。第 33 章会用 Zod 做运行时校验。

### 27.6 `interface`

接口适合描述对象形状：

```ts
interface Author {
  id: string;
  name: string;
  avatarUrl?: string;
}

interface Post {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  tags: string[];
  status: 'draft' | 'published';
  author: Author;
  publishedAt: string | null;
}
```

只读属性表达“不应被直接修改”的意图：

```ts
interface PostSummary {
  readonly id: string;
  readonly slug: string;
  title: string;
}
```

接口可以继承：

```ts
interface AuditedEntity {
  createdAt: string;
  updatedAt: string;
}

interface StoredPost extends Post, AuditedEntity {
  revision: number;
}
```

### 27.7 类型别名

`type` 可以为任意类型命名：

```ts
type PostStatus = 'draft' | 'published';
type PostId = string;
type Nullable<T> = T | null;
type Coordinate = [latitude: number, longitude: number];
```

对象也可以使用类型别名：

```ts
type SearchOptions = {
  keyword: string;
  tags: string[];
  page: number;
};
```

常用选择：

- 可扩展的对象契约：优先 `interface`。
- 联合、交叉、元组、函数、工具类型组合：使用 `type`。
- 团队已有明确约定时，保持一致比争论语法更重要。

接口支持声明合并：

```ts
interface Window {
  blogVersion: string;
}

interface Window {
  analyticsEnabled: boolean;
}

window.blogVersion = '2.0.0';
window.analyticsEnabled = true;
```

业务模型一般不依赖声明合并，避免不同文件无意中改变同名接口。

### 27.8 `unknown` 代替 `any`

`any` 会让后续操作全部失去检查：

```ts
function unsafeParse(value: string): any {
  return JSON.parse(value);
}

const data = unsafeParse('{}');
data.not.exists().still.compiles();
```

外部数据先视为 `unknown`：

```ts
function parseJson(value: string): unknown {
  return JSON.parse(value);
}

const data = parseJson('{"title":"TS"}');

if (
  typeof data === 'object' &&
  data !== null &&
  'title' in data &&
  typeof data.title === 'string'
) {
  console.log(data.title);
}
```

`unknown` 强迫调用方先证明类型，再使用数据。

### 27.9 完整练习：文章摘要

```ts
interface Post {
  id: string;
  title: string;
  content: string;
  tags: string[];
  publishedAt: string | null;
}

interface PostPreview {
  id: string;
  title: string;
  excerpt: string;
  tagCount: number;
  published: boolean;
}

function createPostPreview(post: Post): PostPreview {
  const normalizedContent = post.content.trim();
  const excerpt =
    normalizedContent.length > 120
      ? `${normalizedContent.slice(0, 120)}…`
      : normalizedContent;

  return {
    id: post.id,
    title: post.title,
    excerpt,
    tagCount: post.tags.length,
    published: post.publishedAt !== null,
  };
}
```

### 27.10 效果验证

1. 运行 `npx tsc`，确认严格配置无错误。
2. 把 `publishedAt` 改为 `undefined`，观察 `exactOptionalPropertyTypes` 相关提示。
3. 读取 `tags[0].toUpperCase()`，观察 `noUncheckedIndexedAccess` 要求先处理 `undefined`。
4. 把外部 JSON 返回值从 `unknown` 改为 `any`，比较编辑器能否发现错误属性。
5. 删除 `createPostPreview()` 的一个返回字段，确认返回类型及时报错。

---
