---
title: TypeScript 类型建模：推导、联合收窄与泛型约束
description: 从实际值与状态模型理解类型推导、判别联合、穷尽检查和泛型关系。
type: tutorial
topic: typescript
section: frontend
order: 10
level: beginner
status: published
tags:
  - TypeScript
  - 类型推导
  - 联合类型
  - 泛型
prerequisites:
  - /tutorials/javascript/language.html
comments: true
---

# TypeScript 类型建模：推导、联合收窄与泛型约束

TypeScript 为 JavaScript 增加静态类型检查，帮助你在运行之前发现值与操作不匹配。它不会把普通对象变成另一种运行时对象，也不会自动验证接口返回的数据。好的类型不是给每个变量都写很长注解，而是表达值之间稳定的关系，让推导与收窄在代码路径中发挥作用。本篇用学习任务和结果模型，逐步建立这种思考方式。

## 前置知识与适用范围

先理解 [JavaScript 语言模型](../javascript/language.html)，会使用函数、对象、数组和模块。练习使用已有的 TypeScript 编译器与 Node.js，入口为 `types.ts`。不需要框架、网络服务或第三方类型库；本文不会要求你改现有工程的依赖。若本机没有编译器，应先按 TypeScript 官方说明准备独立学习环境，再运行示例。

本文采用长期稳定的推导、联合类型、控制流收窄与泛型语法，开启严格检查，编译目标为 ES2020。不宣称某个编译器为最新版本；实际项目应以已安装版本和配置为准。类型推导诊断文字可能变化，但值的运行语义仍由 JavaScript 决定。检查编译器版本有助于准确描述问题。

```bash
tsc --version
```

## 推导为什么能减少无意义注解

编译器会根据初始化值、返回表达式和使用上下文推导类型。`let count = 0` 通常推导为数值类型，因为后续可能重新赋数值；`const mode = "reading"` 保留更具体的字面量，因为绑定不能重新赋值。但是常量对象的属性仍可修改，属性值也可能被拓宽，不能把常量绑定误解成整棵对象都只读。

上下文也会约束表达式。例如函数明确返回某个状态类型时，返回对象中的判别字段能够按该类型理解。没有上下文而先创建普通对象，字符串属性可能拓宽成 `string`，再传给只允许少数状态的函数就会失败。正确做法是给真正边界提供注解，或采用合适的字面量策略，而不是到处强制断言。

函数参数通常需要明确类型或由上下文提供类型，函数返回值则常能推导。公共函数可以写返回类型，确保修改内部实现时不会意外改变对外契约。局部计算没有必要重复描述显而易见的数值类型；类型信息应该集中在接口、状态和不明显的关系上。

`as const` 会保留更窄字面量并形成只读类型，但不会在运行时冻结对象。`readonly` 同样主要提供静态约束，不代表其他别名永远不能修改底层数据。若业务要求运行时不可变，应单独设计复制、冻结或数据所有权，而不是把类型修饰当成物理隔离。

## 联合类型为什么比多个可选字段更准确

联合类型表示值可以是几种形态之一。若加载状态写成一个对象，里面 `loading`、`data`、`error` 都可选，就容易出现“同时成功和失败”或“成功但没有数据”。判别联合用一个稳定字段区分形态，并让每种状态只携带自身需要的数据，减少不合法组合。

控制流收窄让编译器根据条件分析当前可能类型。判断 `status === "success"` 后，成功形态的 `data` 可以安全访问。对可空值应按业务明确判断；简单真假判断会同时排除空字符串、零和 `false`，这些值有时合法。选择条件时应围绕数据语义，不是只为让红线消失。

`never` 表示不可能出现的值，可用于穷尽检查。所有联合成员都处理后，剩余值应为 `never`；后来新增状态却漏掉分支，就会在穷尽检查位置产生类型错误。它不会代替运行时输入验证：外部数据若未经检查被断言成联合，仍可能进入静态模型没有描述的分支。

## 第一步：创建完整类型示例

在独立目录的 `types.ts` 写入下面全部代码。任务使用稳定标识和明确状态，结果使用判别联合。泛型函数保留输入与输出类型关系，不通过 `any` 暂时绕过检查。末尾加入模块标记，避免学习文件里的名字意外进入全局脚本作用域。

```typescript
type TaskStatus = "queued" | "done";
type LearningTask = {
  id: string;
  title: string;
  status: TaskStatus;
};

type Result<T> =
  | { status: "success"; data: T }
  | { status: "failure"; message: string };

function first<T>(items: readonly T[]): T | undefined {
  return items[0];
}

function findById<T extends { id: string }>(
  items: readonly T[],
  id: string
): T | undefined {
  return items.find((item) => item.id === id);
}

function pluck<T, K extends keyof T>(value: T, key: K): T[K] {
  return value[key];
}

function assertNever(value: never): never {
  throw new Error(`未处理的状态：${String(value)}`);
}

function describe(result: Result<LearningTask>): string {
  switch (result.status) {
    case "success":
      return `${result.data.title}：${result.data.status}`;
    case "failure":
      return `失败：${result.message}`;
    default:
      return assertNever(result);
  }
}

const tasks: LearningTask[] = [
  { id: "one", title: "学习类型推导", status: "queued" },
  { id: "two", title: "练习联合收窄", status: "done" }
];

const selected = findById(tasks, "two");
const result: Result<LearningTask> = selected
  ? { status: "success", data: selected }
  : { status: "failure", message: "找不到任务。" };

console.log(describe(result));
console.log(first([10, 20]));
console.log(first<string>([]));
console.log(selected ? pluck(selected, "title") : "没有任务");

function normalizeTitle(value: string | null | undefined): string {
  if (value === null || value === undefined) return "未命名";
  return value.trim() === "" ? "未命名" : value.trim();
}
console.log(normalizeTitle("  类型边界  "));
console.log(normalizeTitle(null));

export {};
```

