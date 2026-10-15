---
title: "第 31 章：React Hooks 与状态建模"
description: "掌握 useState、useEffect、useContext、useRef、useMemo、useCallback 与 useReducer。"
date: "2026-10-15"
category: React
tags: [React Hooks, State, Effects]
series:
  order: 32
---
## 第 31 章 Hooks

Hooks 让函数组件使用状态、上下文、引用和副作用。关键不是记住 API，而是分清“渲染计算”“用户事件”和“外部系统同步”三个边界。

### 31.1 学习目标

- 用 `useState` 保存最小必要状态。
- 只在同步外部系统时使用 `useEffect`。
- 用 Context 共享跨层级依赖。
- 用 `useRef` 保存 DOM 引用和不驱动渲染的值。
- 判断何时需要 `useMemo` 与 `useCallback`。
- 用 `useReducer` 管理事件驱动的复杂状态。

### 31.2 Hook 规则

Hooks 必须：

1. 在函数组件或自定义 Hook 顶层调用。
2. 每次渲染按相同顺序调用。

不要放进条件、循环或普通嵌套函数：

```tsx
function SearchPage({ enabled }: { enabled: boolean }) {
  // 错误：不同渲染的 Hook 调用顺序可能变化。
  if (enabled) {
    const [keyword, setKeyword] = useState('');
  }

  return null;
}
```

应始终调用 Hook，再根据状态决定渲染：

```tsx
function SearchPage({ enabled }: { enabled: boolean }) {
  const [keyword, setKeyword] = useState('');

  if (!enabled) {
    return null;
  }

  return <SearchInput value={keyword} onChange={setKeyword} />;
}
```

React 19 的 `use()` 有不同规则，第 32 章单独说明。

### 31.3 `useState`

```tsx
import { useState } from 'react';

export function SearchBox() {
  const [keyword, setKeyword] = useState('');

  return (
    <label>
      搜索文章
      <input
        type="search"
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
      />
    </label>
  );
}
```

状态更新基于旧值时使用函数形式：

```tsx
const [page, setPage] = useState(1);

function nextPage() {
  setPage((currentPage) => currentPage + 1);
}
```

对象状态要创建新对象：

```tsx
interface Filters {
  keyword: string;
  tag: string | null;
}

const [filters, setFilters] = useState<Filters>({
  keyword: '',
  tag: null,
});

function selectTag(tag: string | null) {
  setFilters((current) => ({
    ...current,
    tag,
  }));
}
```

昂贵初始值使用惰性初始化，只在首次挂载计算：

```tsx
const [draft, setDraft] = useState(() => readDraftFromStorage());
```

不要保存可以从现有 Props 或 State 直接计算的值：

```tsx
// 不需要另一个 state 和 effect。
const filteredPosts = posts.filter((post) =>
  post.title.toLowerCase().includes(keyword.toLowerCase()),
);
```

### 31.4 `useEffect`

Effect 用于把 React 与外部系统同步，例如网络、订阅、计时器、DOM API：

```tsx
import { useEffect, useState } from 'react';

function PostPage({ slug }: { slug: string }) {
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadPost() {
      try {
        const response = await fetch(`/api/posts/${slug}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        setPost(await response.json());
      } catch (caught) {
        if (
          caught instanceof DOMException &&
          caught.name === 'AbortError'
        ) {
          return;
        }

        setError(
          caught instanceof Error
            ? caught
            : new Error(String(caught)),
        );
      }
    }

    setPost(null);
    setError(null);
    loadPost();

    return () => controller.abort();
  }, [slug]);

  // 渲染省略
}
```

依赖数组应包含 Effect 内读取的响应式值。不要通过关闭 lint 规则隐藏遗漏依赖。

清理函数在以下时机执行：

- 组件卸载。
- Effect 因依赖变化重新执行之前。
- 开发环境 `StrictMode` 的额外检查周期。

不需要 Effect 的例子：

```tsx
// 错误：派生值造成额外一次渲染。
useEffect(() => {
  setFullName(`${firstName} ${lastName}`);
}, [firstName, lastName]);

// 正确：渲染时直接计算。
const fullName = `${firstName} ${lastName}`;
```

用户点击后保存，应放在事件处理器，不是 Effect：

```tsx
async function handleSave() {
  await savePost(draft);
}
```

### 31.5 `useContext`

Context 适合主题、当前用户、语言等跨多层组件共享的依赖：

```tsx
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [theme, setTheme] = useState<Theme>('light');
  const value = useMemo(
    () => ({ theme, setTheme }),
    [theme],
  );

  return (
    <ThemeContext value={value}>
      <div data-theme={theme}>{children}</div>
    </ThemeContext>
  );
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);

  if (!value) {
    throw new Error('useTheme 必须在 ThemeProvider 内使用');
  }

  return value;
}
```

React 19 可以直接渲染 `<ThemeContext value={value}>`，旧版本使用 `<ThemeContext.Provider>`。

Context 值变化会让读取它的后代重新渲染。不要把高频变化且彼此无关的所有状态放进一个巨大 Context。

### 31.6 `useRef`

访问 DOM：

```tsx
import { useRef } from 'react';

