---
title: "第 25 章：图形、文件、定位与实时通信"
description: "掌握 Canvas、SVG、URL、File、拖放、Geolocation 与 WebSocket 的使用边界。"
date: "2026-10-23"
category: 浏览器 API
tags: [Canvas, SVG, 文件接口, WebSocket]
series:
  order: 26
---
## 第 25 章 图形、文件与实时能力

浏览器不仅能展示文档，也能绘图、读取用户选择的文件、接收拖放、请求位置和建立双向连接。本章重点不是背 API，而是理解每种能力的适用边界与资源清理。

### 25.1 学习目标

- 根据交互和数据规模选择 Canvas 或 SVG。
- 使用 `URL` 安全地解析与构造地址。
- 校验并预览用户选择的 `File`。
- 实现键盘可用的文件拖放区域。
- 在获得用户授权后读取地理位置。
- 管理 WebSocket 的连接、消息、断线和重连。

### 25.2 Canvas：像素画布

Canvas 适合大量、频繁变化的图形，例如图表、图像处理和游戏画面。它是即时绘制模型，画完后图形不再是独立 DOM 节点。

```html
<canvas
  id="reading-chart"
  width="640"
  height="240"
  aria-label="最近七天阅读时长柱状图"
></canvas>
```

```js
const canvas = document.querySelector('#reading-chart');
const context = canvas.getContext('2d');

function drawReadingChart(values) {
  if (values.length === 0) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const width = canvas.width;
  const height = canvas.height;
  const padding = 32;
  const max = Math.max(...values, 1);
  const gap = 12;
  const barWidth =
    (width - padding * 2 - gap * (values.length - 1)) / values.length;

  context.clearRect(0, 0, width, height);
  context.fillStyle = '#2563eb';

  values.forEach((value, index) => {
    const barHeight = ((height - padding * 2) * value) / max;
    const x = padding + index * (barWidth + gap);
    const y = height - padding - barHeight;

    context.fillRect(x, y, barWidth, barHeight);
  });
}

drawReadingChart([12, 28, 20, 35, 18, 42, 30]);
```

高清屏要按设备像素比放大位图，同时保持 CSS 尺寸：

```js
function resizeCanvas(canvas, context) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;

  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);

  return {
    width: rect.width,
    height: rect.height,
  };
}
```

Canvas 内部内容不会自动进入无障碍树。关键数据必须提供文本摘要或可访问表格。

高清缩放后，绘图应使用 `resizeCanvas()` 返回的 CSS 逻辑宽高，而不是再次使用已经乘过像素比的 `canvas.width/height`，否则会双重放大。宽高赋值会清空画布和绘图状态，必须重新设定变换并重绘；真实布局应通过 `ResizeObserver` 触发这一流程。

### 25.3 SVG：可查询的矢量节点

SVG 适合图标、流程图和节点数量适中的交互图形：

```html
<svg
  viewBox="0 0 240 80"
  role="img"
  aria-labelledby="chart-title chart-description"
>
  <title id="chart-title">文章完成率</title>
  <desc id="chart-description">已完成 72%</desc>
  <rect x="10" y="30" width="220" height="16" rx="4" fill="#e5e7eb" />
  <rect x="10" y="30" width="158.4" height="16" rx="4" fill="#16a34a" />
  <text x="120" y="70" text-anchor="middle">72%</text>
</svg>
```

SVG 节点可用 CSS 和 DOM API 操作：

```css
.progress-value {
  transform-box: fill-box;
  transform-origin: left center;
  transition: transform 200ms ease;
}
```

```js
progressValue.style.transform = `scaleX(${progress / 100})`;
```

选择原则：

| 场景 | 更适合 |
|---|---|
| 图标、Logo、少量可点击图形 | SVG |
| 需要 CSS、DOM、焦点和语义 | SVG |
| 数千个粒子或高频重绘 | Canvas |
| 图像像素处理、游戏 | Canvas |
| 数据必须可访问 | SVG 或 HTML 表格；Canvas 提供替代文本 |

