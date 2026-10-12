---
title: JavaScript 语言模型：作用域、闭包、this 与原型模块
description: 通过完整模块示例理解闭包、调用位置、原型查找与对象状态隔离。
type: tutorial
topic: javascript
section: frontend
order: 10
level: beginner
status: published
tags:
  - JavaScript
  - 闭包
  - this
  - 原型
  - 模块
prerequisites:
  - /tutorials/html/document.html
comments: true
---

# JavaScript 语言模型：作用域、闭包、this 与原型模块

JavaScript 中最难排查的错误，往往不是语法，而是变量到底属于哪个作用域、函数如何被调用、属性从哪里找到。闭包、`this` 和原型分别回答不同问题，不能混成一个“对象上下文”。本篇建立一个可运行的计数模块，让每种机制都有具体观察结果，再解释哪些写法适合状态隔离，哪些写法会因为调用方式变化而失效。

## 前置知识与适用范围

你应会创建 [基础 HTML 页面](../html/document.html)，并了解字符串、数值、条件和函数的基本语法。练习使用常见现代浏览器的标准 JavaScript 与原生 ES 模块，不依赖框架或打包器，不使用某个新发布版本才具备的专有能力。

准备独立目录，包含 `index.html`、`counter.js` 和 `main.js`。浏览器原生模块通常需要通过 HTTP 服务访问，不能假设双击文件即可正确运行。若本机已有 Python 3，可以在练习目录运行下面命令；没有时使用已有静态 HTTP 服务，不需要为本文引入应用依赖。示例只访问本地文件。

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

随后打开 `http://127.0.0.1:8000/`。这个命令提供临时文件服务，不是生产部署方案；结束练习后在终端按 Ctrl+C 关闭。端口被占用时可改为其他空闲端口，并同步访问地址。

## 作用域与闭包为什么能保存状态

`let` 与 `const` 有词法作用域，名字可见范围由源码中的声明位置和嵌套结构决定。`const` 禁止重新给变量绑定另一个值，不意味着对象内容不可修改。一个常量对象仍可增加或修改属性，除非你另行设计不可变结构或冻结策略。数组也是对象，不能因为使用 `const` 就假设它不会变化。

闭包是函数连同其能够访问的词法环境。外层函数执行结束后，只要返回的函数仍引用其中的绑定，相关状态就可以继续存在。闭包保留的是绑定，不是一张固定时刻的值快照，因此后续修改能够被下一次调用观察到。创建两次工厂函数，就得到两份不同状态；多次调用同一返回函数，则共享其那一份状态。

对象赋值也不是深复制。两个变量指向同一个对象时，一个修改会被另一个看到。展开运算符通常只做一层复制，内部对象仍可能共享。需要状态隔离时，应先明确有哪些层级需要独立，而不是把展开语法当成万能深拷贝。这里的计数器只保存数字，避免把引用共享与闭包机制混成同一问题。

## 第一步：创建完整的状态模块

将以下代码写入 `counter.js`。模块提供闭包计数器和类计数器两种实现。输入检查避免把字符串意外当成数值参与运算，使观察结果更明确；默认参数只在没有传值或传入 `undefined` 时使用，并不自动修复所有不合法值。

```javascript
export function createCounter(initial = 0) {
  if (!Number.isFinite(initial)) {
    throw new TypeError("初始计数必须是有限数值。");
  }
  let value = initial;
  return {
    increment(step = 1) {
      if (!Number.isFinite(step)) {
        throw new TypeError("步长必须是有限数值。");
      }
      value += step;
      return value;
    },
    read() {
      return value;
    }
  };
}

export class Counter {
  constructor(initial = 0) {
    if (!Number.isFinite(initial)) {
      throw new TypeError("初始计数必须是有限数值。");
    }
    this.value = initial;
  }
  increment(step = 1) {
    if (!Number.isFinite(step)) {
      throw new TypeError("步长必须是有限数值。");
    }
    this.value += step;
    return this.value;
  }
}
```

