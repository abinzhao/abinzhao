---
title: 前端交付实践：CI 门禁、子路径部署与产物安全
description: 从可复现构建到本地验收，明确 base、路由回退、缓存、产物检查和发布恢复边界。
type: tutorial
topic: modern-frontend
section: platform
order: 30
level: advanced
status: published
tags:
  - CI
  - Vite
  - 部署
  - 安全
prerequisites:
  - /tutorials/modern-frontend/quality.html
comments: true
---

# 前端交付实践：CI 门禁、子路径部署与产物安全

开发地址能打开页面，和用户在正式域名下能够稳定访问，是两个不同的完成标准。交付涉及锁定构建输入、检查质量结果、设置公共路径、确认路由回退、验证缓存和检查公开产物。本篇沿用预算实验项目，把这些环节连接成可审查的流程，不执行真实发布或远端写操作。

先完成[质量检查与测试分层](/tutorials/modern-frontend/quality.html)。示例适用于 Vite 静态前端，也适用于 React 18+ 和 Vue 3 的客户端应用；不覆盖需要服务端渲染或专门运行时服务的部署。本篇构建目录为 `dist`，目标公共前缀采用 `/budget-lab/`，它只是独立实验的路径，不代表当前站点实际部署配置。

## 明确构建输入与产物边界

一次可追踪的构建至少需要明确源码版本、Node 与 npm 版本、锁文件、构建模式和公开配置。`npm ci` 让依赖树按锁重建，但操作系统、原生扩展和构建时配置仍可能影响结果。“同一个提交”不能单独证明“同一个产物”，尤其是构建读取外部环境变量时。

推荐 Node 24 的受支持补丁版本。严格可复现流程应固定已经验证的完整 Node 版本，并记录 npm 版本；只写主版本会跟随补丁更新，有利于安全维护，但需要承认输入可能变化。升级运行时之后重新验证原生依赖与构建行为，不把 LTS 名称当作兼容测试。

只有真正需要公开的数据进入客户端构建。标题、公开 API 地址可以作为构建配置，服务端认证密钥不能。Vite 的 `VITE_` 变量会进入浏览器产物，构建完成后在托管机器上修改环境变量不会自动改变已经生成的 JavaScript。如果业务需要运行时配置，应另行定义公开配置文件的读取和缓存策略。

默认应用构建产物包括入口 HTML 与静态资源，不包括 Node 服务。部署时上传 `dist`，不是整个源码仓库、`node_modules` 或开发环境目录。SSR、边缘函数和服务端 API 需要各自的运行契约，不能把它们放进公共目录就认为完成部署。

## 第一步：显式设置公共 base

在独立预算项目运行：

```bash
npm ci
npm run check
npm run build -- --base=/budget-lab/ --mode=production
```

前章的 build 脚本先类型检查再调用 Vite，附加参数应由最终 Vite 命令接收；如果项目脚本经过其他包装层，先检查实际传参行为。更直观的做法是在实验项目 `scripts` 中新增明确命令：

```json
{
  "build:release": "npm run typecheck && vite build --base=/budget-lab/ --mode=production",
  "preview:release": "vite preview --base=/budget-lab/ --host 127.0.0.1 --port 4173 --strictPort"
}
```

这是 scripts 中的新增项，不是完整清单，不能用它替换依赖信息。之后统一执行 `npm run build:release`，减少命令行遗漏公共路径的风险。生产构建默认使用 production mode，显式写出是为了让契约易于审查，不意味着这个 mode 会自动提供安全策略。

base 影响 Vite 处理的资源地址。前章公共说明链接通过 `import.meta.env.BASE_URL` 拼接，因此也会指向目标前缀。自己硬编码的 `/api` 或 `/guide.txt` 不一定被重写；前者可能有意指向域名根接口，后者则可能是错误资源地址。要按资源用途区分，不能机械地给每个 URL 都追加 base。

对于无法预知路径的嵌入场景，可以评估相对 base，但它不自动解决客户端历史路由、API 路径和公共资源拼接。相对地址会随当前文档 URL 改变，深层路径必须实际验收。最简单的策略是先明确一个公共前缀，保证入口、模块、CSS 和公共文件使用一致契约。

