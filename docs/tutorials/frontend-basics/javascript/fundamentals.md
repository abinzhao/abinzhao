---
title: JavaScript：类型与数据操作
description: 从输入校验到金额汇总，理解类型、作用域、函数、数组和对象。
---

# JavaScript：类型与数据操作

## 学习目标

- 分清值的类型、变量绑定与对象引用。
- 用函数表达规则，用数组与对象表达数据。
- 主动处理空输入、无效数字、缺失字段与浅复制边界。

前置：能打开 HTML 页面，了解表单输入。
本章浏览器和 Node.js 都能运行，Node 示例要求 **22.13 或更新版本**。

## 为什么先研究数据

按钮和页面只是入口，真正的业务规则通常是“输入是什么、允许什么、得到什么结果”。
若不先明确输入边界，页面一复杂就容易出现空金额、字符串拼接和重复修改等问题。
本章先构造纯函数：相同输入得到相同输出，不读 DOM，也不修改输入。
这种函数容易复用，也容易通过断言验证。

## 类型、转换和作用域

JavaScript 的原始值包括 string、number、boolean、undefined、null、bigint、symbol。
对象包括普通对象、数组和函数；数组用 `Array.isArray()` 判断。
`typeof null` 的结果是 `"object"`，这是历史行为，不表示 null 可以读取属性。
`undefined` 常表示未提供值，`null` 常表示显式“没有”，但语义仍由接口约定。

`+` 遇到字符串可能拼接，所以 `"2" + 1` 是 `"21"`。
`Number('')` 是 0，不能把“转换成功”直接当作“用户输入合法”。
`NaN` 仍属于 number，而且 `NaN === NaN` 为 false，使用 `Number.isNaN()`。
判断有限数字用 `Number.isFinite()`；无穷大不应作为合法数量。

`const` 禁止重新绑定，不禁止修改对象的属性。
`let` 允许重新赋值，并且与 `const` 一样具有块级作用域。
它们在声明前处于暂时性死区；不要依赖声明前访问。
`var` 是函数级作用域，初学阶段优先使用 `const`，需要重新赋值时才用 `let`。

## 运行步骤

1. 创建 `fundamentals/index.html` 和 `fundamentals/main.js`。
2. 启动练习服务器，打开 `/fundamentals/`，查看页面与 Console。
3. 可选：在该目录执行 `node main.js`，验证纯数据部分。
4. 每次修改后先预测输出，再刷新或重新运行。

## 完整示例

::: code-group

```html [index.html]
<!doctype html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>JavaScript 数据实验</title></head>
<body>
  <main>
    <h1>购物清单汇总</h1>
    <pre id="output"></pre>
    <p>更多断言结果见 Console。此页没有真实支付行为。</p>
  </main>
  <script src="./main.js" defer></script>
</body>
</html>
```