闭包实现没有公开 `value`，只能通过提供的方法读取与修改；这是一种封装，不是安全隔离容器。类实现公开实例属性，便于后续观察原型与调用关系。选择工厂还是类，取决于状态与行为组织需求，不能说其中一种在所有项目里天然更先进。

## 第二步：建立入口与可检查输出

先写入 `index.html`。模块脚本在文档解析后执行，并处于严格模式，因此不会采用某些旧式脚本中把普通调用的 `this` 自动替换成全局对象的行为。输出通过文本写入页面，避免把动态字符串当成 HTML 解释。

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>JavaScript 状态与调用实验</title>
    <script type="module" src="./main.js"></script>
  </head>
  <body>
    <main>
      <h1>JavaScript 状态与调用实验</h1>
      <pre id="output"></pre>
    </main>
  </body>
</html>
```

再写入 `main.js`，从当前目录导入模块，观察两份闭包状态、脱离对象的方法以及原型查找。浏览器原生导入需要明确相对路径与扩展名，不会自动按打包器习惯搜索任意包名。

```javascript
import { createCounter, Counter } from "./counter.js";

const lines = [];
const first = createCounter();
const second = createCounter(10);
lines.push(`first: ${first.increment()}, ${first.increment(2)}`);
lines.push(`second: ${second.read()}`);

const detachedClosure = first.increment;
lines.push(`detached closure: ${detachedClosure()}`);

const objectCounter = new Counter(5);
lines.push(`method call: ${objectCounter.increment()}`);
const detachedMethod = objectCounter.increment;
try {
  detachedMethod();
} catch (error) {
  lines.push(`detached method error: ${error.name}`);
}

const boundMethod = objectCounter.increment.bind(objectCounter);
lines.push(`bound call: ${boundMethod(2)}`);
lines.push(`prototype matches: ${
  Object.getPrototypeOf(objectCounter) === Counter.prototype
}`);
lines.push(`own increment: ${Object.hasOwn(objectCounter, "increment")}`);
lines.push(`own value: ${Object.hasOwn(objectCounter, "value")}`);

const source = { settings: { step: 1 } };
const shallowCopy = { ...source };
shallowCopy.settings.step = 3;
lines.push(`shared nested value: ${source.settings.step}`);

