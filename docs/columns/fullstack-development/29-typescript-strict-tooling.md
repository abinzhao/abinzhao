---
title: "第 29 章：工具类型、类型守卫与严格模式"
description: "使用工具类型派生模型，控制类型断言，并在严格模式下验证未知数据。"
date: "2026-10-23"
category: TypeScript
tags: [工具类型, 类型守卫, 严格模式]
series:
  order: 30
---
## 第 29 章 严格 TypeScript

可靠的 TypeScript 代码不是标注越多越好，而是让类型来源清楚、非法状态难以表示、外部数据必须经过验证。

### 29.1 学习目标

- 使用内建工具类型从主模型派生新类型。
- 区分类型注解、类型断言和 `satisfies`。
- 编写类型谓词和断言函数。
- 理解严格模式中的关键检查。
- 建立从 `unknown` 到可信业务类型的边界。

### 29.2 常用工具类型

基础模型：

```ts
interface Post {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  tags: string[];
  status: 'draft' | 'published';
  publishedAt: string | null;
}
```

`Pick` 选取字段：

```ts
type PostCardData = Pick<
  Post,
  'id' | 'slug' | 'title' | 'summary' | 'tags'
>;
```

`Omit` 排除字段：

```ts
type CreatePostInput = Omit<Post, 'id' | 'publishedAt'>;
```

`Partial` 把所有字段变为可选，适合更新补丁：

```ts
type UpdatePostInput = Partial<
  Pick<Post, 'title' | 'summary' | 'content' | 'tags'>
>;
```

不要把整个业务模型随意 `Partial<Post>`，否则 `id`、`status` 等不应修改的字段也会进入更新输入。

`Required` 把可选字段变为必填：

```ts
interface DraftOptions {
  autosave?: boolean;
  interval?: number;
}

type ResolvedDraftOptions = Required<DraftOptions>;
```

`Readonly` 表达只读快照：

```ts
type PostSnapshot = Readonly<Post>;
```

这是编译期约束，不会在运行时冻结对象。嵌套数组也不是深度只读：

```ts
const snapshot: PostSnapshot = post;
snapshot.tags.push('new'); // 仍然允许，因为 tags 自身是 string[]
```

可以在模型中使用只读数组：

```ts
interface SafePost {
  readonly id: string;
  readonly tags: readonly string[];
}
```

`Record` 创建键值映射：

```ts
type PostStatus = Post['status'];

const statusLabels: Record<PostStatus, string> = {
  draft: '草稿',
  published: '已发布',
};
```

新增状态时，映射会立即提示缺少字段。

函数相关工具类型：

```ts
function createPostCard(post: Post) {
  return {
    id: post.id,
    title: post.title,
    href: `/posts/${post.slug}`,
  };
}

type PostCard = ReturnType<typeof createPostCard>;
type CreatePostCardParameters = Parameters<typeof createPostCard>;
```

异步值：

```ts
type LoadedPosts = Awaited<ReturnType<typeof loadPosts>>;
```

### 29.3 注解、断言与 `satisfies`

类型注解会按声明类型检查变量：

```ts
const labels: Record<PostStatus, string> = {
  draft: '草稿',
  published: '已发布',
};
```

类型断言表示“相信我，这个值是某类型”：

```ts
const element = document.querySelector('#search') as HTMLInputElement;
```

如果节点不存在，断言不会让它出现：

```ts
element.value; // 运行时可能因 element 是 null 而报错
```

更稳妥的写法：

```ts
const element = document.querySelector('#search');

if (!(element instanceof HTMLInputElement)) {
  throw new Error('缺少搜索输入框');
}

element.value = '';
```

`satisfies` 检查值满足某类型，同时保留更具体的推断：

```ts
const routes = {
  home: '/',
  posts: '/posts',
  about: '/about',
} satisfies Record<string, `/${string}`>;

routes.posts; // 类型仍是 "/posts"
```

配合 `as const` 保留只读字面量：

```ts
const POST_STATUSES = [
  'draft',
  'published',
] as const;

type PostStatus = (typeof POST_STATUSES)[number];
```

优先级建议：

1. 先依赖推断。
2. 对公共契约使用类型注解。
3. 对配置对象使用 `satisfies`。
4. 只有掌握额外运行时事实时才使用断言。

不要通过双重断言强行绕过检查：

```ts
// 这通常意味着模型或数据边界有问题。
const post = payload as unknown as Post;
```

### 29.4 自定义类型守卫

类型谓词返回 `value is Type`：