```js [main.js]
'use strict';

function requireQuantity(value) {
  const text = String(value).trim();
  if (!/^[1-9]\d*$/.test(text)) {
    throw new TypeError('数量必须是正整数文本');
  }
  const quantity = Number(text);
  if (!Number.isSafeInteger(quantity) || quantity > 1000) {
    throw new RangeError('数量必须在 1 到 1000 之间');
  }
  return quantity;
}

function summarize(lines) {
  if (!Array.isArray(lines)) throw new TypeError('清单必须是数组');
  const normalized = lines.map(line => {
    if (line === null || typeof line !== 'object') {
      throw new TypeError('每项必须是对象');
    }
    if (typeof line.name !== 'string' || !line.name.trim()) {
      throw new TypeError('商品名不能为空');
    }
    if (!Number.isSafeInteger(line.priceCents) || line.priceCents < 0) {
      throw new TypeError('价格必须是非负整数分');
    }
    const quantity = requireQuantity(line.quantity);
    const subtotal = line.priceCents * quantity;
    if (!Number.isSafeInteger(subtotal)) throw new RangeError('小计超出安全整数范围');
    return { name: line.name.trim(), quantity, subtotal };
  });
  const total = normalized.reduce((sum, line) => sum + line.subtotal, 0);
  if (!Number.isSafeInteger(total)) throw new RangeError('总计超出安全整数范围');
  return { lines: normalized, totalCents: total };
}

const cart = [
  { name: '笔记本', priceCents: 1250, quantity: '2' },
  { name: '铅笔', priceCents: 250, quantity: '3' }
];
const summary = summarize(cart);
const names = summary.lines.map(line => line.name);
const expensive = summary.lines.filter(line => line.subtotal >= 1000);
const pencil = summary.lines.find(line => line.name === '铅笔');
const message = [
  `商品：${names.join('、')}`,
  `高小计商品：${expensive.map(line => line.name).join('、')}`,
  `铅笔小计：${pencil?.subtotal ?? 0} 分`,
  `总计：${(summary.totalCents / 100).toFixed(2)} 元`
].join('\n');
console.log(message);

function assert(condition, description) {
  if (!condition) throw new Error(`验证失败：${description}`);
  console.log(`通过：${description}`);
}
assert(summary.totalCents === 3250, '总计为 3250 分');
assert(cart[0].quantity === '2', '输入对象没有被修改');
assert(summarize([]).totalCents === 0, '空数组总计为零');
for (const invalid of ['', '0', '-1', '1.5', 'Infinity', '1001']) {
  let rejected = false;
  try { requireQuantity(invalid); } catch { rejected = true; }
  assert(rejected, `拒绝非法数量 ${JSON.stringify(invalid)}`);
}
if (typeof document !== 'undefined') {
  document.querySelector('#output').textContent = message;
}
```

:::

## 从代码建立心智模型

`map` 将每项变成新值，`filter` 保留符合条件的项，`find` 返回第一项或 undefined。
`reduce` 把数组逐项汇总，初值 `0` 让空数组也能安全运行。
这些方法本身不修改原数组，但回调里仍可以误改原对象。
`sort`、`push`、`splice` 会修改数组，需要先判断这种修改是否符合设计。

函数通过参数接收输入，`return` 返回结果；没有显式返回时得到 undefined。
`throw` 会打断当前执行，最近的 `catch` 可以处理异常。
本例失败时不返回伪造的 0，因为 0 和“无法计算”是两种不同状态。

可选链 `pencil?.subtotal` 避免读取缺失对象，`??` 只为 null/undefined 提供默认值。
`||` 还会把 0、空字符串和 false 当成需要替换的值，不能任意互换。
对象解构是取字段，展开语法是浅复制；两者都不会验证数据是否合法。

价格以整数分保存，避免 `0.1 + 0.2` 的二进制浮点表示误差。
整数也有安全范围，所以乘法和汇总之后仍检查 `Number.isSafeInteger()`。
真实财务系统还需考虑币种、舍入规则和更大数值，本例不承担支付计算。
bigint 不能直接与 number 混算，也不能直接交给 JSON.stringify。

## 效果验证

页面应显示总计 `32.50 元`，Console 显示所有“通过”断言。
把数量改为 `" 2 "`，应仍计算为 2；改为 `"2x"` 应抛出明确异常。
把 `priceCents` 改为 `"1250"`，应拒绝字符串价格，而不是悄悄转换。
在 Console 查看 `typeof null`、`Array.isArray([])` 与 `Number('')`，核对机制说明。

## 常见错误

`parseInt('2x', 10)` 会读出 2，它不是严格数字校验器。
`const copy = cart` 只是复制引用，修改 copy 会影响 cart。
`const copy = [...cart]` 只复制数组外壳，内部商品对象仍共享。
比较时优先使用 `===`，避免 `==` 的隐式转换掩盖输入类型错误。

## 练习与验收标准

增加“删除铅笔”的纯函数，返回新数组，不修改原 cart。
验收：总计变为 2500 分；原数组仍有两项；空数组和不存在的名称都能处理。
为数量上限 1000、合法免费商品与缺失名称各增加一个断言。

## 延伸资料

- [MDN：JavaScript 指南](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide)
- [MDN：类型与数据结构](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide/Data_structures)
- [MDN：数组](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Array)

下一章：[闭包、this 与原型](./closures-prototypes.md)。
