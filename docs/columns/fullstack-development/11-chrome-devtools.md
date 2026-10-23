---
title: "第 11 章：Chrome DevTools 调试"
description: "系统使用 Elements、Console、Sources、Network、Application、Performance 和 Lighthouse。"
date: '2026-10-23'
category: 浏览器调试
tags: [Chrome DevTools, 调试, Lighthouse]
series:
  order: 12
---
## 第 11 章 Chrome DevTools

### 11.0 建立可重复的调试流程

不要一看到报错就随机改代码。一个稳定的前端调试循环是：

1. **稳定复现**：记录页面地址、操作步骤、视口、网络条件和账号状态。
2. **收集证据**：先看 Console 首个异常和 Network 失败请求，再检查相关 DOM 与状态。
3. **缩小范围**：禁用可疑 CSS 声明、设置断点，或用请求阻断验证依赖关系。
4. **解释根因**：说明哪个输入经过哪条调用链导致了错误状态。
5. **最小修复**：只修改根因所在位置，不用隐藏异常或放宽校验制造“正常”。
6. **回归验证**：重新执行原步骤，并覆盖一个正常路径和一个边界路径。

调试前可勾选 Console 和 Network 的 **Preserve log**，避免跳转或刷新后证据消失。完成后关闭它，防止不同页面的日志混在一起。

#### 设备模式

用 `Cmd/Ctrl + Shift + M` 打开 Device Toolbar，可检查：

- 常见视口宽度与横竖屏。
- 触摸输入和设备像素比。
- 网络与 CPU 降速后的体验。
- CSS 媒体查询断点。

设备模式是模拟，不等于真机。移动端浏览器地址栏、软键盘、安全区、字体渲染和性能仍应在真实设备上验证。至少检查 `320px`、`390px`、`768px` 和一个桌面宽度，并拖动视口观察断点之间是否出现溢出。

### 11.1 Elements 面板

**核心操作**：

| 操作 | 快捷键/方式 |
|---|---|
| 检查元素 | `Ctrl/Cmd + Shift + C` 或点击左上角箭头 |
| 选中元素后按 `H` | 切换 `visibility: hidden` |
| 按 `Delete` | 删除节点 |
| 拖动节点 | 调整 DOM 顺序 |
| 双击属性 | 编辑属性值 |
| 双击文本 | 编辑文本内容 |
| 右键 → Break on | 设置 DOM 断点 |

**Styles 面板**：

- 被划掉的声明 = 被更高优先级覆盖
- 右上角 `element.style` = 内联样式
- 灰色 `user agent stylesheet` = 浏览器默认样式
- 声明右侧的小三角可以跳转到源码位置

**Computed 面板**：

显示元素**最终生效**的每个属性值。排查「为什么宽度是这个值」时，看这里而不是 Styles。

点击属性值旁边的箭头，能看到该值的来源和盒模型图示。

**盒模型图示**：鼠标悬停在 Computed 顶部的盒模型图上，页面上会高亮对应区域（content 蓝色，padding 绿色，border 黄色，margin 橙色）。

**Accessibility 面板**：

- 查看元素在无障碍树中的角色、名称和状态。
- 检查按钮是否有可访问名称，输入框是否关联标签。
- 确认 `aria-*` 属性是否真的改变了语义。
- 检查被 `display: none`、`hidden` 或 `aria-hidden` 排除的节点。

机器审计只能发现部分问题。还要用键盘完成主流程，确认焦点顺序、焦点可见性和弹窗关闭后的焦点恢复。

**DOM 断点（Break on）**：

右键元素 → Break on：

- **Subtree modifications**：子节点增删改时断住
- **Attribute modifications**：属性变化时断住（排查「谁改了我的 class」的利器）
- **Node removal**：节点被删除时断住

断住后会跳到 Sources 面板，调用栈直接指向修改代码。

### 11.2 Console 面板

