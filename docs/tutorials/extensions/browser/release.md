---
title: 扩展发布、权限与检查脚本
description: 用白名单打包最小 Popup，完成隐私披露、商店提交与安装验收。
---

# 扩展发布、权限与检查脚本

## 发布不是把目录压缩一下

本章发布[最小 Popup](./manifest)，不发布带本地测试站点权限的演示插件。
完成标准：安装包根目录有清单，只含运行文件，源码无远程执行逻辑，权限与隐私描述一致，
且从最终 ZIP 解压出的扩展完成点击、关闭与重开验收。检查通过不等于商店审核通过。

## 权限、CSP 与远程代码

只在自己的 Popup 计数，不申请任何权限。需要某次用户点击后操作当前页时，优先评估 `activeTab`；
需要持续注入时才声明具体匹配站点，非核心能力可考虑 `optional_permissions`，并解释拒绝后的行为。
`host_permissions` 不等于所有跨域请求都成功，更不授权下载代码执行。

MV3 普通扩展执行上下文的逻辑应随包提交。不要从 CDN 加载 JS、下载字符串后 `eval`，
或把远端 JSON 当指令集交给解释器执行。请求数据与执行代码是两种边界。
本教程不用政策特殊豁免；具体豁免以官方政策为准，不能用 sandbox 页面规避审查。
`script-src 'self'` 约束脚本来源，不验证 IPC/消息参数，也不代替 DOM 输入校验。

## 发布目录

建立独立 `release-lab`，将前章的 `popup.html`、`popup.js` 放进 `extension`。
用绘图工具导出真正的 PNG 图标，尺寸分别为 16、48、128 像素；不要只是把其他格式改后缀。

```text [目录]
release-lab/
  check-pack.mjs
  extension/
    manifest.json
    popup.html
    popup.js
    icons/
      16.png
      48.png
      128.png
```

## 完整检查与打包脚本

图标及商店截图需实际制作。脚本只接受此零权限 Popup 的六个运行文件，不是通用审核器。
使用 Node 22+、macOS/Linux 的 `zip`；Windows 可在 WSL 中运行。不会改动源目录或覆盖已有 ZIP。

::: code-group
```json [extension/manifest.json] {9}
{
  "manifest_version": 3,
  "name": "Local Popup Counter",
  "version": "1.0.0",
  "description": "A counter that lives only inside the popup.",
  "action": { "default_popup": "popup.html" },
  "icons": { "16": "icons/16.png", "48": "icons/48.png", "128": "icons/128.png" },
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

```js [check-pack.mjs]
import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
const fail = message => { throw new Error(message); };
if (process.argv.length !== 4) fail('Usage: node check-pack.mjs source output.zip');
const source = fs.realpathSync(process.argv[2]);
const requested = path.resolve(process.argv[3]);
const output = path.join(fs.realpathSync(path.dirname(requested)), path.basename(requested));
if (!output.endsWith('.zip') || fs.existsSync(output)) fail('Use a fresh .zip path');
if (output.startsWith(source + path.sep)) fail('Output must be outside source');
const allowed = ['manifest.json', 'popup.html', 'popup.js',
  'icons/16.png', 'icons/48.png', 'icons/128.png'];
