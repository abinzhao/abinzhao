---
title: TypeScript 工程实践：tsconfig、模块解析与构建边界
description: 建立独立 Node ESM 小工程，理解严格检查、源码输出与模块运行契约。
type: tutorial
topic: typescript
section: frontend
order: 20
level: intermediate
status: published
tags:
  - TypeScript
  - tsconfig
  - 模块
  - 工程实践
prerequisites:
  - /tutorials/typescript/types.html
comments: true
---

# TypeScript 工程实践：tsconfig、模块解析与构建边界

单个 TypeScript 文件能够编译，不代表工程的模块能在实际运行环境中加载。编译器需要知道目标语法、可用平台 API、模块格式、文件解析方式和输出边界；运行器还要按自己的规则理解生成文件。本篇建立一个不使用第三方依赖的 Node ESM 小工程，逐步解释配置为什么存在，以及如何区分类型检查、构建和运行验证。

## 前置知识与适用范围

先学习 [类型推导与联合收窄](./types.html)，并理解 JavaScript 的 `import` 与 `export`。本篇目标环境是支持原生 ES 模块的 Node.js，以及支持 `NodeNext` 配置的 TypeScript 编译器。使用长期稳定选项，不指定所谓最新版本；请先运行版本查询，确保当前工具支持示例配置。

```bash
node --version
tsc --version
```

练习应放在独立空目录，不修改已有应用配置。本文展示的 `package.json` 与 `tsconfig.json` 是教程练习文件，不意味着可以直接复制覆盖真实项目。编译器应已经由学习环境提供，示例不声明新的依赖也不执行安装命令。Node 运行配置与浏览器打包配置不同，后者可能由 Vite 等工具拥有模块解析责任，应遵守其真实工程约定。

## 配置项如何描述编译器与运行器的约定

`target` 决定输出采用哪个 JavaScript 语法层级，但不会自动提供缺失的运行时 API。把目标设置得更低，不等于浏览器就获得 Promise 或其他能力。`lib` 告诉类型检查器有哪些平台声明；加入 DOM 声明不会让 Node 真正拥有 `document`。类型可见性与运行时能力必须分开理解。

`module` 决定模块语义与输出策略，`moduleResolution` 决定导入说明如何对应文件。Node ESM、Node CommonJS 与打包器各有不同规则，不应为了消除一个导入错误就随意混搭配置。本文采用 `NodeNext`，根据文件扩展名和最近的包类型声明模拟 Node 的模块约定。

`strict` 打开一组严格检查，其中空值和隐式宽泛类型检查很有价值，但它不等同于所有可选安全检查。`noUncheckedIndexedAccess` 让不确定索引读取包含 `undefined`，提醒你检查数组或字典边界。`exactOptionalPropertyTypes` 更明确区分属性缺失与显式赋 `undefined`，适合需要精确更新语义的模型。

`rootDir` 指定源码组织边界，`outDir` 指定输出位置，它们不会自动选择全部输入。输入集合还受 `include`、`files` 和导入依赖影响。`exclude` 主要影响文件发现，不是阻止已被源码导入文件进入编译的隔离墙。公共模块的导入关系仍须实际检查，不能只看配置中的路径列表。

## 第一步：创建独立工程文件

建立以下目录结构。`dist` 由编译器生成，开始练习时不需要手工创建或写入。所有可编辑业务源码都在 `src` 中，避免把输出文件与输入文件混在一起。

```text
learning-project/
  package.json
  tsconfig.json
  src/
    model.ts
    main.ts
```

在 `package.json` 写入下面内容。`type` 明确告诉 Node 将普通 `.js` 文件按 ES 模块理解；`private` 表示这不是准备发布的软件包。本文不添加脚本与依赖，因为直接命令已足够展示构建边界。

```json
{
  "name": "typescript-learning-project",
  "private": true,
  "type": "module"
}
```

在 `tsconfig.json` 写入下面配置。`noEmitOnError` 防止本次存在诊断时生成新的输出，但不会删除之前已经生成的旧文件。运行旧文件仍可能让你误以为新代码已经成功，因此必须先核对本次构建结果，再运行。

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noEmitOnError": true,
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist"]
}
```

本例加 DOM 库仅为了在不安装 Node 类型包的前提下使用 `console` 等通用声明，并不授权业务使用浏览器专属 API。正式 Node 工程通常采用与其依赖一致的 Node 类型声明和更准确的平台库；不要把这个教学取舍推广到生产项目。这里所有实际运行代码只调用 Node 已有的通用能力。

## 第二步：编写模块与类型契约

在 `src/model.ts` 写入下列内容。接口同时描述读取数据和更新数据，更新模型的可选标题表示“没有提供则不修改”，不同于“提供空值则清除”。完整输入与局部更新具有不同语义，不能在所有地方简单套用同一对象类型。

```typescript
export interface Note {
  readonly id: string;
  title: string;
  completed: boolean;
}

export interface NotePatch {
  title?: string;
  completed?: boolean;
}

export function updateNote(note: Note, patch: NotePatch): Note {
  const title = patch.title === undefined ? note.title : patch.title.trim();
  if (title.length === 0) {
    throw new Error("笔记标题不能为空。");
  }
  return {
    id: note.id,
    title,
    completed: patch.completed ?? note.completed
  };
}

export function findNote(notes: readonly Note[], id: string): Note | undefined {
  return notes.find((note) => note.id === id);
}
```

在 `src/main.ts` 写入入口。类型专用导入不需要成为运行时依赖，`import type` 明确表达这一点。源码里导入 `.js`，因为最终 Node 要运行生成的 `.js` 文件；`NodeNext` 能在编译阶段将这种路径对应到 `.ts` 源码，编译器并不是把所有导入扩展名自动重写一遍。

```typescript
import { findNote, updateNote } from "./model.js";
import type { Note } from "./model.js";

