---
title: 可回溯滚动叙事：路径测量、锚点和输入仲裁
description: 让真实作品节点沿滚动点亮，用同一份几何缓存协调索引、hash、历史返回和尺寸变化。
date: '2026-11-03'
id: lab-reversible-work-timeline
category: 前端实验
tags: [SVG, ResizeObserver, 滚动交互]
level: intermediate
demoIds: [timeline]
source:
  path: docs/.vitepress/theme/components/WorkTimeline.vue
  ref: working-tree
  command: pnpm dev
runtime: Vue 3.5.44；SVG、ResizeObserver 与原生滚动
verification:
  kind: browser
  evidence: timeline-data.test.ts 校验日期和提交来源；data-labs.e2e.ts 验证索引定位、直接 hash 与后退。节点来自公开提交，不代表未核实的个人履历。
---

## 先有可核查的作品，再有时间线

关于页的时间线使用 `docs/content/config/about.yml`，每条数据包含日期、标题、描述、作品链接和完整提交来源。日期按先后排列，ID 稳定且唯一。没有来源的条目不会进入发布数据。

仓库创建时间只能证明仓库创建，不能自动推导个人开始学习某项技术的时间。这里展示公开构建记录，连线表达作品之间的时间顺序，不额外宣称职业成就或技能等级。

构建时的校验代码如下：

<<< @/.vitepress/data/timeline.ts

URL 格式校验只能约束来源形态，不能证明提交内容支持所有表述。新增节点仍需要作者核对该提交实际变更与文案是否一致。

## 为什么路径不应该写死坐标

同一标题在 1440px 和 390px 下换行不同，简介长度和字体也会改变节点高度。把 SVG 节点坐标写成等间隔，文本一旦变化就会脱离连线。

`WorkTimeline.vue` 用真实 `.work-entry` 边界计算两套值：相对 track 顶部的位置用于 SVG 路径，文档绝对顶部用于滚动选择。SVG 的 viewBox 高度与列表 scrollHeight 对齐，因此路径能跟随内容增长。

```ts
const top = track.getBoundingClientRect().top;
const documentTops = nodes.map(node =>
  node.getBoundingClientRect().top + scrollY);
const positions = nodes.map(node =>
  node.getBoundingClientRect().top - top + 30);
```

30px 是节点标记在条目内部的设计偏移；它与条目顶部留白共同定义视觉位置。若改版时调整条目排版，这个偏移也应一并复核，而不是当作算法常量。

## 滚动帧只读取缓存

ResizeObserver、窗口变化和字体就绪触发重新测量。普通 scroll 事件只请求一次 rAF，在该帧使用缓存的 documentTops 与滚动位置比较。

活动阈值设在视口上部，取 `min(innerHeight * .38, 260)`。选择最后一个已经越过阈值的节点，使正向和反向滚动使用同一规则。无需写两套“进场”和“退场”状态，否则来回滚动容易出现方向不一致。

静止时不创建持续动画循环；SVG 只随真实输入更新。主要正文不会滑出屏幕，装饰连线和当前节点颜色承担反馈。

## 手动索引与原生滚动合作

年份链接定位该年第一条实际记录，滑块定位具体作品。手动选择写入 `#work-<id>`，然后调用 scrollIntoView；系统减少动态时使用 instant，其他情况允许 smooth。

页面滚动仍会更新活动节点，所以平滑定位途中的当前项可能逐个变化。这是反映实际视口位置，而不是锁住索引直到动画结束。没有强制滚轮捕获或全页 scroll-snap，用户随时可以中断并反向浏览。

popstate 与 hashchange 读取真实锚点并恢复位置。首次挂载也处理 hash，因此从外部直接打开某个作品与站内点击使用同一入口。卸载后取消 rAF、断开 Observer、移除监听器；字体 Promise 完成时还要检查组件是否已销毁。

## 移动端和无 JavaScript 的路径

宽屏索引在正文旁 sticky，窄屏改成普通横向控件区域。范围输入不禁用整页滚动，文本列表保留正常文档流。SVG 是装饰，对读屏隐藏；作品标题与提交来源都是普通链接。

关闭 JavaScript 后，构建出的时间有序列表与来源仍可阅读，年份锚点也有实际 href。缺失的只是自动点亮和测量路径，不是内容本身。

## 验证恢复，而不仅是向下滚一次

运行 `pnpm dev`，打开 `/abinzhao/about.html` 或 `/abinzhao/labs/timeline.html`。向下再向上滚动，拖动作品索引，访问作品后点击后退，再直接打开带 hash 的地址，检查当前项和视口一致。

运行 `pnpm exec vitest run tests/timeline-data.test.ts` 校验数据，运行 `pnpm exec playwright test tests/e2e/data-labs.e2e.ts` 覆盖交互。改变窗口宽度和字体加载条件后还应观察路径与文字对齐。截图能发现几何错位，URL 与焦点断言才能证明导航可恢复。

参考：[ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver)、[History API](https://developer.mozilla.org/en-US/docs/Web/API/History_API)。后续添加作品只需补充有来源的数据；几何从实际内容重建，不需要手工重画时间线。
