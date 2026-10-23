---
title: "第 35 章：博客 v2 状态管理与表单校验"
description: "为博客加入收藏、搜索筛选和文章反馈表单，并用 Zustand 与 Zod 管理边界。"
date: "2026-10-23"
category: 项目实战
tags: [Zustand, Zod, 表单, 状态管理]
series:
  order: 36
---
## 第 35 章 组件拆分、状态与表单

这一章加入三类状态：组件内部的搜索条件、跨页面共享的收藏、需要运行时校验的反馈表单。不同状态使用不同工具，不把所有数据都塞进全局 store。

### 35.1 完成标准

- 首页可以按关键词和标签筛选。
- 列表页和详情页共享收藏状态。
- 收藏在刷新后保留。
- 反馈表单显示字段级错误、提交状态和成功反馈。
- 表单数据写入本地演示存储，整个静态项目可独立运行。
- 组件只订阅和渲染自己需要的状态。

### 35.2 状态归属

| 状态 | 归属 | 原因 |
|---|---|---|
| 搜索关键词 | `HomePage` 的 `useState` | 只影响当前页面 |
| 标签筛选 | `HomePage` 的 `useState` | 只影响当前页面 |
| 筛选后的文章 | 渲染时计算 | 可以从文章和筛选条件推导 |
| 收藏 slug | Zustand + persist | 列表、详情、导航共享，并需持久化 |
| 表单输入 | `FeedbackForm` 的 `useState` | 只属于当前表单 |
| 字段错误与提交结果 | `useActionState` | 来自异步提交 Action |

判断顺序：

1. 能否从现有数据计算？能就不要新增状态。
2. 是否只在一个组件子树中使用？是就放在最近公共父组件。
3. 是否跨无关页面共享？是再考虑 Zustand。
4. 是否来自服务端？交给路由数据层，不要复制到客户端 store。

### 35.3 收藏 Store

```ts
// src/features/favorites/favorite-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { z } from 'zod';

interface FavoriteState {
  favoriteSlugs: string[];
  toggleFavorite: (slug: string) => void;
  clearFavorites: () => void;
}

export const useFavoriteStore = create<FavoriteState>()(
  persist(
    (set) => ({
      favoriteSlugs: [],

      toggleFavorite(slug) {
        set((state) => {
          const isFavorite =
            state.favoriteSlugs.includes(slug);

          return {
            favoriteSlugs: isFavorite
              ? state.favoriteSlugs.filter(
                  (item) => item !== slug,
                )
              : [...state.favoriteSlugs, slug],
          };
        });
      },

      clearFavorites() {
        set({ favoriteSlugs: [] });
      },
    }),
    {
      name: 'blog:favorites:v1',
      version: 1,
      partialize: (state) => ({ favoriteSlugs: state.favoriteSlugs }),
      merge: (persisted, current) => {
        const result = z.object({
          favoriteSlugs: z.array(z.string().min(1)).max(1000),
        }).safeParse(persisted);
        return {
          ...current,
          favoriteSlugs: result.success ? [...new Set(result.data.favoriteSlugs)] : [],
        };
      },
    },
  ),
);
```

只存 slug，不复制整篇文章。文章内容由数据源负责，收藏只表达用户选择。

### 35.4 收藏按钮

```tsx
// src/features/favorites/FavoriteButton.tsx
import { useFavoriteStore } from './favorite-store';

export function FavoriteButton({
  slug,
}: {
  slug: string;
}) {
  const active = useFavoriteStore((state) =>
    state.favoriteSlugs.includes(slug),
  );
  const toggleFavorite = useFavoriteStore(
    (state) => state.toggleFavorite,
  );

  return (
    <button
      type="button"
      className="favorite-button"
      aria-pressed={active}
      onClick={() => toggleFavorite(slug)}
    >
      {active ? '已收藏' : '收藏'}
    </button>
  );
}
```

