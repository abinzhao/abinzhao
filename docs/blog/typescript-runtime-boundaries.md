---
title: TypeScript 的运行时边界：把未知 JSON 变成可验证的领域契约
description: 用原生验证器、判别联合和显式序列化处理外部 JSON，区分结构有效、领域有效与授权有效，避免类型断言掩盖真实输入风险。
date: "2026-10-17"
category: 类型系统
tags: [TypeScript, 运行时验证, JSON, 契约设计]
featured: false
---

# TypeScript 的运行时边界：把未知 JSON 变成可验证的领域契约

前端从接口得到数据，后端从队列得到消息，工具从文件得到配置，这三种场景都有同一个缺口：输入不会因为项目使用了 TypeScript 就自动符合类型。`response.json() as Invoice` 改变的是编译器的看法，不是网络里已经到达的字节。问题也不限于恶意输入，旧版本服务、错误缓存、手工补录和序列化差异都可能打破契约。

本文围绕一个实质问题展开：如何把未知 JSON 转换为可以安全参与业务计算的对象，并保证再次序列化时不悄悄改变含义。示例使用原生 TypeScript 验证代码，不依赖某个未经核验的校验库 API。它处理金额、时间、状态和版本，提供可编译的命令行程序与断言，但不把“结构验证通过”夸大为业务授权通过。

## 三层契约不能合成一个接口

传输契约回答字节如何表示数据，例如金额是十进制字符串，时间是 UTC ISO 字符串。领域契约回答数据能否参与计算，例如金额非负且有上界、已支付记录必须有支付时间。授权契约回答当前身份能否操作这笔账单，它依赖服务端会话、租户和数据库状态，不可能由 JSON 自己证明。

如果三个层次都使用同一个 `Invoice`，字段很容易被错误复用。数据库中的 `bigint` 不适合直接放入普通 JSON，`Date` 序列化后也不是 `Date` 实例。用户传来的 `ownerId` 既是字符串，又可能是越权来源。共享静态类型能降低开发时漂移，但不能取代入口验证，更不能把浏览器声明的所有者当成认证结果。

TypeScript 官方 [Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html) 文档解释了控制流收窄和类型谓词。它们帮助编译器理解已经进行的运行时检查，而不是自动生成检查。一个错误的 `value is Invoice` 谓词，可以和错误的 `as Invoice` 一样危险：函数返回 `true` 时，编译器信任开发者写下的声明。

因此，入口用 `unknown` 表示尚未获得证据，而不是用 `any` 绕开检查。验证成功之后构造新对象，只保留被契约允许的字段；失败返回有限的错误路径，不原样回显输入。领域模块再接收这个受控对象。这样的“解析后构造”比在一个大对象上不断追加断言更容易审查，也能避免未经允许的字段继续向下传播。

## 用判别联合表达不可能的组合

账单有草稿和已支付两个状态。若类型写成 `status: string; paidAt?: Date`，调用方必须到处猜测：草稿可以有支付时间吗？已支付可以缺失时间吗？布尔标志再多一点，还会产生彼此矛盾的组合。

这里使用 `kind: 'draft' | 'paid'` 作为判别字段，但不是把其余字段全设成可选。草稿分支没有 `paidAt`，已支付分支必须有 `paidAt`。序列化类型也使用同样的分支关系，只是金额和时间保持传输表示。业务上的退款、撤销不是随意改一个字符串，需要定义新状态及合法转移。

协议中的 `version` 是另一条判别轴。本例只接受版本一，不把任何数字都当成“向后兼容”。将来添加版本二，应先解析对应的传输结构，再显式迁移成同一个领域模型。修改字段含义却保持版本不变，会让静态类型共享也无法发现线上数据的语义漂移。

严格拒绝未知字段是一项有成本的选择。它能发现拼写错误、禁止无意透传和压缩输入表面积，却会阻断某些服务端先增加字段、客户端后升级的发布方式。只读展示接口可以选择丢弃未知字段，执行写操作的命令通常更适合严格验证。两种政策都应写在契约里，不能由不同模块临时决定。

## 完整示例：字节入口、领域构造和出站编码

准备独立目录，使用 Node `22.22.0`。安装命令只作用于示例目录，不要求修改业务工程依赖：

```sh
mkdir runtime-boundary-example
cd runtime-boundary-example
npm init -y
npm install --save-dev --save-exact typescript@5.9.3 @types/node@22.17.0
```

将下面内容写入 `boundary.mts`。程序默认执行断言，加 `--stdin` 时从标准输入读取真实 JSON 文档：

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Issue = { path: string; code: string };
type Result<T> =
  | { ok: true; value: T }
  | { ok: false; issues: Issue[] };

type Common = {
  readonly id: string;
  readonly amountCents: bigint;
  readonly occurredAt: Date;
};
type Invoice =
  | (Common & { readonly kind: 'draft' })
  | (Common & { readonly kind: 'paid'; readonly paidAt: Date });

