---
title: 受控表单与浏览器路由
description: 从字段状态和错误反馈到 URL、history、popstate，不依赖 router 实现教学路由。
---

# 受控表单与浏览器路由

## 学习目标与范围

本节把“填写、校验、提交、切换页面、后退”连成完整流程。
你会实现一个两页客户端应用，并区分表单 state、URL state 和需要服务端保存的业务数据。
沿用 `react-lab`，不安装路由库；保留上一节完整的 `src/main.tsx` 与模板 `index.html`。
替换下面两个文件即可运行。示例提交只更新本地反馈，不声称数据已发送或持久保存。

## 1. 表单的事实来源只能有一个

受控输入通过 `value` 从 state 读取值，通过 `onChange` 把输入写回 state。
初始化为 `''` 而不是 undefined，避免从非受控切到受控；复选框则由 checked 和布尔状态控制。
验证函数返回错误，不负责导航、请求或 DOM 操作，便于独立测试。
本例提交时校验，字段修改时清除已过期错误；产品也可选择 blur 校验，但不应每个按键都打断用户。

客户端校验改善体验，不能防恶意请求。真实服务端必须再次校验、鉴权，并防重复提交。
`noValidate` 让演示统一走自己的错误反馈；若采用浏览器原生约束，就要理解两套验证的顺序和表现差异。
邮箱规则仅供练习，不是完整邮箱标准，也不证明地址属于当前用户。

## 2. URL 是可分享的状态，history 是导航记录

`pathname` 决定页面，`search` 可保存筛选或来源；不要把密码、令牌和敏感表单内容放进 URL。
`pushState` 增加同源历史项，`replaceState` 替换当前项，两者都不会主动触发 popstate。
浏览器后退/前进的历史遍历会触发 popstate；监听后要重新读取 URL，不只信任 event.state。
路由更新要同时改变地址栏与 React 状态，否则“URL 改了页面没改”。

::: code-group
```ts [src/validation.ts]
export function validateEmail(value: string): string {
  const email = value.trim();
  if (email.length === 0) return '请输入邮箱';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '邮箱格式不正确';
  return '';
}
```

```tsx{56-60} [src/App.tsx]
import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { validateEmail } from './validation';

function Signup() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const input = useRef<HTMLInputElement>(null);
  return (
    <form noValidate onSubmit={(event) => {
      event.preventDefault();
      const message = validateEmail(email);
      setError(message);
      setSaved('');
      if (message) {
        input.current?.focus();
        return;
      }
      setSaved(`本地已确认：${email.trim()}`);
    }}>
      <label htmlFor="email">邮箱</label>
      <input id="email" ref={input} type="email" autoComplete="email"
        required value={email} aria-invalid={Boolean(error)}
        aria-describedby={error ? 'email-error' : undefined}
        onChange={(event) => {
          setEmail(event.target.value);
          setError('');
          setSaved('');
        }} />
      {error && <p id="email-error" role="alert">{error}</p>}
      <button type="submit">确认邮箱</button>
      <p role="status">{saved}</p>
    </form>
  );
}

function readLocation(): string {
  return window.location.pathname + window.location.search;
}

export default function App() {
  const [location, setLocation] = useState(readLocation);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const sync = () => setLocation(readLocation());
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  const url = new URL(location, window.location.origin);
  const path = url.pathname;
  function follow(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey ||
      event.ctrlKey || event.shiftKey || event.altKey) return;
    const next = new URL(event.currentTarget.href);
    if (next.origin !== window.location.origin) return;
    event.preventDefault();
    if (next.pathname + next.search === location) return;
    window.history.pushState(null, '', next);
    setLocation(readLocation());
  }
  const title = path === '/' ? '学习首页' : path === '/form' ? '邮箱练习' : '页面不存在';
  useEffect(() => {
    document.title = title;
    heading.current?.focus();
  }, [location, title]);
  return (
    <main>
      <nav aria-label="主导航">
        <a href="/" onClick={follow} aria-current={path === '/' ? 'page' : undefined}>首页</a>
        {' | '}
        <a href="/form?source=nav" onClick={follow}
          aria-current={path === '/form' ? 'page' : undefined}>邮箱练习</a>
      </nav>
      <h1 ref={heading} tabIndex={-1}>{title}</h1>
      {path === '/' && <p>选择邮箱练习，填写后再使用浏览器后退。</p>}
      {path === '/form' && (
        <section aria-label="邮箱表单">
          <p>来源：{url.searchParams.get('source') || '直接访问'}</p>
          <Signup />
        </section>
      )}
      {path !== '/' && path !== '/form' && <p>请通过上方首页链接返回。</p>}
    </main>
  );
}
```
:::