### 25.4 `URL` 与查询参数

不要用字符串拼接复杂 URL：

```js
const url = new URL('/search', location.origin);
url.searchParams.set('q', 'JavaScript 事件循环');
url.searchParams.set('page', '2');

console.log(url.href);
```

读取当前地址：

```js
const currentUrl = new URL(location.href);
const keyword = currentUrl.searchParams.get('q') ?? '';
const page = Number(currentUrl.searchParams.get('page') ?? '1');
```

更新地址但不刷新页面：

```js
function updateSearchUrl(keyword) {
  const url = new URL(location.href);

  if (keyword) {
    url.searchParams.set('q', keyword);
  } else {
    url.searchParams.delete('q');
  }

  history.replaceState(null, '', url);
}
```

处理外部跳转前检查协议：

```js
function isSafeExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
```

### 25.5 File API

文件只能在用户主动选择或拖放后由页面读取：

```html
<label for="cover-input">选择文章封面</label>
<input
  id="cover-input"
  type="file"
  accept="image/png,image/jpeg,image/webp"
>
<img id="cover-preview" alt="封面预览" hidden>
```

```js
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);
const coverInput = document.querySelector('#cover-input');
const coverPreview = document.querySelector('#cover-preview');

function validateImage(file) {
  if (!ACCEPTED_TYPES.has(file.type)) {
    throw new TypeError('只支持 PNG、JPEG 或 WebP 图片');
  }

  if (file.size === 0 || file.size > MAX_FILE_SIZE) {
    throw new RangeError('图片不能超过 5MB');
  }
}

let previewUrl;

function showPreview(file) {
  validateImage(file);

  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
  }

  previewUrl = URL.createObjectURL(file);
  coverPreview.src = previewUrl;
  coverPreview.hidden = false;
}

coverInput.addEventListener('change', () => {
  const [file] = coverInput.files;

  if (!file) {
    return;
  }

  try {
    showPreview(file);
  } catch (error) {
    coverInput.value = '';
    showMessage(error.message);
  }
});

window.addEventListener('pagehide', () => {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
  }
});
```

对象 URL 持有底层资源引用，用完必须 `revokeObjectURL()`。`accept` 只是文件选择器提示，仍需在代码和服务端验证类型与大小。

`file.type` 是浏览器提供的声明，不是文件内容证明；可信上传流程还要检查文件头、解码结果和像素上限，见第 48 章。初始化时应确认两个 DOM 节点存在；页面从往返缓存恢复后，要重新生成已撤销的预览 URL。

读取文本文件：

```js
const markdown = await file.text();
```

读取二进制：

```js
const bytes = await file.arrayBuffer();
```

大文件不要一次性全部读入内存，可以使用 `file.stream()` 分块处理。

### 25.6 Drag and Drop

拖放区域仍应包含可点击的文件输入，保证键盘和触屏用户可操作：

```html
<label class="drop-zone" data-drop-zone>
  <span>拖入封面，或点击选择</span>
  <input type="file" accept="image/*" data-file-input>
</label>
```

```js
const dropZone = document.querySelector('[data-drop-zone]');
const fileInput = document.querySelector('[data-file-input]');

for (const eventName of ['dragenter', 'dragover']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add('is-dragging');
  });
}

for (const eventName of ['dragleave', 'drop']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove('is-dragging');
  });
}

dropZone.addEventListener('drop', (event) => {
  const file = event.dataTransfer?.files[0];

  if (file) {
    try {
      showPreview(file);
    } catch (error) {
      showMessage(error.message);
    }
  }
});

fileInput.addEventListener('change', () => {
  const [file] = fileInput.files;

  if (file) {
    try {
      showPreview(file);
    } catch (error) {
      fileInput.value = '';
      showMessage(error.message);
    }
  }
});
```

`dragover` 必须调用 `preventDefault()`，否则浏览器通常不会把该元素视为可放置目标。

