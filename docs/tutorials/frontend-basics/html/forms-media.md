---
title: HTML：表单与媒体
description: 实现有标签和校验的表单，理解响应式图片、媒体控制与加载失败。
---

# HTML：表单与媒体

## 学习目标

- 用 `label`、`name` 和约束属性构造可操作的表单。
- 区分浏览器校验、业务校验和服务端校验。
- 理解 `srcset`、尺寸声明、媒体播放和资源失败的处理。

前置：[HTML 结构](./structure.md)。
本章脚本可以先照着运行，学完 JavaScript 后再逐句复盘。

## 为什么控件需要名字

输入框的外观不能表达“应该输入什么”。
`label` 为控件提供可访问名称，点击标签还可以聚焦控件。
`placeholder` 在输入后消失，不能替代标签。
`id` 负责标签关联，`name` 决定 `FormData` 中的字段名，两者作用不同。

原生表单能处理 Enter 提交、必填项、邮箱格式和长度限制。
但前端校验可以被绕过，真实提交仍必须在服务端验证。
这里仅显示本地结果，不会发送姓名或邮箱。

## 机制与边界

`required` 要求非空，但只含空格的文本可能仍通过。
`minlength` 的原生检查主要针对用户输入，脚本赋值不能代替真实输入验证。
`setCustomValidity('错误说明')` 会让控件无效；传入空字符串才会恢复有效。
不要只设置错误却忘记清除，否则修正输入后仍无法提交。

`srcset` 的 `w` 描述符表示资源固有宽度，`sizes` 描述显示区域的 CSS 宽度。
浏览器结合显示宽度和设备像素比选择资源，不保证永远选择最小文件。
`width`、`height` 预留比例，减少加载后的布局移动。
首屏关键图片通常不延迟加载；下方非关键图片可以设置 `loading="lazy"`。
有意义的图片需要 `alt`；纯装饰图用空 `alt`，不要重复旁边已有的说明。

音视频默认不自动播放，`controls` 提供暂停、音量与时间控制。
视频包含对白时需要字幕，音频需要文字转录。
选中文件不保证浏览器支持其编解码器，所以仍要处理 `error`。

## 运行步骤

1. 创建 `forms-media/`，放入下列三个文件，名称必须一致。
2. 用练习目录的 `node serve.mjs` 启动，打开 `/forms-media/`。
3. 准备自己有权使用的本地音频或视频，通过文件选择器加载。
4. 没有媒体文件也可以验证表单与图片；媒体部分会保留操作说明。

## 完整示例

::: code-group

```html [index.html]
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>报名与媒体体验</title>
  <style>
    body { font-family: sans-serif; max-width: 48rem; margin: 2rem auto; padding: 1rem; }
    label, input, button { display: block; margin-block: .5rem; }
    input, button { font: inherit; padding: .5rem; }
    img, video, audio { display: block; max-width: 100%; }
    :focus-visible { outline: 3px solid #245ac7; outline-offset: 3px; }
  </style>
</head>
<body>
  <main>
    <h1>报名与媒体体验</h1>
    <form id="signup">
      <label for="name">姓名（去掉首尾空格后至少 2 个字符）</label>
      <input id="name" name="name" required minlength="2" maxlength="40" autocomplete="name">
      <label for="email">邮箱</label>
      <input id="email" name="email" type="email" required autocomplete="email">
      <button type="submit">预览报名信息</button>
    </form>
    <p id="result" role="status"></p>
    <h2>响应式图片</h2>
    <img id="picture" src="./diagram-800.svg"
      srcset="./diagram-400.svg 400w, ./diagram-800.svg 800w"
      sizes="(max-width: 700px) 90vw, 640px"
      width="800" height="400" style="width: min(100%, 640px)"
      alt="流程图：输入内容后进行检查" decoding="async">
    <p id="image-status" role="status"></p>
    <h2>本地媒体</h2>
    <p>仅在本机播放，不上传。请选择有权使用且含字幕的视频。</p>
    <label for="audio-file">选择音频</label>
    <input id="audio-file" type="file" accept="audio/*">
    <audio id="audio" controls preload="metadata"></audio>
    <label for="video-file">选择视频</label>
    <input id="video-file" type="file" accept="video/*">
    <video id="video" controls preload="metadata" width="640"></video>
    <p id="media-status" role="status">选择文件后点击播放器的播放按钮。</p>
  </main>
  <script>
    const form = document.querySelector('#signup');
    const nameInput = document.querySelector('#name');
    const result = document.querySelector('#result');
    nameInput.addEventListener('input', () => {
      nameInput.setCustomValidity(
        nameInput.value.trim().length < 2 ? '姓名不能只有空格，且至少 2 个字符' : ''
      );
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const data = new FormData(form);
      result.textContent = `${String(data.get('name')).trim()}，报名信息格式正确，未上传。`;
    });
    const picture = document.querySelector('#picture');
    const imageStatus = document.querySelector('#image-status');
    picture.addEventListener('error', () => {
      imageStatus.textContent = '图片加载失败，请检查本地 SVG 文件名和 Network 面板。';
    });
    const urls = new Map();
    for (const kind of ['audio', 'video']) {
      const input = document.querySelector(`#${kind}-file`);
      const player = document.querySelector(`#${kind}`);
      input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) return;
        if (urls.has(kind)) URL.revokeObjectURL(urls.get(kind));
        const url = URL.createObjectURL(file);
        urls.set(kind, url);
        player.src = url;
        player.load();
      });
      player.addEventListener('error', () => {
        document.querySelector('#media-status').textContent =
          '媒体无法播放：文件损坏或当前浏览器不支持其编解码器。';
      });
    }
    window.addEventListener('pagehide', () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
    });
  </script>
