---
title: "第 1 章：HTML5 语义、表单与浏览器 API"
description: "掌握语义化结构、表格表单、多媒体、图形、无障碍和常用浏览器 API。"
date: '2026-10-23'
category: HTML
tags: [HTML5, 语义化, 无障碍]
series:
  order: 2
---
## 第 1 章 语义化标签

### 1.1 为什么用语义化标签

三个实际理由，不是「代码好看」：

1. **无障碍**：屏幕阅读器靠标签判断区域，把整页都写成 `<div>` 会导致读屏用户无法跳转区块。
2. **内容理解**：清晰的标题层级和内容区域能帮助搜索引擎、阅读模式等工具理解页面结构，但语义标签本身不是排名捷径。
3. **可维护性**：半年后你自己看 `<nav>` 比看 `<div class="nav-wrapper">` 快。

### 1.2 标准页面骨架

```html
<body>
  <header>
    <h1>站点名</h1>
    <nav aria-label="主导航">
      <ul>
        <li><a href="/" aria-current="page">首页</a></li>
        <li><a href="/archive.html">归档</a></li>
        <li><a href="/about.html">关于</a></li>
      </ul>
    </nav>
  </header>

  <main>
    <article>
      <header>
        <h2>文章标题</h2>
        <p><time datetime="2026-10-15">2026-10-15</time></p>
      </header>
      <section>
        <h3>小节标题</h3>
        <p>正文……</p>
      </section>
    </article>

    <aside aria-label="侧边栏">
      <h2>相关链接</h2>
    </aside>
  </main>

  <footer>
    <p>© 2026 站点名</p>
  </footer>
</body>
```

### 1.3 逐个说明与使用边界

| 标签 | 语义 | 使用规则 |
|---|---|---|
| `<header>` | 页头 / 区块头部 | 可以出现在 `<body>`、`<article>`、`<section>` 内，不是只能有一个 |
| `<nav>` | 导航链接组 | 只放主要导航，页脚的一堆链接不需要包 |
| `<main>` | 页面主内容 | 最多一个未带 `hidden` 的 main；不得置于 article、aside、footer、header 或 nav 内 |
| `<section>` | 主题性分组 | 通常应有标题；仅为布局分组时用 div，标题不是所有 section 的语法必需条件 |
| `<article>` | 可独立分发的内容 | 博客文章、论坛帖、新闻条目、评论 |
| `<aside>` | 与主内容间接相关 | 侧边栏、广告位、作者简介、相关阅读 |
| `<footer>` | 页脚 / 区块尾部 | 同 `<header>`，可多次出现 |
| `<figure>` / `<figcaption>` | 插图 + 图注 | 代码块、图表、图片都适用 |
| `<details>` / `<summary>` | 可折叠详情 | 原生折叠，无需 JS |

**`<section>` vs `<div>` 的判别**：这个区块的内容能不能起一个标题？能，用 `<section>`；不能（纯粹为了布局分组），用 `<div>`。

**`<article>` vs `<section>` 的判别**：这段内容单独拿出去（RSS、分享）还完整吗？完整，用 `<article>`。

### 1.4 文本标签

```html
<h1>页面唯一主标题</h1>            <!-- 每页一个，不要跳级 -->
<p>段落文本</p>
<strong>重要内容</strong>          <!-- 语义=重要，默认加粗 -->
<em>强调内容</em>                  <!-- 语义=强调，默认斜体 -->
<b>关键词</b>                      <!-- 引起注意，但不增加重要性 -->
<i>术语</i>                        <!-- 区别于普通文本的语气、术语等，不等于强调 -->
<mark>高亮</mark>
<small>法律声明等附属信息</small>
<del>删除内容</del>
<ins>新增内容</ins>
<code>行内代码</code>
<pre><code>代码块</code></pre>
<kbd>Ctrl + C</kbd>
<abbr title="Cascading Style Sheets">CSS</abbr>
<blockquote cite="https://example.com">引用内容</blockquote>
<q>行内引用</q>
<time datetime="2026-10-15T10:00">2026年10月15日 10:00</time>
<br>   <!-- 仅用于诗歌、地址等需要强制换行的地方，不要用来做段落间距 -->
<hr>   <!-- 语义是「主题转换」，不是分割线 -->
```

**不要**用 `<b>`/`<i>` 表达重要或强调，不要用 `<br>` 做布局间距（用 CSS `margin`）。

### 1.5 列表

```html
<!-- 无序列表：顺序不重要 -->
<ul>
  <li>苹果</li>
  <li>香蕉</li>
</ul>

<!-- 有序列表 -->
<ol start="3" reversed>
  <li>第三步</li>
  <li>第二步</li>
</ol>

<!-- 描述列表：术语 + 解释 -->
<dl>
  <dt>HTML</dt>
  <dd>超文本标记语言，负责结构</dd>
  <dt>CSS</dt>
  <dd>层叠样式表，负责表现</dd>
</dl>

<!-- 嵌套必须写在 li 内部 -->
<ul>
  <li>前端
    <ul>
      <li>HTML</li>
      <li>CSS</li>
    </ul>
  </li>
</ul>
```