document.querySelector("#output").textContent = lines.join("\n");
```

打开 HTTP 入口，预期计数输出依次解释：第一个闭包得到 1 和 3，第二个仍为 10，脱离对象调用闭包后为 4。类实例先从 5 增加到 6，脱离方法产生 `TypeError`，绑定后增加到 8。后面的布尔值依次为真、假、真，嵌套共享值为 3。错误的具体消息文本依浏览器可能不同，本文只要求错误类别和状态关系。

## this 为什么取决于调用方式

普通函数的 `this` 通常由调用方式决定。`object.method()` 提供接收对象，单独把方法保存到变量再调用，就不再保留这个接收关系。模块严格模式中普通无接收者调用的 `this` 是 `undefined`，因此访问 `this.value` 会失败。函数定义在对象里面，不代表永远绑定到该对象。

`bind()` 返回一个绑定接收者的新函数，适合必须把方法传给回调系统时保留调用对象；`call()` 与 `apply()` 则直接以指定接收者调用。箭头函数没有自己的 `this`，它沿词法环境读取外层的 `this`。这能解决某些嵌套回调问题，但顶层模块箭头函数也不会因此获得某个实例。

闭包版本的 `increment` 不读取 `this`，所以脱离对象后仍能工作；它读取的是创建时的 `value` 绑定。不要把这个现象解释为“闭包自动绑定对象”。事件监听、计时器和数组回调各有调用约定，传方法之前应先确认它是否依赖接收者，而不是一律改成箭头函数。

## 原型与模块如何组织复用

对象读取属性时，先查自身，没有再沿原型链查找。`Counter` 的实例拥有自己的 `value`，方法通常位于 `Counter.prototype`，多个实例共享方法函数但不共享实例上的数字属性。`Object.hasOwn()` 只检查自身属性，而 `in` 运算符还会检查原型链，两者回答不同问题。

原型链不是复制链。修改共享原型上的方法会影响依赖它的实例，修改某个实例的自身同名属性则会遮蔽原型属性。实际应用不应随意修改内建原型，这会改变其他模块的行为，并造成跨团队不可见依赖。优先使用自己的对象、类或函数组合。

模块建立独立作用域，通过 `export` 明确公开接口，通过 `import` 明确依赖。导入绑定是对导出绑定的连接，并不是随时可以在导入方重新赋值的普通局部变量。模块通常按模块标识加载并执行，循环依赖仍可能导致初始化时机问题；不要仅凭“用了模块”就假设不存在状态耦合。

## 检查结果与错误排查

先确认网络面板能加载三个文件，控制台没有模块路径或 MIME 类型错误。页面没有输出时，检查入口是否通过 HTTP 访问、脚本是否声明为模块、导入是否包含正确扩展名。服务器返回 HTML 错误页给脚本地址时，浏览器可能报告模块类型错误，根因仍可能是路径错误。

状态串扰时，检查是否重复使用同一个计数器实例，以及是否存在共享嵌套对象。`this` 错误时，在调用点检查函数是以方法、普通函数还是绑定函数调用。不要只在定义处加日志，因为同一个定义可以有多种调用方式。原型属性判断不符合预期时，区分自身属性、继承属性和被遮蔽属性。

如果变量在初始化前读取时报错，检查块级声明的暂时性死区；声明存在不意味着它已经可以读取。循环中的异步回调若都看到同一个变量值，检查绑定是函数作用域的 `var` 还是每轮独立的 `let`。这类错误来自绑定生命周期，不是计时器随机选择了一个结果。

## 值比较与状态所有权

严格相等比较不会为了比较而自动把字符串转成数字，因此更适合已经明确数据类型的业务判断。两个内容相同但分别创建的对象仍不相等，因为比较的是引用身份。若需要判断业务上是否同一条记录，应使用稳定标识，而不是期待对象字面量内容一致就自动相等。

函数返回一个对象，也不自动转移它的所有权。如果多个调用方保存同一引用，它们仍可能互相影响。闭包封装能够隐藏直接访问入口，但返回内部可变对象时又可能暴露状态。因此扩展计数器为复杂记录时，应明确返回快照还是共享引用，并让命名和文档说明这一点，而不是只在变量声明上增加 `const`。

这些关系影响后续异步代码：请求启动时捕获的是哪个绑定，回调完成时该绑定是否已经变化，返回对象是否被其他任务修改。先用同步实验查清状态拥有者，再引入异步时机，能把问题分解成可观察的两层，而不是把所有异常都归因于执行顺序不可预测。

## 练习与官方参考

给闭包计数器增加 `reset()`，让它恢复创建时的初始值，并验证两份计数器互不影响。再创建两个类实例，确认它们的方法引用可以相同，但各自 `value` 独立。解释为什么闭包方法可以脱离对象调用，而类方法需要绑定。

最后把输出整理成“调用前状态、调用方式、调用后状态”的表格，避免只背诵结果。掌握后阅读 [异步与并发控制](./async.html)，在那里回调、错误和状态生命周期会同时出现。

官方参考：

- [MDN：闭包](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide/Closures)
- [MDN：this](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Operators/this)
- [MDN：继承与原型链](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide/Inheritance_and_the_prototype_chain)
- [MDN：JavaScript 模块](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide/Modules)

本篇预期输出依据语言机制推导，没有声称在你的浏览器已运行。实际检查时应区分语言错误、模块交付错误和环境限制。