</body>
</html>
```

```xml [diagram-400.svg]
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
  <rect width="400" height="200" fill="#eef3ff"/>
  <text x="50" y="105" font-size="24">输入 → 检查</text>
</svg>
```

```xml [diagram-800.svg]
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 400 200">
  <rect width="400" height="200" fill="#eef3ff"/>
  <text x="50" y="105" font-size="24">输入 → 检查</text>
</svg>
```

:::

SVG 内容相同但固有尺寸不同，适合观察资源选择，不代表生产环境的体积优化。
真实照片应输出不同分辨率的实际资源；这里没有远程配图或网络依赖。
`sizes` 接近布局宽度即可；本例边距会让真实宽度略小于 `90vw`。

## 效果验证

1. 空表单提交：浏览器提示必填；无效邮箱不会触发成功结果。
2. 姓名输入两个空格：出现自定义错误；改成“小林”后可以提交。
3. 点击“姓名”标签会聚焦输入框，Tab 可到提交按钮和播放器。
4. 在 Console 输入 `document.querySelector('#picture').currentSrc` 查看选中的图片。
5. 在 Network 使用请求阻断拦截 `*diagram-*.svg*` 后刷新，显示加载失败说明。
6. 加载本地媒体并播放；换文件时旧对象 URL 被释放。

## 常见错误

不要使用 `innerHTML` 展示姓名，用户输入应通过 `textContent` 作为文本显示。
`accept` 只过滤选择器建议，不是安全验证。
按钮不写 `type` 时，在表单内默认可能提交，普通操作应写 `type="button"`。
图片失败处理不要无限重设同一个失败地址，会形成重复请求。

## 练习与验收标准

增加一个必选的“同意学习安排”复选框，并通过 `label` 关联。
再增加 `loading="lazy"` 的第二幅非关键图片，观察滚动前后请求时机。
验收：未勾选不能提交；图片失败仍有文字说明；所有控件有名称。
媒体练习补充手工转录文字，不能只提供播放控件而没有内容替代。

## 延伸资料

- [MDN：客户端表单验证](https://developer.mozilla.org/zh-CN/docs/Learn_web_development/Extensions/Forms/Form_validation)
- [MDN：响应式图片](https://developer.mozilla.org/zh-CN/docs/Web/HTML/Guides/Responsive_images)
- [MDN：HTMLMediaElement](https://developer.mozilla.org/zh-CN/docs/Web/API/HTMLMediaElement)
- [W3C：媒体可访问性](https://www.w3.org/WAI/media/av/)

下一章：[层叠与盒模型](../css/cascade-box.md)。
