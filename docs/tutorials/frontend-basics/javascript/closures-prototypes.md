---
title: JavaScript：闭包、this 与原型
description: 用独立计数器和类实例理解状态封装、调用方式、原型查找与内存释放。
---

# JavaScript：闭包、this 与原型

## 学习目标

- 解释闭包为什么能在外层函数返回后继续访问状态。
- 按调用方式判断普通函数的 `this`，区分箭头函数与 bind。
- 理解类的方法共享、原型链查找和事件监听的生命周期。

前置：[类型与数据操作](./fundamentals.md)。
闭包与原型不是面试专属知识，它们影响事件回调、组件状态和资源清理。

## 为什么要封装状态

如果把所有计数器都放到同一个全局变量，两个界面控件会彼此影响。
把变量放进工厂函数，每次调用就创建独立的词法环境。
返回的方法仍能访问那次调用的变量，这个组合就是闭包。

闭包捕获的是绑定，不是创建函数时的数值快照。
状态更新后，下次调用读到的是新状态。
只要某个仍可访问的函数引用环境，其中需要的值就可能继续存活。
闭包并不天然泄漏；没有可达引用时，垃圾回收器可以回收相关对象。

## this 的决定时机

普通函数的 `this` 主要由调用方式决定，而不是定义位置。
`object.method()` 的 this 是 object，取出方法后单独调用则不再保留这个关系。
严格模式中的普通独立调用，this 是 undefined。
箭头函数没有自己的 this，使用定义处外层的 this。

`bind` 返回固定 this 的新函数，不会修改原函数。
传给事件监听的函数应保留引用，否则无法用同一个引用移除监听。
类方法默认在严格模式下执行，脱离实例调用时不能依赖全局对象兜底。

## 运行步骤

1. 创建 `closures-prototypes/index.html` 与 `closures-prototypes/main.js`。
2. 启动练习服务器，打开 `/closures-prototypes/`。
3. 点击两个独立计数器，再点击“停用左侧监听”。
4. 可选：用 Node 22.13+ 执行 `node main.js`，查看数据断言。

## 完整示例

::: code-group

```html [index.html]
<!doctype html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>闭包与原型实验</title></head>
<body>
  <main>
    <h1>两个独立计数器</h1>
    <button id="left" type="button">左侧 +1</button>
    <button id="right" type="button">右侧 +1</button>
    <button id="dispose" type="button">停用左侧监听</button>
    <p id="counts" role="status"></p>
    <p id="cleanup" role="status"></p>
  </main>
  <script src="./main.js" defer></script>
</body>
</html>
```

```js [main.js]
'use strict';

function createCounter(start = 0) {
  if (!Number.isSafeInteger(start)) throw new TypeError('初值必须是安全整数');
  let value = start;
  return {
    read() { return value; },
    increment() {
      if (value === Number.MAX_SAFE_INTEGER) throw new RangeError('计数达到上限');
      value += 1;
      return value;
    }
  };
}

class NamedCounter {
  #value = 0;
  constructor(name) {
    this.name = name;
  }
  increment() {
    this.#value += 1;
    return this.#value;
  }
  describe() {
    return `${this.name}：${this.#value}`;
  }
}

function assert(condition, description) {
  if (!condition) throw new Error(`验证失败：${description}`);
  console.log(`通过：${description}`);
}

const first = createCounter();
const second = createCounter(10);
first.increment();
assert(first.read() === 1 && second.read() === 10, '闭包状态互不影响');
const a = new NamedCounter('A');
const b = new NamedCounter('B');
assert(a.increment === b.increment, '实例共享原型方法');
assert(Object.getPrototypeOf(a) === NamedCounter.prototype, '实例原型关系正确');
assert(Object.hasOwn(a, 'name'), 'name 是实例自己的属性');
assert(!Object.hasOwn(a, 'describe'), 'describe 来自原型');
const detached = a.describe;
let detachedFailed = false;
try { detached(); } catch (error) { detachedFailed = error instanceof TypeError; }
assert(detachedFailed, '脱离实例调用时 this 不存在');
const bound = a.describe.bind(a);
assert(bound() === 'A：0', 'bind 固定接收者');

