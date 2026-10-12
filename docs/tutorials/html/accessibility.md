---
title: HTML 可访问性实践：键盘、焦点与可感知状态
description: 用语义控件和原生对话框建立可检查的键盘路径、焦点管理与状态反馈。
type: tutorial
topic: html
section: frontend
order: 30
level: advanced
status: published
tags:
  - HTML
  - 可访问性
  - 键盘
  - 焦点管理
prerequisites:
  - /tutorials/html/document.html
  - /tutorials/html/forms.html
comments: true
---

# HTML 可访问性实践：键盘、焦点与可感知状态

可访问性不是发布前给控件补几个 ARIA 属性，而是让内容和操作能够被不同方式感知、理解和完成。鼠标用户可以点击屏幕上的位置，键盘用户依赖焦点顺序，屏幕阅读器用户还依赖名称、角色、状态和结构。任何一条路径断开，都可能让看起来正常的页面无法使用。本篇用一个阅读设置对话框，建立从进入页面到完成操作的完整检查方法。

## 前置知识与适用范围

你应理解 [语义文档](./document.html) 和 [原生表单](./forms.html)，会使用事件监听与 DOM 查询。示例采用原生 `button`、`dialog`、`form` 和 `details`，适用于支持模态对话框与相关焦点行为的常见现代浏览器。目标产品仍应按实际浏览器和辅助技术组合核验，不能凭某一个浏览器的成功结果推断所有平台都一致。

创建独立目录，将两个文件命名为 `index.html` 和 `main.js`，直接打开入口即可练习。示例不需要网络，也不会持久化设置。屏幕阅读器的开启和操作依赖系统，可以按自己的设备文档配置；本文提供观察目标，不声称已替你完成辅助技术测试，也不把自动检查等同于合规认证。

## 可访问名称与视觉标签为何要一致

可访问性树并不是 DOM 的完整复制。浏览器根据语义、可见性和属性，向辅助技术暴露有用的信息。一个按钮通常有按钮角色，其名称来自文字内容；输入框的名称通常来自关联标签。读者听到的名称与屏幕显示文字尽量一致，才能让语音操作和团队协作更容易理解。

ARIA 可以补充语义，不能自动实现行为。给普通容器设置按钮角色，并不会让它天然支持 Enter、Space、禁用状态和正确焦点行为。使用原生按钮通常更少出错。`aria-label` 可能覆盖已有可见文字提供的名称，因此不要把它当成每个元素都必须添加的装饰。仅图标按钮确实需要清晰名称，但有文字的按钮通常无需重复。

`aria-describedby` 用于附加说明，`aria-labelledby` 用于从页面中引用名称。它们引用的 `id` 必须存在且唯一。隐藏装饰性图形与隐藏交互控件也不同：不要把仍可聚焦的控件放在 `aria-hidden="true"` 的祖先里，否则键盘焦点可能到达一个辅助技术无法解释的位置。需要暂时不可操作的区域应选择正确的结构和状态管理方式。

## 第一步：建立有明确键盘路径的页面