const notes: Note[] = [
  { id: "first", title: "理解工程边界", completed: false },
  { id: "second", title: "核对模块输出", completed: false }
];

const selected = findNote(notes, "second");
if (selected === undefined) {
  throw new Error("预期笔记不存在。");
}

const updated = updateNote(selected, {
  title: "  核对类型与运行结果  ",
  completed: true
});

console.log(updated.title);
console.log(updated.completed);
console.log(selected.completed);

const first = notes[0];
console.log(first ? first.id : "数组为空");
```

## 第三步：分别检查、构建与运行

在工程根目录执行下面三条命令。第一条只检查类型，不生成文件；第二条生成 JavaScript 与声明文件；第三条运行明确的入口。使用 `-p` 表达工程模式，避免同时传一个源文件又以为它会自动使用所有工程配置。

```bash
tsc -p tsconfig.json --noEmit
tsc -p tsconfig.json
node dist/main.js
```

预期运行输出为“核对类型与运行结果”、`true`、`false` 与 `first`。原对象的完成状态不变，因为更新函数返回新对象，而不是直接修改原笔记。生成目录应包含两个 `.js` 与两个 `.d.ts` 文件；声明文件提供类型契约，不包含可执行实现，也不用于运行时验证。

需要排查配置合并时可以运行下面命令，查看编译器实际理解的配置。真实工程可能通过 `extends` 继承配置，直接阅读某个局部文件并不足以知道最终选项。本文未执行这些命令，所有结果需在练习环境中自行确认。

```bash
tsc -p tsconfig.json --showConfig
```

## 模块边界与路径别名常见误区

Node ESM 通常要求相对导入明确扩展名，打包器可能有不同解析规则。浏览器原生模块也不能直接把任意包名当成本地文件。配置是否合理，应从真实运行器出发，再让类型检查器模拟它，而不是先选一个看起来宽松的解析模式。

`paths` 可以让 TypeScript 理解别名对应关系，但一般不会替你改写生成代码中的导入说明。编译成功后运行器仍不知道某个别名，就会在启动时报模块找不到。只有真实打包器、运行器或配套转换明确负责别名，才应使用相应配置；不要仅为减少几个相对路径引入额外隐性机制。

模块类型还受包边界影响。同一份生成 `.js` 被不同 `package.json` 的 `type` 解释时，可能产生不同结果；复制输出到另一目录也可能改变最近包边界。部署构建产物时需要同时交付运行器所需配置，而不是只验证源码所在环境。本文入口在本包目录下运行，边界明确。

## 检查结果与错误排查

出现 `Cannot find module` 时，分别确认源文件解析、生成文件存在与运行时导入路径。类型检查通过不代表 Node 路径也通过。遇到“不能在当前模式使用 import”之类错误，先查包类型和模块配置，不要把源代码机械改成另一套导出语法来掩盖边界冲突。

索引读取变成可空值时，说明编译器要求考虑空数组或不存在键，应补充真实检查。可选属性赋 `undefined` 失败时，检查业务是想省略字段，还是确实允许该值；如果后者合法，应明确写入类型契约，而不是关闭精确可选属性检查。

构建报错但运行似乎成功时，检查运行的是不是之前生成的旧文件。不要以旧输出证明本次构建正确。新增浏览器 API 后 Node 报未定义，则说明平台声明选择与实际运行器不一致。正式工程应让平台类型更准确，并保留运行测试去发现类型无法覆盖的环境问题。

## 输出文件与源码的责任边界

编译输出是源码与配置共同产生的结果，应通过同一构建命令重新生成，而不是在 `dist` 里修补逻辑。直接修改生成 JavaScript 会让下次构建覆盖修复，也让声明文件与运行实现不一致。遇到输出问题，应追溯对应源码、模块语义或编译选项，保持唯一可信编辑入口。

声明文件适合描述公开接口，却不能保证实现确实遵守业务逻辑。消费者依赖声明能完成静态检查，但调用后结果仍需测试。公开函数的类型改变可能影响多个模块，哪怕运行代码只有一行改动；因此工程验收应按接口使用面决定范围，而不是只根据修改行数判断风险。

工程目录也应避免把临时练习和正式源码混在一起。没有模块标记的学习文件可能产生全局名字冲突，宽泛的输入匹配可能把它们一起纳入编译。明确源码目录、输出目录和学习副本范围，可以减少这种偶然耦合；这属于文件边界设计，不需要靠关闭诊断来解决。

## 练习与官方参考

新增一个纯函数 `summarizeNotes()`，返回总数与完成数，在入口输出结果。对空数组也返回合法统计，不依赖非空断言。再给 `NotePatch` 增加明确可清空的备注字段，分别设计“未提供”“提供字符串”“清空”三种更新语义，观察精确可选属性检查如何帮助表达边界。

在独立副本中临时删除导入扩展名，比较编译诊断与运行结果；恢复后再检查完整工程。不要在真实工作区随意试验配置。完成后阅读 [unknown 与运行时验证](./boundaries.html)，把类型边界延伸到外部数据。

官方参考：

- [TypeScript：TSConfig 参考](https://www.typescriptlang.org/tsconfig/)
- [TypeScript：模块理论](https://www.typescriptlang.org/docs/handbook/modules/theory.html)
- [TypeScript：模块解析参考](https://www.typescriptlang.org/docs/handbook/modules/reference.html)
- [TypeScript：Node ESM 与 CommonJS](https://www.typescriptlang.org/docs/handbook/modules/reference.html#node16-node18-node20-nodenext)

工程正确性需要同时核验配置、输出和运行。本文展示可重复的命令路径，但不提供未经执行的构建成功结论。