type WireCommon = {
  version: 1;
  id: string;
  amountCents: string;
  occurredAt: string;
};
type WireInvoice =
  | (WireCommon & { kind: 'draft' })
  | (WireCommon & { kind: 'paid'; paidAt: string });

const MAX_BYTES = 64 * 1024;
const MAX_CENTS = 999999999999999999n;
const ID = /^[a-zA-Z0-9_-]{1,64}$/;
const CENTS = /^(0|[1-9][0-9]{0,17})$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function fail(path: string, code: string): Result<never> {
  return { ok: false, issues: [{ path, code }] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !ISO.test(value)) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    return undefined;
  }
  return date;
}

function parseInvoice(value: unknown): Result<Invoice> {
  if (!isRecord(value)) return fail('$', 'expected_object');
  if (value.version !== 1) return fail('version', 'unsupported_version');
  if (value.kind !== 'draft' && value.kind !== 'paid') {
    return fail('kind', 'unsupported_kind');
  }
  const keys = ['version', 'kind', 'id', 'amountCents', 'occurredAt'];
  if (value.kind === 'paid') keys.push('paidAt');
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    return fail('$', 'unknown_field');
  }
  if (keys.some((key) => !Object.hasOwn(value, key))) {
    return fail('$', 'missing_field');
  }
  if (typeof value.id !== 'string' || !ID.test(value.id)) {
    return fail('id', 'invalid_id');
  }
  if (typeof value.amountCents !== 'string' || !CENTS.test(value.amountCents)) {
    return fail('amountCents', 'invalid_decimal');
  }
  const amountCents = BigInt(value.amountCents);
  if (amountCents > MAX_CENTS) return fail('amountCents', 'out_of_range');
  const occurredAt = parseDate(value.occurredAt);
  if (!occurredAt) return fail('occurredAt', 'invalid_timestamp');
  const common: Common = { id: value.id, amountCents, occurredAt };
  if (value.kind === 'draft') {
    return { ok: true, value: Object.freeze({ ...common, kind: 'draft' }) };
  }
  const paidAt = parseDate(value.paidAt);
  if (!paidAt) return fail('paidAt', 'invalid_timestamp');
  if (paidAt.getTime() < occurredAt.getTime()) {
    return fail('paidAt', 'before_creation');
  }
  return {
    ok: true,
    value: Object.freeze({ ...common, kind: 'paid', paidAt }),
  };
}

function decodeJSON(bytes: Uint8Array): Result<Invoice> {
  if (bytes.byteLength > MAX_BYTES) return fail('$', 'too_large');
  let value: unknown;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    value = JSON.parse(text);
  } catch {
    return fail('$', 'invalid_json_or_utf8');
  }
  return parseInvoice(value);
}

function encodeInvoice(value: Invoice): WireInvoice {
  const common: WireCommon = {
    version: 1,
    id: value.id,
    amountCents: value.amountCents.toString(10),
    occurredAt: value.occurredAt.toISOString(),
  };
  switch (value.kind) {
    case 'draft':
      return { ...common, kind: 'draft' };
    case 'paid':
      return { ...common, kind: 'paid', paidAt: value.paidAt.toISOString() };
    default: {
      const exhaustive: never = value;
      throw new Error(`Unreachable kind: ${typeof exhaustive}`);
    }
  }
}

function fromText(text: string): Result<Invoice> {
  return decodeJSON(new TextEncoder().encode(text));
}

const sample: WireInvoice = {
  version: 1,
  kind: 'paid',
  id: 'invoice_42',
  amountCents: '9007199254740993',
  occurredAt: '2026-10-17T08:00:00.000Z',
  paidAt: '2026-10-17T08:01:00.000Z',
};

if (process.argv.includes('--stdin')) {
  const result = decodeJSON(readFileSync(0));
  if (!result.ok) {
    console.error(JSON.stringify(result.issues));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(encodeInvoice(result.value)));
  }
} else {
  const parsed = fromText(JSON.stringify(sample));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error('Sample rejected');
  assert.equal(parsed.value.amountCents, 9007199254740993n);
  assert.deepEqual(encodeInvoice(parsed.value), sample);
  const invalid: unknown[] = [
    null, [], { ...sample, version: 2 },
    { ...sample, amountCents: 9007199254740993 },
    { ...sample, amountCents: '-1' },
    { ...sample, amountCents: '01' },
    { ...sample, occurredAt: '2026-02-30T08:00:00.000Z' },
    { ...sample, paidAt: '2026-10-16T08:00:00.000Z' },
    { ...sample, kind: 'draft' },
    { ...sample, ownerId: 'another-user' },
  ];
  for (const value of invalid) {
    assert.equal(fromText(JSON.stringify(value)).ok, false);
  }
  assert.equal(fromText('{').ok, false);
  assert.equal(decodeJSON(Uint8Array.of(0xff)).ok, false);
  assert.equal(decodeJSON(new Uint8Array(MAX_BYTES + 1)).ok, false);
  console.log('boundary assertions passed');
}
```

编译和运行步骤完整如下；`.mts` 输出 `.mjs`，无需猜测 CommonJS 和 ESM 的隐式配置：

```sh
npx tsc boundary.mts --strict --noUncheckedIndexedAccess \
  --exactOptionalPropertyTypes --target ES2022 \
  --module NodeNext --moduleResolution NodeNext --outDir out