function mountCounter(button, counter, onChange) {
  const listener = () => {
    counter.increment();
    onChange();
  };
  button.addEventListener('click', listener);
  return () => button.removeEventListener('click', listener);
}

if (typeof document !== 'undefined') {
  const left = createCounter();
  const right = createCounter();
  const counts = document.querySelector('#counts');
  const leftButton = document.querySelector('#left');
  function render() {
    counts.textContent = `左侧：${left.read()}；右侧：${right.read()}`;
  }
  let stopLeft = mountCounter(leftButton, left, render);
  const stopRight = mountCounter(document.querySelector('#right'), right, render);
  document.querySelector('#dispose').addEventListener('click', () => {
    if (stopLeft) stopLeft();
    stopLeft = null;
    leftButton.disabled = true;
    document.querySelector('#cleanup').textContent = '左侧监听已移除，右侧仍可操作。';
  });
  window.addEventListener('pagehide', () => {
    if (stopLeft) stopLeft();
    stopRight();
  }, { once: true });
  render();
}
```

:::

## 原型查找与类的边界

读取 `a.describe` 时，先检查 a 自身，再沿 `[[Prototype]]` 查找。
`NamedCounter.prototype` 上定义了 describe，所以多个实例共享同一个函数。
查找继续到 Object.prototype，最后到 null；找不到得到 undefined。
`Object.hasOwn()` 只判断自身属性，不把原型上的字段误认为实例数据。

`class` 为构造和原型提供清晰语法，但不是另一套与原型无关的对象系统。
`#value` 是私有字段，不是可以通过 `a['#value']` 访问的普通属性。
从类实例复制出来的普通对象不会自动保留原型方法与私有字段。
不要把 JSON 序列化当作类实例的完整备份。

本例类计数器只进行少量演示，没有业务级上限约束。
闭包计数器显式检查安全整数边界，说明封装方式不会自动决定数据安全。
选择闭包还是类，主要看状态组织、实例数量与现有代码模式。

## 内存与生命周期

事件目标会引用监听函数，监听函数又可能引用 DOM、数组和状态。
如果长期存活的对象继续保留这些引用，移除页面视觉内容也未必释放相关数据。
清理函数移除监听，并将 stopLeft 置空，避免继续持有不用的清理闭包。
匿名箭头函数每次创建都是新引用，不能用另一个相同写法的函数移除监听。

垃圾回收时机不确定，不能以“立刻看见内存下降”作为唯一验收。
更有价值的是反复挂载与销毁，观察监听数量或保留对象是否持续增加。
不要通过修改 Object.prototype 给全部对象加业务方法，这会污染全局查找。

## 效果验证

Console 应显示 7 条通过信息，两个按钮各自从 0 开始。
停用左侧后左侧按钮不可操作，右侧继续计数。
在 Console 查看 `Object.getPrototypeOf({}) === Object.prototype`，结果为 true。
尝试把 bound 换成 detached，断言会暴露调用接收者丢失。

## 常见错误

把闭包理解为“变量永久存在”会忽略可达性和生命周期。
在对象属性里用箭头函数当普通方法，this 不会自动成为该对象。
调用 `bind()` 却丢弃返回值，原函数的 this 仍未改变。
通过展开语法复制实例，得到的对象不再是原类实例。

## 练习与验收标准

新增“停用右侧监听”，并让每个清理操作重复执行也不会报错。
验收：两个状态独立；停止后无重复回调；清理函数使用原监听引用。
再写一个类实例自己的箭头函数属性，与原型方法比较引用是否共享。

## 延伸资料

- [MDN：闭包](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide/Closures)
- [MDN：this](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Operators/this)
- [MDN：继承与原型链](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide/Inheritance_and_the_prototype_chain)

下一章：[异步、取消与竞态](./async.md)。
