---
title: 前端质量工程：Lint、类型检查与分层测试
description: 为预算实验项目建立 ESLint、TypeScript 和 Vitest 检查，验证纯逻辑、DOM 交互及失败边界。
type: tutorial
topic: modern-frontend
section: platform
order: 20
level: intermediate
status: published
tags:
  - ESLint
  - TypeScript
  - Vitest
  - 测试
prerequisites:
  - /tutorials/modern-frontend/toolchain.html
comments: true
---

# 前端质量工程：Lint、类型检查与分层测试

质量工具的价值不是在提交前显示一排绿色，而是让不同错误在合适的阶段暴露。Lint 检查可疑写法与约定，类型检查验证静态契约，单元测试验证输入输出，交互测试验证用户操作，真实浏览器验证布局与平台行为。本篇为前章预算实验项目建立一个可运行的最小质量链，不让某一种检查承担它无法证明的责任。

示例沿用[工具链入门](/tutorials/modern-frontend/toolchain.html)中的 `budget.ts`、`view.ts`、`main.ts` 与别名配置。推荐 Node 24，或者满足所用版本要求的 Node 22。当前 Vitest 官方入门文档有具体 Node 与 Vite 下限；安装前检查引擎与 peer 要求，不能任意混合不同主版本的配置示例。

## 先把完成标准转成可观察行为

预算函数的契约是非负整数分乘以一到九十九的整数数量，结果必须仍是安全整数。界面契约是提交数量后二十四元等正常结果可见，非法数量可见错误而不是页面刷新。公开说明链接和真实浏览器布局属于其他边界，不能仅凭函数测试证明它们正确。

按故障层级分配检查，可以避免把所有验证都放进慢而脆弱的端到端测试。纯计算测试不启动浏览器；DOM 交互测试使用模拟环境覆盖事件与文字反馈；关键浏览器路径再检查焦点、原生约束、网络和布局。后两层的目标不同，不应把 jsdom 当作一个真正进行绘制的浏览器。

覆盖率衡量代码被执行的程度，不衡量断言是否正确。一个测试遍历全部分支但从不检查输出，覆盖率仍可能很高。首先补正常、空值、边界、失败和恢复场景，再根据未覆盖信息寻找遗漏，不为提高数字去测试实现细节或删除困难分支。

## 安装工具并明确配置范围

仅在独立实验项目安装：

```bash
npm install -D eslint@9 @eslint/js@9 typescript-eslint@8 globals vitest jsdom
npm ls eslint @eslint/js typescript-eslint vitest vite jsdom
```

这里把 ESLint 与对应官方规则包放在同一主版本，使用支持平面配置的 TypeScript ESLint。Vitest、jsdom 和 Vite 的实际兼容版本由安装结果与锁文件确定，安装出现引擎或 peer 警告时应先核对，不能用强制忽略作为教程默认路线。

新增 `eslint.config.mjs`：

```js
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
);
```

平面配置按顺序合并匹配对象。只声明 `ignores` 的对象提供全局忽略；带其他字段的局部忽略有不同匹配责任，不应随意混用。浏览器源文件和 Node 配置文件使用不同全局对象，避免把 Node 的 `process` 当作所有客户端代码都能调用的变量。

这份配置采用非类型感知的推荐规则，TypeScript 编译器单独负责类型检查。需要类型感知规则时，应明确配置项目服务并测量成本，而不是复制一个不匹配当前 tsconfig 的配置。React 还要接入 Hook 规则与对应插件；Vue 单文件组件需要合适解析器与 Vue 规则，不能宣称此原生 TypeScript 配置已经检查了所有框架语义。

## 配置 Vitest 并复用别名

新增 `vitest.config.mjs`，复用前章的 Vite 配置，避免测试、编辑器和生产构建各指向一个不同目录：

```js
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.mjs';

export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
}));
```

jsdom 提供 DOM 模拟，便于验证本篇表单事件，但没有真实布局、完整浏览器网络栈或 GPU 渲染。纯逻辑项目可以默认用 Node 环境，再对界面文件选择 DOM 环境；这里统一使用 jsdom 是为了保持实验配置简单，不能由此得出所有测试都应该用同一环境。