两个页共用入口，只有匹配路由时才挂载 Signup；离开表单会卸载，回来字段为空，这是本例的明确取舍。
需要保留草稿时把状态提升到共同父组件，或按非敏感数据规则存储；不要误以为 history 会替你保存 React state。
焦点移到新页标题后，键盘用户知道导航已完成；标题用 `tabIndex={-1}` 接受程序焦点，但不增加常规 Tab 停靠点。
字段错误将焦点放回输入，`aria-describedby` 提供关联，role alert 提供即时错误提示。

## 3. 为什么仍使用 a，不改成可点击 div

链接保留 href，使复制地址、键盘 Enter、新标签页和无脚本退化行为仍有语义。
本例只截获当前窗口普通点击，Ctrl/Command/Shift/Alt 点击交给浏览器。
这里只使用没有 target/download 的同源链接；若封装通用 Link，还需排除 `_blank`、download 和特殊协议。
路由器还可能承担 hash、滚动恢复、嵌套页面、参数匹配、加载器、错误边界和 SSR，本例都不声称支持。

`pushState` 只能导航到同源 URL，不会下载新页面；它本身也不会提供部署服务器的路径回退。
Vite 开发服务器通常提供 SPA 回退。正式托管必须把 `/form` 等应用路径回退到入口 HTML，同时正确处理静态资源。
否则点击导航正常，但刷新 `/form` 返回 404。这是服务配置问题，不应通过捕获所有错误掩盖。
本例基于域名根路径；部署在子路径时需要统一 base 和链接前缀，不要直接照搬 `/form`。

## 4. 效果验证

运行 `npm run dev`，从 `/` 点击邮箱练习，地址应带 `/form?source=nav`，焦点应位于新标题。
空提交出现“请输入邮箱”；输入 `abc` 出现格式错误并聚焦输入；输入 `reader@example.com` 后显示本地确认。
编辑已确认邮箱，成功提示应清空，不能让旧提示声称新值已经确认。
按后退回首页、前进回表单，页面与地址栏必须一致；重新挂载的输入为空。
Ctrl/Command 点击链接应开新标签；直接输入 `/unknown` 应显示应用内“页面不存在”。
刷新 `/form?source=direct`，开发服务应显示表单及 direct 来源，而不是错误地跳回首页。

## 5. 常见失败与修复

| 现象 | 原因与修复 |
| --- | --- |
| URL 变化，页面不变 | 只调用 pushState；主动同步框架状态 |
| 后退不更新 | 没监听 popstate 或缺 cleanup；配对注册和移除 |
| 每次点击增加重复历史项 | 导航到当前 URL 也 push；先比较目标地址 |
| 表单提交后整页刷新 | 没 preventDefault，或 button 类型不对 |
| 错误只能看到不能听到 | 缺标签关联、错误描述或焦点管理；补原生语义和 ARIA |

不要用 effect 监听每个字段来模拟 submit；提交是明确的用户事件，应在 onSubmit 中处理。
真实异步提交还需要 pending、失败重试、重复点击保护以及服务端错误映射，本例没有伪造网络成功。

## 练习与验收

增加 `/help` 页面，并在导航中加入真实链接；不新增 router 依赖。
验收：直达、普通点击、刷新、后退/前进都匹配页面；未知路径有兜底；导航更新 document.title 和焦点。
再增加“昵称”字段，要求 trim 后非空。验收空提交聚焦第一个错误字段，合法值才显示成功反馈。
对照下一节测试教程，写出能因删除 preventDefault 或放宽邮箱规则而失败的验证步骤。

## 官方资料

- [React input](https://react.dev/reference/react-dom/components/input)
- [MDN History API](https://developer.mozilla.org/en-US/docs/Web/API/History_API)
- [MDN popstate](https://developer.mozilla.org/en-US/docs/Web/API/Window/popstate_event)
- [WAI 表单错误反馈](https://www.w3.org/WAI/tutorials/forms/notifications/)

下一节：[Vue 响应式机制与 React 对照](../vue/reactivity.md)。
