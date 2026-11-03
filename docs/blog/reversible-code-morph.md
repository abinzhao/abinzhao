---
title: 可逆的代码 Morph：稳定标识、动画取消与可访问性
description: 构建时完成 token 匹配，运行时只移动节点，让代码、复制结果和真实 CSS 预览始终一致。
date: '2026-11-03'
id: lab-reversible-code-morph
category: 前端实验
tags: [WAAPI, 代码展示, 可访问性]
level: advanced
demoIds: [code-morph]
source:
  path: docs/.vitepress/theme/labs/CodeMorph.vue
  ref: working-tree
  command: pnpm dev
runtime: Vue 3.5.44；Web Animations API，减少动态时即时更新
verification:
  kind: browser
  evidence: code-morph.test.ts 核对 token 还原和稳定身份；labs-interactions.e2e.ts 核对跳步、复制、真实 iframe 样式和反向播放。
---

## 代码演化首先是内容一致性问题

一段代码从 `width` 改成 `transform` 时，读者希望看清哪些部分保留、哪些部分改变。动画如果生成了第二份视觉代码，就容易出现复制到旧内容、读屏重复朗读、快速跳步后预览落后等问题。

这里让一个 `step` 同时决定源码、讲解与预览。DOM 中只有一份代码文本，动画只改变 token 元素的视觉位置。复制直接读取 `current.source`；预览 iframe 的样式也来自这份字符串，而不是另写一套“看起来差不多”的演示。

## 用有限匹配获得稳定身份

三个步骤的源文件位于 `examples/site-labs/progress-*.css`。VitePress data loader 在构建阶段读取它们，词法切分保留空白，再通过相邻步骤的最长公共子序列复用 token ID。

<<< @/.vitepress/data/code-tokens.ts

LCS 复杂度是 O(mn)，所以这个办法用于几十行的受控 CSS 示例，不适合用户随意上传的巨大文件。相同的标点可能存在多个等价匹配；算法选择确定性路径，并不理解程序语义。这里的身份代表“此演示里沿用的文本片段”，不能用于代码审查或 AST 重构。

空白仍在 DOM 中，保证连接全部 token 后能够还原源码。非空白 token 使用 `inline-block`，让浏览器能够对它们执行 transform；不需要每帧高亮全文。反向播放选择同一组预先生成的步骤，因此不会倒放一段已经失效的动画时间线。

## 中断时从当前位置重新出发

切换前读取 token 的 `getBoundingClientRect()`；取消旧动画；等待 Vue `nextTick()` 提交新内容；读取终态；对保留 token 施加从旧位置到新位置的差值。这是 FLIP 的 First、Last、Invert、Play 四步。

值得注意的是采样顺序：旧动画尚未取消时测量当前视觉坐标，才能从中途的位置衔接。若先取消再测量，元素会先跳回旧布局终点。公共实现 `use-flip.ts` 用递增序号拒绝过期的异步测量，用 `animation.finished.catch(...)` 消化取消产生的拒绝，并在卸载、窗口变化或减少动态时取消全部动画。

步骤改变立即生效；动画只是解释已经发生的变化。无 WAAPI 时源码和预览照常更新，用户不会等待动画结束才能阅读下一步。

## 让预览执行真实样式

第二步的源码如下。滑块改变 `--progress`，iframe 展示该 CSS 真实产生的结果。

<<< @/../examples/site-labs/progress-transform.css

iframe 使用空 `sandbox`，不允许脚本执行。内容仅来自仓库内受维护的有限示例；此结构不是任意 HTML 编辑器的安全方案。如果未来接收用户输入，需要重新设计隔离 origin、URL 处理和资源访问，而不能仅套用当前字符串拼接方式。

最后一步增加 `contain: layout paint`。这限制内部布局和绘制影响范围，但也会改变格式化上下文、裁剪溢出内容；不能仅因为名称带“性能”就添加到所有容器上。`transform` 也不保证永远独立合成，必须结合渲染实验核对。

## 播放、复制与降级

播放每次只调度一个有限 timeout，达到首尾自动停止；用户手动跳步先取消计时器。离屏、后台或系统减少动态会暂停自动推进。减少动态时仍能手动选择各步骤、复制代码和查看预览。

复制失败时提示用户选中文本，不能显示虚假的“复制成功”。按钮保持可聚焦，范围输入支持键盘，当前步骤摘要使用状态区域播报；没有给每个 token 单独加 aria-live，以免读屏朗读大量碎片。

运行 `pnpm dev` 后进入 `/abinzhao/labs/code-morph.html`，快速在第 1、3、2 步之间切换，再反向播放。用 `pnpm exec vitest run tests/code-morph.test.ts` 核对数据，用 `pnpm exec playwright test tests/e2e/labs-interactions.e2e.ts` 验证复制结果与 iframe 的计算样式。

参考：[Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API)、[Animation.cancel](https://developer.mozilla.org/en-US/docs/Web/API/Animation/cancel)。本实现不依赖动画库，也没有执行读者输入的 JavaScript。
