---
title: TypeScript 数据边界：unknown、运行时验证与错误分类
description: 将不可信 JSON 解析为领域类型，建立可观察的结构验证与失败边界。
type: tutorial
topic: typescript
section: frontend
order: 30
level: advanced
status: published
tags:
  - TypeScript
  - unknown
  - 运行时验证
  - 数据边界
prerequisites:
  - /tutorials/typescript/types.html
  - /tutorials/typescript/applications.html
comments: true
---

# TypeScript 数据边界：unknown、运行时验证与错误分类

网络响应、文件内容、存储记录和用户输入都来自类型检查器无法完整观察的世界。把它们断言成某个接口，只是告诉编译器相信你，并没有改变数据。本篇把 JSON 文本转成学习计划，采用 `unknown`、显式结构验证和判别结果，让静态类型建立在运行时证据之上，而不是建立在调用方的愿望之上。

## 前置知识与适用范围

先学习 [类型建模](./types.html) 与 [工程配置](./applications.html)，理解联合收窄、泛型和编译输出。练习使用已有 TypeScript 编译器和 Node.js，建立独立的 CommonJS 学习目录，入口为 `boundaries.ts`。不要直接复用上一章声明了 `"type": "module"` 的目录；如果使用那个 ESM 工程，应遵循其工程编译方式。

本文使用严格模式、`unknown`、类型谓词、判别联合和普通标准 JavaScript，目标 ES2020，不要求最新版本或外部验证库。示例全部输入都是虚构内存文本，不访问真实接口，不读取敏感记录。手写解析器适合这个小而稳定的模型，复杂工程可以采用现有 schema 工具，但不能仅为了短示例引入新的依赖和多套契约。

## unknown 为什么比 any 更适合边界

`unknown` 表示当前不知道值是什么。在确定类型前，你不能随意读取属性或调用方法，必须通过检查建立证据。`any` 则让相关操作绕过检查，并可能把这种不确定性传播给后续代码。边界越靠近不可信输入，越需要明确的不确定，而不是暂时获得一个看起来方便的类型。

`JSON.parse()` 能确认文本是合法 JSON，但不能确认它满足业务接口。一个数值、一份数组、缺少字段的对象都可能合法。应把解析结果显式接到 `unknown`，再交给解析函数；不要在读取后立即断言成领域类型。类型断言在编译后不会保留为验证代码，因此不能保护运行时行为。

结构正确也不等于业务合法。字符串类型的标识可能为空，数值类型的分钟数可能是负数，多个任务可能使用重复标识。静态类型能描述某些关系，但像长度、整数范围、唯一性通常需要运行时检查。本例会同时检查基础形状和局部业务约束，再生成新的领域对象。

## 解析器为什么应返回经过规范化的新对象

验证函数可以只回答真假，也可以在成功时返回处理后的值。这里采用解析器：检查后裁剪标题首尾空白，复制需要的字段，忽略无关附加字段。业务代码拿到的对象因此来自明确构造过程，而不是继续持有任意输入对象的全部属性。是否允许额外字段应由契约决定，不是所有系统都必须拒绝它们。

类型谓词能帮助控制流收窄，但谓词的实现同样可能写错。写出 `value is Plan` 并不意味着编译器会自动证明所有字段都检查了。因此本篇只提供基础对象谓词，后续按字段逐项验证并构造返回值，避免用一个过度宽泛的谓词隐藏检查遗漏。

数据规模也有边界。数组项目数限制可以减少后续业务遍历，但无法阻止一个超大文本在 `JSON.parse()` 前已经占用内存。真实接口需要响应体限制、超时和服务器配合，文件导入需要大小约束；本例不假装单个结构解析器解决所有资源与安全问题。

## 第一步：定义领域类型与基础检查

在 `boundaries.ts` 写入下面代码。任务只允许排队或完成状态，分钟数限制为 1 到 240 的整数，标题与标识有明确长度边界。对象谓词排除空值和数组，因为 JavaScript 中空值的 `typeof` 也会得到对象结果，数组则需要单独处理。