`clearMocks` 清理调用记录，`restoreMocks` 恢复 spy 等修改，但不会替应用释放事件监听和定时器。被测模块创建资源时仍需要显式释放。本篇 `createBudgetView` 返回 `dispose`，测试调用它验证正常收尾，而不是依靠测试进程结束掩盖泄漏。

## 第一步：测试纯计算与边界

新增 `src/budget.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { calculateBudget } from '@/budget';

describe('calculateBudget', () => {
  it('计算整数金额并允许零单价', () => {
    expect(calculateBudget(1200, 2)).toBe(2400);
    expect(calculateBudget(0, 1)).toBe(0);
    expect(calculateBudget(1200, 99)).toBe(118800);
  });

  it.each([0, -1, 100, 1.5, Number.NaN])(
    '拒绝非法数量 %s',
    quantity => {
      expect(() => calculateBudget(1200, quantity)).toThrow();
    },
  );

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    '拒绝非法单价 %s',
    price => {
      expect(() => calculateBudget(price, 1)).toThrow();
    },
  );

  it('拒绝乘法结果超出安全整数', () => {
    expect(() => calculateBudget(Number.MAX_SAFE_INTEGER, 2)).toThrow(
      '总金额超出安全整数范围',
    );
  });
});
```

参数化测试覆盖多种非法输入，不依赖随机值。断言检查可观察返回值和拒绝行为，不检查局部变量名称或函数内部调用次数。错误文案只有在它确实属于用户反馈契约时才需要精确断言；内部异常细节可以检查类型或错误类别，减少无意义的重构阻力。

如果有意修改规则，例如允许零数量，先说明合法行为变化，再更新测试与实现。不能因为实现错了就把断言改成错误结果。对于缺陷，先运行失败用例确认它失败在目标条件，再实施最小修复，最后回归其他边界。

## 第二步：测试完整 DOM 操作

新增 `src/view.test.ts`。测试不会 mock 核心预算函数，真实输入路径会执行真实计算；否则表单测试可能只证明一个无意义替身返回了预定值。

```ts
import { afterEach, expect, it } from 'vitest';
import { createBudgetView } from '@/view';

let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});

it('提交数量后显示预算，并从非法输入恢复', () => {
  const view = createBudgetView();
  dispose = view.dispose;
  document.body.append(view.element);
  const input = view.element.querySelector<HTMLInputElement>('input');
  const output = view.element.querySelector('p');
  if (!input || !output) throw new Error('表单结构不完整');

  input.value = '2';
  view.element.dispatchEvent(new Event('submit', {
    bubbles: true,
    cancelable: true,
  }));
  expect(output.textContent).toBe('预算：¥24.00');

  input.value = '0';
  view.element.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(output.textContent).toContain('数量必须');

  input.value = '3';
  view.element.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(output.textContent).toBe('预算：¥36.00');
});

it('释放监听后不再响应提交', () => {
  const view = createBudgetView();
  dispose = view.dispose;
  document.body.append(view.element);
  const output = view.element.querySelector('p');
  view.dispose();
  view.element.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(output?.textContent).toBe('');
});
```

测试通过真实 DOM 元素读写与提交事件验证本篇协议，但人工派发事件并不等于模拟完整键盘或浏览器原生行为。复杂组件项目可使用 React 或 Vue 的测试库，通过角色和标签查询、用户事件驱动；网络请求应在请求边界 mock，并匹配真实响应结构，不能 mock 到连失败场景都不会发生。

异步测试应等待真实可观察结果，使用确定的 Promise 控制或假定时器管理时序，不写任意睡眠赌机器速度。取消竞态至少要覆盖先发后到、卸载、失败和恢复。只有正常响应测试，无法证明请求顺序变化之后仍然正确。

## 串成统一检查命令

在 `package.json` 的 `scripts` 对象中合并以下项，保留已有依赖与其他字段：

```json
{
  "lint": "eslint . --max-warnings=0",
  "typecheck": "tsc --noEmit",
  "test": "vitest",
  "test:run": "vitest run",
  "check": "npm run lint && npm run typecheck && npm run test:run",
  "build": "npm run typecheck && vite build"
}
```