```js
// 基础输出
console.log('普通', obj);
console.info('信息');
console.warn('警告');
console.error('错误');
console.table([{ a: 1, b: 2 }, { a: 3, b: 4 }]);

// 分组
console.group('请求详情');
console.log('url', url);
console.log('params', params);
console.groupEnd();

// 计时
console.time('loop');
for (let i = 0; i < 1e6; i++) {}
console.timeEnd('loop');    // loop: 3.42ms

// 计数
console.count('click');     // 每次调用递增

// 断言
console.assert(x > 0, 'x 必须大于 0', { x });

// 调用栈
console.trace('到这里');

// 样式化输出
console.log('%c 重要 ', 'background:#e74c3c;color:#fff;padding:4px 8px;border-radius:4px');

// 清空
console.clear();
```

**快捷变量**：

- `$0`：当前 Elements 面板选中的元素
- `$1` ~ `$4`：之前选中的元素
- `$_`：上一次 console 表达式的返回值
- `$('selector')`：等价于 `querySelector`
- `$$('selector')`：等价于 `querySelectorAll`，返回真数组

**Copy 技巧**：右键 console 里的对象 → Copy object / Copy as JSON。

`copy(obj)` 直接把对象复制到剪贴板（`copy` 是内置函数）。

**实时表达式（Live Expressions）**：点击 Console 顶部的眼睛图标，可以固定监视一个表达式，每次页面变化都会重新求值。调试响应式布局时很实用。

### 11.3 Sources 面板

**文件树**：左侧 `Page` 标签是当前页面的所有资源。`Filesystem` 可以挂载本地目录，在 DevTools 里直接改文件并保存。

**断点类型**：

#### 1. 普通断点（Line-of-code）

点击行号处设置。执行到该行时暂停。

#### 2. 条件断点

右键行号 → Add conditional breakpoint，输入表达式。**只有表达式为真时才暂停**。

```js
// 只在 id 为 42 时暂停
user.id === 42

// 只在循环第 100 次时暂停
i === 100

// 用 console 输出但不暂停 —— 不行，条件断点只能判断真假
```

**避免在循环里反复暂停拖慢调试**。

#### 3. Logpoint

右键行号 → Add logpoint，输入表达式。**不暂停执行，只往 Console 打印**。

```js
'user is', user.name, 'count', count
```

**Logpoint 的价值**：不用修改源码、不用重新构建，就能在任意位置插桩。调试生产环境代码时特别有用（普通断点会暂停，Logpoint 不会）。

#### 4. DOM 断点

在 Elements 面板设置，见 11.1。

#### 5. 事件侦听器断点（Event Listener Breakpoints）

Sources 面板右侧 → Event Listener Breakpoints。

按类别勾选：

- **Mouse**：`click` `mousedown` `mouseup` `mousemove` ...
- **Keyboard**：`keydown` `keyup` `keypress`
- **XHR/Fetch**：所有网络请求（**排查「这个请求是谁发的」必用**）
- **Timer**：`setTimeout` `setInterval`
- **Animation**：`animationstart` `animationend` `transitionend`
- **Clipboard** `Drag` `Focus` `Load` `Media` `Touch` ...

勾选 `Animation` → `animationend`，任何动画结束时都会断住，能直接看到触发代码。

#### 6. XHR/Fetch 断点

Sources 面板右侧 → XHR/fetch Breakpoints，可以输入 URL 片段。

**这是排查「页面上某处偷偷发了请求」最直接的方法。** 输入 `api/user`，任何匹配的请求发出时都会断在 `send()` 调用处。

#### 7. 异常断点

Sources 面板右上角的暂停图标：

- 灰色 = 不因异常暂停
- 蓝色 = 只在**未捕获**的异常暂停
- 红色 = **所有**异常都暂停（包括被 try/catch 捕获的）

排查「代码静默失败」时开启红色模式，能在异常抛出的瞬间看到完整调用栈。

#### 断点调试快捷键