导航栏几乎永远用 `<ul>` + `<li>` + `<a>`，因为这是「一组链接」，语义正确，且对屏幕阅读器会播报「列表，3 项」。

### 1.6 表格

表格只用于**展示数据**，不用于布局。

```html
<table>
  <caption>2026 年季度营收（单位：万元）</caption>
  <thead>
    <tr>
      <th scope="col">季度</th>
      <th scope="col">营收</th>
      <th scope="col">同比</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">Q1</th>
      <td>1,200</td>
      <td>+12%</td>
    </tr>
    <tr>
      <th scope="row">Q2</th>
      <td>1,450</td>
      <td>+8%</td>
    </tr>
  </tbody>
  <tfoot>
    <tr>
      <th scope="row">合计</th>
      <td>2,650</td>
      <td>+10%</td>
    </tr>
  </tfoot>
</table>
```

关键点：

- `<caption>` 写在 `<table>` 内的第一个子元素，是表格标题。
- `<th scope="col">` 表头列，`<th scope="row">` 表头行。加上 `scope` 屏幕阅读器才能把单元格和数据关联起来。
- 跨列 `colspan="2"`，跨行 `rowspan="3"`。

#### 链接、图片与嵌入内容

链接必须有明确目的。不要用“点这里”作为唯一文字，也不要用没有 `href` 的 `<a>` 充当按钮：

```html
<a href="./article.html">阅读 CSS 布局教程</a>
<a href="#examples">跳到示例</a>
<a href="mailto:hi@example.com">发送邮件</a>
<a href="tel:+8613800000000">拨打电话</a>

<a href="https://example.com" target="_blank" rel="noopener noreferrer">
  在新标签页打开外部站点
</a>
```

- **导航到另一个地址**用 `<a>`，**触发页面行为**用 `<button>`。
- 新窗口链接应让用户能从上下文中预期其行为。
- `download` 可提示浏览器下载资源，但跨源地址是否生效取决于响应和浏览器策略。

图片要同时处理语义、尺寸和加载策略：

```html
<figure>
  <img
    src="./assets/layout-800.webp"
    srcset="
      ./assets/layout-480.webp 480w,
      ./assets/layout-800.webp 800w,
      ./assets/layout-1200.webp 1200w
    "
    sizes="(max-width: 640px) 100vw, 800px"
    width="800"
    height="450"
    loading="lazy"
    decoding="async"
    alt="博客首页在桌面端显示三列文章卡片"
  >
  <figcaption>桌面端文章列表布局</figcaption>
</figure>
```

- `alt` 描述图片传达的信息；纯装饰图片使用 `alt=""`。
- `width` 和 `height` 提供固有宽高比，减少图片加载后的布局偏移。
- 首屏关键图片不要使用 `loading="lazy"`，可按需设置 `fetchpriority="high"`。
- `srcset` 提供候选资源，`sizes` 告诉浏览器图片最终会占多宽，由浏览器选择合适文件。

图片内容在不同屏幕需要不同裁切时，使用 `<picture>`：

```html
<picture>
  <source media="(max-width: 640px)" srcset="./assets/cover-mobile.webp">
  <source type="image/avif" srcset="./assets/cover.avif">
  <img src="./assets/cover.webp" width="1200" height="630" alt="教程封面">
</picture>
```

嵌入第三方页面时必须提供标题，并尽量收紧权限：

```html
<iframe
  src="https://example.com/embed/map"
  title="办公地点地图"
  loading="lazy"
  sandbox="allow-scripts allow-same-origin"
  referrerpolicy="strict-origin-when-cross-origin"
></iframe>
```

`sandbox` 未传值时限制最严格，应只按实际需求逐项放开能力。不要同时对不可信页面开放过多权限。

### 1.7 表单

#### 基础结构

```html
<form action="/api/submit" method="post" novalidate>
  <fieldset>
    <legend>账号信息</legend>

    <p>
      <label for="username">用户名</label>
      <input type="text" id="username" name="username" required>
    </p>

    <p>
      <label for="email">邮箱</label>
      <input type="email" id="email" name="email" required>
    </p>
  </fieldset>

  <button type="submit">提交</button>
</form>
```

- `action`：提交地址；`method`：`get`（参数拼在 URL）或 `post`（参数在请求体）。
- `novalidate`：关闭浏览器默认校验气泡，改用自定义校验 UI。
- `<label for="id">` 的 `for` 必须等于对应控件的 `id`。这样点击文字能聚焦输入框，屏幕阅读器能读出标签。**这是最常被忽略的可访问性要点。**
- `<fieldset>` + `<legend>` 用于把一组相关控件（尤其是单选/多选组）打包。