日常开发的 `npm test` 进入监听模式，CI 和一次性验收使用 `npm run test:run`，否则任务可能一直等待文件变化。检查按顺序执行，前一个失败即停止，便于先处理快速的静态错误；大型 CI 可以并行独立检查，但最终必须合并结果后再决定是否发布。

执行：

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
```

预期 Lint 无警告、类型检查无错误、两个测试文件通过、生产构建生成产物。运行时保留第一处失败信息，区分配置不匹配、测试问题与真实实现缺陷。

## 浏览器验收与常见排错

启动开发或预览服务器后，实际使用键盘输入、提交和阅读错误，检查焦点、说明链接、控制台以及移动端是否溢出。jsdom 测试没有检查这些。端到端测试优先覆盖关键主路径与高风险恢复路径，不复制每个纯计算输入，否则增加成本却没有扩大有效风险覆盖。

Lint 找不到 TypeScript 文件，检查 `files` 匹配和解析器；配置脚本报未定义全局，确认它属于 Node 还是浏览器。测试别名报错，检查配置是否真的复用了 Vite 别名。测试一直运行，检查是否遗漏 `run`。时间相关用例不稳定，先检查未清理计时器与真实睡眠，而不是不断放宽超时时间。

类型检查未发现某个文件错误，检查 tsconfig 的 include、引用关系和实际命令。Vite 转换成功不意味着 tsc 执行过。React 的 Hook 依赖警告和 Vue 的属性修改警告也不能通过关闭规则规避，它们可能指向真实状态或生命周期缺陷。

## 面向框架应用选择相应检查

React 项目应把 JSX 和 Hook 语义放进对应检查配置，尤其是 Hook 调用顺序和 Effect 依赖。类型检查无法单独证明依赖完整，普通函数测试也不能证明组件卸载时取消了请求。对于异步查询，应通过组件挂载、输入变化和卸载验证可观察结果，再用独立模块测试数据转换与取消协议。

Vue 项目除了 TypeScript 源文件，还要检查单文件组件模板与脚本。常规 tsc 不完整理解所有 `.vue` 模板约束，通常需要项目采用的 Vue 类型检查工具；ESLint 也需要合适的 Vue 解析器和规则。原生 TypeScript 实验的命令可以作为责任分层参考，不能直接声称原封不动覆盖了框架所有文件。

Mock 应放在真实边界。外部 HTTP 可以用受控响应替代，组件内部纯计算尽量真实执行。假数据要包含真实结构需要的字段，失败场景要有明确的失败方式。只返回成功对象而没有错误、空结果和延迟变化，可能让测试无法发现加载状态和竞态问题。

当用例失败时，先判断它是否覆盖了当前需求，再看失败发生在实现、测试假设还是环境。环境缺少浏览器或依赖不兼容，应报告未验证，而不是删除用例；合法规则变化可以更新断言，但要说明新的可观察行为。最终报告分别列出静态检查、测试和浏览器结果，不能用一句“全部通过”混淆没有实际执行的部分。

## 练习与官方来源

练习一：先为负单价和数量一百写失败测试，再确认实现确实拒绝。练习二：增加总预算上限规则，更新纯函数、DOM 反馈和恢复路径。练习三：记录真实浏览器验收清单，将资源地址和焦点问题留给适合的层级，不用单元测试假装验证了布局。

之后阅读[构建与交付](/tutorials/modern-frontend/delivery.html)，让质量检查成为产物发布前的可审查门禁。

- [ESLint：平面配置文件](https://eslint.org/docs/latest/use/configure/configuration-files)
- [ESLint：命令行](https://eslint.org/docs/latest/use/command-line-interface)
- [Vitest：开始使用](https://vitest.dev/guide/)
- [Vitest：测试环境](https://vitest.dev/guide/environment)
- [Vitest：Mock](https://vitest.dev/guide/mocking)
- [Vite：TypeScript 转换边界](https://vite.dev/guide/features)
- [TypeScript ESLint：快速开始](https://typescript-eslint.io/getting-started/)