| 快捷键 | 作用 |
|---|---|
| `F8` / `Ctrl+\` | 继续执行 |
| `F10` | 单步跳过（不进函数） |
| `F11` | 单步进入（进函数） |
| `Shift+F11` | 单步跳出 |
| `Ctrl+F8` | 禁用/启用所有断点 |
| `Ctrl+Shift+E` | 运行选中代码（在 Console 上下文） |

**Scope 面板**：显示当前作用域的所有变量（Local / Closure / Global）。可以直接双击修改值，立刻生效。

**Watch 面板**：添加任意表达式，每次暂停时重新求值。

**Call Stack 面板**：点击任意栈帧，可以跳转到对应代码位置，Scope 面板也会切换到那个帧的作用域。这是定位「谁调用了我」的标准手段。

**Async 调用栈**：Call Stack 顶部有个 "Async" 复选框，勾上后能看到跨越 `await` / `setTimeout` 的异步调用链。

**Snippets**：Sources 面板左侧 → Snippets，可以保存一段脚本反复运行。适合放常用的调试工具函数。

### 11.4 Network 面板

#### 关键列

| 列 | 含义 |
|---|---|
| Name | 请求路径 |
| Status | HTTP 状态码 |
| Type | 资源类型（document / stylesheet / script / fetch / xhr / img / font） |
| Initiator | **发起位置**（见下） |
| Size | 传输大小 / 解压后大小 |
| Time | 总耗时 |
| Waterfall | 各阶段耗时可视化 |

#### Initiator 列 —— 请求发起位置追踪

鼠标悬停在 Initiator 上会显示完整调用链：

```
Request
  ├─ main.js:142 (fetchUser)
  └─ app.js:88 (init)
