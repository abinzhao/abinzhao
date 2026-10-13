---
title: CSS：层叠与盒模型
description: 判断声明为什么胜出，用盒模型和开发者工具解释尺寸与溢出。
---

# CSS：层叠与盒模型

## 学习目标

- 能按层叠规则判断同一属性最终采用哪条声明。
- 能计算内容、内边距、边框与外边距的关系。
- 能通过开发者工具定位溢出，而不是反复增加 `!important`。

前置：[HTML 结构](../html/structure.md)。
CSS 通过选择器找到元素，然后给元素属性赋值；它不会改变 HTML 的内容语义。

## 为什么写在最后也可能无效

浏览器不是简单选择最后一条 CSS。
它先判断规则是否适用，例如选择器是否匹配、媒体条件是否成立。
再按来源、重要性、层叠层、优先级等条件比较；只有前面的条件相同，顺序才决定胜负。

下面先聚焦普通网页的作者样式：

| 比较条件 | 含义 |
| --- | --- |
| 重要性 | `!important` 声明优先于普通声明 |
| 层叠层 | 普通声明中，后定义的层优先；无层声明优先于有层声明 |
| 优先级 | 同层内比较 ID、类/属性/伪类、类型/伪元素三个计数 |
| 出现顺序 | 其他条件相同，后出现的声明胜出 |

`#panel` 的计数是 `(1,0,0)`，`.panel` 是 `(0,1,0)`，`section` 是 `(0,0,1)`。
计数按列比较，不是把十个类机械换算成一个 ID。
`:where()` 的优先级是零，`:is()` 和 `:not()` 取参数列表中最高的优先级。
继承只在元素自身没有决定该属性时提供值，不参与上述“竞争”。

内联普通样式优先于普通样式表声明；作者 `!important` 又能覆盖普通内联声明。
重要声明的层顺序反转，用户重要样式、过渡等还有更高的级别。
这里不穷举来源矩阵，复杂情况要结合 Styles 面板和官方层叠文档。

## 盒模型不是一个 width

默认 `box-sizing: content-box` 时，`width` 只描述内容区域。
实际边框盒宽度等于内容宽度加左右 padding 和 border。
`border-box` 则将 padding、border 包含在指定宽度内，但 margin 永远在外面。

块元素在普通流中可能发生相邻垂直外边距折叠。
水平方向 margin 不折叠，Flex/Grid 项之间的 margin 也不按普通流方式折叠。
写了 `width: 100%` 再加左右 margin，很容易比父容器更宽。
溢出也可能来自长单词、固定宽度子元素或 Flex 项默认最小尺寸。

## 运行步骤

1. 创建 `cascade-box/index.html` 和 `cascade-box/style.css`。
2. 启动练习服务器，打开 `/cascade-box/`。
3. 查看下面蓝色和黄色两个盒子的宽度。
4. 在 Styles 面板切换声明勾选框，观察样式来源与尺寸。

## 完整示例

::: code-group

```html [index.html]
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>层叠与盒模型实验</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <main>
    <h1>层叠与盒模型实验</h1>
    <p>容器宽度为 360px，两个盒子使用不同的尺寸计算方式。</p>
    <section class="frame" aria-labelledby="experiment-title">
      <h2 id="experiment-title">观察边界</h2>
      <p id="message" class="message">这段文字由 layers 决定颜色。</p>
      <div class="box content">content-box：300 + 40 + 8 = 348px</div>
      <div class="box border">border-box：总宽度 300px</div>
      <p class="long">https://example.test/a-very-long-unbroken-resource-identifier-for-testing</p>
    </section>
    <p>边框之外的空间来自外边距，不计入上述 300px。</p>
    <button type="button" id="measure">测量边框盒</button>
    <output id="result" aria-live="polite"></output>
  </main>
  <script>
    document.querySelector('#measure').addEventListener('click', () => {
      const first = document.querySelector('.content').getBoundingClientRect();
      const second = document.querySelector('.border').getBoundingClientRect();
      document.querySelector('#result').textContent =
        `content-box ${first.width}px；border-box ${second.width}px`;
    });
  </script>
</body>
</html>
```

```css [style.css]
@layer base, components;

@layer base {
  #message { color: #a12b28; }
  body { font-family: sans-serif; color: #222; }
}

@layer components {
  .message { color: #2359ac; }
}

main {
  max-width: 46rem;
  margin: 2rem auto;
  padding: 1rem;
}

.frame {
  width: 360px;
  border: 2px dashed #555;
}

.frame h2 { margin: 12px; }
.message { margin: 12px; }

.box {
  width: 300px;
  padding: 20px;
  border: 4px solid #345;
  margin: 12px 0;
}

.content {
  box-sizing: content-box;
  background: #e1edff;
}

.border {
  box-sizing: border-box;
  background: #fff2cd;
}

.long {
  margin: 12px;
  overflow-wrap: anywhere;
}

button { font: inherit; padding: .5rem; }
output { display: block; margin-top: 1rem; }
:focus-visible { outline: 3px solid #2359ac; outline-offset: 3px; }
```

:::

注意：无层的 `.message` 只声明 margin，没有覆盖颜色。
虽然 base 中用了 ID，components 层的普通颜色仍胜出，因为层顺序先于选择器优先级。
尺寸实验故意保留固定宽度，仅用于桌面观察；下一章会把容器改为流动布局。

## 效果验证与调试顺序

1. 段落呈蓝色；在 Styles 中红色声明被划掉。
2. 点击测量，输出分别为 `348px` 与 `300px`，前提是没有页面缩放干扰测量解释。
3. 在 Computed 的盒模型区域核对 `20px` padding 与 `4px` border。
4. 禁用 `overflow-wrap`，观察长地址越过边界；恢复后正常换行。
5. 先定位越界的元素，再检查尺寸、最小宽度、文本换行与父布局。

`getBoundingClientRect()` 测的是视觉边框盒，包含 transform 的影响。
Computed 是最终计算值，Styles 用于追溯来源，两者解决不同问题。
不要用 `overflow: hidden` 直接掩盖问题，它可能一起裁掉文字与焦点轮廓。

## 常见错误

“颜色不继承”可能是子元素自己已有声明，而不是继承失效。
“宽度差一点”先查 border/padding，不要随意减去一个看似合适的像素数。
“提高优先级就能修复”可能引入更难覆盖的规则，先查层和规则适用条件。

## 练习与验收标准

将两个盒子统一为 `border-box`，给 frame 添加内边距，并让盒子宽度占满可用空间。
验收：边框不越过容器；解释为什么不能同时保留固定 `300px` 和 `width: 100%`。
再将 components 放到 base 之前，预测颜色，然后通过 Styles 验证预测。

## 延伸资料

- [MDN：层叠](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_cascade/Cascade)
- [MDN：优先级](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_cascade/Specificity)
- [MDN：盒模型](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_box_model/Introduction_to_the_CSS_box_model)

下一章：[Flex 与 Grid 布局](./layout.md)。