将以下完整代码写入 `index.html`。跳转链接在聚焦时显示，帮助读者跳过重复导航；它指向可以程序聚焦的主体。`tabindex="-1"` 不把主体加入常规 Tab 顺序，只允许锚点或脚本在需要时把焦点放到这里。不要用正数 `tabindex` 人工拼接顺序，那会使 DOM 顺序与操作顺序脱节。

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>阅读设置与键盘练习</title>
    <style>
      body { margin: 0; color: #182235; background: #fff; font: 1rem/1.8 system-ui; }
      header, main { max-width: 44rem; margin: auto; padding: 1rem; }
      nav { display: flex; gap: 1rem; flex-wrap: wrap; }
      a { color: #164b9c; }
      button, select { min-height: 44px; font: inherit; }
      :focus-visible { outline: 3px solid #164b9c; outline-offset: 4px; }
      .skip { position: fixed; top: 0.5rem; left: 0.5rem; transform: translateY(-200%); background: white; padding: 0.5rem; }
      .skip:focus { transform: translateY(0); }
      dialog { max-width: min(90vw, 28rem); border: 2px solid #182235; border-radius: 0.75rem; }
      dialog::backdrop { background: rgb(10 20 35 / 60%); }
      .actions { display: flex; gap: 1rem; margin-top: 1rem; }
      body[data-spacing="wide"] main { line-height: 2.2; }
      @media (prefers-reduced-motion: reduce) {
        * { scroll-behavior: auto; }
      }
    </style>
    <script src="./main.js" defer></script>
  </head>
  <body data-spacing="normal">
    <a class="skip" href="#main">跳到正文</a>
    <header>
      <nav aria-label="本页导航">
        <a href="#reading">阅读内容</a>
        <a href="#help">操作说明</a>
      </nav>
    </header>
    <main id="main" tabindex="-1">
      <h1>阅读设置与键盘练习</h1>
      <button id="open-settings" type="button">调整阅读行距</button>
      <section id="reading" aria-labelledby="reading-title">
        <h2 id="reading-title">阅读内容</h2>
        <p>焦点说明当前可以操作的位置，标题说明内容之间的关系。</p>
        <p>改变行距不应删除内容，也不应把读者带到无关位置。</p>
      </section>
      <details id="help">
        <summary>键盘操作说明</summary>
        <p>使用 Tab 移动，Enter 激活按钮，Esc 关闭阅读设置。</p>
      </details>
      <p id="status" role="status">当前使用标准行距。</p>
    </main>
    <dialog id="settings" aria-labelledby="settings-title">
      <form id="settings-form" method="dialog">
        <h2 id="settings-title">阅读设置</h2>
        <label for="spacing">正文行距</label>
        <select id="spacing" name="spacing" autofocus>
          <option value="normal">标准</option>
          <option value="wide">宽松</option>
        </select>
        <div class="actions">
          <button value="apply">应用</button>
          <button value="cancel">取消</button>
        </div>
      </form>
    </dialog>
  </body>
</html>
```

对话框通过标题提供名称，内部选项使用原生选择控件。`method="dialog"` 表示表单提交用于关闭对话框并设置返回值，不发送请求。原生 `details` 提供折叠说明，不需要再写一套手动键盘实现。本文只设置必要样式，不删除系统焦点提示，也不依赖颜色之外没有文本说明的状态。

## 第二步：处理打开、关闭与状态更新

把以下代码写入 `main.js`。每次打开时同步当前设置，并清空上次返回值，防止 Esc 关闭时残留上次“应用”的状态。业务变更只在明确应用后发生，取消和 Esc 都不修改设置。这个区别决定了用户是否能安全探索界面。

```javascript
const opener = document.querySelector("#open-settings");
const dialog = document.querySelector("#settings");
const spacing = document.querySelector("#spacing");
const status = document.querySelector("#status");

opener.addEventListener("click", () => {
  if (dialog.open) return;
  spacing.value = document.body.dataset.spacing;
  dialog.returnValue = "";
  dialog.showModal();
});

dialog.addEventListener("cancel", () => {
  dialog.returnValue = "cancel";
});

dialog.addEventListener("close", () => {
  if (dialog.returnValue === "apply") {
    document.body.dataset.spacing = spacing.value;
    status.textContent = spacing.value === "wide"
      ? "已应用宽松行距。"
      : "已应用标准行距。";
  }
  if (opener.isConnected) opener.focus();
});
```

`showModal()` 不只是让元素可见，它把对话框置于顶层，并使页面其余部分处于模态交互限制下。仅给容器加 `display: block` 或 `aria-modal` 不会获得这些行为。对话框打开后应把焦点放到合理起点；本例短小且主要任务是选行距，因此选择控件有 `autofocus`。更复杂的说明可能需要先聚焦标题或说明区域，不能机械地总选第一个输入框。

关闭后恢复到触发按钮，帮助读者继续原先任务。真实页面若触发按钮已经被删除，就应找到业务上合理的下一个位置，而不是盲目调用旧节点。状态区域在页面建立时已存在，更新文字时辅助技术可以收到非紧急提示；它不是把焦点强行移走的替代方案。

## 焦点、朗读与视觉反馈的因果关系

Tab 顺序通常来自 DOM 顺序和原生可聚焦元素。使用 CSS 把最后一个按钮视觉移动到最前面，键盘顺序不会自动跟着变。读者会看到焦点在界面中跳来跳去，因此合理的源代码顺序比手工补大量 `tabindex` 更可靠。弹层打开时也应避免焦点落到背景控件，否则用户可能操作到看不见的内容。

`role="status"` 通常提供礼貌级别的状态通知，适合保存成功、筛选结果等无需马上打断的消息。紧急错误与普通状态不同，但过度使用警报会产生持续干扰。不要在每个键盘输入时朗读整个页面，也不要把装饰性动画描述成关键状态。动态信息应该有清晰文字，且播报频率符合实际任务。

焦点轮廓不是美化失败，而是定位信息。暗色、渐变和玻璃材质会让轮廓或文本对比随背景变化；应检查实际组合，而不是只看某个颜色值。正文通常需要至少 4.5:1 的对比度，大号文本通常需要至少 3:1，具体尺寸条件应查 WCAG。本文颜色选择不能替代目标页面的对比测量。

减弱动画偏好应影响非必要运动。示例没有强制动画；如果后续新增滚动或弹层运动，应让 `prefers-reduced-motion` 分支禁用不必要的位移。用户缩放、文本放大和高对比模式也会改变空间条件，固定高度容器尤其容易裁切内容。交互目标保留足够尺寸，但尺寸本身不能替代良好名称和顺序。

## 检查结果与错误排查

先完全不使用鼠标。从地址栏进入页面后按 Tab，预期先看到跳转链接；激活后应到正文。继续移动到设置按钮并用 Enter 打开，对话框内应出现焦点，Tab 和 Shift+Tab 不应访问背景导航。选择宽松行距并应用后，正文行距改变，焦点回到打开按钮，状态文字解释结果。

再次打开，改选标准但按 Esc，预期宽松行距保留。再用取消按钮关闭，结果也应保持不变。展开操作说明时，原生折叠控件应能被键盘操作。将页面放大到 200%，检查对话框内容与按钮是否仍可访问；缩窄窗口，检查导航换行和正文阅读顺序。

屏幕阅读器检查应确认：页面语言和主标题可识别，导航有名称，对话框有标题，选择控件名称正确，关闭后定位连贯，状态变化可感知。具体播报可能不同，不要把逐字一致当成唯一判断标准。自动工具可以找缺少名称、重复标识等问题，却不能判断全部文案是否有意义，也不能证明任务必然可完成。

如果对话框打开后不能关闭，先检查是否拦截了 `cancel` 并忘记实现替代行为。若按 Esc 意外应用设置，检查返回值是否每次重置。若触发按钮不能用键盘激活，确认它是否被普通容器替代。若某元素可聚焦却不朗读，检查隐藏属性及其祖先。修复应回到语义和状态根因，不是随意增加更多 ARIA。

## 测试路径与辅助技术边界

键盘检查和屏幕阅读器检查不能互相替代。能按 Tab 到达按钮，只说明焦点路径存在，还需核对名称、状态与结果是否能被解释；朗读出按钮名称，也不说明它在放大后仍可见。应把视觉、输入与语义三类证据分别记录，再围绕同一任务确认它们是否连贯，避免只收集互不关联的成功截图。

## 练习与官方参考

增加一个“恢复标准行距”按钮，使用原生按钮实现，并在状态区描述结果。再设计一项只在对话框确认后应用的阅读设置，写清取消语义。练习的验收记录应包括键盘路径、焦点位置、取消后的状态和放大后的内容完整性，不要只提交截图。

进一步检查一份自己的表单：移除作为唯一标签的占位提示，建立可见标签和常驻帮助文字；检查错误信息是否能在不辨认颜色的情况下理解。可访问性是一条连续操作路径，单独正确的控件仍可能被错误页面顺序串成难用的流程。

官方参考：

- [MDN：可访问性](https://developer.mozilla.org/zh-CN/docs/Web/Accessibility)
- [MDN：dialog 元素](https://developer.mozilla.org/zh-CN/docs/Web/HTML/Reference/Elements/dialog)
- [WHATWG：dialog 的交互与聚焦](https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element)
- [MDN：ARIA live regions](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions)
- [W3C：WCAG 2.2](https://www.w3.org/TR/WCAG22/)

正式验收需要结合用户任务、浏览器支持和辅助技术实测。本文提供可复用的检查方法，但不提供未经验证的合规结论。