### 25.7 Geolocation

定位涉及隐私，必须由用户明确操作触发，并解释用途：

```js
function getCurrentPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('当前浏览器不支持定位'));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10_000,
      maximumAge: 5 * 60_000,
      ...options,
    });
  });
}

locationButton.addEventListener('click', async () => {
  locationButton.disabled = true;

  try {
    const position = await getCurrentPosition();
    const { latitude, longitude, accuracy } = position.coords;

    renderLocation({ latitude, longitude, accuracy });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error
    ) {
      showMessage('无法获取位置，请检查定位权限');
    } else {
      showMessage(error.message);
    }
  } finally {
    locationButton.disabled = false;
  }
});
```

注意：

- 一般需要 HTTPS，本地开发环境除外。
- `enableHighAccuracy` 可能更慢、更耗电，不应默认开启。
- 坐标属于敏感数据，不要无必要上传或长期保存。
- 用户拒绝后应提供手动输入城市等替代流程。

### 25.8 WebSocket

WebSocket 在一个长连接上双向传输消息，适合评论提醒、协作状态和实时仪表盘：

```js
function createCommentSocket(url, handlers) {
  let socket;
  let reconnectTimer;
  let retryCount = 0;
  let closedByUser = false;

  function connect() {
    socket = new WebSocket(url);

    socket.addEventListener('open', () => {
      retryCount = 0;
      handlers.onStatus?.('connected');
    });

    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        handlers.onMessage?.(message);
      } catch (error) {
        handlers.onError?.(error);
      }
    });

    socket.addEventListener('error', () => {
      handlers.onStatus?.('error');
    });

    socket.addEventListener('close', () => {
      handlers.onStatus?.('disconnected');

      if (closedByUser) {
        return;
      }

      const delay = Math.min(1000 * 2 ** retryCount, 30_000);
      retryCount += 1;
      reconnectTimer = setTimeout(connect, delay * (0.5 + Math.random() * 0.5));
    });
  }

  connect();

  return {
    send(message) {
      if (socket?.readyState !== WebSocket.OPEN) {
        throw new Error('实时连接尚未就绪');
      }

      socket.send(JSON.stringify(message));
    },

    close() {
      closedByUser = true;
      clearTimeout(reconnectTimer);
      socket?.close(1000, '页面离开');
    },
  };
}
```

使用：

```js
const commentSocket = createCommentSocket(
  'wss://example.com/comments',
  {
    onStatus: updateConnectionStatus,
    onMessage(message) {
      if (message.type === 'comment.created') {
        appendComment(message.payload);
      }
    },
    onError: console.error,
  },
);

window.addEventListener('pagehide', () => {
  commentSocket.close();
});
```

生产实现还要考虑：

- 鉴权与令牌刷新。
- 心跳与服务端空闲断开。
- 消息 schema 校验和版本。
- 断线期间消息是否排队。
- 指数退避和网络恢复。
- WebSocket 原生 API 没有背压控制，不能无限发送或处理大流量消息。

如果只需要服务端向页面单向推送，可以评估 Server-Sent Events；如果只需偶尔刷新，普通 HTTP 轮询更简单。

### 25.9 效果验证

1. 在普通屏和高清屏上观察 Canvas 是否清晰。
2. 用键盘聚焦文件输入并选择图片，确认不依赖拖放。
3. 连续选择不同图片，在 Memory 面板确认对象 URL 被释放。
4. 拒绝定位权限，确认页面给出替代操作而不是卡死。
5. 在 DevTools Network 的 WS 面板观察连接与消息帧。
6. 临时断网后恢复，确认重连间隔逐步增加且最多为 30 秒。

### 25.10 官方参考

- [MDN：Canvas 高像素密度缩放](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)。
- [MDN：File API](https://developer.mozilla.org/en-US/docs/Web/API/File_API)。
- [WHATWG：WebSocket 标准](https://websockets.spec.whatwg.org/)。
- [MDN：Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API)。

---