#### 全部输入类型

```html
<input type="text">          <!-- 单行文本 -->
<input type="password">      <!-- 密码，值被遮蔽 -->
<input type="email">         <!-- 邮箱，移动端键盘带 @ -->
<input type="tel">           <!-- 电话，移动端弹数字键盘，不校验格式 -->
<input type="url">           <!-- URL，提交时校验协议 -->
<input type="search">        <!-- 搜索，部分浏览器带清除按钮 -->
<input type="number" min="1" max="100" step="1">  <!-- 数字，带步进器 -->
<input type="range" min="0" max="100" value="50" step="10"> <!-- 滑块 -->
<input type="date">          <!-- 日期选择器 -->
<input type="time">          <!-- 时间 -->
<input type="datetime-local"> <!-- 本地日期时间 -->
<input type="month">         <!-- 年月 -->
<input type="week">          <!-- 年周 -->
<input type="color" value="#ff6600"> <!-- 取色器 -->
<input type="file" accept="image/png, image/jpeg" multiple> <!-- 文件 -->
<input type="checkbox" id="a" checked>  <!-- 复选框 -->
<input type="radio" name="g" value="1"> <!-- 单选框，同 name 互斥 -->
<input type="hidden" name="token" value="abc"> <!-- 隐藏字段 -->
<input type="submit" value="提交">
<input type="reset" value="重置">
<input type="button" value="普通按钮">
```

**`type="number"` 的坑**：它允许输入 `e`、`+`、`-`。如果只想收纯数字（比如手机号），用 `type="text" inputmode="numeric" pattern="[0-9]*"`。

#### 其他表单控件

```html
<!-- 多行文本 -->
<textarea name="content" rows="6" cols="40" maxlength="500"></textarea>

<!-- 下拉选择 -->
<select name="city">
  <optgroup label="华东">
    <option value="sh">上海</option>
    <option value="hz">杭州</option>
  </optgroup>
  <optgroup label="华南">
    <option value="gz" selected>广州</option>
  </optgroup>
</select>

<!-- 多选下拉（按住 Ctrl/Cmd 多选，体验差，一般用复选框代替） -->
<select name="tags" multiple size="4">...</select>

<!-- 输入建议：input 与 datalist 通过 list 属性关联 -->
<input list="langs" name="lang">
<datalist id="langs">
  <option value="JavaScript">
  <option value="TypeScript">
  <option value="Rust">
</datalist>

<!-- 输出计算结果 -->
<output name="result" for="a b">0</output>

<!-- 进度条（确定进度） -->
<progress value="70" max="100">70%</progress>

<!-- 度量衡（已知范围内的标量，如磁盘占用） -->
<meter value="0.7" min="0" max="1" low="0.3" high="0.8" optimum="0.1">70%</meter>
```

#### 验证属性全表

| 属性 | 作用 | 适用类型 |
|---|---|---|
| `required` | 必填 | 除 hidden、range、color、button 类 |
| `minlength` / `maxlength` | 字符数范围 | text、search、url、tel、email、password、textarea |
| `min` / `max` | 数值/日期范围 | number、range、date 系 |
| `step` | 步长 | number、range、date 系 |
| `pattern` | 正则（**隐式锚定整串**，不用写 `^$`） | text、search、url、tel、email、password |
| `type` | 内置格式校验 | email、url |
| `accept` | 文件类型过滤 | file |
| `multiple` | 允许多值 | email、file |
| `novalidate` | 加在 form 上，关闭校验 | form |
| `formnovalidate` | 加在按钮上，单次跳过校验 | submit |

```html
<form id="f">
  <input type="text" name="user" required minlength="3" maxlength="16"
         pattern="[A-Za-z0-9_]+" title="只能包含字母、数字、下划线">
  <input type="number" name="age" min="18" max="120" step="1">
  <input type="url" name="site">
  <button>提交</button>
</form>
```

#### 约束验证 API（JS 侧）

```js
const input = document.querySelector('[name="user"]');

// 是否通过校验（不显示 UI）
input.checkValidity();          // true / false

// 是否通过校验，且失败时浏览器弹出提示气泡
input.reportValidity();

// 详细状态对象，全部只读
input.validity.valid            // 总体是否有效
input.validity.valueMissing     // 违反了 required
input.validity.typeMismatch     // 违反了 type（如 email 格式错）
input.validity.patternMismatch  // 违反了 pattern
input.validity.tooShort         // 短于 minlength
input.validity.tooLong          // 长于 maxlength
input.validity.rangeUnderflow   // 小于 min
input.validity.rangeOverflow    // 大于 max
input.validity.stepMismatch     // 不符合 step
input.validity.badInput         // 用户输入了浏览器无法解析的内容
input.validity.customError      // 设置了 setCustomValidity 的非空字符串

// 设置自定义错误信息
input.setCustomValidity('这个用户名已被占用');
// 清空（必须清空，否则永远校验失败）
input.setCustomValidity('');
```