组件订阅的是一个布尔值和一个稳定 action。收藏其他文章时，如果当前文章的 `active` 没变化，这个组件无需因整份数组引用变化而更新界面。

把它加入文章卡片：

```tsx
// src/features/posts/PostCard.tsx
import { Link } from 'react-router';
import { FavoriteButton } from '../favorites/FavoriteButton';
import type { Post } from './post-schema';

export function PostCard({ post }: { post: Post }) {
  return (
    <article className="post-card">
      <div className="post-card__actions">
        {post.featured ? (
          <span className="post-card__badge">精选</span>
        ) : null}
        <FavoriteButton slug={post.slug} />
      </div>

      <h2 className="post-card__title">
        <Link to={`/posts/${post.slug}`}>
          {post.title}
        </Link>
      </h2>

      <p>{post.summary}</p>

      <ul className="tag-list" aria-label="文章标签">
        {post.tags.map((tag) => (
          <li key={tag}>{tag}</li>
        ))}
      </ul>
    </article>
  );
}
```

不要把整个卡片变成按钮。标题保持真实链接，收藏是独立按钮，键盘和辅助技术才能理解两个操作。

### 35.5 首页筛选

替换 `HomePage`：

```tsx
// src/pages/HomePage.tsx
import { useState } from 'react';
import {
  useLoaderData,
  type LoaderFunctionArgs,
} from 'react-router';
import { PostList } from '../features/posts/PostList';
import { getPosts } from '../features/posts/post-repository';
import { postsSchema } from '../features/posts/post-schema';

export function homeLoader({ request }: LoaderFunctionArgs) {
  return getPosts(request.signal);
}

export function HomePage() {
  const posts = postsSchema.parse(useLoaderData());
  const [keyword, setKeyword] = useState('');
  const [selectedTag, setSelectedTag] =
    useState<string | null>(null);

  const normalizedKeyword = keyword.trim().toLowerCase();
  const tags = [
    ...new Set(posts.flatMap((post) => post.tags)),
  ].toSorted((left, right) => left.localeCompare(right));

  const visiblePosts = posts.filter((post) => {
    const matchesKeyword =
      normalizedKeyword === '' ||
      post.title.toLowerCase().includes(normalizedKeyword) ||
      post.summary.toLowerCase().includes(normalizedKeyword);
    const matchesTag =
      selectedTag === null ||
      post.tags.includes(selectedTag);

    return matchesKeyword && matchesTag;
  });

  return (
    <section className="page-section">
      <header className="page-heading">
        <p className="eyebrow">BLOG V2</p>
        <h1>文章</h1>
        <p>记录 Web 开发、工程实践与问题复盘。</p>
      </header>

      <div className="post-filters">
        <label>
          <span>搜索文章</span>
          <input
            type="search"
            value={keyword}
            onChange={(event) =>
              setKeyword(event.target.value)
            }
          />
        </label>

        <fieldset>
          <legend>按标签筛选</legend>
          <button
            type="button"
            aria-pressed={selectedTag === null}
            onClick={() => setSelectedTag(null)}
          >
            全部
          </button>
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              aria-pressed={selectedTag === tag}
              onClick={() => setSelectedTag(tag)}
            >
              {tag}
            </button>
          ))}
        </fieldset>
      </div>

      <p role="status" aria-live="polite">
        找到 {visiblePosts.length} 篇文章
      </p>

      <PostList posts={visiblePosts} />
    </section>
  );
}
```

当前数据量很小，直接筛选足够。只有 Profiler 证明计算昂贵时，再使用 `useMemo`。不要为了“看起来优化”给所有派生值加缓存。

### 35.6 表单 Schema

