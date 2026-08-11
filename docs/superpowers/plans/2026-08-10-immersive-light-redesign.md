# 沉浸光感视觉重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留真实内容、静态导出和现有路由的前提下，为个人博客实现浅色/深色沉浸光感系统，以及仅在深色桌面首页运行的 3D 星体磁场场景。

**Architecture:** 主题状态、滚动状态、文章筛选、目录高亮和 WebGL 场景分别封装为独立客户端边界；页面和 MDX 内容继续由服务器组件在构建期读取。Three.js 通过动态导入限制在首页，浅色、移动端、reduced-motion 和 WebGL 失败场景统一降级为静态视觉。

**Tech Stack:** Next.js 16、React 19、TypeScript、CSS、Three.js、MDX、Unified/Remark、Vitest、Testing Library、Playwright。

---

## 执行约束

- 实施应在基于最新 `origin/master` 的独立工作树或功能分支中进行。
- 不修改文章、项目 frontmatter、RSS、Sitemap、Robots 和 GitHub Pages 发布协议。
- 不新增虚构阅读量、评论、经历、日期、项目结果或占位内容。
- 每个任务先运行最小相关测试，再运行更大范围验证。
- 下文提交步骤仅作为检查点；没有用户明确授权时，不执行 `git commit` 或 `git push`。
- 任何视觉完成声明必须经过外部 Chrome 和 Chrome DevTools 验证。

## 文件结构

### 新建文件

| 文件 | 职责 |
|---|---|
| `lib/theme.ts` | 主题类型、存储键和初始主题选择纯函数 |
| `lib/article-presentation.ts` | 文章主题列表和 MDX 标题目录的构建期纯函数 |
| `components/ThemeProvider/index.tsx` | 主题上下文、系统偏好监听和持久化 |
| `components/ThemeToggle/index.tsx` | 可访问的浅色/深色切换按钮 |
| `components/AmbientLight/index.tsx` | 全站装饰性环境光 |
| `components/RevealSection/index.tsx` | Intersection Observer 驱动的进入动画 |
| `components/GlassCard/index.tsx` | 受约束的玻璃卡片容器 |
| `components/CelestialScene/index.tsx` | 主题、视口和运动偏好门控 |
| `components/CelestialScene/StaticCelestial.tsx` | 浅色、移动端和失败场景的静态视觉 |
| `components/CelestialScene/WebGLCelestial.tsx` | Canvas 生命周期和动态 Three.js 初始化 |
| `components/CelestialScene/createCelestialScene.ts` | Three.js 场景、磁场粒子和资源清理 |
| `components/WritingCollection/index.tsx` | 文章主题筛选与响应式卡片集合 |
| `components/ArticleToc/index.tsx` | 目录渲染和当前章节高亮 |
| `components/CodeBlock/index.tsx` | 代码块复制和状态反馈 |
| `app/styles/tokens.css` | 浅色/深色语义变量 |
| `app/styles/base.css` | Reset、排版、焦点和基础布局 |
| `app/styles/components.css` | 导航、按钮、卡片、目录、代码块和视觉组件 |
| `app/styles/pages.css` | 首页及内容页面布局 |
| `tests/theme.test.ts` | 主题纯函数测试 |
| `tests/theme-components.test.tsx` | 主题组件和导航交互测试 |
| `tests/article-presentation.test.ts` | 分类与目录提取测试 |
| `tests/writing-components.test.tsx` | 筛选、目录和代码复制测试 |

### 修改文件

| 文件 | 修改范围 |
|---|---|
| `package.json`、`package-lock.json` | 增加 Three.js 和结构化 Markdown 解析依赖 |
| `app/layout.tsx` | 主题初始化、Provider、环境光和全局样式入口 |
| `app/globals.css` | 改为四个样式职责文件的统一入口 |
| `components/SiteHeader/index.tsx` | 滚动玻璃状态、主题切换和移动导航 |
| `components/Footer/index.tsx` | 公开社交入口及可访问交互样式 |
| `app/page.tsx` | 首页内容顺序和星体 Hero |
| `app/writing/page.tsx` | 真实主题筛选和文章卡片集合 |
| `app/writing/[slug]/page.tsx` | 目录、标题 ID 和代码块增强 |
| `app/work/page.tsx`、`app/work/[slug]/page.tsx` | 项目卡片和详情阅读布局 |
| `app/about/page.tsx` | 介绍、技能标签和能力演进结构 |
| `app/contact/page.tsx` | 公开入口布局，继续保持表单不可提交 |
| `tests/home.test.tsx`、`tests/routes.test.tsx` | 新页面结构和真实内容边界 |
| `tests/e2e/smoke.spec.ts` | 主题、响应式、reduced-motion、控制台和网络验收 |

### 删除文件

| 文件 | 删除条件 |
|---|---|
| `components/AbilityMap/index.tsx` | `app/page.tsx` 替换引用且 `rg "AbilityMap"` 只剩组件自身后删除 |