#### 自定义校验 UI 的完整写法

```html
<style>
  input:invalid:not(:placeholder-shown) {
    border-color: #e5484d;
  }
  .error {
    color: #e5484d;
    font-size: 0.875rem;
    min-height: 1.2em;
  }
</style>

<form id="signup" novalidate>
  <label for="email">邮箱</label>
  <input type="email" id="email" name="email" required placeholder="you@example.com">
  <p class="error" id="email-error" aria-live="polite"></p>
  <button>注册</button>
</form>

<script>
const form = document.getElementById('signup');
const email = form.elements.namedItem('email');
const errBox = document.getElementById('email-error');

function showError(msg) {
  errBox.textContent = msg;
  email.setCustomValidity(msg);
  email.setAttribute('aria-invalid', msg ? 'true' : 'false');
}

function validateEmail() {
  email.setCustomValidity('');
  if (email.validity.valueMissing) return showError('邮箱不能为空');
  if (email.validity.typeMismatch) return showError('邮箱格式不正确');
  showError('');
}

email.addEventListener('blur', validateEmail);
email.addEventListener('input', () => {
  if (email.getAttribute('aria-invalid') === 'true') validateEmail();
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  validateEmail();
  if (!form.checkValidity()) {
    form.reportValidity();   // 或用上面的自定义逻辑
    return;
  }
  // 通过校验，提交
  const data = Object.fromEntries(new FormData(form));
  console.log(data);
});
</script>
```

`Object.fromEntries(new FormData(form))` 适合字段名唯一的简单表单。同名复选框会只保留最后一个值，需要使用 `getAll()`；未选复选框、禁用控件不会被收集，文件值是 `File` 而非字符串。表单校验是交互辅助，服务端仍需重新校验。

### 1.8 多媒体

```html
<!-- 视频 -->
<video controls width="640" poster="cover.jpg" preload="metadata" playsinline>
  <source src="movie.webm" type="video/webm">
  <source src="movie.mp4" type="video/mp4">
  你的浏览器不支持 video 标签，<a href="movie.mp4">下载视频</a>。
</video>

<!-- 音频 -->
<audio controls preload="none">
  <source src="song.ogg" type="audio/ogg">
  <source src="song.mp3" type="audio/mpeg">
</audio>

<!-- 字幕轨（WebVTT 格式） -->
<video controls>
  <source src="v.mp4" type="video/mp4">
  <track kind="subtitles" src="zh.vtt" srclang="zh" label="中文" default>
  <track kind="captions" src="en.vtt" srclang="en" label="English">
</video>
```

关键属性：

- `controls`：显示浏览器默认控件。不写就完全没控件，需要自己用 JS 调 `play()` / `pause()`。
- `preload`：`none`（不预载）/ `metadata`（只载元数据，推荐）/ `auto`。
- `playsinline`：iOS Safari 不加这个，视频会强制全屏播放。
- `muted` + `autoplay`：现代浏览器要求自动播放必须静音，否则被拦截。
- `<source>` 顺序即优先级，浏览器选第一个支持的格式，都不支持才显示最后的兜底文本。

JavaScript 控制：

```js
const v = document.querySelector('video');
v.play();            // 返回 Promise
v.pause();
v.currentTime = 30;  // 跳到第 30 秒
v.volume = 0.5;      // 0~1
v.playbackRate = 1.5;
v.addEventListener('ended', () => console.log('播放结束'));
```

### 1.9 canvas 与 svg

#### 两者的本质区别

| | canvas | svg |
|---|---|---|
| 模型 | 像素位图，立即模式 | 矢量，保留模式（DOM 节点） |
| 缩放 | 放大会模糊 | 无损 |
| 访问 | 画完就没了，无法单独选中某个图形 | 每个图形是 DOM 元素，可 CSS 样式、可绑事件 |
| 性能 | 图形数量极多时更好 | 元素数量上千时变慢 |
| 适合 | 游戏、图像处理、大数据可视化 | 图标、图表、地图、需交互的矢量图 |

#### canvas 基础

```html
<canvas id="cv" width="600" height="400"></canvas>
<!-- width/height 是画布内部分辨率，不是显示尺寸，不要用 CSS 设置 -->
```