const found = [];
function walk(directory, prefix = '') {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    const full = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) fail('Symlink rejected: ' + name);
    if (entry.isDirectory()) {
      if (name !== 'icons') fail('Unexpected directory: ' + name);
      walk(full, name + '/');
    } else if (entry.isFile()) found.push(name);
    else fail('Special file rejected: ' + name);
  }
}
walk(source);
if (found.sort().join('|') !== [...allowed].sort().join('|')) fail('File list mismatch');
const read = name => fs.readFileSync(path.join(source, name), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const keys = ['manifest_version', 'name', 'version', 'description',
  'action', 'icons', 'content_security_policy'];
if (Object.keys(manifest).some(key => !keys.includes(key))) fail('Unexpected manifest key');
if (manifest.manifest_version !== 3 || typeof manifest.name !== 'string' ||
    !manifest.name.trim() || typeof manifest.description !== 'string' ||
    typeof manifest.version !== 'string') fail('Invalid metadata');
const parts = String(manifest.version).split('.');
if (parts.length > 4 || parts.some(p => !/^(0|[1-9]\d*)$/.test(p) || +p > 65535) ||
    parts.every(p => +p === 0)) fail('Invalid version');
if (JSON.stringify(manifest.action) !== JSON.stringify({ default_popup: 'popup.html' })) {
  fail('Unexpected action');
}
if (manifest.content_security_policy?.extension_pages !==
    "script-src 'self'; object-src 'self'") fail('Unexpected CSP');
for (const size of [16, 48, 128]) {
  if (manifest.icons?.[size] !== `icons/${size}.png`) fail('Icon path mismatch');
  const bytes = fs.readFileSync(path.join(source, `icons/${size}.png`));
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
      bytes.readUInt32BE(16) !== size || bytes.readUInt32BE(20) !== size) fail('Invalid icon');
}
const html = read('popup.html');
const js = read('popup.js');
if (/https?:|eval\s*\(|new\s+Function|import\s*\(/i.test(html + js)) fail('Review code loading');
if (/\son\w+\s*=|javascript:|<iframe|<object/i.test(html)) fail('Unsafe HTML pattern');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
if (scripts.length !== 1 || !/\bsrc="popup\.js"/.test(scripts[0][1]) ||
    scripts[0][2].trim()) fail('Only one external popup.js is allowed');
const syntax = spawnSync(process.execPath, ['--check', path.join(source, 'popup.js')]);
if (syntax.status !== 0) fail('JavaScript syntax failed');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'extension-release-'));
try {
  for (const name of allowed) {
    const dest = path.join(temp, name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(source, name), dest);
  }
  const archive = path.join(temp, 'package.zip');
  const result = spawnSync('zip', ['-q', '-X', archive, ...allowed], { cwd: temp });
  if (result.status !== 0) fail('zip failed or missing');
  fs.copyFileSync(archive, output, fs.constants.COPYFILE_EXCL);
  console.log('CHECKED AND PACKED: ' + output);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
```
:::

正则只是拒绝明显模式，无法证明不存在混淆、供应链问题或间接执行；PNG 头检查也不验证完整解码。
人工审查全部源码与依赖，检查图标真实显示。该脚本只清理自己创建的临时目录。

## 真实发布步骤

```bash [终端：release-lab]
zip -v
node check-pack.mjs extension counter-1.0.0.zip
unzip -l counter-1.0.0.zip
unzip counter-1.0.0.zip -d verify-1.0.0
```

从 `verify-1.0.0` 加载已解压扩展，关闭 DevTools 后验收计数、归零及无网络请求。
负例：复制一份源目录加入 `.env`、内联脚本或 `permissions`，脚本应拒绝且不产生 ZIP。
更新必须提高清单版本，使用新输出路径；不要重复覆盖已验收制品。

1. 在 Chrome Web Store 开发者控制台完成账号注册、费用及身份/安全设置，以当前控制台要求为准。
2. 新建商品并上传 ZIP，填写名称、单一用途、分类、语言，上传实际截图、图标等所需素材。
3. 在隐私实践中如实填写数据使用和权限理由；隐私政策 URL 应公开可访问，不提交本地文件路径。
4. 选择分发范围，提交审核；检查拒绝理由，修正后重新上传，不把“已上传”等同于“已发布”。
5. 审核通过后从商店全新安装，再验收版本、权限提示、离线行为及卸载；记录浏览器版本和结果。

本计数器的政策可说明：不收集/传输个人数据，不分析浏览记录，计数只存在弹窗内存，
关闭后清除，无第三方分析服务，并提供维护者联系方式。若改为保存网页标题，必须重新披露存储与清除方式；
“不上传”不能直接写成“不处理数据”。商店字段、截图尺寸及审核规则会变化，提交当天重新核对。

## 可验收练习与官方资料

写一份发布验收记录：制品 SHA-256、版本、权限清单、离线测试、负例结果与隐私政策地址。
验收：记录对应最终 ZIP，新增权限会让脚本失败，描述与实际功能一致；不自动提交或发布。

- [Chrome 发布流程](https://developer.chrome.com/docs/webstore/publish)
- [MV3 远程代码政策](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)
- [用户数据隐私政策](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [权限声明](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