## Task 1：建立主题决策与首屏初始化

**Files:**
- Create: `lib/theme.ts`
- Create: `components/ThemeProvider/index.tsx`
- Create: `components/ThemeToggle/index.tsx`
- Create: `tests/theme.test.ts`
- Create: `tests/theme-components.test.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1：为主题选择优先级编写失败测试**

```ts
import { describe, expect, it } from "vitest";
import { resolveInitialTheme } from "@/lib/theme";

describe("主题初始化", () => {
  it("优先使用已保存主题", () => {
    expect(resolveInitialTheme("light", true)).toBe("light");
  });

  it("没有保存值时跟随系统主题", () => {
    expect(resolveInitialTheme(null, true)).toBe("dark");
    expect(resolveInitialTheme(null, false)).toBe("light");
  });

  it("忽略非法保存值", () => {
    expect(resolveInitialTheme("system", false)).toBe("light");
  });
});
```

- [ ] **Step 2：运行测试并确认因模块不存在而失败**

Run: `npm test -- tests/theme.test.ts`

Expected: FAIL，提示无法解析 `@/lib/theme`。

- [ ] **Step 3：实现最小主题纯函数**

```ts
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "personal-site-theme";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

export function resolveInitialTheme(
  storedTheme: unknown,
  systemPrefersDark: boolean,
): Theme {
  if (isTheme(storedTheme)) {
    return storedTheme;
  }

  return systemPrefersDark ? "dark" : "light";
}
```

- [ ] **Step 4：运行纯函数测试并确认通过**

Run: `npm test -- tests/theme.test.ts`

Expected: PASS，3 个主题初始化用例通过。

- [ ] **Step 5：为主题切换组件编写失败测试**

```tsx
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("主题组件", () => {
  it("切换主题并持久化明确选择", () => {
    document.documentElement.dataset.theme = "dark";

    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "切换到浅色模式" }));

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("personal-site-theme")).toBe("light");
  });
});
```

- [ ] **Step 6：实现 Provider、切换按钮和无闪烁初始化脚本**

`ThemeProvider` 对外暴露以下稳定接口：

```tsx
type ThemeContextValue = {
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
  toggleTheme: () => void;
};

export function useTheme(): ThemeContextValue;
```

`app/layout.tsx` 为 `<html>` 增加 `suppressHydrationWarning`，并在 `<body>` 前注入同步脚本，逻辑必须与 `resolveInitialTheme` 一致：

```tsx
<script
  dangerouslySetInnerHTML={{
    __html: `(function(){try{var key="personal-site-theme";var saved=localStorage.getItem(key);var dark=matchMedia("(prefers-color-scheme: dark)").matches;var theme=saved==="light"||saved==="dark"?saved:(dark?"dark":"light");document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;}catch(_){document.documentElement.dataset.theme=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}})();`,
  }}
/>
```

`ThemeProvider` 只在没有已保存选择时响应系统主题变化；`ThemeToggle` 使用当前状态生成 `aria-label`，不得只显示无文本含义的图标。

- [ ] **Step 7：运行主题测试、Lint 和构建**

Run: `npm test -- tests/theme.test.ts tests/theme-components.test.tsx && npm run lint && npm run build`

Expected: 主题测试全部 PASS；Lint 和静态构建成功。

- [ ] **Step 8：经用户授权后提交主题基础**

```bash
git add app/layout.tsx components/ThemeProvider components/ThemeToggle lib/theme.ts tests/theme.test.ts tests/theme-components.test.tsx
git commit -m "feat: add persistent light and dark themes"
```

## Task 2：拆分视觉令牌与基础组件

**Files:**
- Create: `app/styles/tokens.css`
- Create: `app/styles/base.css`
- Create: `app/styles/components.css`
- Create: `app/styles/pages.css`
- Create: `components/AmbientLight/index.tsx`
- Create: `components/RevealSection/index.tsx`
- Create: `components/GlassCard/index.tsx`
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

- [ ] **Step 1：将全局样式入口改为明确职责**

`app/globals.css` 只保留以下导入：

```css
@import "./styles/tokens.css";
@import "./styles/base.css";
@import "./styles/components.css";
@import "./styles/pages.css";
```

- [ ] **Step 2：写入浅色和深色语义变量**

`app/styles/tokens.css` 写入以下稳定变量：

```css
:root {
  --color-bg: #fafbff;
  --color-bg-subtle: #f0f2f8;
  --color-heading: #1a1d2e;
  --color-text: #3d4259;
  --color-muted: #6b708c;
  --color-accent: #6366f1;
  --color-glow-primary: rgba(120, 140, 255, 0.12);
  --color-glow-secondary: rgba(255, 180, 140, 0.08);
  --color-glass: rgba(255, 255, 255, 0.6);
  --color-glass-highlight: rgba(255, 255, 255, 0.6);
  --space-unit: 0.5rem;
  --content-width: 75rem;
  --reading-width: 50rem;
  --radius-card: 1rem;
  --ease-standard: cubic-bezier(0.25, 0.8, 0.25, 1);
}

