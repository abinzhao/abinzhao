---
title: 从行为测试到浏览器验收
description: 在独立 React 项目中配置 Vitest、Testing Library 和 Playwright，验证真实失败路径。
---

# 从行为测试到浏览器验收

## 学习目标与测试分层

本节建立三层证据：纯函数验证规则，RTL 验证组件交互，Playwright 验证真实浏览器集成。
通过一次有意破坏规则再恢复的实验，证明测试能失败，而不是“运行了几个永远为真的断言”。
沿用[React 章节](../react/components-state.md)的 react-lab，以下是本节独立的完整邮箱例子。

Vitest 是测试执行器；React Testing Library（RTL）从用户可见 DOM 操作组件，不是另一个执行器。
jsdom 提供模拟 DOM，没有真实布局、绘制和完整导航；端到端测试才适合验证浏览器焦点与页面刷新。
优先测试高风险规则和关键用户路径；不要为每个实现细节写快照，重构不应使合法行为测试全部失效。

## 1. 安装与隔离配置

以下命令只在 `react-lab` 运行，不修改教程站点依赖：

```bash
npm install -D vitest jsdom @testing-library/react @testing-library/dom @testing-library/user-event @testing-library/jest-dom @playwright/test
npx playwright install chromium
```

React、ReactDOM、TS 和 `@vitejs/plugin-react` 来自 react-ts 模板。安装后保留并提交练习项目锁文件。
以包的 engines 和 peerDependencies 核对 Node/React 兼容性；不要在版本冲突时使用 force 绕过。
创建下列配置。Vitest 只收集 src 内测试，避免把 Playwright 的 spec 交给错误执行器。

::: code-group
```ts [vitest.config.ts]
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
```

```ts [src/test/setup.ts]
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(() => cleanup());
```

```ts [playwright.config.ts]
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:5173', browserName: 'chromium' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
  },
});
```
:::

E2E 前停止手动运行的 5173 服务；strictPort 确保端口占用时失败，而不是悄悄换端口测试了另一个应用。
这里测试开发服务，不证明生产打包与托管正确；生产验收要在练习项目构建后测试预览或实际托管地址。

## 2. 被测代码也必须完整

保留模板 `index.html` 中的 root 节点，替换以下文件。成功反馈仅在内存中，刷新后必须消失。

::: code-group
```ts [src/validation.ts]
export function validateEmail(value: string): string {
  const email = value.trim();
  if (!email) return '请输入邮箱';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '邮箱格式不正确';
  return '';
}
```

```tsx [src/App.tsx]
import { useRef, useState } from 'react';
import { validateEmail } from './validation';
export default function App() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const field = useRef<HTMLInputElement>(null);
  return <main>
    <h1>邮箱确认</h1>
    <form noValidate onSubmit={(event) => {
      event.preventDefault();
      const message = validateEmail(email);
      setError(message);
      setSaved(message ? '' : `本地已确认：${email.trim()}`);
      if (message) field.current?.focus();
    }}>
      <label htmlFor="email">邮箱</label>
      <input id="email" ref={field} type="email" required value={email}
        aria-invalid={Boolean(error)} aria-describedby={error ? 'error' : undefined}
        onChange={(event) => { setEmail(event.target.value); setError(''); setSaved(''); }} />
      {error && <p id="error" role="alert">{error}</p>}
      <button type="submit">确认邮箱</button>
      <p role="status">{saved}</p>
    </form>
  </main>;
}
```

```tsx [src/main.tsx]
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
const root = document.getElementById('root');
if (!root) throw new Error('缺少 #root');
createRoot(root).render(<StrictMode><App /></StrictMode>);
```
:::

## 3. 行为测试：输入、操作、断言

::: code-group
```ts [src/validation.test.ts]
import { expect, test } from 'vitest';
import { validateEmail } from './validation';
test.each([
  ['', '请输入邮箱'],
  ['   ', '请输入邮箱'],
  ['abc', '邮箱格式不正确'],
  ['reader@example.com', ''],
  [' reader@example.com ', ''],
])('验证 %j', (input, expected) => {
  expect(validateEmail(input)).toBe(expected);
});
```

```tsx{10-12} [src/App.test.tsx]
import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
test('非法邮箱拒绝，修正后成功，继续编辑会清除旧确认', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText('邮箱'), 'abc');
  await user.click(screen.getByRole('button', { name: '确认邮箱' }));
  expect(screen.getByRole('alert')).toHaveTextContent('邮箱格式不正确');
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
  await user.clear(screen.getByLabelText('邮箱'));
  await user.type(screen.getByLabelText('邮箱'), 'reader@example.com');
  await user.click(screen.getByRole('button', { name: '确认邮箱' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('本地已确认：reader@example.com');
  await user.type(screen.getByLabelText('邮箱'), 'x');
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});
```

```ts [e2e/email.spec.ts]
import { expect, test } from '@playwright/test';
test('真实浏览器提交、焦点、修正与刷新', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '确认邮箱' }).click();
  await expect(page.getByRole('alert')).toHaveText('请输入邮箱');
  await expect(page.getByLabel('邮箱')).toBeFocused();
  await page.getByLabel('邮箱').fill('abc');
  await page.getByRole('button', { name: '确认邮箱' }).click();
  await expect(page.getByRole('alert')).toHaveText('邮箱格式不正确');
  await page.getByLabel('邮箱').fill('reader@example.com');
  await page.getByRole('button', { name: '确认邮箱' }).click();
  await expect(page.getByRole('status')).toHaveText('本地已确认：reader@example.com');
  await page.reload();
  await expect(page.getByLabel('邮箱')).toHaveValue('');
  await expect(page.getByRole('status')).toBeEmpty();
});
```
:::

执行 `npx vitest run`，应通过 5 个规则用例与 1 个组件用例；执行 `npx playwright test`，应通过 1 个浏览器用例。
把 validation 中格式判断的返回临时删除，规则、组件和 E2E 都应因接受 abc 而失败，恢复后重新运行。
把 onChange 中 setSaved 删除，RTL 的最后断言应失败；这比只断言“按钮存在”更能防回归。

## 4. 排错、练习与验收

`document is not defined` 要核对 jsdom 配置；jest-dom matcher 不存在要核对 setupFiles 和 vitest 专用导入。
userEvent 是异步交互，要 await；异步结果用 findBy 或 Playwright 可重试断言，不用固定 sleep。
不要 mock 被测验证函数，否则规则变坏组件测试也可能通过；本例没有网络，不需要虚构 fetch。
浏览器未安装就安装所需 Chromium；端口占用先查进程，不用 reuseExistingServer 接入未知页面。
练习：补 RTL 空提交焦点断言，再用上一节路由例增加“点击表单、后退、前进”的 E2E。
验收：测试标题描述用户行为；破坏规则时真实失败；恢复通过；用角色/标签定位；区分 jsdom 与真实浏览器证据。

## 官方资料

- [Vitest 环境配置](https://vitest.dev/config/environment) 与 [Vitest 入门](https://vitest.dev/guide/)
- [Testing Library 查询优先级](https://testing-library.com/docs/queries/about/) 与 [user-event](https://testing-library.com/docs/user-event/intro/)
- [Playwright Web Server](https://playwright.dev/docs/test-webserver) 与 [断言](https://playwright.dev/docs/test-assertions)

下一节：[性能与可访问性](../performance/accessibility.md)。
