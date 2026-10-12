---
title: HTML 原生表单：字段语义、约束验证与提交数据
description: 用原生表单建立可访问字段、浏览器约束和清晰的数据提交边界。
type: tutorial
topic: html
section: frontend
order: 20
level: intermediate
status: published
tags:
  - HTML
  - 表单
  - 约束验证
prerequisites:
  - /tutorials/html/document.html
comments: true
---

# HTML 原生表单：字段语义、约束验证与提交数据

表单是一组帮助用户表达意图的控件，也是一份数据编码规则。一个输入框能显示文字，不代表它有正确的名称、会参加提交或能说明错误。原生 HTML 已提供标签关联、字段分组、键盘交互和许多约束规则。本篇先使用这些能力，再加少量脚本实现密码确认与本地提交预览，理解浏览器验证能做什么、不能做什么。

## 前置知识与适用范围

先掌握 [HTML 文档结构](./document.html)，并了解元素属性、唯一 `id` 和脚本的基本使用。创建独立目录，入口为 `index.html`。示例不需要后端，也不会真的发送注册请求；有效提交被脚本拦截，数据只展示在当前页面。不要输入真实密码或个人邮箱，练习使用虚构数据。

本文适用于常见现代浏览器的 HTML 表单与 Constraint Validation API。浏览器的提示文案、日期控件外观以及邮箱边界判定可能略有差别，因此验收关注约束状态和数据字段，而不要求提示气泡长得完全相同。原生验证改善用户体验，但所有不可信输入仍须在真实服务端再次验证。

## 字段名称、标签与提交规则

`label` 的 `for` 对应控件的 `id`，使标签点击能够聚焦输入框，也让辅助技术获得字段名称。`placeholder` 只适合给出短示例，用户输入后会消失，不能替代标签。较长格式要求可以写成常驻帮助文字，再用 `aria-describedby` 建立描述关系；名称说明“是什么”，描述说明“怎么填”。

`name` 决定字段提交时的数据键，与 `id` 不是一回事。有 `id` 而没有 `name` 的输入框可以被脚本查到，却通常不会进入表单数据。禁用字段不参加提交，未勾选的复选框通常也不参加提交；只读字段仍可能参与提交。要防止编辑和要防止提交是两种不同需求，不能混用。

多个相关选项用 `fieldset` 与 `legend` 分组。单选按钮通过共同的 `name` 形成互斥组，复选框用于独立选择。不要用普通文本和点击事件重新实现已有控件，否则还要自行处理键盘、焦点、状态和可访问名称。表单内部的按钮应明确声明 `type`，避免把取消按钮意外变成提交按钮。

## 第一步：建立完整的原生表单