:root[data-theme="dark"] {
  --color-bg: #0a0e1a;
  --color-bg-subtle: #151929;
  --color-heading: #e8eaf6;
  --color-text: #b0b3c5;
  --color-muted: #7a7f99;
  --color-accent: #8b8df9;
  --color-glow-primary: rgba(100, 120, 255, 0.18);
  --color-glow-secondary: rgba(140, 200, 255, 0.1);
  --color-glass: rgba(21, 25, 41, 0.6);
  --color-glass-highlight: rgba(255, 255, 255, 0.08);
}
```

- [ ] **Step 3：实现基础排版、焦点和装饰组件**

`AmbientLight` 必须是纯装饰：

```tsx
export function AmbientLight() {
  return (
    <div className="ambient-light" aria-hidden="true">
      <span className="ambient-light__primary" />
      <span className="ambient-light__secondary" />
    </div>
  );
}
```

`GlassCard` 只包装语义内容，不固定标题或链接：

```tsx
type GlassCardProps = React.ComponentPropsWithoutRef<"div">;

export function GlassCard({ className = "", ...props }: GlassCardProps) {
  return <div className={`glass-card ${className}`.trim()} {...props} />;
}
```

`RevealSection` 使用 Intersection Observer 添加 `is-visible`，Observer 不可用时直接展示内容；reduced-motion 由 CSS 关闭位移。

- [ ] **Step 4：在根布局挂载环境光并验证无障碍树**

在 `ThemeProvider` 内、站点框架外渲染 `<AmbientLight />`。运行：

Run: `npm test -- tests/home.test.tsx tests/routes.test.tsx`

Expected: 现有页面内容测试继续 PASS，装饰元素不改变可访问名称。

- [ ] **Step 5：运行样式格式、Lint 和构建检查**

Run: `npm run lint && npm run build`

Expected: PASS；静态导出仍生成现有路由。

- [ ] **Step 6：经用户授权后提交视觉基础**

```bash
git add app/globals.css app/layout.tsx app/styles components/AmbientLight components/GlassCard components/RevealSection
git commit -m "feat: establish immersive light visual system"
```

## Task 3：实现滚动玻璃导航和移动菜单

**Files:**
- Modify: `components/SiteHeader/index.tsx`
- Modify: `app/styles/components.css`
- Modify: `tests/theme-components.test.tsx`

- [ ] **Step 1：编写滚动状态失败测试**

```tsx
it("页面滚动后为导航添加玻璃状态", () => {
  render(
    <ThemeProvider>
      <SiteHeader />
    </ThemeProvider>,
  );

  Object.defineProperty(window, "scrollY", { value: 80, configurable: true });
  fireEvent.scroll(window);

  expect(screen.getByRole("banner")).toHaveAttribute("data-scrolled", "true");
});
```

- [ ] **Step 2：运行测试并确认失败**

Run: `npm test -- tests/theme-components.test.tsx`

Expected: FAIL，导航缺少 `data-scrolled="true"`。

- [ ] **Step 3：实现最小滚动状态和主题入口**

将 `SiteHeader` 设为客户端组件：

```tsx
const [isScrolled, setIsScrolled] = useState(false);

useEffect(() => {
  const update = () => setIsScrolled(window.scrollY > 24);
  update();
  window.addEventListener("scroll", update, { passive: true });
  return () => window.removeEventListener("scroll", update);
}, []);
```

`<header>` 设置 `data-scrolled={isScrolled}`，桌面导航末尾加入 `ThemeToggle`。移动端继续使用原生 `<details>`，并在菜单内提供同一主题切换入口。

- [ ] **Step 4：实现导航视觉状态**

`app/styles/components.css` 按以下确定规则实现：

- 默认透明背景。
- `data-scrolled="true"` 时使用 `blur(12px)` 和主题玻璃背景。
- `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))` 的纯色降级。
- 导航链接悬停、键盘聚焦时出现 2px 光条。
- 移动端菜单触控目标不小于 44px。

- [ ] **Step 5：运行组件测试和构建**

Run: `npm test -- tests/theme-components.test.tsx && npm run build`

Expected: PASS，静态导出不因客户端导航失败。

- [ ] **Step 6：经用户授权后提交导航**

```bash
git add components/SiteHeader app/styles/components.css tests/theme-components.test.tsx
git commit -m "feat: add responsive glass navigation"
```

## Task 4：实现首页 3D 星体与磁场粒子

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `components/CelestialScene/index.tsx`
- Create: `components/CelestialScene/StaticCelestial.tsx`
- Create: `components/CelestialScene/WebGLCelestial.tsx`
- Create: `components/CelestialScene/createCelestialScene.ts`
- Modify: `app/styles/components.css`
- Modify: `tests/theme-components.test.tsx`

- [ ] **Step 1：安装公开 registry 的 Three.js 依赖**

Run:

```bash
npm_config_registry=https://registry.npmjs.org/ npm install three
npm_config_registry=https://registry.npmjs.org/ npm install --save-dev @types/three
```

Expected: `package.json` 增加 `three` 和 `@types/three`，`package-lock.json` 中新增条目使用 `https://registry.npmjs.org/`。