```typescript
type LearningTask = {
  id: string;
  title: string;
  minutes: number;
  status: "queued" | "done";
};

type LearningPlan = {
  name: string;
  tasks: LearningTask[];
};

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readText(value: unknown, path: string, maximum: number): string {
  if (typeof value !== "string") {
    throw new ValidationError(`${path} 必须是字符串。`);
  }
  const text = value.trim();
  if (text.length === 0 || text.length > maximum) {
    throw new ValidationError(`${path} 长度必须在 1 到 ${maximum} 之间。`);
  }
  return text;
}

function parseTask(value: unknown, path: string): LearningTask {
  if (!isRecord(value)) {
    throw new ValidationError(`${path} 必须是对象。`);
  }
  const id = readText(value.id, `${path}.id`, 40);
  const title = readText(value.title, `${path}.title`, 80);
  const minutes = value.minutes;
  if (typeof minutes !== "number" || !Number.isInteger(minutes) ||
    minutes < 1 || minutes > 240) {
    throw new ValidationError(`${path}.minutes 必须是 1 到 240 的整数。`);
  }
  const status = value.status;
  if (status !== "queued" && status !== "done") {
    throw new ValidationError(`${path}.status 只能是 queued 或 done。`);
  }
  return { id, title, minutes, status };
}
```

`readText()` 的长度使用 JavaScript 字符串长度，计算的是 UTF-16 代码单元，不保证与用户感知的字数相同。若产品需要按字素簇限制，应另行采用明确策略，不能把这个练习的长度检查解释为完整中文编辑计数规则。这里给出限制是为了有界输入，不是为全部语言场景定义统一字数。

## 第二步：验证集合与区分失败来源

继续添加下面代码。集合检查放在计划解析中，因为唯一性是任务之间的关系，单个任务解析器无法独立知道是否重复。错误信息包括字段路径，帮助调用方定位问题，但不回显整个原始输入，避免将敏感数据带到日志或界面。

```typescript
function parsePlan(value: unknown): LearningPlan {
  if (!isRecord(value)) {
    throw new ValidationError("计划必须是对象。");
  }
  const name = readText(value.name, "name", 80);
  if (!Array.isArray(value.tasks) || value.tasks.length > 20) {
    throw new ValidationError("tasks 必须是最多 20 项的数组。");
  }
  const ids = new Set<string>();
  const tasks = value.tasks.map((item: unknown, index: number) => {
    const task = parseTask(item, `tasks[${index}]`);
    if (ids.has(task.id)) {
      throw new ValidationError(`tasks[${index}].id 与前面的任务重复。`);
    }
    ids.add(task.id);
    return task;
  });
  return { name, tasks };
}

type DecodeResult<T> =
  | { ok: true; value: T }
  | { ok: false; kind: "json" | "schema"; message: string };

function decode<T>(
  text: string,
  parser: (value: unknown) => T
): DecodeResult<T> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      return { ok: false, kind: "json", message: "输入不是合法 JSON 文本。" };
    }
    throw error;
  }
  try {
    return { ok: true, value: parser(value) };
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return { ok: false, kind: "schema", message: error.message };
    }
    throw error;
  }
}
```

泛型 `T` 的可信来源是传入的解析器返回值，而不是调用方随意填写一个类型参数。调用 `decode(text, parsePlan)` 时，编译器可以从解析器推导得到计划结果。若解析器自身只使用断言，整个契约仍然不可信；泛型不能替代真正的检查。

本例只把明确的 JSON 语法错误和预期的验证错误转换成失败结果，其他错误继续抛出。这样编程错误不会被伪装成“用户输入不合法”。捕获所有异常后返回空数组虽然能减少报错，却会丢掉严重故障证据，并让业务误以为数据确实为空。

## 第三步：加入可重复的输入场景

继续在文件末尾加入下面代码。四个输入分别覆盖成功、错误字段类型、无效 JSON 和集合重复。有效输入通过文本解析边界进入模型，输出只展示计划名称、任务数量与总分钟数。所有示例值都不是实测数据，而是固定教学输入。

```typescript
const examples: { label: string; text: string }[] = [
  {
    label: "有效输入",
    text: JSON.stringify({
      name: "  周末学习  ",
      tasks: [
        { id: "one", title: "类型建模", minutes: 30, status: "queued" },
        { id: "two", title: "运行时验证", minutes: 45, status: "done" }
      ]
    })
  },
  {
    label: "字段错误",
    text: JSON.stringify({
      name: "练习",
      tasks: [{ id: "one", title: "验证", minutes: "30", status: "queued" }]
    })
  },
  { label: "语法错误", text: "{broken" },
  {
    label: "重复标识",
    text: JSON.stringify({
      name: "练习",
      tasks: [
        { id: "same", title: "第一项", minutes: 10, status: "queued" },
        { id: "same", title: "第二项", minutes: 20, status: "done" }
      ]
    })
  }
];

for (const example of examples) {
  const result = decode(example.text, parsePlan);
  if (result.ok) {
    const total = result.value.tasks.reduce((sum, task) => sum + task.minutes, 0);
    console.log(`${example.label}：${result.value.name}，${result.value.tasks.length} 项，${total} 分钟`);
  } else {
    console.log(`${example.label}：${result.kind}，${result.message}`);
  }
}

export {};
```

