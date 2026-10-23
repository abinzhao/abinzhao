---
title: "第 32 章：React 19 的 use、动作与乐观更新"
description: "掌握 use()、表单动作、useActionState、useOptimistic 与 useFormStatus。"
date: "2026-10-23"
category: React
tags: [React 19, 动作, Suspense]
series:
  order: 33
---
## 第 32 章 React 19 新能力

React 19 把异步操作更深地集成进渲染和表单：`use()` 可以读取 Promise 或 Context，Action 可以管理异步提交，`useOptimistic` 让界面先响应，`useFormStatus` 则读取表单提交状态。

### 32.1 学习目标

- 理解 `use()` 读取 Promise 时如何与 Suspense 协作。
- 知道 `use()` 与普通 Hook 的规则差异。
- 用函数形式的 `form action` 提交表单。
- 用 `useActionState` 管理提交结果和 pending 状态。
- 用 `useOptimistic` 实现可回滚的即时反馈。
- 在表单子组件中用 `useFormStatus` 展示提交状态。

### 32.2 `use()` 读取上下文

React 19 的 `use()` 可以读取 Context，而且允许写在条件分支中：

```tsx
import { createContext, use } from 'react';

type Theme = 'light' | 'dark';
const ThemeContext = createContext<Theme>('light');

function PostPreview({ showTheme }: { showTheme: boolean }) {
  if (showTheme) {
    const theme = use(ThemeContext);
    return <p>当前主题：{theme}</p>;
  }

  return <p>文章预览</p>;
}
```

普通 Hooks 不能放在条件中，`use()` 是例外。但它仍然只能在组件或自定义 Hook 中调用，不能放进 `try/catch`。

读取 Context 时，`useContext(ThemeContext)` 仍然清晰且常用；当读取操作确实需要条件化时，`use()` 更有价值。

### 32.3 `use()` 读取 Promise

`use(promise)` 在 Promise 未完成时暂停当前组件，由最近的 Suspense 展示 fallback；失败时由错误边界处理。

```tsx
import { Component, Suspense, use, type ReactNode } from 'react';

class PostErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed
      ? <p role="alert">文章加载失败，请刷新重试。</p>
      : this.props.children;
  }
}

interface Post {
  id: string;
  title: string;
  content: string;
}

async function fetchPost(slug: string): Promise<Post> {
  const response = await fetch(`/api/posts/${slug}`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

const postPromise = fetchPost('react-19-actions');

function PostContent({
  promise,
}: {
  promise: Promise<Post>;
}) {
  const post = use(promise);

  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.content}</p>
    </article>
  );
}

export function PostPage() {
  return (
    <PostErrorBoundary>
      <Suspense fallback={<p role="status">文章加载中…</p>}>
        <PostContent promise={postPromise} />
      </Suspense>
    </PostErrorBoundary>
  );
}
```

不要在组件渲染中每次创建新 Promise：

```tsx
function BadPostPage({ slug }: { slug: string }) {
  // 每次渲染都会创建新 Promise，可能反复暂停。
  const post = use(fetchPost(slug));
  return <h1>{post.title}</h1>;
}
```

Promise 应来自支持 Suspense 的框架、路由加载器或稳定缓存。一个最小缓存示例：

```ts
const postPromises = new Map<string, Promise<Post>>();

export function getPostPromise(slug: string): Promise<Post> {
  const cached = postPromises.get(slug);

  if (cached) {
    return cached;
  }

  const promise = fetchPost(slug);
  postPromises.set(slug, promise);
  return promise;
}
```

缓存还要考虑失效、错误重试和内存上限。真实项目优先使用路由或数据请求库提供的方案，不要随意创建永久全局缓存。

### 32.4 表单动作

在 React 19 中，异步更新函数可以作为 Action 使用。表单的 `action` 属性可以直接接收函数：

```tsx
async function createNewsletterSubscription(
  formData: FormData,
): Promise<void> {
  const email = String(formData.get('email') ?? '');

  const response = await fetch('/api/subscriptions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    throw new Error('订阅失败');
  }
}

export function NewsletterForm() {
  return (
    <form action={createNewsletterSubscription}>
      <label>
        邮箱
        <input name="email" type="email" required />
      </label>
      <button type="submit">订阅</button>
    </form>
  );
}
```

Action 运行期间，React 可以提供 pending 状态、错误结果和乐观更新。表单函数收到 `FormData`，因此输入必须有 `name`。

客户端 `action` 仍是浏览器函数，不会自动成为服务器函数。`'use server'` 依赖支持该能力的框架，普通 Vite SPA 不提供这条通道；这里由 Fetch 调用明确的 HTTP API。未捕获错误应由实际挂载的错误边界处理，失败保留输入的需求应使用受控字段。

客户端校验用于即时反馈，服务端或 API 仍必须再次验证。

### 32.5 `useActionState`

`useActionState` 把 Action 的返回值保存为状态：

```tsx
import { useActionState } from 'react';

interface FormState {
  status: 'idle' | 'success' | 'error';
  message: string;
}

const initialState: FormState = {
  status: 'idle',
  message: '',
};

async function subscribe(
  previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get('email') ?? '').trim();

  if (!email.includes('@')) {
    return {
      status: 'error',
      message: '请输入有效邮箱',
    };
  }

  try {
    const response = await fetch('/api/subscriptions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return {
      status: 'success',
      message: '订阅成功',
    };
  } catch {
    return {
      status: 'error',
      message: '暂时无法订阅，请稍后重试',
    };
  }
}

export function NewsletterForm() {
  const [state, formAction, isPending] = useActionState(
    subscribe,
    initialState,
  );

  return (
    <form action={formAction}>
      <label>
        邮箱
        <input
          name="email"
          type="email"
          required
          disabled={isPending}
        />
      </label>
      <button type="submit" disabled={isPending}>
        {isPending ? '提交中…' : '订阅'}
      </button>
      <p
        role={state.status === 'error' ? 'alert' : 'status'}
        aria-live="polite"
      >
        {state.message}
      </p>
    </form>
  );
}
```