- [ ] **Step 2：编写场景门控失败测试**

```tsx
it("浅色主题使用静态星体", () => {
  document.documentElement.dataset.theme = "light";

  render(
    <ThemeProvider>
      <CelestialScene />
    </ThemeProvider>,
  );

  expect(screen.getByTestId("static-celestial")).toBeInTheDocument();
  expect(screen.queryByTestId("webgl-celestial")).not.toBeInTheDocument();
});
```

将 `vi` 加入 Vitest import，并分别增加移动端和 reduced-motion 用例。使用下列可写的 `matchMedia` 模拟，不直接修改只读的 `MediaQueryList.matches`：

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

function mockMedia(matchesByQuery: Record<string, boolean>) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: matchesByQuery[query] ?? false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

mockMedia({
  "(max-width: 767px)": true,
  "(prefers-reduced-motion: reduce)": false,
});

// 在独立的 reduced-motion 用例中使用：
mockMedia({
  "(max-width: 767px)": false,
  "(prefers-reduced-motion: reduce)": true,
});
```

两种情况都必须断言静态星体存在、WebGL Canvas 不存在。

- [ ] **Step 3：实现门控组件和静态降级**

`CelestialScene` 仅在以下条件同时满足时动态加载 WebGL：

```ts
theme === "dark" && !isMobile && !prefersReducedMotion
```

`WebGLCelestial` 接收 `onUnavailable: () => void`。Three.js 模块加载或场景初始化抛错时调用该回调，父组件将状态切换为静态场景。静态组件输出：

```tsx
export function StaticCelestial() {
  return (
    <div
      className="static-celestial"
      data-testid="static-celestial"
      aria-hidden="true"
    >
      <span className="static-celestial__body" />
      <span className="static-celestial__field" />
    </div>
  );
}
```

- [ ] **Step 4：为 WebGL 初始化失败编写回退测试**

```tsx
vi.mock("@/components/CelestialScene/createCelestialScene", () => ({
  createCelestialScene: () => {
    throw new Error("WebGL unavailable");
  },
}));

it("WebGL 初始化失败时回退静态星体", async () => {
  document.documentElement.dataset.theme = "dark";
  mockMedia({
    "(max-width: 767px)": false,
    "(prefers-reduced-motion: reduce)": false,
  });

  render(
    <ThemeProvider>
      <CelestialScene />
    </ThemeProvider>,
  );

  expect(await screen.findByTestId("static-celestial")).toBeInTheDocument();
});
```

- [ ] **Step 5：实现 Three.js 资源生命周期**

`createCelestialScene.ts` 导出明确接口：

```ts
export type CelestialSceneController = {
  pause: () => void;
  resume: () => void;
  resize: () => void;
  dispose: () => void;
};

export function createCelestialScene(
  canvas: HTMLCanvasElement,
): CelestialSceneController;
```

实现必须按以下确定规则完成：

- 使用球体几何体、标准材质、环境光和方向光形成真实明暗。
- 使用固定种子的 CanvasTexture 生成熔岩色明暗纹理，避免每次加载产生随机闪变。
- 使用 `CatmullRomCurve3` 预计算磁场曲线，粒子只沿曲线更新进度。
- `renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))`。
- `dispose()` 取消动画帧并释放 geometry、material、texture 和 renderer。
- 不挂载全局鼠标处理器；指针偏移只监听场景容器并在清理时移除。

- [ ] **Step 6：实现 Canvas 暂停和恢复**

`WebGLCelestial` 使用 Page Visibility API 和 Intersection Observer：

```tsx
useEffect(() => {
  const controller = createCelestialScene(canvas);
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !document.hidden) controller.resume();
    else controller.pause();
  });

  observer.observe(canvas);
  const handleVisibility = () =>
    document.hidden ? controller.pause() : controller.resume();
  document.addEventListener("visibilitychange", handleVisibility);

  return () => {
    observer.disconnect();
    document.removeEventListener("visibilitychange", handleVisibility);
    controller.dispose();
  };
}, []);
```

- [ ] **Step 7：运行门控测试、Lint 和构建**

Run: `npm test -- tests/theme-components.test.tsx && npm run lint && npm run build`

Expected: PASS；构建产物中首页包含 Three.js 客户端分块，其他静态页面不直接导入场景模块。

- [ ] **Step 8：检查 lockfile registry**

Run: `rg "bnpm\\.byted\\.org|registry\\.npm\\.byted" package-lock.json`

Expected: 无输出。

- [ ] **Step 9：经用户授权后提交场景**

```bash
git add package.json package-lock.json components/CelestialScene app/styles/components.css tests/theme-components.test.tsx
git commit -m "feat: add celestial magnetic hero scene"
```

## Task 5：重构首页内容节奏

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/styles/pages.css`
- Modify: `tests/home.test.tsx`
- Delete: `components/AbilityMap/index.tsx`