## 第二步：本地验收构建产物

执行：

```bash
npm run preview:release
```

从浏览器访问终端输出地址下的 `/budget-lab/`，不要继续打开开发服务器地址。`--strictPort` 保证端口被占用时明确失败，而不是默默切换，让后续自动检查误测另一个服务。

在另一个终端可读取：

```bash
curl -I http://127.0.0.1:4173/budget-lab/
curl -fsS http://127.0.0.1:4173/budget-lab/guide.txt
```

预期入口可访问、说明文本内容正确；浏览器输入二计算显示二十四元，输入零出现错误，控制台没有资源加载失败。网络面板检查模块和公共文件地址，确认不是请求域名根目录中的错误同名资源。

`vite preview` 只是预览工具，其路由回退和响应头不能证明正式托管平台行为正确。尤其是 HTML 回退可能把不存在的 JavaScript 路径也返回为 HTML，表面上 HTTP 为成功，浏览器却因 MIME 类型错误拒绝执行。检查状态码时还要检查内容类型和响应正文，不能只看一个数字。

## 路由模式、深层链接和 base 的区别

React Router 的历史路由通常需要 `basename`，Vue Router 的历史模式通常需要对应基础路径，并要求托管平台把客户端路由回退到入口。客户端公共路径、路由基础路径与服务器回退是三个合作边界，设置其中一个不意味着其他两个自动完成。

使用哈希路由时，片段不会发给服务器，静态托管通常只收到入口路径，但资源 base 仍要正确。使用历史路由时，必须测试从站外直接打开深层页面、刷新深层页面、前进后退和不存在路由。只测试站内点击成功，可能完全没有触达服务器回退问题。

预算实验本身没有客户端路由，因此它只能验证资源 base。框架应用应另外建立具有真实页面的验收路径。服务器回退应限定应用范围，并避免把静态资源和接口路径全部回退成入口 HTML；真正不存在的资源应返回明确失败，而不是伪装成功。

若同时托管多个应用，还要验证各自路径不冲突。一个过宽的根路径回退可能截获另一应用的资源或接口请求。路径大小写也要在目标平台测试，macOS 文件系统上的成功不能保证大小写敏感服务器上也成立。

## 第三步：建立只构建不发布的 CI

下面是独立项目可采用的 GitHub Actions 示例，内容放入 `.github/workflows/check.yml` 后生效。它完成检查、构建和产物上传；真正部署需要另行配置目标平台与权限。

```yaml
name: frontend-check
on:
  pull_request:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: npm
      - name: Show runtime
        run: |
          node --version
          npm --version
      - name: Install locked dependencies
        run: npm ci
      - name: Run quality checks
        run: npm run check
      - name: Build release artifact
        run: npm run build:release
      - name: Check public artifact
        run: node scripts/check-artifact.mjs
      - uses: actions/upload-artifact@v4
        with:
          name: budget-lab-dist
          path: dist
          if-no-files-found: error
          retention-days: 7
```

工作流使用已发布的稳定 Action 主版本示例，正式供应链策略可固定审核过的完整提交标识，并制定升级流程。这里不伪造某个未经核对的提交哈希。外部 Action 与安装脚本都具有执行能力，需要来源审查、最小权限和明确输入范围。

setup-node 的 npm 缓存主要复用包下载缓存，不是跳过 `npm ci`，也不是把未知的 `node_modules` 当成可信产物。构建任务和发布任务应隔离，来自不可信分支的代码检查不应拿到生产凭据。也不要在高权限事件中检出不可信代码再执行安装脚本。

质量检查失败就不构建或上传成功产物。上面的顺序便于查找首个错误；大型工程可并行独立检查，但发布门禁必须等待全部相关结果。上传文件存在不代表它安全或正确，后面仍需验收产物内容和目标平台行为。

## 第四步：检查公开产物

在独立实验项目新增 `scripts/check-artifact.mjs`。它只读取 `dist`，检查入口、空产物、符号链接以及显然不应公开的文件名；使用结构化目录 API，不靠拼接 shell 扫描路径。

