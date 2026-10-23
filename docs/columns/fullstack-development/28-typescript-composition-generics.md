---
title: "第 28 章：联合、交叉、泛型与类型收窄"
description: "用联合类型表达状态，用交叉类型组合能力，用泛型保留输入输出关系。"
date: "2026-10-23"
category: TypeScript
tags: [联合类型, 泛型, 类型收窄]
series:
  order: 29
---
## 第 28 章 类型组合与泛型

类型系统的价值不只是描述字段，更重要的是表达“哪些状态允许出现”以及“输入和输出之间有什么关系”。

### 28.1 学习目标

- 使用联合类型限制合法值。
- 用可辨识联合表达互斥的界面状态。
- 使用交叉类型组合独立能力。
- 编写有约束的泛型函数与泛型接口。
- 通过控制流完成类型收窄和穷尽检查。

### 28.2 联合类型

联合类型表示值可以是多个类型中的一个：

```ts
type PostStatus = 'draft' | 'reviewing' | 'published';

function getStatusLabel(status: PostStatus): string {
  switch (status) {
    case 'draft':
      return '草稿';
    case 'reviewing':
      return '审核中';
    case 'published':
      return '已发布';
  }
}
```

字符串字面量联合比任意 `string` 更准确：

```ts
interface Post {
  id: string;
  status: PostStatus;
}

const post: Post = {
  id: 'post-1',
  status: 'published',
};

// post.status = 'done'; // 类型错误
```

### 28.3 可辨识联合

不要用一组互相独立的布尔值表示加载状态：

```ts
// 会允许 isLoading、hasError、hasData 同时为 true。
interface BadState {
  isLoading: boolean;
  hasError: boolean;
  hasData: boolean;
}
```

用固定判别字段表达互斥状态：

```ts
type LoadState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };
```

消费状态时，TypeScript 会自动收窄：

```ts
function renderPostState(state: LoadState<Post>): string {
  switch (state.status) {
    case 'idle':
      return '尚未加载';
    case 'loading':
      return '加载中';
    case 'success':
      return state.data.title;
    case 'error':
      return state.error.message;
  }
}
```

这样无法构造“既成功又失败”的状态。

### 28.4 穷尽检查

当联合新增成员时，让编译器提醒所有遗漏分支：

```ts
function assertNever(value: never): never {
  throw new Error(`未处理的状态：${JSON.stringify(value)}`);
}

function getStatusLabel(status: PostStatus): string {
  switch (status) {
    case 'draft':
      return '草稿';
    case 'reviewing':
      return '审核中';
    case 'published':
      return '已发布';
    default:
      return assertNever(status);
  }
}
```

如果给 `PostStatus` 增加 `'archived'`，`assertNever(status)` 会报类型错误，指出分支不完整。

### 28.5 交叉类型

交叉类型要求同时满足多个类型：

```ts
interface Timestamped {
  createdAt: string;
  updatedAt: string;
}

interface Identifiable {
  id: string;
}

type StoredPost = Post & Timestamped & Identifiable;
```

适合组合正交能力：

```ts
type SearchResult<T> = {
  item: T;
  score: number;
};

type Highlighted = {
  highlights: string[];
};

type HighlightedPostResult = SearchResult<Post> & Highlighted;
```

不要交叉冲突属性：

```ts
type Left = { id: string };
type Right = { id: number };
type Impossible = Left & Right;

// Impossible 的 id 变为 never，基本无法构造。
```

### 28.6 泛型保存类型关系

没有泛型时，函数可能丢失具体类型：

```ts
function firstUnsafe(items: unknown[]): unknown {
  return items[0];
}
```

泛型把输入元素类型传递到输出：

```ts
function first<T>(items: readonly T[]): T | undefined {
  return items[0];
}

const firstTag = first(['TypeScript', 'React']);
// string | undefined
```

`T` 不是“任意值”，而是调用时确定的一种具体类型。

多个类型参数：

```ts
function createEntry<Key, Value>(
  key: Key,
  value: Value,
): [Key, Value] {
  return [key, value];
}

const entry = createEntry('views', 1200);
// [string, number]
```

### 28.7 泛型约束

函数需要访问特定字段时添加约束：

```ts
interface HasId {
  id: string;
}

function indexById<T extends HasId>(
  items: readonly T[],
): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}
```

返回类型保留了完整的 `T`，不会只剩下 `HasId`。

`keyof` 表示对象键的联合：