- [ ] **Step 1：编写首页结构失败测试**

```tsx
it("按沉浸首屏、精选内容、最新文章和代表项目组织首页", () => {
  render(<HomePage />);

  expect(screen.getByRole("region", { name: "个人介绍" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "精选内容" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "最新文章" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "代表项目" })).toBeInTheDocument();
});

it("不为精选布局伪造文章", () => {
  render(<HomePage />);

  expect(
    screen.getAllByText("从公开仓库整理 HarmonyOS Next 学习路径"),
  ).toHaveLength(1);
});
```

- [ ] **Step 2：运行首页测试并确认失败**

Run: `npm test -- tests/home.test.tsx`

Expected: FAIL，缺少新的区域名称和章节标题。

- [ ] **Step 3：重构首页服务器组件**

首页数据继续在构建期读取。Hero 使用：

```tsx
<section className="immersive-hero section-shell" aria-label="个人介绍">
  <div className="immersive-hero__copy">
    <p className="identity">{profile.name}</p>
    <h1>{profile.headline}</h1>
    <p className="role-line">{profile.roles.join(" / ")}</p>
    <p className="hero-summary">
      面向前端、HarmonyOS 与多端应用场景，关注从问题定义到稳定交付的完整过程。
    </p>
    <div className="hero-actions">{/* 保留项目与关于入口 */}</div>
  </div>
  <CelestialScene />
</section>
```

后续章节顺序固定为：

1. 精选内容：优先展示精选项目；只有文章总数大于 1 时才加入 1 篇文章，避免唯一文章与“最新文章”重复。
2. 最新文章：真实文章按时间倒序。
3. 代表项目：真实精选项目。
4. 联系行动区。

三类受众文案不再单独占据工业列表，可合并为精选内容中的入口说明，但不得丢失 `/writing`、`/work`、`/contact` 三个可访问入口。

- [ ] **Step 4：实现首页响应式布局**

`pages.css` 使用 CSS Grid：

- 桌面 Hero 左右比例约为 `5 / 7`。
- 精选内容使用不对称网格，但只有一个条目时占据合理宽度，不复制内容。
- Hero 以下降低背景光、阴影和动画密度。
- `390px` 下 Hero 单栏，静态星体位于文字后方且不造成横向溢出。

- [ ] **Step 5：删除无引用能力图**

Run: `rg "AbilityMap" app components`

Expected: 替换首页引用后，只匹配 `components/AbilityMap/index.tsx`。

删除 `components/AbilityMap/index.tsx`，再次运行同一命令应无输出。

- [ ] **Step 6：运行首页测试和构建**

Run: `npm test -- tests/home.test.tsx && npm run build`

Expected: PASS，首页静态导出成功。

- [ ] **Step 7：经用户授权后提交首页**

```bash
git add app/page.tsx app/styles/pages.css tests/home.test.tsx components/AbilityMap
git commit -m "feat: redesign immersive homepage"
```

## Task 6：实现真实文章筛选与卡片布局

**Files:**
- Create: `lib/article-presentation.ts`
- Create: `components/WritingCollection/index.tsx`
- Create: `tests/article-presentation.test.ts`
- Create: `tests/writing-components.test.tsx`
- Modify: `app/writing/page.tsx`
- Modify: `app/styles/components.css`
- Modify: `app/styles/pages.css`
- Modify: `tests/routes.test.tsx`

- [ ] **Step 1：为真实主题生成编写失败测试**

```ts
import { describe, expect, it } from "vitest";
import { getArticleTopics } from "@/lib/article-presentation";

describe("文章展示数据", () => {
  it("去重并排序真实主题，忽略空主题", () => {
    expect(
      getArticleTopics([
        { topic: "跨端开发" },
        { topic: "前端工程" },
        { topic: "跨端开发" },
        {},
      ]),
    ).toEqual(["前端工程", "跨端开发"]);
  });
});
```

- [ ] **Step 2：运行纯函数测试并确认失败**

Run: `npm test -- tests/article-presentation.test.ts`

Expected: FAIL，模块尚不存在。

- [ ] **Step 3：实现主题纯函数和筛选组件**

```ts
export function getArticleTopics(
  articles: Array<{ topic?: string }>,
): string[] {
  return [...new Set(articles.flatMap(({ topic }) => (topic ? [topic] : [])))].sort(
    (left, right) => left.localeCompare(right, "zh-CN"),
  );
}
```