将下列代码写入入口文件。示例故意保留浏览器默认控件，不引入组件库。表单明确要求邮箱、限定年龄范围、要求密码长度，并把提示文字常驻展示。没有 `novalidate`，因此浏览器会在提交前执行原生交互验证。

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>学习活动报名</title>
    <style>
      body { margin: 2rem auto; padding: 0 1rem; max-width: 40rem; font: 1rem/1.7 system-ui; }
      .field { margin-block: 1rem; }
      label { display: block; font-weight: 600; }
      input:not([type="checkbox"]), select { width: 100%; min-height: 44px; box-sizing: border-box; }
      button { min-height: 44px; margin-top: 1rem; }
      :focus-visible { outline: 3px solid #174ea6; outline-offset: 3px; }
      pre { white-space: pre-wrap; overflow-wrap: anywhere; }
    </style>
    <script src="./main.js" defer></script>
  </head>
  <body>
    <main>
      <h1>学习活动报名</h1>
      <p>这是本地练习，不会创建真实账号。</p>
      <form id="signup">
        <div class="field">
          <label for="email">联系邮箱</label>
          <input id="email" name="email" type="email" required autocomplete="email"
            aria-describedby="email-help">
          <p id="email-help">使用练习邮箱，例如 learner@example.com。</p>
        </div>
        <div class="field">
          <label for="age">年龄</label>
          <input id="age" name="age" type="number" min="18" max="120" step="1" required>
        </div>
        <div class="field">
          <label for="password">练习密码</label>
          <input id="password" name="password" type="password" minlength="8" required
            autocomplete="new-password" aria-describedby="password-help">
          <p id="password-help">至少八个字符，只填写虚构密码。</p>
        </div>
        <div class="field">
          <label for="confirmation">再次输入练习密码</label>
          <input id="confirmation" type="password" required autocomplete="new-password">
        </div>
        <fieldset>
          <legend>学习方向</legend>
          <label><input type="radio" name="track" value="html" checked> HTML</label>
          <label><input type="radio" name="track" value="css"> CSS</label>
        </fieldset>
        <label class="field">
          <input type="checkbox" name="agreement" value="yes" required>
          我理解这是本地练习
        </label>
        <button type="submit">预览报名数据</button>
        <button type="reset">重置</button>
      </form>
      <p id="status" role="status"></p>
      <pre id="preview"></pre>
    </main>
  </body>
</html>
```

确认密码没有 `name`，因为它是本地一致性检查，不是业务数据。真实系统同样需要考虑最少提交原则，但不能因此省略服务端要求的字段。`autocomplete` 描述输入用途，帮助浏览器和密码管理器理解字段，不是保证所有浏览器一定如何填充的指令。

## 第二步：增加跨字段验证与提交预览

在同级文件 `main.js` 写入下面的完整脚本，再打开或刷新 `index.html`。两次密码是否一致不是单个 HTML 属性能表达的约束，因此用自定义有效性补充。自定义错误一旦设为非空字符串，会持续使字段无效，直到显式清空；只更新可见文字而不清空错误会导致“明明修好了却不能提交”。

```javascript
const form = document.querySelector("#signup");
const password = document.querySelector("#password");
const confirmation = document.querySelector("#confirmation");
const status = document.querySelector("#status");
const preview = document.querySelector("#preview");

function validateConfirmation() {
  const mismatch = confirmation.value !== "" &&
    confirmation.value !== password.value;
  confirmation.setCustomValidity(mismatch ? "两次练习密码必须一致。" : "");
}

password.addEventListener("input", validateConfirmation);
confirmation.addEventListener("input", validateConfirmation);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  validateConfirmation();
  if (!form.reportValidity()) return;

  const data = new FormData(form);
  const result = {
    email: data.get("email"),
    age: Number(data.get("age")),
    track: data.get("track"),
    agreement: data.get("agreement") === "yes",
    passwordIncluded: data.has("password")
  };
  preview.textContent = JSON.stringify(result, null, 2);
  status.textContent = "数据已在本页预览，没有发送网络请求。";
});