```ts
// src/features/feedback/feedback-schema.ts
import { z } from 'zod';

export const feedbackSchema = z.object({
  rating: z.coerce
    .number()
    .int()
    .min(1, '请选择评分')
    .max(5, '评分不能超过 5'),
  email: z.union([
    z.literal(''),
    z.email('邮箱格式不正确'),
  ]),
  message: z
    .string()
    .trim()
    .min(10, '反馈至少需要 10 个字符')
    .max(500, '反馈不能超过 500 个字符'),
});

export const storedFeedbackSchema = feedbackSchema.extend({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
});

export const storedFeedbackListSchema = z.array(
  storedFeedbackSchema,
);

export type FeedbackInput = z.infer<
  typeof feedbackSchema
>;
export type StoredFeedback = z.infer<
  typeof storedFeedbackSchema
>;
```

浏览器原生属性提供第一层即时约束，Zod 是提交边界的第二层校验。真实 API 还必须在服务端再次校验。

### 35.7 本地反馈仓库

阶段 2 仍是纯静态项目，反馈保存到本地演示存储：

```ts
// src/features/feedback/feedback-repository.ts
import {
  storedFeedbackListSchema,
  type FeedbackInput,
  type StoredFeedback,
} from './feedback-schema';

const STORAGE_KEY = 'blog:feedback:v1';

export async function saveFeedback(
  input: FeedbackInput,
): Promise<StoredFeedback> {
  await new Promise((resolve) => {
    setTimeout(resolve, 600);
  });

  const stored: StoredFeedback = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  const current = readFeedback();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify([...current, stored]),
  );

  return stored;
}

function readFeedback(): StoredFeedback[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  return storedFeedbackListSchema.parse(JSON.parse(raw));
}
```

这是可运行的前端演示，不代表生产反馈系统。真实反馈需要服务端持久化、限流、鉴权和隐私说明。

已有数据损坏或存储读取失败时，错误传播到 Action 的失败状态，不能把损坏记录悄悄变成空数组后覆盖。生产实现还要限制记录数量、定义清除和保留周期；多个标签页的 `getItem → setItem` 会丢失并发更新，本地存储不是事务数据库。

### 35.8 Action 与字段错误

```tsx
// src/features/feedback/FeedbackForm.tsx
import {
  useActionState,
  useEffect,
  useState,
} from 'react';
import { useFormStatus } from 'react-dom';
import { saveFeedback } from './feedback-repository';
import { feedbackSchema } from './feedback-schema';
import { z } from 'zod';

interface FeedbackFormState {
  status: 'idle' | 'error' | 'success';
  message: string;
  fieldErrors: Partial<
    Record<'rating' | 'email' | 'message', string[]>
  >;
  submissionId: number;
}

const initialState: FeedbackFormState = {
  status: 'idle',
  message: '',
  fieldErrors: {},
  submissionId: 0,
};

async function submitFeedback(
  previousState: FeedbackFormState,
  formData: FormData,
): Promise<FeedbackFormState> {
  const result = feedbackSchema.safeParse({
    rating: formData.get('rating'),
    email: formData.get('email'),
    message: formData.get('message'),
  });

  if (!result.success) {
    return {
      status: 'error',
      message: '请检查表单内容',
      fieldErrors: z.flattenError(result.error).fieldErrors,
      submissionId: previousState.submissionId,
    };
  }

  try {
    await saveFeedback(result.data);

    return {
      status: 'success',
      message: '反馈已保存在当前浏览器',
      fieldErrors: {},
      submissionId: previousState.submissionId + 1,
    };
  } catch {
    return {
      status: 'error',
      message: '保存失败，请稍后重试',
      fieldErrors: {},
      submissionId: previousState.submissionId,
    };
  }
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending}>
      {pending ? '提交中…' : '提交反馈'}
    </button>
  );
}

export function FeedbackForm() {
  const [state, action, isPending] = useActionState(
    submitFeedback,
    initialState,
  );
  const [values, setValues] = useState({
    rating: '',
    email: '',
    message: '',
  });

  useEffect(() => {
    if (state.status === 'success') {
      setValues({
        rating: '',
        email: '',
        message: '',
      });
    }
  }, [state.status, state.submissionId]);

  return (
    <form action={action} className="feedback-form">
      <fieldset disabled={isPending}>
        <legend>这篇文章有帮助吗？</legend>
        <label htmlFor="feedback-rating">评分</label>
        <select
          id="feedback-rating"
          name="rating"
          required
          value={values.rating}
          aria-describedby="rating-error"
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              rating: event.target.value,
            }))
          }
        >
          <option value="">请选择</option>
          <option value="5">5 - 很有帮助</option>
          <option value="4">4 - 有帮助</option>
          <option value="3">3 - 一般</option>
          <option value="2">2 - 帮助较少</option>
          <option value="1">1 - 没有帮助</option>
        </select>
        <p id="rating-error" className="field-error">
          {state.fieldErrors.rating?.[0]}
        </p>

        <label htmlFor="feedback-email">
          邮箱（可选）
        </label>
        <input
          id="feedback-email"
          name="email"
          type="email"
          value={values.email}
          aria-describedby="email-error"
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              email: event.target.value,
            }))
          }
        />
        <p id="email-error" className="field-error">
          {state.fieldErrors.email?.[0]}
        </p>

        <label htmlFor="feedback-message">
          具体反馈
        </label>
        <textarea
          id="feedback-message"
          name="message"
          required
          minLength={10}
          maxLength={500}
          value={values.message}
          aria-describedby="message-error"
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              message: event.target.value,
            }))
          }
        />
        <p id="message-error" className="field-error">
          {state.fieldErrors.message?.[0]}
        </p>
      </fieldset>

      <SubmitButton />

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

表单使用受控输入，因此 Action 完成时浏览器对非受控字段的自动重置不会丢失校验失败后的输入。只有成功且 `submissionId` 增加时才清空。

把表单放到文章页正文后：

```tsx
<div className="article-content">
  <Markdown rehypePlugins={[rehypeSanitize]}>
    {post.content}
  </Markdown>