`WritingCollection` 接收可序列化的 `ArticleMeta[]`。只有 `topics.length > 1` 时渲染“全部”和真实主题胶囊；筛选使用本地状态，不修改 URL，也不引入不存在的分页。

- [ ] **Step 4：编写筛选组件测试**

测试明确覆盖以下两个场景：

```tsx
it("只有一个真实主题时隐藏筛选栏", () => {
  render(<WritingCollection articles={[singleArticle]} />);
  expect(screen.queryByRole("group", { name: "文章分类" })).not.toBeInTheDocument();
});

it("选择主题后只展示匹配文章", () => {
  render(<WritingCollection articles={[crossPlatformArticle, toolingArticle]} />);
  fireEvent.click(screen.getByRole("button", { name: "前端工程" }));
  expect(screen.getByText(toolingArticle.title)).toBeInTheDocument();
  expect(screen.queryByText(crossPlatformArticle.title)).not.toBeInTheDocument();
});
```

- [ ] **Step 5：替换文章列表页面**

`app/writing/page.tsx` 保留服务器端读取和 RSS 原生 `<a>`，将 `articles.map` 替换为：

```tsx
<WritingCollection articles={articles.map(({ meta }) => meta)} />
```

卡片不得显示阅读量；布局在桌面、平板、移动端分别为 3、2、1 栏。

- [ ] **Step 6：运行文章测试和构建**

Run: `npm test -- tests/article-presentation.test.ts tests/writing-components.test.tsx tests/routes.test.tsx && npm run build`

Expected: PASS；当前只有一个主题时页面不出现无效筛选栏。

- [ ] **Step 7：经用户授权后提交文章列表**

```bash
git add app/writing/page.tsx app/styles/components.css app/styles/pages.css components/WritingCollection lib/article-presentation.ts tests/article-presentation.test.ts tests/writing-components.test.tsx tests/routes.test.tsx
git commit -m "feat: add truthful article collection"
```

## Task 7：实现结构化文章目录和代码复制

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `lib/article-presentation.ts`
- Create: `components/ArticleToc/index.tsx`
- Create: `components/CodeBlock/index.tsx`
- Modify: `app/writing/[slug]/page.tsx`
- Modify: `app/styles/components.css`
- Modify: `app/styles/pages.css`
- Modify: `tests/article-presentation.test.ts`
- Modify: `tests/writing-components.test.tsx`

- [ ] **Step 1：安装结构化 Markdown 解析依赖**

Run:

```bash
npm_config_registry=https://registry.npmjs.org/ npm install github-slugger mdast-util-to-string rehype-slug remark-parse unified unist-util-visit
```

Expected: 依赖写入公开 registry lockfile；不使用正则表达式解析 Markdown 标题。

- [ ] **Step 2：编写目录提取失败测试**

```ts
it("从二级和三级标题生成稳定目录", () => {
  expect(
    extractArticleHeadings(`
## 先建立知识骨架
### ArkTS 与 ArkUI
## 先建立知识骨架
`),
  ).toEqual([
    { id: "先建立知识骨架", text: "先建立知识骨架", level: 2 },
    { id: "arkts-与-arkui", text: "ArkTS 与 ArkUI", level: 3 },
    { id: "先建立知识骨架-1", text: "先建立知识骨架", level: 2 },
  ]);
});
```

- [ ] **Step 3：使用 Unified 实现结构化提取**

导出类型和函数：

```ts
export type ArticleHeading = {
  id: string;
  text: string;
  level: 2 | 3;
};

export function extractArticleHeadings(source: string): ArticleHeading[];
```

实现使用 `unified().use(remarkParse).parse(source)`、`visit`、`mdast-util-to-string` 和单个 `GithubSlugger` 实例，确保目录 ID 与 `rehype-slug` 一致。

- [ ] **Step 4：实现目录显示和章节高亮**

`ArticleToc` 仅在 `headings.length >= 2` 时渲染。使用 Intersection Observer 观察对应标题 ID，当前项设置 `aria-current="location"`。Observer 不可用时保留可点击目录，不强制高亮。

- [ ] **Step 5：实现代码块复制组件**

`CodeBlock` 为客户端组件，使用容器 `ref.current?.innerText` 获取真实代码：

```tsx
const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

async function copyCode() {
  try {
    await navigator.clipboard.writeText(codeRef.current?.innerText ?? "");
    setStatus("copied");
  } catch {
    setStatus("failed");
  }
}
```

按钮文本必须分别为“复制代码”“已复制”“复制失败”，不能只改变颜色。

- [ ] **Step 6：接入文章详情页**

构建期执行：

```ts
const headings = extractArticleHeadings(article.content);
```

`MDXRemote` 配置 `rehypeSlug`，并通过 `components={{ pre: CodeBlock }}` 增强代码块。页面结构为正文主栏和可选目录侧栏；目录不存在时正文仍保持 `800px` 最大宽度。

- [ ] **Step 7：运行目录、复制和构建测试**