Action 返回“可展示状态”，不可恢复的程序错误仍应抛给错误边界或监控系统。

### 32.6 `useFormStatus`

深层提交按钮可以读取所属父表单的状态，无需层层传 Props：

```tsx
import { useFormStatus } from 'react-dom';

function SubmitButton() {
  const { pending, data, method, action } = useFormStatus();

  return (
    <button type="submit" disabled={pending}>
      {pending ? '发布中…' : '发布评论'}
    </button>
  );
}
```

必须把它渲染在 `<form>` 内部：

```tsx
function CommentForm({
  action,
}: {
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action}>
      <label>
        评论
        <textarea name="content" required />
      </label>
      <SubmitButton />
    </form>
  );
}
```

在渲染表单的同一个组件顶部调用 `useFormStatus()`，无法读取该组件返回的表单状态，因为 Hook 需要位于表单的后代组件中。

### 32.7 `useOptimistic`

评论提交前先显示临时评论，成功后由真实数据替换；失败时 React 会恢复基准状态：

```tsx
import { startTransition, useOptimistic, useState } from 'react';

interface Comment {
  id: string;
  author: string;
  content: string;
  pending?: boolean;
}

interface CommentListProps {
  comments: readonly Comment[];
  createComment: (
    content: string,
  ) => Promise<Comment>;
  onCreated: (comment: Comment) => void;
}

export function CommentList({
  comments,
  createComment,
  onCreated,
}: CommentListProps) {
  const [message, setMessage] = useState('');
  const [optimisticComments, addOptimisticComment] = useOptimistic(
    comments,
    (currentComments, optimisticComment: Comment) => [
      ...currentComments,
      optimisticComment,
    ],
  );

  async function createCommentAction(formData: FormData) {
    const content = String(formData.get('content') ?? '').trim();

    if (!content) {
      return;
    }

    setMessage('');
    addOptimisticComment({
      id: `temp-${crypto.randomUUID()}`,
      author: '我',
      content,
      pending: true,
    });

    try {
      const savedComment = await createComment(content);
      startTransition(() => onCreated(savedComment));
    } catch {
      setMessage('评论发送失败，请重试');
    }
  }

  return (
    <section>
      <ul aria-live="polite">
        {optimisticComments.map((comment) => (
          <li
            key={comment.id}
            aria-label={comment.pending ? '正在发送的评论' : undefined}
          >
            <strong>{comment.author}</strong>
            <p>{comment.content}</p>
            {comment.pending ? <small>发送中…</small> : null}
          </li>
        ))}
      </ul>

      <form action={createCommentAction}>
        <label>
          评论
          <textarea name="content" required />
        </label>
        <SubmitButton />
      </form>
      <p role="alert">{message}</p>
    </section>
  );
}
```

乐观更新适合高成功率、失败可回滚的操作，例如点赞、收藏、评论。支付、权限变更等高风险操作不应伪装成已成功。

失败时 Action 结束，临时项回到基准 `comments`，错误消息提供明确反馈。`onCreated` 必须更新真实数据源，不能只是打印日志；否则成功后临时项仍会消失。`await` 后更新基准状态时显式包在 `startTransition` 中，不能假定所有异步后续都自动保留 Transition 上下文。此简例的非受控 textarea 在 Action 正常返回后可能被重置；需要失败保留内容时改为受控输入。

### 32.8 组合关系

```text
<form action={action}>
  ├─ useActionState：保存 Action 返回结果
  ├─ useFormStatus：后代读取 pending
  └─ useOptimistic：提交期间展示临时结果

<Suspense fallback={...}>
  └─ use(promise)：读取异步资源
```

这些 API 解决不同层次的问题，不需要在每个表单中全部使用。

### 32.9 效果验证

1. 给 Promise 请求加两秒延迟，确认 Suspense fallback 出现。
2. 让 Promise reject，确认错误交给错误边界，而不是 `try/catch` 包围 `use()`。
3. 连续提交订阅表单，确认 pending 时控件禁用。
4. 把 `SubmitButton` 移到 `<form>` 外，观察 `useFormStatus` 无法得到目标表单状态，再移回。
5. 给评论接口模拟失败，确认临时评论回滚且出现可重试提示。
6. 检查所有输入都有 `name`，否则 `FormData` 无法读取。

### 32.10 选择建议

- 普通本地状态更新继续使用 `useState` 或 `useReducer`。
- 表单异步提交优先考虑 Action 与 `useActionState`。
- 需要深层提交按钮状态时使用 `useFormStatus`。
- 高成功率、可回滚操作使用 `useOptimistic`。
- 只有数据层提供稳定 Promise 与缓存策略时，才在客户端用 `use()` 读取异步资源。

### 32.11 官方参考

- [React：use](https://react.dev/reference/react/use)。
- [React：useActionState](https://react.dev/reference/react/useActionState)。
- [React：useOptimistic](https://react.dev/reference/react/useOptimistic)。
- [React：useFormStatus](https://react.dev/reference/react-dom/hooks/useFormStatus)。
- [React：startTransition 的异步边界](https://react.dev/reference/react/startTransition)。

---