```

点击任意一行会跳到 Sources 面板对应位置。**这是回答「这个接口是谁调的」的最快途径。**

如果显示 `Parser` 或 `Other`，说明是浏览器解析 HTML 时自动发起的（如 `<img>`、`<script>`）。

#### Waterfall 各阶段

| 阶段 | 颜色 | 含义 |
|---|---|---|
| Queueing | 灰色 | 排队（连接数超限、被更高优先级抢占） |
| Stalled | 灰色 | 等待可用连接 |
| DNS Lookup | 深绿 | DNS 解析 |
| Initial Connection | 橙色 | TCP 握手 |
| SSL | 紫色 | TLS 握手 |
| Request Sent | 灰蓝 | 发送请求 |
| Waiting (TTFB) | 绿色 | 等待服务器首字节 |
| Content Download | 蓝色 | 接收响应体 |

**TTFB 过长**可能来自网络往返、代理、缓存未命中或服务端处理，应结合服务端时间与链路追踪定位。**Content Download 过长**可能来自体积、带宽或服务端分块发送，不能单凭一个阶段下根因结论。

#### 右键菜单常用项

- **Copy → Copy as fetch**：把请求复制成 `fetch()` 代码，可直接在 Console 里重放
- **Copy → Copy as cURL**：复制成 curl 命令
- **Copy → Copy response**：复制响应体
- **Save as HAR with content**：导出完整抓包文件，可以发给别人分析
- **Block request URL**：屏蔽该请求，测试资源加载失败的表现
- **Replay XHR**：重发 XHR 请求

#### Filter 框的高级语法

```
status-code:500               # 只看 500
method:POST                   # 只看 POST
domain:api.example.com        # 按域名过滤
larger-than:100k              # 只看大于 100KB 的
mime-type:application/json
-has-response-header:cache-control    # 排除
is:from-cache                 # 只看缓存命中
```

多个属性过滤条件通常同时约束结果；复杂布尔语法随版本变化，排查多个状态时分别筛选并核对可见请求，不能假设所有版本都支持任意 `OR` 表达式。

#### 慢速网络模拟

Network 面板顶部的 **Throttling** 下拉：

| 预设 | 下行 | 上行 | 延迟 |
|---|---|---|---|
| Fast 4G | 4 Mbps | 3 Mbps | 20ms |
| Slow 4G | 1.6 Mbps | 750 Kbps | 150ms |
| Fast 3G | 1.6 Mbps | 750 Kbps | 562ms |
| Slow 3G | 400 Kbps | 400 Kbps | 2000ms |
| Offline | 断网 | | |

也可以点 **Add...** 自定义。测移动端体验时至少用 Slow 4G 过一遍。

**Disable cache** 通常只在 DevTools 打开时禁用浏览器 HTTP 缓存，不会自动清除 Service Worker 的 Cache Storage、CDN 或服务端缓存。首次加载与缓存后加载都应分别记录。

#### 其他实用功能

- **Preserve log**：页面跳转后保留之前的请求记录。排查登录跳转、SPA 路由切换必用。
- **Disable cache**：见上。
- **Request blocking**：右键 → Block request domain，测试第三方服务挂掉时的降级表现。
- **Network conditions**（在 Network 面板右上角菜单里）：可以自定义 User-Agent，测试移动端 UA 判断。

### 11.5 Application 面板

| 分区 | 用途 |
|---|---|
| **Manifest** | PWA 配置，可检查图标、名称、启动方式 |
| **Service Workers** | 查看注册的 SW、离线缓存、可强制更新/注销 |
| **Storage** | 总占用空间，可按类型清除 |
| **Local Storage** | 键值对查看/编辑/删除 |
| **Session Storage** | 同上 |
| **IndexedDB** | 结构化数据，可展开查看对象仓库 |
| **Cache Storage** | SW 缓存的具体条目 |
| **Cookies** | 按域名分组，可编辑值、过期时间、Secure/HttpOnly 标志 |
| **Background Services** | 后台同步、推送、定期同步 |

**调试存储的常见操作**：

- 双击值可编辑，回车生效
- 右键 → Delete 删除单条
- 顶部 🚫 图标清空全部
- 修改后刷新页面验证代码逻辑

**Cookie 面板的关键列**：

- `HttpOnly`：JS 无法读取（防 XSS 窃取），排查「为什么 `document.cookie` 读不到」看这里
- `Secure`：只在 HTTPS 下发送
- `SameSite`：`Strict` / `Lax` / `None`（`None` 必须配合 `Secure`）
- `Expires / Max-Age`：会话 Cookie 显示为 `Session`

### 11.6 Performance 面板

#### 录制流程

1. 点 ⚙️ 图标，勾选 **Screenshots**（看到每帧画面）和 **Web Vitals**（看到性能指标）
2. 点 ⏺ 开始录制
3. 执行要分析的操作（滚动、点击、加载）
4. 点 ⏹ 停止

#### 看懂火焰图

**Frames 轨道**：每一帧一个绿色竖条。红条 = 掉帧（超过 16.7ms）。

**Main 轨道**：主线程活动，从下往上是调用栈：

- **黄色** = JavaScript 执行
- **紫色** = Style Recalculation + Layout
- **绿色** = Paint + Composite
- **灰色** = 系统任务、GC

**长任务（Long Task）** 会标红三角。超过 50ms 的任务阻塞交互响应，是卡顿的元凶。

**点击任意色块**，底部的 Summary 面板会显示该任务的耗时拆解。

#### 关键指标

- **FCP（First Contentful Paint）**：首次内容绘制，应 < 1.8s
- **LCP（Largest Contentful Paint）**：最大内容绘制，应 < 2.5s
- **CLS（Cumulative Layout Shift）**：累积布局偏移，应 < 0.1
- **TBT（Total Blocking Time）**：总阻塞时间，应 < 200ms
- **INP（Interaction to Next Paint）**：交互到下一帧绘制，应 < 200ms

#### Insights 面板

新版 DevTools 的 Insights 侧边栏会自动分析并给出可操作建议：

- 「LCP 元素是这张图，加载耗时 2.1s，建议 preload」
- 「发现 3 个长任务，最长 320ms，位于 main.js:1200」
- 「DOM 尺寸过大，有 4200 个节点」

**从 Insights 开始看，再深入火焰图定位。**

### 11.7 Lighthouse 面板

运行所选审计类别，现代 Lighthouse 的常见分类为 Performance、Accessibility、Best Practices、SEO；旧版 PWA 分类已移除，PWA 应另行检查 Manifest、Service Worker 和实际安装体验。

#### 配置选项

| 选项 | 说明 |
|---|---|
| Mode | Navigation（加载页面）/ Timespan（一段时间内的交互）/ Snapshot（当前状态） |
| Device | Mobile（默认，模拟中端手机 + 4G）/ Desktop |
| Categories | Performance / Accessibility / Best Practices / SEO |
| Clear storage | 每次跑之前清空缓存和存储（**测首次加载必勾**） |

#### 各分类关注点

**Performance**：

- 消除阻塞渲染的资源（把 CSS 内联关键部分、JS 加 `defer`）
- 图片压缩、用 WebP/AVIF、设置正确尺寸
- 减少未使用的 JS/CSS
- 启用文本压缩（gzip/brotli）
- 合理设置缓存策略

**Accessibility**：

- 图片有 `alt`
- 表单控件有关联的 `label`
- 颜色对比度达标（正文 4.5:1，大字 3:1）
- 按钮/链接有可访问名称
- 标题层级不跳级

**Best Practices**：

- HTTPS
- 控制台无错误
- 不请求已弃用的 API

**SEO**：

- 有 `<meta name="description">`
- 可被抓取（`robots.txt` 不误挡）
- 链接文本有描述性（不是「点击这里」）
- 页面有 `<title>`

#### 常见优化项速查

```html
<!-- 图片：显式尺寸防 CLS，懒加载首屏外的 -->
<img src="hero.webp" width="1200" height="600"
     alt="描述" loading="eager" fetchpriority="high" decoding="async">