</div>

<FavoriteButton slug={post.slug} />
<FeedbackForm />
```

### 35.9 组件拆分原则

当前拆分有清晰理由：

- `PostCard`：可重复的文章摘要。
- `PostList`：列表与空状态。
- `FavoriteButton`：共享收藏交互与可访问语义。
- `FeedbackForm`：独立校验、提交和状态。
- `HomePage`：路由数据与页面级筛选编排。

不要把每个 `<div>` 都拆成组件。适合拆分的信号包括：

- 有独立业务名称。
- 在多个位置复用。
- 有独立状态或副作用。
- 渲染分支复杂，需要单独阅读或测试。
- 可以形成稳定 Props 契约。

### 35.10 效果验证

1. 在首页输入关键词并切换标签，确认结果数量和列表同步变化。
2. 收藏一篇文章，进入详情页，确认按钮仍为“已收藏”。
3. 刷新页面，确认收藏恢复。
4. 提交空表单，确认浏览器原生校验阻止提交。
5. 浏览器的 `minLength` 会先拦截短文本；在独立 schema 练习中直接调用 `safeParse()` 验证 Zod 错误，不把原生校验提示当成 Zod 的验证结果。
6. 提交合法反馈，确认按钮显示 pending、成功消息出现、字段清空。
7. 在 Application 面板检查两个带版本号的 localStorage key。
8. 清空 localStorage，确认应用回到默认状态且无报错。

9. 将反馈 key 写入损坏 JSON，再提交合法表单，确认提示保存失败且原记录未被覆盖。
10. 保存期间不要继续编辑会被成功重置的字段；使用 `useActionState` 的第三个 pending 返回值禁用字段，或记录提交快照并仅重置对应版本。

### 35.11 官方参考

- [Zustand persist](https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data)。
- [Zod 4 错误格式化](https://zod.dev/error-formatting)。
- [React：表单 action 与重置](https://react.dev/reference/react-dom/components/form)。
- [MDN：Storage](https://developer.mozilla.org/en-US/docs/Web/API/Storage)。

---