function SearchPanel() {
  const inputRef = useRef<HTMLInputElement>(null);

  function focusSearch() {
    inputRef.current?.focus();
  }

  return (
    <>
      <input ref={inputRef} type="search" />
      <button type="button" onClick={focusSearch}>
        聚焦搜索
      </button>
    </>
  );
}
```

保存不参与渲染的可变值：

```tsx
const requestIdRef = useRef(0);

async function search(keyword: string) {
  const requestId = requestIdRef.current + 1;
  requestIdRef.current = requestId;

  const result = await fetchSearchResult(keyword);

  if (requestId === requestIdRef.current) {
    setResult(result);
  }
}
```

修改 `ref.current` 不会触发渲染。需要显示在界面上的数据应使用 State。

不要在渲染期间随意读取或写入 ref，DOM 测量和外部同步应放在事件或 Effect 中。

### 31.7 `useMemo`

`useMemo` 缓存一次计算结果：

```tsx
const visiblePosts = useMemo(() => {
  const normalizedKeyword = keyword.trim().toLowerCase();

  return posts.filter((post) => {
    const matchesKeyword =
      normalizedKeyword === '' ||
      post.title.toLowerCase().includes(normalizedKeyword);
    const matchesTag =
      selectedTag === null || post.tags.includes(selectedTag);

    return matchesKeyword && matchesTag;
  });
}, [posts, keyword, selectedTag]);
```

适合：

- 数据量大、计算确实昂贵。
- 计算结果作为被 memo 化子组件的 Props，需要稳定引用。
- 依赖另一个 Hook 的对象引用。

不适合简单表达式：

```tsx
// 不需要 useMemo。
const hasPosts = posts.length > 0;
```

`useMemo` 是性能优化，不是语义保证。先用 React DevTools Profiler 找到实际瓶颈。

### 31.8 `useCallback`

`useCallback` 缓存函数引用：

```tsx
const handleSelectPost = useCallback((slug: string) => {
  navigate(`/posts/${slug}`);
}, [navigate]);
```

它不会减少函数内部工作，只保持依赖不变时引用稳定。常见使用场景：

- 传给 `memo()` 包裹的子组件。
- 函数是其他 Hook 的依赖。
- 第三方 API 以函数引用识别订阅。

普通按钮处理器通常不需要：

```tsx
<button onClick={() => setOpen(true)}>打开</button>
```

不要给每个函数机械添加 `useCallback`。缓存本身也有理解和维护成本。

### 31.9 `useReducer`

当多个状态字段由明确事件共同变化时，Reducer 比多个分散的 setter 更清晰：

```tsx
interface EditorState {
  title: string;
  content: string;
  status: 'clean' | 'dirty' | 'saving' | 'saved' | 'error';
  error: string | null;
}

type EditorAction =
  | { type: 'titleChanged'; title: string }
  | { type: 'contentChanged'; content: string }
  | { type: 'saveStarted' }
  | { type: 'saveSucceeded' }
  | { type: 'saveFailed'; message: string }
  | { type: 'reset'; state: EditorState };

function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  switch (action.type) {
    case 'titleChanged':
      return {
        ...state,
        title: action.title,
        status: 'dirty',
      };
    case 'contentChanged':
      return {
        ...state,
        content: action.content,
        status: 'dirty',
      };
    case 'saveStarted':
      return {
        ...state,
        status: 'saving',
        error: null,
      };
    case 'saveSucceeded':
      return {
        ...state,
        status: 'saved',
      };
    case 'saveFailed':
      return {
        ...state,
        status: 'error',
        error: action.message,
      };
    case 'reset':
      return action.state;
  }
}
```

组件中使用：

```tsx
const [state, dispatch] = useReducer(editorReducer, initialEditorState);

async function handleSave() {
  dispatch({ type: 'saveStarted' });

  try {
    await saveDraft(state);
    dispatch({ type: 'saveSucceeded' });
  } catch (error) {
    dispatch({
      type: 'saveFailed',
      message: error instanceof Error ? error.message : '保存失败',
    });
  }
}
```

Reducer 必须是纯函数：不请求网络、不写存储、不修改传入 state。

### 31.10 如何选择

| 需求 | Hook |
|---|---|
| 单个或少量独立界面状态 | `useState` |
| 多字段由事件共同变化 | `useReducer` |
| 同步网络、订阅、计时器、浏览器 API | `useEffect` |
| 跨多层共享稳定依赖 | `useContext` |
| DOM 节点或不驱动渲染的可变值 | `useRef` |
| 经测量昂贵的派生计算 | `useMemo` |
| 需要稳定函数引用 | `useCallback` |

### 31.11 效果验证

1. 在 `StrictMode` 下确认请求 Effect 能取消，不会让旧响应覆盖新文章。
2. 删除一个 Effect 依赖，观察 lint 提示，再恢复完整依赖。
3. 将可计算的 `filteredPosts` 改为 State + Effect，比较额外渲染后恢复直接计算。
4. 用 Profiler 比较加入 `useMemo` 前后的实际耗时。
5. 给 Reducer 新增 `publishSucceeded` 事件，用穷尽联合保证分支完整。
6. 修改 ref，确认界面不会自动变化；改用 State 后确认会重新渲染。

---