```js
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');

// 高清屏适配：内部像素加倍，CSS 尺寸不变
const dpr = window.devicePixelRatio || 1;
const rect = cv.getBoundingClientRect();
cv.width = rect.width * dpr;
cv.height = rect.height * dpr;
ctx.scale(dpr, dpr);

// 矩形
ctx.fillStyle = '#3498db';
ctx.fillRect(20, 20, 100, 60);
ctx.strokeStyle = '#e74c3c';
ctx.lineWidth = 3;
ctx.strokeRect(150, 20, 100, 60);

// 路径
ctx.beginPath();
ctx.moveTo(50, 200);
ctx.lineTo(150, 200);
ctx.lineTo(100, 120);
ctx.closePath();
ctx.fillStyle = 'rgba(46, 204, 113, .6)';
ctx.fill();
ctx.stroke();

// 圆 / 弧
ctx.beginPath();
ctx.arc(300, 200, 60, 0, Math.PI * 2);
ctx.fill();

// 文字
ctx.font = 'bold 24px system-ui';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillStyle = '#333';
ctx.fillText('Hello Canvas', 300, 320);

// 渐变
const g = ctx.createLinearGradient(0, 0, 600, 0);
g.addColorStop(0, '#f39c12');
g.addColorStop(1, '#e74c3c');
ctx.fillStyle = g;
ctx.fillRect(0, 360, 600, 40);

// 图像
const img = new Image();
img.src = 'photo.jpg';
img.onload = () => ctx.drawImage(img, 0, 0, 200, 150);

// 清屏
ctx.clearRect(0, 0, cv.width, cv.height);
```

动画循环：

```js
let x = 0;
function loop() {
  ctx.clearRect(0, 0, 600, 400);
  ctx.fillRect(x, 200, 40, 40);
  x = (x + 2) % 640;
  requestAnimationFrame(loop);   // 永远不要用 setInterval 做动画
}
requestAnimationFrame(loop);
```

`requestAnimationFrame` 与显示器刷新率同步（通常 60/120fps），页面切到后台会自动暂停。`setInterval(fn, 16)` 做不到这两点。

#### svg 基础

```html
<svg viewBox="0 0 100 100" width="200" height="200" role="img" aria-label="饼图">
  <rect x="0" y="0" width="40" height="40" fill="#3498db" rx="6"/>
  <circle cx="70" cy="20" r="18" fill="#e74c3c"/>
  <path d="M10 80 L30 60 L50 70 L70 40 L90 50" fill="none"
        stroke="#2ecc71" stroke-width="3" stroke-linecap="round"/>
  <text x="50" y="95" text-anchor="middle" font-size="10">图例</text>
</svg>
```

- `viewBox="minX minY width height"` 定义内部坐标系。设了 `viewBox` 后，图形会自适应缩放到外层 `width`/`height`。**不带单位的数值是 SVG 世界的核心。**
- 常用元素：`rect` `circle` `ellipse` `line` `polyline` `polygon` `path` `text` `g`（分组）`defs`（定义复用资源）`use`（引用）。
- `path` 的 `d` 属性：`M` 移动，`L` 直线，`H`/`V` 水平/垂直线，`C` 三次贝塞尔，`Q` 二次贝塞尔，`A` 圆弧，`Z` 闭合。小写字母表示相对坐标。
- SVG 元素可以用 CSS 控制 `fill`、`stroke`、`stroke-width`，也可以绑定 JS 事件。

```html
<!-- 用 CSS 给 SVG 上色 -->
<style>
  .icon { width: 24px; height: 24px; fill: currentColor; }
  .icon:hover { fill: #e74c3c; }
</style>
<svg class="icon" viewBox="0 0 24 24"><path d="M12 2 L2 22 L22 22 Z"/></svg>
```

`fill: currentColor` 让图标颜色自动跟随父元素 `color`，这是图标系统最常用的技巧。

### 1.10 全局属性与 data-*

#### 常用全局属性（任何元素都能用）

```html
<div id="unique"                  <!-- 唯一标识，全文档只能出现一次 -->
     class="card large"           <!-- 类名，可重复 -->
     style="color: red"           <!-- 内联样式，优先级很高，尽量别用 -->
     title="鼠标悬停提示"          <!-- 提示文本 -->
     lang="ja"                    <!-- 语言，影响断词、朗读、字体选择 -->
     dir="rtl"                    <!-- 文字方向 -->
     hidden                       <!-- 隐藏，等价于 display:none -->
     tabindex="0"                 <!-- 键盘 Tab 顺序 -->
     contenteditable="true"       <!-- 可编辑 -->
     draggable="true"             <!-- 可拖拽 -->
     spellcheck="false"           <!-- 关闭拼写检查 -->
     translate="no"               <!-- 禁止自动翻译（品牌名、代码用） -->
     inert>                       <!-- 及其子树完全不可交互、不可聚焦 -->
</div>
```

**`tabindex` 的三个取值区间**：

- `tabindex="0"`：元素进入 Tab 顺序，按 DOM 位置排序。给自定义控件（如 `<div role="button">`）用。
- `tabindex="-1"`：可被 JS `focus()`，但不在 Tab 顺序里。用于弹窗容器、错误提示框。
- `tabindex="1"` 及以上：**永远不要用**，会打乱整个页面的 Tab 顺序。

#### data-*

`data-*` 是自定义数据属性的唯一合法形式。浏览器不解释它的含义，但提供两个 API 存取：

```html
<button class="btn"
        data-action="delete"
        data-id="1024"
        data-confirm-message="确定删除这条记录？">
  删除
</button>
```