```ts
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPostStatus(value: unknown): value is PostStatus {
  return value === 'draft' || value === 'published';
}

function isPost(value: unknown): value is Post {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.slug === 'string' &&
    typeof value.title === 'string' &&
    typeof value.summary === 'string' &&
    typeof value.content === 'string' &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === 'string') &&
    isPostStatus(value.status) &&
    (typeof value.publishedAt === 'string' ||
      value.publishedAt === null)
  );
}
```

使用：

```ts
const payload: unknown = await response.json();

if (!isPost(payload)) {
  throw new TypeError('文章响应格式错误');
}

console.log(payload.title); // 已收窄为 Post
```

类型守卫必须真的完成检查。下面的守卫会欺骗编译器：

```ts
function isPostWrong(value: unknown): value is Post {
  return true;
}
```

对象结构复杂或需要错误详情时，使用 Zod 等 schema 库比手写守卫更可靠。

### 29.5 断言函数

断言函数失败时抛错，成功后收窄调用方变量：

```ts
function assertPost(value: unknown): asserts value is Post {
  if (!isPost(value)) {
    throw new TypeError('文章响应格式错误');
  }
}

const payload: unknown = await response.json();
assertPost(payload);

console.log(payload.title);
```

DOM 初始化也适合断言函数：

```ts
function assertElement<T extends Element>(
  value: Element | null,
  constructor: new (...args: never[]) => T,
  message: string,
): asserts value is T {
  if (!(value instanceof constructor)) {
    throw new Error(message);
  }
}

const searchInput = document.querySelector('#search');
assertElement(
  searchInput,
  HTMLInputElement,
  '缺少 #search 输入框',
);

searchInput.focus();
```

### 29.6 严格模式关键检查

推荐起点：

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "useUnknownInCatchVariables": true
  }
}
```

`strictNullChecks` 由 `strict` 开启：

```ts
const post = posts.find((item) => item.slug === slug);
// Post | undefined

if (!post) {
  throw new Error('文章不存在');
}
```

`noUncheckedIndexedAccess`：

```ts
const firstTag = post.tags[0];
// string | undefined

if (firstTag) {
  console.log(firstTag.toUpperCase());
}
```

`exactOptionalPropertyTypes`：

```ts
interface SearchOptions {
  keyword?: string;
}

const options: SearchOptions = {};
// options.keyword = undefined; // 在严格配置下不等于“删除属性”
```

`useUnknownInCatchVariables`：

```ts
try {
  await savePost(post);
} catch (error) {
  const message =
    error instanceof Error ? error.message : String(error);

  showError(message);
}
```

### 29.7 外部数据边界

类型检查只发生在开发和构建阶段：

```ts
const response = await fetch('/api/posts');
const payload = await response.json();
```

`response.json()` 的真实内容由服务端决定。即使写成 `Post[]`，运行时也可能收到错误页面、字段缺失或旧版本结构。

可靠流程：

```text
网络 / localStorage / URL / postMessage
             ↓
           unknown
             ↓ 运行时校验
         可信业务类型
             ↓
         应用内部使用
```

简单结构可以手写守卫，复杂结构在第 33 章使用 Zod：

```ts
async function loadPosts(): Promise<Post[]> {
  const response = await fetch('/api/posts');

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload: unknown = await response.json();

  if (!Array.isArray(payload) || !payload.every(isPost)) {
    throw new TypeError('文章列表格式错误');
  }

  return payload;
}
```

### 29.8 效果验证

1. 从 `PostStatus` 新增一个状态，确认 `Record<PostStatus, string>` 提示补齐。
2. 把可能为 `null` 的 DOM 节点直接断言，再删除对应 HTML，观察运行时问题。
3. 改为断言函数，确认页面在初始化阶段给出明确错误。
4. 向模拟 API 数据删除 `title`，确认 `isPost()` 拒绝该响应。
5. 开启所有严格配置，逐个修复错误，不使用 `any` 或双重断言跳过。

### 29.9 本阶段检查清单

- [ ] 新项目启用 `strict`。
- [ ] 外部输入先视为 `unknown`。
- [ ] 类型断言旁有可说明的运行时事实。
- [ ] 状态使用可辨识联合，而不是互相冲突的布尔值。
- [ ] 工具类型从唯一主模型派生，避免复制字段。
- [ ] `switch` 对联合类型有穷尽检查。
- [ ] 数组索引和查询结果处理了 `undefined`。
- [ ] 类型错误没有通过 `any`、`@ts-ignore` 或双重断言掩盖。

### 29.10 官方参考

- [TypeScript：工具类型](https://www.typescriptlang.org/docs/handbook/utility-types.html)。
- [TypeScript：类型谓词与断言函数](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates)。
- [TSConfig：exactOptionalPropertyTypes](https://www.typescriptlang.org/tsconfig/exactOptionalPropertyTypes.html)。

---