Run: `npm test -- tests/article-presentation.test.ts tests/writing-components.test.tsx && npm run lint && npm run build`

Expected: PASS；当前文章的真实标题生成可链接目录；没有代码块时不渲染复制按钮。

- [ ] **Step 8：检查 lockfile registry**

Run: `rg "bnpm\\.byted\\.org|registry\\.npm\\.byted" package-lock.json`

Expected: 无输出。

- [ ] **Step 9：经用户授权后提交文章详情**

```bash
git add package.json package-lock.json "app/writing/[slug]/page.tsx" app/styles/components.css app/styles/pages.css components/ArticleToc components/CodeBlock lib/article-presentation.ts tests/article-presentation.test.ts tests/writing-components.test.tsx
git commit -m "feat: enhance article reading experience"
```

## Task 8：统一项目、关于、联系与页脚视觉

**Files:**
- Modify: `app/work/page.tsx`
- Modify: `app/work/[slug]/page.tsx`
- Modify: `app/about/page.tsx`
- Modify: `app/contact/page.tsx`
- Modify: `components/Footer/index.tsx`
- Modify: `app/styles/components.css`
- Modify: `app/styles/pages.css`
- Modify: `tests/routes.test.tsx`

- [ ] **Step 1：编写真实内容边界失败测试**

在 `tests/routes.test.tsx` 增加：

```tsx
it("关于页使用能力演进结构且不推断年份经历", () => {
  const { container } = render(<AboutPage />);

  expect(screen.getByRole("heading", { name: "能力演进" })).toBeInTheDocument();
  expect(container).not.toHaveTextContent(/20\d{2}\s*[–-]\s*20\d{2}/);
});

it("文章与项目列表不展示阅读量或虚构指标", () => {
  const { container } = render(<WritingPage />);
  expect(container).not.toHaveTextContent(/阅读量|浏览量|合作客户|性能提升/);
});
```

- [ ] **Step 2：运行路由测试并确认能力演进断言失败**

Run: `npm test -- tests/routes.test.tsx`

Expected: FAIL，关于页尚无“能力演进”标题。

- [ ] **Step 3：重构关于页**

左栏保留介绍和技术标签，右栏使用现有数据组成三个无年份阶段：

1. 跨端界面：HarmonyOS、ArkTS、ArkUI。
2. 前端工程：TypeScript、React、Node.js、CLI、Monorepo。
3. 智能开发：AI Agent 与可验证交付原则。

不得新增公司、岗位年限和项目时间。

- [ ] **Step 4：统一项目和联系页面**

- 项目列表使用 `GlassCard` 视觉规则，但保留真实领域、标题和摘要。
- 项目详情与文章详情共享阅读宽度和正文排版，不引入项目截图占位。
- 联系页保留 GitHub、掘金和 RSS；禁用表单继续明确显示不可提交状态。
- 页脚增加 GitHub、掘金、RSS 和联系入口，链接保留文字标签。

- [ ] **Step 5：运行路由测试和完整单元测试**

Run: `npm test`

Expected: 所有 Vitest 测试 PASS；真实内容数量和公开边界断言不回归。

- [ ] **Step 6：经用户授权后提交内容页面**

```bash
git add app/work app/about app/contact components/Footer app/styles/components.css app/styles/pages.css tests/routes.test.tsx
git commit -m "feat: unify immersive content pages"
```

## Task 9：完善响应式、reduced-motion 与 E2E 验收

**Files:**
- Modify: `app/styles/base.css`
- Modify: `app/styles/components.css`
- Modify: `app/styles/pages.css`
- Modify: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1：扩展 E2E 主题和视口测试**

在现有控制台、失败请求和核心路由检查基础上增加：

```ts
test("主题切换持久化且不产生横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: /切换到.+模式/ }).click();

  const selectedTheme = await page.locator("html").getAttribute("data-theme");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", selectedTheme!);

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 900, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  }
});
```

- [ ] **Step 2：增加 reduced-motion 和移动端静态场景测试**

```ts
test("reduced-motion 和移动端不初始化 WebGL", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("static-celestial")).toBeVisible();
  await expect(page.getByTestId("webgl-celestial")).toHaveCount(0);

  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByTestId("static-celestial")).toBeVisible();
  await expect(page.getByTestId("webgl-celestial")).toHaveCount(0);
});
```

- [ ] **Step 3：写入响应式和运动降级 CSS**

写入以下确定规则：

```css
@media (max-width: 1023px) {
  :root {
    --section-gap: 4rem;
  }

  .article-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ambient-light {
    opacity: 0.67;
  }
}

@media (max-width: 767px) {
  :root {
    --page-gutter: 1rem;
    --section-gap: 3.5rem;
  }

  .article-grid,
  .immersive-hero,
  .about-layout {
    grid-template-columns: 1fr;
  }

  .ambient-light span {
    width: 18.75rem;
    height: 18.75rem;
    transform: none;
  }

  .button,
  .site-header a,
  .site-header button,
  .mobile-nav summary {
    min-height: 2.75rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }

  .reveal-section {
    opacity: 1;
    transform: none;
  }
}
```