```js
const btn = document.querySelector('.btn');

// 读取：dataset 用驼峰，HTML 里用连字符
btn.dataset.action;           // "delete"
btn.dataset.id;               // "1024"（始终是字符串）
btn.dataset.confirmMessage;   // 连字符自动转驼峰

// 写入
btn.dataset.loading = 'true';
// 结果：<button ... data-loading="true">

// 删除
delete btn.dataset.id;

// 注意：dataset 只能访问 data-* 属性
btn.dataset.foo;              // undefined（HTML 里没有 data-foo）
btn.getAttribute('data-foo'); // 这才是直接读属性
```

**经典用法：事件委托 + data-* 传参**

```html
<ul id="list">
  <li><button data-id="1" data-action="edit">编辑</button></li>
  <li><button data-id="2" data-action="delete">删除</button></li>
</ul>
```

```js
document.getElementById('list').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const { id, action } = btn.dataset;
  console.log(action, id);
});
```

一个监听器处理所有按钮，新增列表项无需重新绑定。

**CSS 也可以用 data-* 选择器**：

```css
[data-state="loading"] { opacity: .5; pointer-events: none; }
[data-theme="dark"] { --bg: #111; --fg: #eee; }
```

#### 原生对话框与 Popover

需要模态交互时优先使用 `<dialog>`，它会提供顶层显示、背景遮罩和模态语义：

```html
<button id="delete-trigger">删除文章</button>

<dialog id="confirm-dialog">
  <form method="dialog">
    <h2>确认删除？</h2>
    <p>删除后无法恢复。</p>
    <button value="cancel">取消</button>
    <button value="confirm">确认删除</button>
  </form>
</dialog>

<script>
const trigger = document.querySelector('#delete-trigger');
const dialog = document.querySelector('#confirm-dialog');

trigger.addEventListener('click', () => dialog.showModal());
dialog.addEventListener('close', () => {
  if (dialog.returnValue === 'confirm') {
    console.log('执行删除');
  }
  trigger.focus();
});
</script>
```

用 CSS 的 `::backdrop` 设置模态背景。关闭入口必须可见，且不能只依赖点击遮罩。

工具提示、菜单等非模态浮层可以使用 Popover API：

```html
<button popovertarget="profile-menu">账号菜单</button>
<nav id="profile-menu" popover aria-label="账号操作">
  <a href="/profile">个人资料</a>
  <button type="button">退出登录</button>
</nav>
```

Popover 会处理顶层显示、轻触外部关闭和 `Escape` 关闭，但不会自动把任意复杂菜单变成完整的键盘交互组件。菜单中的焦点移动规则仍需按交互模式实现并测试。

### 1.11 ARIA 可访问性属性

#### 第一条规则：不要用 ARIA

原生 HTML 元素自带语义、键盘行为、焦点管理。`<button>` 天生可 Tab 聚焦、回车/空格触发、被读屏识别为按钮。`<div role="button">` 这些全都要你自己补。

```html
<!-- 错误：丢失了所有原生行为 -->
<div role="button" onclick="submit()">提交</div>

<!-- 正确 -->
<button onclick="submit()">提交</button>
```

什么时候真的需要 ARIA？只有三种情况：

1. 原生标签表达不了（如 `<div role="tablist">` 这类组合控件）
2. 需要给元素补充描述（`aria-label`）
3. 需要向读屏播报动态变化（`aria-live`）

#### 常用属性

```html
<!-- 命名：给没有可见文字的元素起名 -->
<button aria-label="关闭对话框">✕</button>
<nav aria-label="面包屑导航">...</nav>

<!-- 引用其他元素作为名称/描述 -->
<input id="pw" aria-describedby="pw-hint">
<p id="pw-hint">至少 8 位，含大小写字母和数字</p>

<!-- 状态 -->
<button aria-expanded="false" aria-controls="menu">菜单</button>
<ul id="menu" hidden>...</ul>

<div aria-hidden="true">纯装饰性内容</div>

<a href="/current" aria-current="page">当前页</a>

<input aria-invalid="true" aria-errormessage="err1">
<p id="err1">格式错误</p>

<!-- 实时区域：内容变化时读屏自动播报 -->
<p aria-live="polite">已保存</p>
```

`aria-live` 三个值：

- `off`（默认）：不播报
- `polite`：等用户当前朗读结束再播报，用于状态提示
- `assertive`：立即打断播报，只用于错误、警告

`aria-live` 的容器必须**一开始就存在于 DOM 中**，后面只改它的文本内容，否则读屏不认。

#### 动态开关菜单的完整例子

```html
<button id="toggle" aria-expanded="false" aria-controls="menu">菜单</button>
<ul id="menu" hidden>
  <li><a href="/a">选项 A</a></li>
  <li><a href="/b">选项 B</a></li>
</ul>

<script>
const btn = document.getElementById('toggle');
const menu = document.getElementById('menu');

btn.addEventListener('click', () => {
  const open = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', String(!open));
  menu.hidden = open;
});
</script>
```