## 第二步：编译并检查运行结果

在练习目录执行下面命令。指定入口文件的命令采用命令行选项，不依赖你所在其他目录的工程配置。输出放入独立的 `dist` 目录；这些输出是学习练习中的编译产物，不应手工修改。如果编译器报错，先解决诊断，再执行对应生成文件。

```bash
tsc types.ts --strict --noEmitOnError --target ES2020 --module commonjs --outDir dist
node dist/types.js
```

预期依次输出“练习联合收窄：done”、数值 10、`undefined`、“练习联合收窄”、“类型边界”和“未命名”。`first<string>([])` 返回空值，证明声明明确考虑了空数组，而不是把任意索引读取都当成一定存在的元素。

可以在文件末尾临时加入下面的错误练习，再仅执行编译命令。每行都有明确的类型冲突，预期出现诊断；完成观察后移除这些故意错误，不要靠删除严格检查或加断言让它们通过。错误片段不是主示例的一部分。

```typescript
const invalidStatus: TaskStatus = "paused";
const invalidKey = pluck(tasks[0], "missing");
const unsafeTitle = first(tasks).title;
```

## 泛型为什么要表达关系

泛型参数在调用处由输入推导或明确指定。`first<T>` 表达输入元素类型与输出类型相同，同时保留可能为空；它不决定实际数组有多少元素。约束 `T extends { id: string }` 说明输入对象至少具有字符串标识，返回时仍保留完整的具体对象类型，而不是只剩一个标识字段。

`keyof T` 描述合法键集合，`T[K]` 描述选定键对应的值类型。`pluck` 因此可以在调用时知道读取标题得到字符串，读取其他数值属性得到数值。若把键写成任意字符串，就失去这种对应关系，也可能读取不存在的字段。类型系统擅长表达这些关联，不必为每个对象类型复制读取函数。

泛型不能凭空证明外部数据。一个 `load<T>()` 若直接把网络 JSON 断言成 `T`，只是把责任转给调用者，并没有验证。泛型参数也不会在运行时保留为可以查询的类型对象。需要运行时结构保证时，应传入实际验证函数或解析器，这会在 [unknown 边界与运行时验证](./boundaries.html) 中继续说明。

## 检查结果与错误排查

对象明明包含正确字段却不能传入函数时，查看判别属性是否拓宽为普通字符串。优先在对象创建边界使用类型注解，不要无条件把整个对象断言成目标类型。若空值报错，检查它来自可选属性、查询失败还是空数组，再明确处理对应业务分支。

联合中访问属性报错时，先判断该属性是否真的存在于全部成员。只有成功形态有数据，就应先判别成功，而不是把数据改成所有状态都可选。新增成员后穷尽检查报错是保护，不是编译器的误判；补全实际处理逻辑，而非删除 `never` 检查。

如果泛型推导变成过宽类型，检查输入是否已被宽泛注解抹掉具体信息。过早声明为只含 `id` 的数组，会让后续无法恢复标题字段类型。若使用断言后运行时仍报错，说明断言不是验证，应回到实际数据来源检查。类型能帮助发现约定错误，但不能替你重新生成合法数据。

编译成功后仍可能存在逻辑错误，例如查错标识、错误计算或不合理业务状态。严格检查提升的是某些错误的可发现性，不是完整正确性证明。测试应核验结果与边界，而不能把类型检查成功当成所有功能都已通过。

## 结构兼容与类型命名

TypeScript 的多数对象类型按结构比较，而不是要求对象由某个同名接口创建。只要具有所需成员，一个更完整的对象通常可以用于只读取部分字段的函数。这有助于复用，但也意味着接口名称不是运行时身份；不要期待写了某个类型名字，就能在浏览器中按该名字验证对象。

直接把新对象字面量赋给明确类型时，编译器还可能执行额外属性检查，帮助发现拼写错误。这与一般结构兼容的用途不同，不能从一次诊断推出“所有额外字段永远禁止”。外部数据应接受哪些字段仍需要边界契约和运行时解析，静态兼容规则只是开发阶段的辅助机制。

## 练习与官方参考

给任务增加 `"active"` 状态，并写一个单独的状态说明函数，用穷尽检查覆盖全部状态。再给结果联合增加取消形态，观察原来的 `describe()` 是否提示遗漏，并为它设计不同于失败的说明。

创建一个只读数组版本的输入，确认 `findById()` 能接受它但不能在函数内部直接修改数组。为 `first()` 检查空数组与非空数组两条路径，明确返回类型为什么包含空值。练习完成后继续阅读 [TypeScript 工程配置](./applications.html)，把单文件约束放到模块工程中。

官方参考：

- [TypeScript：类型推导](https://www.typescriptlang.org/docs/handbook/type-inference.html)
- [TypeScript：收窄](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
- [TypeScript：泛型](https://www.typescriptlang.org/docs/handbook/2/generics.html)
- [TypeScript：对象类型](https://www.typescriptlang.org/docs/handbook/2/objects.html)

阅读类型资料时始终区分编译期模型与运行时行为。一个类型描述越可信，越需要真实代码遵守它的输入与状态边界。
