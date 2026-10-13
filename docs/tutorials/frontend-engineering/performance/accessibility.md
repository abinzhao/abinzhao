---
title: 性能、懒加载与可访问性
description: 用真实指标理解分包与缓存，并实现包含错误恢复、焦点和语义的完整懒加载流程。
---

# 性能、懒加载与可访问性

## 学习目标与测量边界

本节把一个非首屏必需的复习面板延后加载，并保证等待、失败、打开和关闭都能被键盘用户理解。
你要观察“资源什么时候请求”和“用户什么时候能使用”，不能用包大小下降替代体验结论。
沿用 react-lab；只在这个练习项目安装 `npm install web-vitals`，不增加路由依赖。

Core Web Vitals 当前包括 LCP（主要内容出现）、INP（交互到下一帧的响应）和 CLS（非预期布局移动）。
良好阈值分别为 LCP ≤ 2.5 秒、INP ≤ 200 毫秒、CLS ≤ 0.1；真实流量按移动/桌面分别看第 75 百分位。
Lighthouse 的 TBT 是实验室辅助信号，不等于真实 INP；一次本地跑分也不是线上 P75。
记录相同设备、网络、页面路径、缓存状态和交互，再做前后对比，避免把测量噪声当优化成果。

## 1. 分包减少首屏工作，不消灭总成本

静态 import 通常进入启动依赖图；动态 import 建立异步边界，生产构建可以生成单独 chunk。
用户仍要在稍后下载、解析和执行它；过度分包会引入请求开销、依赖瀑布与等待状态。
首屏主内容不应为追求分包而延迟，LCP 图片也通常不应 lazy；非关键面板更适合作为边界。
React.lazy 需要模块 default export，必须在组件外声明，并由 Suspense 处理等待、错误边界处理失败。
这个小例主要验证机制，不承诺明显节省体积或达成全部 CWV；收益应以真实功能代码测量。

## 2. 完整懒加载示例

保留模板 index.html 的 root 节点，替换以下文件。面板是普通内联 section，不是模态框，不需要焦点陷阱。

::: code-group
```tsx [src/main.tsx]
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { startMetrics } from './metrics';
import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('缺少 #root');
startMetrics();
createRoot(root).render(<StrictMode><App /></StrictMode>);
```

```ts [src/metrics.ts]
import { onCLS, onINP, onLCP } from 'web-vitals';

export function startMetrics() {
  const log = (metric: { name: string; value: number }) => {
    console.info(`[体验指标] ${metric.name}: ${metric.value}`);
  };
  onCLS(log);
  onINP(log);
  onLCP(log);
}
```

```tsx{4} [src/App.tsx]
import { Component, lazy, Suspense, useRef, useState } from 'react';
import type { ReactNode } from 'react';

const Review = lazy(() => import('./Review'));
class LoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return (
      <div role="alert">
        <p>复习面板加载失败，请检查网络后重新加载页面。</p>
        <button type="button" onClick={() => window.location.reload()}>重新加载页面</button>
      </div>
    );
    return this.props.children;
  }
}
export default function App() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <>
      <a className="skip" href="#main">跳到主要内容</a>
      <main id="main" tabIndex={-1}>
        <h1>工程化学习记录</h1>
        <p>先完成类型检查和测试，需要时再打开复习面板。</p>
        <button type="button" ref={trigger} aria-expanded={open} aria-controls="review-slot"
          onClick={() => { if (open) close(); else setOpen(true); }}>
          {open ? '关闭复习面板' : '打开复习面板'}
        </button>
        <div id="review-slot" className="panel">
          {open && <LoadBoundary>
            <Suspense fallback={<p role="status">正在加载复习面板</p>}>
              <Review onClose={close} />
            </Suspense>
          </LoadBoundary>}
        </div>
      </main>
    </>
  );
}
```