`aria-expanded` 是状态，必须跟着真实状态同步更新，否则比不加还糟。

### 1.12 HTML5 新特性 API

#### 1.12.1 Web Storage（localStorage / sessionStorage）

```js
// 存（只能是字符串）
localStorage.setItem('theme', 'dark');
localStorage.setItem('user', JSON.stringify({ id: 1, name: '张三' }));

// 取
const theme = localStorage.getItem('theme');        // 'dark' 或 null
const user = JSON.parse(localStorage.getItem('user') || 'null');

// 删
localStorage.removeItem('theme');
localStorage.clear();          // 清空本站所有

// 遍历
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  console.log(key, localStorage.getItem(key));
}

// 监听其他标签页的修改（同源、同浏览器）
window.addEventListener('storage', (e) => {
  console.log(e.key, e.oldValue, e.newValue);
  // 注意：触发事件的是「其他」标签页，当前页不会触发
});
```

**与 Cookie 对比**：

| | localStorage | sessionStorage | Cookie |
|---|---|---|---|
| 容量 | 约 5MB | 约 5MB | 约 4KB |
| 生命周期 | 无显式到期，但可能被清理或驱逐 | 标签页会话，刷新保留，恢复行为依浏览器 | 会话或 Expires / Max-Age |
| 随请求发送 | 否 | 否 | 满足域、路径、Secure、SameSite 等条件时发送 |
| 作用域 | 同源，可能受分区策略影响 | 同源且按顶层标签页隔离 | Domain / Path 等属性控制，不按端口隔离 |
| 服务端可读 | 否 | 否 | 是 |

**必须注意**：

- 存储是**字符串**。存对象必须 `JSON.stringify`，取出来 `JSON.parse`。
- 同步 API，大量读写会阻塞主线程。不要存几 MB 的大数据，大量数据用 IndexedDB。
- **不要存 token、密码等敏感信息**。任何 XSS 都能读走。
- 隐私模式 / 禁用 Cookie 时，某些浏览器访问 `localStorage` 会直接抛异常：

```js
function safeStorage() {
  try {
    localStorage.setItem('__t', '1');
    localStorage.removeItem('__t');
    return localStorage;
  } catch {
    return null;   // 降级到内存变量
  }
}
```

#### 1.12.2 WebSocket

HTTP 通常是请求—响应，但响应体可以持续流式发送，例如 SSE。WebSocket 建立一次连接后允许**双向、全双工、长连接**。

```js
const ws = new WebSocket('wss://example.com/chat');   // 生产环境用 wss

// 连接建立
ws.onopen = () => {
  console.log('已连接');
  ws.send(JSON.stringify({ type: 'join', room: 'general' }));
};

// 收到消息
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  console.log('收到', msg);
};

// 出错
ws.onerror = (err) => console.error('错误', err);

// 关闭
ws.onclose = (event) => {
  console.log('关闭', event.code, event.reason, event.wasClean);
};

// 发送（仅在 readyState === WebSocket.OPEN 时可用）
ws.send('hello');

// 主动关闭
ws.close(1000, '用户离开');

// 状态常量
WebSocket.CONNECTING  // 0
WebSocket.OPEN        // 1
WebSocket.CLOSING     // 2
WebSocket.CLOSED      // 3
```

**自动重连（必备）**：

```js
class ReconnectingWS {
  constructor(url) {
    this.url = url;
    this.retry = 0;
    this.maxRetry = 10;
    this.connect();
  }

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.retry = 0;
      console.log('已连接');
    };

    this.ws.onmessage = (e) => {
      this.onMessage?.(JSON.parse(e.data));
    };

    this.ws.onclose = (e) => {
      if (e.wasClean) return;                 // 正常关闭不重连
      if (this.retry >= this.maxRetry) return console.error('重连次数耗尽');
      // 指数退避：1s, 2s, 4s, 8s... 封顶 30s
      const delay = Math.min(1000 * 2 ** this.retry, 30000);
      this.retry++;
      console.log(`${delay}ms 后第 ${this.retry} 次重连`);
      setTimeout(() => this.connect(), delay);
    };
  }

  send(data) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('连接未就绪，消息丢弃');
    }
  }
}
```

**心跳保活**：中间代理（Nginx、负载均衡）会断开长时间无数据的连接。需要定期发心跳：

```js
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ping' }));
  }
}, 30000);
```

#### 1.12.3 SSE（Server-Sent Events）

服务端单向推送给客户端，基于普通 HTTP，**自动重连**，比 WebSocket 简单得多。