```js
import { access, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../dist/', import.meta.url);
const directory = fileURLToPath(root);
await access(new URL('index.html', root));
const forbidden = [];
let files = 0;

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      forbidden.push(`符号链接：${relative(fileURLToPath(root), path)}`);
      continue;
    }
    if (entry.isDirectory()) {
      await visit(path);
      continue;
    }
    if (!entry.isFile()) continue;
    files += 1;
    if (
      /^\.env(?:\.|$)/.test(entry.name) ||
      /\.(?:pem|key|p12|map)$/i.test(entry.name) ||
      ['package.json', 'package-lock.json'].includes(entry.name)
    ) {
      forbidden.push(relative(fileURLToPath(root), path));
    }
    if ((await stat(path)).size === 0 && entry.name === 'index.html') {
      throw new Error('入口 HTML 为空');
    }
  }
}

await visit(directory);
if (files === 0) throw new Error('没有构建文件');
if (forbidden.length) {
  throw new Error(`发现需要审查的公开文件：${forbidden.join(', ')}`);
}
console.log(`产物检查通过，共 ${files} 个文件`);
```

该脚本是最小文件清单门禁，不是秘密检测器，也不完整验证 HTML 和所有资源引用。实际项目还要对公开目录、客户端常量、调试信息和第三方资源进行审查。某些库分发有意包含 package 元信息，应该按产物类型制定策略，而不是照搬应用门禁。

源映射是否公开应由威胁模型决定。本例门禁拒绝 `.map`，可把经过审查的映射私下上传到错误监控系统；`hidden` source map 只是去掉公开引用，不代表文件没有生成，更不代表部署时不会被访问。任何秘密只要进入 JavaScript，即使没有映射也仍然泄漏。

产物文件名检查不能识别被重命名的私钥，也不能证明打包代码没有凭据。不要拿真实密钥当测试样本，使用明显占位值验证规则。公开产物需要与构建输入关联，正式交付宜记录完整目录的校验和与版本信息，不能只给入口文件计算哈希就声称整个目录未变化。

## 缓存、动态加载失败与恢复

HTML 通常需要允许及时重新验证，而带内容哈希的资源适合长期缓存。`Cache-Control: no-cache` 允许缓存但要求复用前验证，不等同于 `no-store`。公共文件若名称不带哈希，就需要独立的更新与缓存策略，不能直接套用不可变缓存。

新版本发布后，旧页面仍可能尝试加载旧动态模块。如果服务器立即删除所有旧资源，用户首次进入某个懒加载页面就可能失败。可以保留一定版本窗口、使用原子目录切换，或向用户展示可恢复的更新提示。简单无限自动刷新可能造成循环，并丢失未保存表单。

正式发布要有权限门禁、明确目标和恢复方案，不因 CI 构建成功自动扩大授权。回滚应恢复入口和匹配的资源集合，不能只回滚 HTML 留下不匹配模块。部署之后再验证 HTTPS、响应头、关键页面、接口错误以及目标设备行为；预览成功只证明其中一部分。

## 排错、练习与官方来源

页面入口正常但模块 404，核对实际上传目录、base、资源大小写与旧缓存。深层地址刷新失败，检查服务器回退与路由基础路径。CI 安装失败，核对运行版本和锁文件，不通过删锁或使用强制安装制造成功。环境值错误，检查它何时进入构建以及是否被外部变量覆盖。

练习一：在 `/budget-lab/` 与域名根路径各构建一次，比较资源地址并复测公共说明。练习二：为门禁创建无秘密的 `.env.example` 模拟产物，确认明确失败，之后移出公开目录。练习三：给真实框架应用设计新旧版本切换验收，包含未保存草稿与懒加载失败恢复，不实际发布未经批准的版本。

- [Vite：生产构建与公共路径](https://vite.dev/guide/build)
- [Vite：静态站点部署](https://vite.dev/guide/static-deploy)
- [Vite：环境变量与模式](https://vite.dev/guide/env-and-mode)
- [Vite：构建选项与源映射](https://vite.dev/config/build-options)
- [Vitest：CLI 与单次执行](https://vitest.dev/guide/cli)
- [npm：ci](https://docs.npmjs.com/cli/v11/commands/npm-ci)