node out/boundary.mjs
printf '%s' '{"version":1,"kind":"draft","id":"invoice_1","amountCents":"1200","occurredAt":"2026-10-17T08:00:00.000Z"}' \
  | node out/boundary.mjs --stdin
```

程序会输出规范化的传输对象，不输出大整数的浮点近似值。失败退出码为一，错误包含路径和分类，不包含原始金额、身份或整份输入。命令行的 `readFileSync(0)` 会先读完整输入再检查大小，适合这个文件工具，但不能直接搬成互联网 HTTP 服务的请求体限制。HTTP 入口必须边读边累计字节，超限即停止，解压后还需独立限制。

## 金额和时间为什么要这样规定

JavaScript 的 `number` 无法精确表示任意大整数。金额若作为 JSON 数字抵达，精度可能在 `JSON.parse` 时已经丢失，之后调用 `BigInt(number)` 也无法恢复原值。示例坚持最小货币单位的十进制字符串，并拒绝负号、前导零、指数和小数，避免不同实现对规范形式产生分歧。

这个模型并不支持所有金融需求。它没有币种，默认单位由协议另行固定；外汇、分摊、税率、银行家舍入需要独立定义。以分存储也不能自动解决有三位小数的币种，更不能把展示金额用 `parseFloat` 转回来计算。正确的取舍是先明确领域精度，再选择存储表示，而不是让语言的默认数字类型替产品做决定。

时间采用完整 UTC 毫秒字符串，解析后再序列化必须与输入一致。因此，日期自动滚动、省略时区、不同精度及不合法日期不会悄悄被接受。这是刻意收窄的协议，不是通用 ISO 8601 解析器。排班、生日和账期可能需要“日历日期加时区”，不能仅靠 UTC 时间点表达；把所有时间一概转换成 `Date` 也会丢失业务含义。

`Object.freeze` 只冻结对象属性，不冻结 `Date` 内部状态。调用方仍能执行 `setTime()`。示例把领域对象当成不修改的值使用，但深层不可变没有获得运行时保证；对要求更强的不变量，可以在领域层保留时间戳数字，或通过封装限制修改。这种边界应说清楚，不能看到 `readonly` 就宣称对象在运行时不可变。

## 失败案例不是多加几个可选字段

常见修补是发现旧消息缺少字段，就把字段改成可选。这样编译错误减少了，但每个消费模块都要增加默认值，默认政策还可能互相不同。正确处理是确认旧版本语义：若旧协议真的允许缺失，迁移层可补出有来源的默认值；若原始数据已经损坏，就应隔离并记录有限元信息，而不是制造一个“看起来合法”的支付记录。

另一类错误是先 `JSON.parse`，再用对象展开合并到数据库更新对象。未知字段会穿过边界，甚至修改本不该由用户指定的状态。本例拒绝 `ownerId` 并只构造白名单字段，但这不等于完成权限控制。服务端仍要从认证主体确定所有者，并在写事务中检查账单状态、版本及可执行操作。

还要注意重复 JSON 键。标准 `JSON.parse` 对重复键保留后面的值，这个原生实现不能检测重复出现的 `amountCents`。若协议用于签名、支付或安全决策，应选择能拒绝重复键的解析器，或者签名明确的原始字节及规范化规则。类型验证器处理的是解析后的值，无法还原解析器已经丢弃的信息。

来自进程内部的任意对象也不等于 JSON 数据。对象可能包含 getter、Proxy 或恶意原型；调用属性和 `Object.getPrototypeOf` 本身就可能执行代码。这个验证器的安全入口是 `decodeJSON`，不是面向任意 JavaScript 对象的沙箱。结构化克隆、数据库读取和 SDK 返回值需要根据各自来源重新评估边界。

## 验证怎样覆盖契约而不是迎合实现

静态验证用严格编译和 `never` 穷尽分支。把领域联合增加一个新状态，序列化函数应产生编译错误，提醒维护者补齐出站表示。不要使用最后一个默认分支直接返回空对象，因为那会把协议演进变成安静的数据丢失。

动态验证至少包括合法边界值、每个字段的错误类型、不同状态组合、金额上界、非法日期、未知版本、未知字段、非法字节和超长输入。再建立往返性质：合法传输对象解析再编码后仍等价；若允许规范化，则比较规范化后的语义而非原始字符串。编解码同时写错时也可能满足往返，所以还需要与协议独立维护的参考样例交叉检查。

本例断言是确定性的契约案例，不是生产数据，也不是接口端到端测试。上线前应由生产者和消费者各自运行同一份协议样例，并测试滚动发布时的旧新组合。验证失败率要与协议版本、错误码一起统计，避免记录输入正文；异常率上升可能表示部署漂移，而不只是有人在攻击。

原生验证器适合这里的小契约。大规模嵌套结构需要考虑错误聚合、复用、性能以及从一份定义生成类型的需求，可以引入经过版本核验的 Schema 库或 JSON Schema。但即使有代码生成，身份授权、数据库一致性和输入字节限制仍不会自动出现。工具减少重复，不会消除边界。

## 让版本迁移只发生在边界

协议升级时，最危险的做法是让业务模块同时理解多个历史字段名。某个模块读取 `amount`，另一个读取 `amountCents`，第三个在两个字段都存在时随意选择，最终同一条消息会得到不同解释。较清晰的结构是每个版本先得到自己的传输类型，再通过迁移函数进入唯一的领域类型，业务计算不再分辨原始版本。

迁移规则要包括冲突输入，而不只是补字段。如果新旧金额字段同时存在但数值不同，应该拒绝，不能用对象展开顺序决定优先级。时间字段从本地时区变成 UTC 时也不能简单补一个后缀；不知道旧数据时区就无法证明那个瞬间是什么，应把不可恢复的信息标记出来并进入人工或业务补偿流程。

读取旧格式和写出旧格式是两个不同能力。服务可以接受版本一和二，却只输出版本二，但消费者是否准备好读取新格式必须由发布顺序确认。也可以暂时按协商版本输出不同表示，不过维护成本随版本组合增加。本例只接受一种版本，正是为了避免给一个小程序添加没有需求依据的兼容框架。

契约还要有退役路径。统计各版本的实际使用范围，确认消息保留窗口、离线客户端更新时间和回放工具之后，才能停止接受旧格式。只看线上最近一小时没有旧请求，无法排除某个队列里还保存着旧事件。回放历史记录是运行时边界的重要消费者，也应该使用相同解析入口。

## 静态类型不能代替状态变更条件

一个合法的已支付对象并不证明草稿可以由当前请求改成已支付。真实服务需要从数据库读取当前状态，验证操作者权限、预期版本和支付来源，再原子更新。本例的支付时间比较只是局部字段不变量，没有验证账单存在、没有核对外部支付结果，也没有保证消息只处理一次。

品牌类型有时能减少内部误用，例如区分用户标识和账单标识，但品牌通常在编译后消失。运行时仍要检查输入格式，并由可信构造函数给值附上类型证据。把外部字符串直接断言成品牌类型，会把同一个边界问题藏得更深，而不是增强安全性。

默认值和容错也要明确所有权。展示层可以把缺少昵称显示成匿名用户，但支付命令不能把缺少金额变成零。将 UI 兜底对象继续传回服务端，可能把展示便利变成数据修改。领域对象、展示对象和写入命令应该各自保持清晰的允许字段，避免一个“万能接口”贯穿全部层次。

最后，错误结构也是契约。客户端可以按 `invalid_decimal` 定位输入问题，但不能依赖服务器某一段自然语言的拼写。错误路径应稳定，面向用户的文案可以国际化，内部日志记录有限分类。对于认证失败与资源不存在，还要考虑是否暴露资源存在性，而不是把所有详细验证结果都返回给未认证调用者。

## 示例验证范围

示例在 Node `22.22.0`、TypeScript `5.9.3` 下使用文中的严格编译选项完成编译，程序内合法往返、错误字段组合、非法日期、错误版本、超长输入和非法 UTF-8 断言通过。大整数以十进制字符串往返，不经过浮点金额转换。

这些验证只覆盖文中定义的小型契约，没有接入实际业务 HTTP 服务、历史消息库、授权系统或生成式模糊测试。重复 JSON 键检测、任意 JavaScript 对象沙箱及跨服务滚动发布不在示例保证内，采用到真实系统前需要分别补齐。

## 官方参考

- [TypeScript Handbook：控制流收窄、类型谓词、判别联合与 never](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
- [TypeScript TSConfig：strict 与严格检查选项](https://www.typescriptlang.org/tsconfig/)
- [MDN JSON.stringify：BigInt、Date 和不可序列化值](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify)
- [MDN Number.MAX_SAFE_INTEGER](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER)

这套边界能证明某份输入满足所定义的格式及局部不变量，不能证明输入真实、来源可信或操作者有权限。把这些证明分开，是 TypeScript 工程从“有类型”走向“有契约”的关键。
