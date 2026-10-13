---
title: TypeScript 类型与运行时边界
description: 用收窄、可辨识联合和泛型表达合法状态，用 unknown 验证外部数据。
---

# TypeScript 类型与运行时边界

## 学习目标

本节不是把每个变量标成类型，而是让非法状态更难表达，并把网络、存储、URL 的不可信值挡在边界。
完成后，你应能区分“类型检查证明了什么”和“必须运行才能知道什么”，并处理错误 JSON 而不让页面崩溃。
前置知识：对象、数组、函数、异常，以及上一节的独立 `tooling-lab` 项目。

## 1. 类型收窄来自控制流，不来自愿望

`string | number` 表示值可能是两者之一，使用共有能力之外的操作之前必须判断。
`typeof`、`in`、字面量比较和自定义类型守卫，能让编译器沿分支缩小候选集合。
`unknown` 可以接收任何值，但不能直接读取属性；`any` 则跳过这道检查并传播不确定性。
外部 JSON 应先进入 `unknown`，校验成功后才能进入应用类型。

`as User` 只是让编译器信任你，不会检查对象、生成字段或修复服务端响应。
TypeScript 类型会在生成 JavaScript 时擦除，因此运行时验证必须是真实的 JS 条件。
即使前后端共享类型，旧客户端、缓存、用户输入和服务故障仍会破坏约定。

## 2. 用联合表达互斥状态，用泛型保留关系

一个 `loading: boolean` 配上可空 `data`、可空 `error`，会允许“加载中同时成功且失败”。
可辨识联合让 `status` 决定允许出现的字段，消费者通过 `switch` 收窄。
泛型 `Result<T>` 表示成功值的类型与调用方有关，而不是把结果统一变成 `any`。
泛型不会凭空证明输入是 T；只有验证函数或已受约束的数据能提供这个证明。

在上一节项目中替换下面三个文件。保留模板 TS 配置，确保 `strict` 开启，执行 `npm run typecheck`。
这个例子无网络依赖；文本框模拟接口原始响应，故障输入可以稳定复现。

::: code-group
```html [index.html]
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>类型边界实验</title>
  </head>
  <body>
    <main>
      <h1>读取用户响应</h1>
      <form id="form">
        <label for="payload">JSON 响应</label>
        <textarea id="payload" rows="5">{"id":1,"name":"林舟"}</textarea>
        <button type="submit">验证并读取</button>
      </form>
      <p id="result" role="status"></p>
    </main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

```ts [src/types.ts]
export type User = { id: number; name: string };
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
export type LoadState<T> =
  | { status: 'idle' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseUser(value: unknown): Result<User> {
  if (!isRecord(value)) return { ok: false, error: '响应必须是对象' };
  const { id, name } = value;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) {
    return { ok: false, error: 'id 必须是正的安全整数' };
  }
  if (typeof name !== 'string' || name.trim().length === 0) {
    return { ok: false, error: 'name 必须是非空字符串' };
  }
  return { ok: true, value: { id, name: name.trim() } };
}

export function mapResult<A, B>(
  result: Result<A>, transform: (value: A) => B,
): Result<B> {
  if (!result.ok) return result;
  return { ok: true, value: transform(result.value) };
}

function assertNever(value: never): never {
  throw new Error(`未处理状态：${JSON.stringify(value)}`);
}

export function describe(state: LoadState<string>): string {
  switch (state.status) {
    case 'idle': return '等待输入';
    case 'success': return state.data;
    case 'error': return `读取失败：${state.message}`;
    default: return assertNever(state);
  }
}
```

```ts{14-17} [src/main.ts]
import { describe, mapResult, parseUser } from './types';
import type { LoadState } from './types';

const form = document.querySelector<HTMLFormElement>('#form');
const input = document.querySelector<HTMLTextAreaElement>('#payload');
const output = document.querySelector<HTMLParagraphElement>('#result');
if (!form || !input || !output) throw new Error('页面缺少必需节点');
const field = input;
const resultNode = output;
resultNode.textContent = describe({ status: 'idle' });
form.addEventListener('submit', (event) => {
  event.preventDefault();
  let state: LoadState<string>;
  try {
    const raw: unknown = JSON.parse(field.value);
    const result = mapResult(parseUser(raw), (user) => `${user.id}：${user.name}`);
    state = result.ok
      ? { status: 'success', data: result.value }
      : { status: 'error', message: result.error };
  } catch (error: unknown) {
    state = {
      status: 'error',
      message: error instanceof Error ? error.message : '未知异常',
    };
  }
  resultNode.textContent = describe(state);
});
```
:::

`isRecord` 的返回类型是类型谓词；编译器相信谓词，因此实现本身必须严谨。
先排除 `null` 是因为 `typeof null === 'object'`；排除数组是因为数组也属于对象。
验证后重建 `{ id, name }`，只让约定字段进入应用，避免把整个外部对象当作内部模型。
这只是本例的数据规则，不代表名称必须适用于所有产品；业务要求变化时应同步改验证和测试。

## 3. 效果验证：让类型错误与数据错误各就各位

运行 `npm run dev`。默认输入提交后应显示 `1：林舟`。
依次输入 `null`、`[]`、`{"id":"1","name":"林舟"}`、`{"id":1,"name":" "}`，都应出现可读错误。
再输入单独的 `{`，应走 JSON 解析异常分支，表单仍能继续使用。
不要断言 JSON 语法错误的完整文案，浏览器可能提供不同措辞；断言错误状态和恢复能力即可。

临时把 `transform(result.value)` 改成读取 `result.error`，类型检查应失败，因为当前分支是成功分支。
恢复后，在 `LoadState` 新增 `loading` 分支但不修改 `describe`，`assertNever(state)` 应触发检查错误。
这证明 `never` 检查的是穷尽性，而不是把错误强转后藏起来。
泛型函数中的 `transform` 如果抛错，本例由外层 `catch` 处理；`mapResult` 不承诺自动捕获所有异常。

## 4. 常见失败与取舍

| 错误做法 | 为什么失败；怎样修复 |
| --- | --- |
| `JSON.parse(text) as User` | 断言没有运行时代码；先进入 unknown，再逐项校验 |
| 用 `if (value)` 代替数值校验 | 合法的 0 也是假值；使用明确的类型和范围判断 |
| 只检查 `typeof id` | NaN、Infinity 也是 number；补有限性或安全整数检查 |
| 给所有字段加 `?` | 读取方被迫处理大量不合理组合；用联合表达真实状态 |
| 断言 `state as never` | 取消穷尽性证明；直接把已收窄的 state 传给函数 |

小模型手写校验便于理解；大型嵌套协议可选择 schema 库，代价是依赖、学习成本和规则维护。
静态类型、运行时校验、行为测试负责不同问题，任何一个都不能替代其他两个。
DOM 查询中的类型参数也不验证 HTML 标签；本例同时检查节点存在，并保证 HTML 与脚本由我们共同控制。

## 练习与验收

给 User 增加 `role: 'reader' | 'editor'`，在 `parseUser` 验证字面量，再让成功文字包含角色。
验收：两个合法角色成功；缺字段、未知角色和数字角色失败；JSON 语法错误后能重新提交成功。
再新增 loading 状态并补齐 `describe`，确认删除相应分支后类型检查会失败。
说明验收证据分别来自编译器和运行时，不能仅记录“没有红线”。

## 官方资料

- [TypeScript 收窄](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
- [TypeScript 泛型](https://www.typescriptlang.org/docs/handbook/2/generics.html)
- [类型断言与 unknown](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html)

下一节：[React 组件与状态](../react/components-state.md)。