```ts
function getProperty<ObjectType, Key extends keyof ObjectType>(
  object: ObjectType,
  key: Key,
): ObjectType[Key] {
  return object[key];
}

const title = getProperty(post, 'title');
// 根据 Post.title 推断具体类型
```

如果传入不存在的键，编译器会报错。

### 28.8 泛型接口与 API 响应

```ts
interface PageInfo {
  page: number;
  pageSize: number;
  total: number;
}

interface PaginatedResponse<T> {
  items: T[];
  pageInfo: PageInfo;
}

async function loadPage<T>(
  url: string,
  parseItem: (value: unknown) => T,
): Promise<PaginatedResponse<T>> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload: unknown = await response.json();

  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('items' in payload) ||
    !Array.isArray(payload.items) ||
    !('pageInfo' in payload)
  ) {
    throw new TypeError('分页响应格式错误');
  }

  const pageInfo = payload.pageInfo;
  if (
    typeof pageInfo !== 'object' ||
    pageInfo === null ||
    !('page' in pageInfo) || typeof pageInfo.page !== 'number' ||
    !('pageSize' in pageInfo) || typeof pageInfo.pageSize !== 'number' ||
    !('total' in pageInfo) || typeof pageInfo.total !== 'number' ||
    !Number.isInteger(pageInfo.page) || pageInfo.page < 1 ||
    !Number.isInteger(pageInfo.pageSize) || pageInfo.pageSize < 1 ||
    !Number.isInteger(pageInfo.total) || pageInfo.total < 0
  ) {
    throw new TypeError('分页元数据格式错误');
  }

  return {
    items: payload.items.map(parseItem),
    pageInfo: {
      page: pageInfo.page,
      pageSize: pageInfo.pageSize,
      total: pageInfo.total,
    },
  };
}
```

泛型不能验证运行时数据。示例中的 `parseItem` 才负责把 `unknown` 验证为 `T`；第 33 章会用 Zod 简化这部分代码。

### 28.9 类型收窄

`typeof`：

```ts
function normalizeId(id: string | number): string {
  if (typeof id === 'number') {
    return String(id);
  }

  return id.trim();
}
```

真值检查：

```ts
function printSummary(summary: string | null | undefined): void {
  if (!summary) {
    console.log('暂无摘要');
    return;
  }

  console.log(summary.toUpperCase());
}
```

注意：真值检查会同时排除空字符串。如果空字符串有业务含义，应明确检查 `summary == null`。

`instanceof`：

```ts
function formatError(error: Error | DOMException): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return '请求已取消';
  }

  return error.message;
}
```

`in` 操作符：

```ts
type SearchEvent =
  | { type: 'query'; keyword: string }
  | { type: 'tag'; tag: string };

function describeSearch(event: SearchEvent): string {
  if ('keyword' in event) {
    return `搜索：${event.keyword}`;
  }

  return `标签：${event.tag}`;
}
```

对可辨识联合，优先检查统一的 `type` 或 `status` 字段，可读性更高。

### 28.10 实战：类型安全的请求状态

```ts
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T; receivedAt: number }
  | { status: 'error'; error: Error };

async function execute<T>(
  task: () => Promise<T>,
  onChange: (state: AsyncState<T>) => void,
): Promise<void> {
  onChange({ status: 'loading' });

  try {
    const data = await task();
    onChange({
      status: 'success',
      data,
      receivedAt: Date.now(),
    });
  } catch (error) {
    onChange({
      status: 'error',
      error: error instanceof Error ? error : new Error(String(error)),
    });
  }
}
```

使用：

```ts
await execute(
  () => loadPosts(),
  (state) => {
    if (state.status === 'success') {
      console.log(state.data.length);
    }
  },
);
```

### 28.11 效果验证

1. 给 `PostStatus` 新增 `'archived'`，确认穷尽检查报错。
2. 为新建对象标注 `LoadState<Post>` 后同时写成功数据和错误，观察对象字面量检查；注意 TypeScript 是结构类型系统，不能据此宣称运行时绝不出现多余字段。
3. 把 `first()` 分别用于字符串数组和文章数组，观察返回类型随输入变化。
4. 给 `indexById()` 传入没有 `id` 的对象数组，确认泛型约束生效。
5. 在 `execute()` 的不同状态分支访问不存在字段，确认收窄能阻止错误。

### 28.12 官方参考

- [TypeScript：收窄](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)。
- [TypeScript：泛型](https://www.typescriptlang.org/docs/handbook/2/generics.html)。
- [TypeScript：对象类型与多余属性检查](https://www.typescriptlang.org/docs/handbook/2/objects.html#excess-property-checks)。

---