```tsx [src/Review.tsx]
import { useEffect, useRef, useState } from 'react';

const topics = ['类型边界', '副作用清理', '行为测试'];
export default function Review({ onClose }: { onClose: () => void }) {
  const [done, setDone] = useState<string[]>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return (
    <section aria-labelledby="review-heading">
      <h2 id="review-heading" ref={heading} tabIndex={-1}>复习清单</h2>
      <p role="status">已完成 {done.length} / {topics.length}</p>
      {topics.map((topic) => (
        <label key={topic}>
          <input type="checkbox" checked={done.includes(topic)} onChange={(event) => {
            const checked = event.target.checked;
            setDone((previous) => checked ? previous.concat(topic) : previous.filter((item) => item !== topic));
          }} />
          {topic}
        </label>
      ))}
      <button type="button" onClick={onClose}>完成并关闭</button>
    </section>
  );
}
```

```css [src/style.css]
body { margin: 0; font: 1rem/1.6 system-ui, sans-serif; color: #18243a; background: #fff; }
main { max-width: 44rem; margin: 2rem auto; padding: 1rem; }
button, input { font: inherit; }
button { min-height: 2.75rem; padding: 0.5rem 1rem; }
label { display: block; min-height: 2.75rem; }
.panel { min-block-size: 20rem; margin-block-start: 1rem; }
:focus-visible { outline: 3px solid #2457c5; outline-offset: 3px; }
.skip { position: absolute; left: 1rem; top: -5rem; padding: 0.5rem; background: #fff; }
.skip:focus { top: 0; }
```
:::

## 3. 键盘、焦点和 ARIA 的职责

打开后标题接受焦点，关闭后回到触发按钮；如果只移除面板，焦点可能掉到 body，用户会失去位置。
原生 button 提供 Enter/Space 行为，checkbox 提供勾选语义；ARIA 不会替 div 自动添加键盘事件。
`aria-expanded` 报告开合，`aria-controls` 始终指向存在的容器，status 提示等待与完成数量。
不要对整个页面设置 aria-live，容易反复朗读无关内容；不要隐藏所有 outline。
本例没有动效，不需要额外减弱动画逻辑；新增动画时要响应 prefers-reduced-motion。
预留面板高度减少加载后的移动，但内容超出预留空间仍可能移动，要在实际尺寸下测 CLS。

## 4. 缓存的所有者是服务器与浏览器

带内容 hash 的资源可用长期缓存，因为内容变化会产生新 URL；入口 HTML 应及时重新验证。
以下是托管服务器的响应头策略示意，不是 Vite 配置，也不是能在组件中设置的头：

```http [响应头策略]
# index.html
Cache-Control: no-cache
# 带内容 hash 的静态资源
Cache-Control: public, max-age=31536000, immutable
```

no-cache 表示允许存储但使用前重新验证，不等于 no-store；不得给敏感接口套用 public 缓存。
发布时入口和资源要一致，并保留旧 chunk 一段时间，否则已打开的旧页面可能请求已删除文件。
lazy 会缓存加载 Promise 和结果；失败后仅重新挂载相同 lazy 对象不保证重试，本例明确让用户整页重新加载。

## 5. 效果验证、故障与验收

只在自己的 react-lab 执行 `npm run build`、`npm run preview -- --host 127.0.0.1`，不要构建教程主站。
Network 禁用缓存并刷新：未点击时不应请求 Review chunk，点击后才请求；第二次打开通常复用已加载模块。
用慢速网络观察 status，再按 Tab/Enter 操作：加载完标题获焦，勾选可用，关闭返回按钮。
点击前先开启 Offline，面板应出现失败反馈；恢复网络后点击重新加载页面并再次打开应恢复。
web-vitals 的默认日志在指标生命周期节点输出，INP 需要实际交互，部分值在页面隐藏时报告；没有日志不等于 0。

白屏要检查 default export 与错误边界；没有分包要检查是否另处静态导入 Review；开发请求不能证明生产 chunk 结构。
练习：用浏览器请求阻止制造 chunk 失败，再恢复，记录成功和失败的键盘路径，不以固定等待时间验收。
验收：首次按需请求、可见等待和错误、可恢复加载、焦点去向正确、无横向溢出；测量条件与 CWV 未验证项写清楚。

## 官方资料

- [Core Web Vitals](https://web.dev/articles/vitals) 与 [web-vitals](https://github.com/GoogleChrome/web-vitals)
- [React lazy](https://react.dev/reference/react/lazy) 与 [Suspense](https://react.dev/reference/react/Suspense)
- [HTTP 缓存](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching) 与 [WAI 键盘可访问性](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html)

返回：[本阶段学习顺序与验收](../index.md)。