在独立练习目录执行下面命令。严格模式使捕获值和联合访问保持明确，禁止通过非空断言或 `any` 绕过边界。编译成功后才运行生成文件；这些命令在本文编写过程中没有执行，因此需由读者检查实际诊断和输出。

```bash
tsc boundaries.ts --strict --noEmitOnError --target ES2020 --module commonjs --outDir dist
node dist/boundaries.js
```

预期有效输入名称被裁剪为“周末学习”，任务数量为 2，总分钟数为 75。字段错误分类为 `schema`，路径指向第一个任务的分钟数；语法错误分类为 `json`；重复标识分类为 `schema`，指出第二个任务的标识与前面重复。不要将四条结果中的三条失败当成程序整体失败，它们正是需要观察的输入边界。

## 边界验证的能力与限制

已经验证的本地对象可以在领域函数中使用，不必每个属性访问都重复验证；但跨过新的不可信来源时，应重新建立证据。类型导出给另一个模块，并不会自动保证那个模块没有强制断言或写入非法值。领域数据的所有权与修改入口仍需设计清楚。

本例从 JSON 文本创建普通数据对象；如果允许任意外部 JavaScript 对象进入解析器，属性读取还可能触发 getter 或其他行为。数据验证不等于沙箱，不应该把恶意可执行对象当作普通 JSON 输入。也不要将验证过的字符串直接插入 HTML、SQL 或命令行，目标上下文仍有自己的编码与安全规则。

运行时验证也不能决定权限。数据形状合法，并不说明用户有权访问计划；合法金额也不说明允许付款。业务授权应在正确的可信服务边界完成。浏览器验证能够改善交互，但服务端必须按自己的契约重新检查和授权，不可以依赖客户端的 TypeScript 类型。

## 检查结果与错误排查

如果所有输入都成功，检查解析器是否只做了断言，或者捕获后错误地返回原值。如果有效输入也失败，读取具体字段路径，确认数字没有被写成字符串、状态拼写一致、标识裁剪后仍唯一。不要为迁就错误数据立即放宽模型；先确认接口契约是否真的改变。

若类型谓词通过后仍运行崩溃，检查谓词是否只验证了外层对象而没有验证深层字段。若静态类型正确但存储数据旧格式不兼容，应该设计明确迁移或版本解析策略，不要把旧数据直接断言成新格式。兼容策略必须说明接受哪些版本和如何转换，不能靠容错猜测字段。

若所有失败都变成同一种消息，检查是否在多个层级重复捕获并覆盖原因。面向用户的文案可以简洁，但内部分类应保留足够诊断信息，且不记录原始敏感载荷。真正的程序错误应该继续暴露给可信错误处理渠道，不能混同于可预期的输入错误。

## 练习与官方参考

新增一个计划备注字段，要求允许缺失，但提供时必须是有界字符串。决定空字符串是否保留、裁剪还是拒绝，并写出契约理由。再加入分钟数为零、小数、超出上限、空任务数组和超长数组的输入，分别说明预期分类。

扩展结果类型以表示网络错误时，把网络读取放在外层，仍让 `decode()` 只负责文本和结构，不让解析器同时拥有请求、界面和日志责任。完成后回到 [教程入口](/tutorials/)，对照语言、异步、DOM 和类型边界，检查同一条数据如何逐步获得可信度。

官方参考：

- [TypeScript：unknown 类型](https://www.typescriptlang.org/docs/handbook/2/functions.html#unknown)
- [TypeScript：控制流收窄与类型谓词](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
- [TypeScript：泛型函数](https://www.typescriptlang.org/docs/handbook/2/functions.html#generic-functions)
- [MDN：JSON.parse()](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse)

可信类型应来自明确证据。本文给出完整解析流程和检查场景，但不声称完成真实接口验证、生产安全审计或目标工程测试。