```js
const es = new EventSource('/api/stream');

// 默认事件（服务端发 data: 时触发）
es.onmessage = (e) => {
  console.log(e.data);   // 永远是字符串
};

// 自定义事件（服务端发 event: foo 时触发）
es.addEventListener('progress', (e) => {
  const p = JSON.parse(e.data);
  console.log(`进度 ${p.percent}%`);
});

es.onerror = (e) => {
  if (es.readyState === EventSource.CLOSED) {
    console.log('连接已关闭');
  }
  // 其他情况浏览器会自动重连
};

es.close();   // 主动关闭，不再重连
```

服务端返回格式（`Content-Type: text/event-stream`）：

```
event: progress
data: {"percent": 30}

data: 普通消息

: 这是注释，用作心跳

retry: 5000
data: 重连间隔改成 5 秒

id: 42
data: 带 ID 的消息
```

字段说明：

- `data:` 消息内容，多行 `data:` 会拼成一条（用 `\n` 连接）
- `event:` 事件名，对应 `addEventListener`
- `id:` 消息 ID，重连时浏览器会带 `Last-Event-ID` 请求头，服务端可据此续传
- `retry:` 重连等待毫秒数

**WebSocket vs SSE 选择**：

| | WebSocket | SSE |
|---|---|---|
| 方向 | 双向 | 服务端 → 客户端 |
| 协议 | ws:// / wss:// | HTTP/HTTPS |
| 自动重连 | 需自己写 | 内置 |
| 二进制 | 支持 | 只支持文本 |
| 连接数限制 | 浏览器、代理与服务端均有资源上限 | HTTP/1.x 常见同源连接限制；HTTP/2 由流数量协商 |
| 适用 | 聊天、协同编辑、游戏 | 通知、进度、日志流、AI 流式输出 |

#### 1.12.4 CORS（跨源资源共享）

**同源** = 协议 + 域名 + 端口三者完全相同。`https://a.com` 和 `http://a.com` 不同源，`https://a.com:443` 和 `https://a.com` 同源（443 是 https 默认端口）。

浏览器默认禁止跨源 XHR/fetch 读取响应。CORS 是**服务端**通过响应头授权，不是前端能绕过的。

**简单请求**（不触发预检）需同时满足：

- 方法为 `GET`、`HEAD`、`POST`
- 头部只含 `Accept`、`Accept-Language`、`Content-Language`、`Content-Type` 等安全头
- `Content-Type` 只能是 `text/plain`、`multipart/form-data`、`application/x-www-form-urlencoded`

**预检请求（Preflight）**：不满足上述条件时，浏览器先发一个 `OPTIONS` 请求问服务器：

```
OPTIONS /api/data HTTP/1.1
Origin: https://mysite.com
Access-Control-Request-Method: PUT
Access-Control-Request-Headers: content-type, authorization
```

服务端响应：

```http
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://mysite.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Max-Age: 86400
```

`Access-Control-Max-Age: 86400` 表示预检结果缓存 24 小时，期间不再重复预检。

**带凭证的请求**：

```js
fetch('https://api.example.com/user', {
  credentials: 'include'   // 携带 Cookie
});
```

服务端必须：

```http
Access-Control-Allow-Origin: https://mysite.com   ← 不能是 *
Access-Control-Allow-Credentials: true
```

**`Access-Control-Allow-Origin: *` 与 `credentials: 'include'` 不能共存**，这是硬性规定。

**常见报错速查**：

| 报错 | 原因 |
|---|---|
| `No 'Access-Control-Allow-Origin' header` | 服务端没返回该头 |
| `Credentials flag is true, but ACAO is '*'` | 通配符与凭证冲突 |
| `Request header field authorization is not allowed` | 预检里没允许该自定义头 |
| `Method PUT is not allowed` | `Access-Control-Allow-Methods` 缺该方法 |

**同源开发代理**：Vite devServer proxy 或反向代理让浏览器访问同一源，这不是绕过安全策略。生产也可以通过同源 `/api` 反代避免跨源；只有确需跨源读取时才配置 CORS。CORS 不阻止所有跨源请求，更不是 CSRF 或资源授权防线，详见 [HTTP 契约](./38-http-openapi-contracts) 与 [Session 安全](./43-password-session-auth)。

### 规范与实践边界

`accept` 只是文件选择提示；`HttpOnly` 限制脚本读取 Cookie，却不能阻止 XSS 利用现有会话发请求。`aria-live` 的播报和自动播放策略也依浏览器、辅助技术与用户设置变化，必须实测。示例重连类只解释退避思路，生产实现还要处理主动关闭、计时器清理、消息解析失败、重连抖动和背压，见 [实时服务](./49-sse-websocket-realtime)。

官方参考：

- [WHATWG HTML 语义元素](https://html.spec.whatwg.org/multipage/sections.html)
- [WHATWG 表单验证](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#constraint-validation)
- [WAI ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [WHATWG Fetch 与 CORS](https://fetch.spec.whatwg.org/)
- [WHATWG SSE](https://html.spec.whatwg.org/multipage/server-sent-events.html)

---