若实施后的组件类名与上面不同，必须在同一步同步更新选择器和 E2E 断言，不能保留无匹配目标的规则。

- [ ] **Step 4：构建静态产物并运行完整 E2E**

Run: `npm run build && npm run test:e2e`

Expected: Playwright 全部 PASS；核心路由、主题、移动菜单、静态降级和无溢出断言通过。

- [ ] **Step 5：验证 RSS、Sitemap 和关键静态文件**

Run:

```bash
test -f out/index.html
test -f out/writing/index.html
test -f out/writing/harmonyos-next-learning-path/index.html
test -f out/rss.xml
test -f out/sitemap.xml
test -f out/robots.txt
```

Expected: 命令退出码为 0。

- [ ] **Step 6：经用户授权后提交响应式与 E2E**

```bash
git add app/styles tests/e2e/smoke.spec.ts
git commit -m "test: verify immersive responsive experience"
```

## Task 10：外部 Chrome 视觉验收与最终检查

**Files:**
- Modify only if verification finds a defect: files owned by the failing task

- [ ] **Step 1：运行完整质量门禁**

Run:

```bash
npm run lint
npm test
npm run build
npm run test:e2e
```

Expected: 四条命令全部退出码为 0。

- [ ] **Step 2：启动静态导出服务器**

Run: `npm run start`

Expected: `http://127.0.0.1:3000` 可访问，服务保持运行直到浏览器验收结束。

- [ ] **Step 3：使用外部 Chrome 和 Chrome DevTools 验收桌面端**

在 `1440 × 900` 检查：

- 深色首页出现唯一星体主体和沿曲线运动的磁场粒子。
- 首屏文字在 Three.js 加载前可见。
- 导航滚动后进入玻璃状态。
- 首页后续区域降低光效强度。
- 文章正文宽度不超过 800px，目录不压缩正文。
- Console 无 error；Network 无意外 4xx/5xx。

- [ ] **Step 4：验收平板与移动端**

在 `900 × 900` 检查双栏内容和降低后的环境光；在 `390 × 844` 检查：

- 汉堡菜单、主题切换和所有触控目标可用。
- 首页使用静态星体，不存在 WebGL Canvas。
- 卡片单栏，无横向溢出。
- 正文、代码块和长链接不溢出视口。

- [ ] **Step 5：验收浅色和 reduced-motion**

- 浅色首页使用 CSS 柔光体，不初始化 WebGL。
- reduced-motion 下没有粒子、自转、视差和内容位移。
- 主题切换、链接、目录和复制按钮仍提供非颜色状态反馈。

- [ ] **Step 6：保存验收证据**

保存以下四张截图：

- `/tmp/immersive-home-dark-desktop.png`
- `/tmp/immersive-home-light-desktop.png`
- `/tmp/immersive-writing-desktop.png`
- `/tmp/immersive-home-mobile.png`

记录 Console、Network、视口和 reduced-motion 结果；若发现缺陷，返回对应任务做最小修复并重跑相关测试。

- [ ] **Step 7：检查最终变更范围**

Run:

```bash
git status --short
git diff --check
git diff --stat
```

Expected:

- 没有 `.env*`、截图、`out/`、测试临时文件或 `.superpowers/` 被纳入产品变更。
- `git diff --check` 无输出。
- 每个变更文件均可追溯到本计划任务。

- [ ] **Step 8：经用户授权后创建最终提交或 PR**

默认停止在已验证但未提交状态。只有用户明确授权后，才创建缺失提交、推送功能分支或创建 PR。

## 最终验收矩阵

| 规范要求 | 实施任务 | 验证方式 |
|---|---|---|
| 浅色/深色主题与持久化 | Task 1 | Vitest、Playwright |
| 统一视觉变量与玻璃降级 | Task 2 | 构建、浏览器 |
| 滚动玻璃导航和移动菜单 | Task 3 | 组件测试、Playwright |
| 深色桌面星体磁场 | Task 4 | 组件测试、Chrome DevTools |
| 浅色、移动端、reduced-motion 静态降级 | Task 4、9 | Vitest、Playwright |
| 首页内容强弱节奏 | Task 5 | 首页测试、截图 |
| 真实文章筛选和响应式网格 | Task 6 | Vitest、Playwright |
| 结构化目录和代码复制 | Task 7 | Vitest、浏览器 |
| 项目、关于、联系真实内容边界 | Task 8 | 路由测试 |
| WCAG 焦点、非颜色反馈和 44px 触控目标 | Task 2、3、9 | 浏览器、键盘验收 |
| RSS、Sitemap、静态导出无回归 | Task 9、10 | 构建产物检查 |
| 控制台、网络和横向溢出无错误 | Task 9、10 | Playwright、Chrome DevTools |