form.addEventListener("reset", () => {
  confirmation.setCustomValidity("");
  status.textContent = "";
  preview.textContent = "";
});
```

脚本不展示密码正文，而只展示它是否参加表单数据。密码类型只是隐藏屏幕上的输入字符，不会自动加密请求，也不应被写进日志。`FormData` 的数据值可能是字符串或文件；这个例子只有文本字段，年龄先经过表单约束，再被明确转换成数值。不要把这个局部结论推广到任意表单。

## 验证流程为什么会阻止提交

用户通过提交按钮或适当的 Enter 操作请求提交时，浏览器先执行约束检查。无效控件会触发 `invalid` 事件，表单的 `submit` 事件通常不会继续发生。因此示例在 `input` 时更新密码确认错误，不能仅依赖提交处理器第一次设置错误，否则无效状态可能阻断后续处理。

`checkValidity()` 返回约束是否满足，并触发相关无效事件；`reportValidity()` 还请求浏览器展示交互提示。读取 `validity` 可以分辨缺少必填值、类型不匹配、范围越界、步长不匹配或自定义错误。原生 `minlength` 对用户编辑值的约束有特定规则，不应把脚本直接赋值等同于用户输入；程序导入数据需要额外明确验证。

脚本主动发起正常提交应考虑 `requestSubmit()`，它保留约束验证和提交事件语义。直接调用 `form.submit()` 会绕开这些步骤，并且可能被名为 `submit` 的控件遮蔽。这两个方法不是可以随意替换的别名。真实请求若使用 GET，数据进入 URL 查询部分，不适合密码等敏感内容；POST 也仍需 HTTPS 和服务端安全设计。

## 检查结果与错误排查

空表单点击预览，预期首先得到必填提示，不出现成功状态。输入不合法邮箱，预期邮箱字段阻止提交；输入年龄 17 或小数 18.5，预期分别触发范围或步长约束。输入八个以上字符的虚构密码并故意让确认不同，预期得到自定义错误；修正之后应能显示 JSON 数据预览。

有效输入可以使用邮箱 `learner@example.com`、年龄 `24`、密码 `practice88`，确认框输入同样内容并勾选声明。预期数据包含邮箱、年龄、方向、声明和密码存在标志，但不包含确认字段，也不展示密码内容。重置后预览与状态应清空，逐项操作并检查实际结果。

如果字段没有进入 `FormData`，先检查 `name`、`disabled` 和选中状态。如果按钮引发意外提交，检查其 `type`。如果确认密码一直无效，检查每次修正是否调用 `setCustomValidity("")`，以及修改原密码时是否也更新确认状态。如果按 Enter 与点击按钮行为不一致，检查是否只绑定了按钮点击，而没有处理表单提交。

如果原生气泡无法满足产品的长期错误说明，可以增加常驻错误列表，并将错误与控件关联。不要同时无控制地重复播报原生提示、弹窗和实时区域。错误提示应说明具体改法，不能只说“输入有误”。真实请求失败时还需区分字段错误、网络失败和服务端拒绝，不要把所有失败都归类为用户填错。

## 原生验证之外的数据边界

表单数据在提交时采集，不是用户每次输入都自动生成一份永久快照。提交前如果脚本改变字段的禁用状态，最终数据就可能与屏幕上看到的内容不同。因此真实提交处理应明确采集时机，成功后何时清空字段，以及失败后是否保留用户输入。不要在请求开始时立即重置表单，否则网络失败后用户可能失去刚才的内容。

数值输入的空文本与数值零不是同一种状态。直接调用 `Number("")` 会得到零，如果字段并非必填，这种转换可能把“用户没有提供”错误解释成明确的年龄或金额。应先判断空值，再决定是否转换；已经存在的数值还需要检查有限性和业务范围。输入类型改善了交互，却不保证任意脚本读取路径都自动符合业务含义。

文件字段也不能复用普通字符串的处理方式。`FormData` 中可能出现文件对象，文件名只是用户提供的信息，不是可信磁盘路径。真实上传还应控制数量、大小和允许内容，由服务端核验实际文件，而不是只信任扩展名或浏览器声明的类型。这里没有上传功能，因此没有暗示报名示例已经覆盖文件安全。

最后应把验证时间视为体验设计：输入过程中可以提示格式，但不要每敲一个字符就显示强烈错误；提交时需要清楚指出阻止继续的字段。多个字段错误同时存在时，错误摘要可以帮助定位，但必须保留到字段的关联与可见焦点。原生约束、常驻说明和服务端响应应互相补充，而不是三套互相矛盾的规则。

## 练习与官方参考

新增一个必填的学习昵称，保留可见标签，并约束用户输入长度。再增加一个可选备注，明确它为空时仍允许提交。修改预览对象，展示昵称与备注，但继续排除密码正文。验收至少覆盖空值、最短边界、有效值、重置和纯键盘提交，并说明哪些规则只能由服务端最终确认。

进阶练习是使用 `FormData.getAll()` 表示一组同名复选框，比较它与 `get()` 的返回差异。不要用 `Object.fromEntries()` 直接压平本来允许多个值的字段，否则同名项可能丢失。随后阅读 [键盘与可访问性](./accessibility.html)，从完整操作流程检查表单，而不只检查字段值。

官方参考：

- [WHATWG：表单与约束验证](https://html.spec.whatwg.org/multipage/forms.html)
- [MDN：客户端表单验证](https://developer.mozilla.org/zh-CN/docs/Learn_web_development/Extensions/Forms/Form_validation)
- [MDN：Constraint Validation API](https://developer.mozilla.org/zh-CN/docs/Web/API/Constraint_validation)
- [MDN：FormData](https://developer.mozilla.org/zh-CN/docs/Web/API/FormData)

阅读规范时重点确认成功控件的数据规则以及验证的触发条件。表单可用性、数据正确性和安全性是相互关联但不同的目标，浏览器提示只能承担其中一部分。