<img src="thumb.webp" width="300" height="200"
     alt="描述" loading="lazy" decoding="async">

<!-- 关键资源预加载 -->
<link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preconnect" href="https://api.example.com">

<!-- 脚本延迟 -->
<script src="app.js" defer></script>
```

**Lighthouse 分数不是目标**。它是个检查清单，帮你发现明显问题。为了刷 100 分做出一堆无意义的优化（比如内联所有 CSS 导致无法缓存）是本末倒置。

### 11.8 辅助诊断面板

通过右上角菜单的 **More tools** 或命令面板打开以下工具：

| 工具 | 适合排查 |
|---|---|
| Issues | Cookie、跨源、弃用 API 和浏览器安全策略问题 |
| Coverage | 当前页面加载但未使用的 CSS 与 JavaScript |
| Rendering | 重绘闪烁、布局偏移区域、帧率与媒体特性模拟 |
| Performance monitor | CPU、JS 堆、DOM 节点和事件监听器的实时变化 |
| Memory | 堆快照、分配采样和疑似内存泄漏 |
| Security | HTTPS、证书和混合内容 |

Coverage 中的“未使用”只代表**本次录制期间**没有执行或匹配。菜单、弹窗和懒加载路由尚未操作时会被计为未使用，不能据此直接删除代码。

排查内存泄漏时，可以采用“三次操作法”：

1. 操作前获取一次 Heap snapshot。
2. 重复打开并关闭目标功能三次。
3. 强制垃圾回收后再获取快照并比较。

如果同类 DOM 节点、监听器或业务对象持续增长且无法被回收，再沿 Retainers 路径查找是谁仍持有引用。

### 官方资料与隐私边界

面板名称、颜色、快捷键和降速预设不是稳定 API，以本机版本界面为准；把旧表中的带宽数值当作示意，不当作当前默认值。Core Web Vitals 使用真实访问第 75 百分位，TBT 是实验室指标，不能替代 INP。

HAR、Copy as cURL 和堆快照可能包含 Cookie、Authorization、请求体和个人数据。分享前脱敏，不能因工具默认隐藏部分敏感头就认为整个文件无敏感内容；不要重放真实支付、删除或发布请求。

- [Chrome Network 参考](https://developer.chrome.com/docs/devtools/network/reference/)
- [Chrome Performance](https://developer.chrome.com/docs/devtools/performance/)
- [Lighthouse 官方概览](https://developer.chrome.com/docs/lighthouse/overview/)
- [Web Vitals](https://web.dev/articles/vitals)

---
