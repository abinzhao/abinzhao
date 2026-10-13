---
title: 依赖、模块与 Vite 工作流
description: 从 package.json 和锁文件到 ESM、开发服务器、类型检查及环境变量。
---

# 依赖、模块与 Vite 工作流

## 学习目标与运行边界

本节要建立一条可解释的链路：依赖安装提供工具，ESM 描述模块关系，Vite 负责开发与打包，TypeScript 单独检查类型。
完成后，你应能说明“开发页面能打开”为什么不等于“生产代码可靠”，并能复现一次环境变量配置错误。

所有命令在新建的练习项目中运行，不在教程站点根目录执行。
使用 Node.js 22.12+ 的 22.x 或当前受 Vite 支持的 LTS；先执行 `node -v`、`npm -v`。
模板随版本演进，生成后以实际 `package.json`、锁文件和 Vite 官方兼容要求为准。

## 1. 安装不是复制一个 node_modules

`package.json` 描述直接依赖、版本范围和脚本，锁文件描述解析出的依赖图及完整性信息。
例如 `^1.2.3` 通常允许同一主版本中的兼容更新，不等于固定到 `1.2.3`。
锁文件应提交到版本控制；`node_modules` 是安装结果，不应提交。

npm 常用较扁平的依赖布局；pnpm 使用内容寻址存储和链接，减少重复存储，并使依赖边界更明确。
不要依赖“恰好能从上层找到”的传递依赖：源码直接导入的包，应列为自己的直接依赖。
`dependencies` 是应用依赖，`devDependencies` 是开发工具；纯静态站点最终部署的是产物，而不是整个依赖目录。

以下二选一。首次创建可以解析新版本，随后用锁文件固定安装结果。

::: code-group
```bash [npm]
npm create vite@latest tooling-lab -- --template vanilla-ts
cd tooling-lab
npm install
npm pkg set 'scripts.typecheck=tsc --noEmit'
npm run dev
```

```bash [pnpm]
npm install -g pnpm@10
pnpm create vite tooling-lab --template vanilla-ts
cd tooling-lab
pnpm install
npm pkg set 'scripts.typecheck=tsc --noEmit'
pnpm dev
```
:::

pnpm 路线里的 `npm pkg set` 仅编辑清单，不安装依赖；它不会生成 npm 锁文件。
团队确定一种管理器后，保留对应锁文件：npm 用 `package-lock.json`，pnpm 用 `pnpm-lock.yaml`。
不要交替安装并维护两份互相偏离的锁文件。多人项目还应记录 Node 和管理器版本。

CI 中 npm 使用 `npm ci`，pnpm 使用 `pnpm install --frozen-lockfile`。
清单与锁文件不一致时，CI 应失败；在本地正常安装更新锁文件并审查，而不是在 CI 关闭冻结选项。
npm 的 `ci` 会重建安装目录，因此只在练习项目或已明确允许的工作目录执行。

## 2. ESM 的边界：浏览器模块不是 Node 模块

`import` / `export` 是模块协议；浏览器通过 URL 找模块，Node 与构建工具另有包解析规则。
`type: "module"` 让 Node 把项目中的 `.js` 当 ESM；`.mjs` 始终是 ESM，`.cjs` 始终是 CommonJS。
浏览器里的 `<script type="module">` 独立决定模块加载，不受 `package.json` 的 `type` 控制。
浏览器不能直接运行 TypeScript，也不能无配置理解 `import '某个包'`；Vite 会转换并解析这些导入。

在 `tooling-lab` 中替换以下文件，保留模板生成的 `tsconfig.json` 和依赖。
`.env.development` 与 `.env.production` 都位于项目根目录，不是 `src/`。

::: code-group
```html [index.html]
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>工具链实验</title>
  </head>
  <body>
    <main id="app"></main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

```ts [src/message.ts]
export function makeMessage(name: string, limit: number): string {
  return `${name}：最多显示 ${limit} 项`;
}
```

```ts{5-8} [src/main.ts]
import { makeMessage } from './message';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('缺少 #app 挂载节点');
const name = import.meta.env.VITE_APP_NAME || '未命名应用';
const limit = Number(import.meta.env.VITE_PAGE_LIMIT);
if (!Number.isInteger(limit) || limit < 1) {
  throw new Error('VITE_PAGE_LIMIT 必须是正整数');
}
const heading = document.createElement('h1');
heading.textContent = makeMessage(name, limit);
const detail = document.createElement('p');
detail.textContent = `mode=${import.meta.env.MODE}; dev=${import.meta.env.DEV}`;
root.replaceChildren(heading, detail);
```

```dotenv [.env.development]
VITE_APP_NAME=开发练习
VITE_PAGE_LIMIT=5
```

```dotenv [.env.production]
VITE_APP_NAME=生产练习
VITE_PAGE_LIMIT=20
```
:::

高亮部分是在运行时验证配置：环境变量即使有类型提示，值仍来自外部输入。
除了 `DEV`、`PROD` 等内置布尔量，自定义变量默认是字符串，`"false"` 不是布尔值 `false`。
通常优先级是启动进程已有变量、模式专属文件、通用文件；修改文件后重启开发服务器。

## 3. dev、build 与 mode 分别决定什么

开发服务器按需处理模块，并通过 HMR 通知浏览器更新；不需要每次改动都生成整个发布目录。
生产构建会转换、优化、分包并输出静态资源。不要把某一代底层打包器的名字当作 Vite 的永久接口。
Vite 转换 TS 时不承担完整类型检查，工程必须显式保留 `typecheck` 步骤。

在自己的 `tooling-lab` 中依次运行：

```bash
npm run typecheck
npm run build
npm run preview -- --host 127.0.0.1
```

pnpm 用户对应执行 `pnpm typecheck`、`pnpm build`、`pnpm preview --host 127.0.0.1`。
访问终端显示的 preview 地址，应看到“生产练习：最多显示 20 项”，开发地址则显示 5 项。
`preview` 用于检查产物，不是生产服务方案；线上由静态服务器/CDN 提供 HTTPS、缓存和路径回退。

`vite build --mode staging` 选择 `.env.staging`，不会自动把构建变成开发构建。
mode 是配置选择名称，`NODE_ENV` 与生产/开发行为另有关联，不能把 `MODE === 'staging'` 当作 `DEV`。
客户端 `VITE_` 变量会进入产物，构建后修改服务器环境不能改变已打包的值。
密码、私钥、服务端令牌绝不能放进客户端配置，也不能因文件名包含 `.local` 就认为不会泄露。

## 4. 效果验证与故障定位

先把开发文件中的 `VITE_PAGE_LIMIT` 改为 `abc` 并重启，页面应停止初始化，控制台显示明确的配置错误。
恢复为 5 后页面恢复；这证明失败路径确实存在，而不是默默使用一个不可信值。
再把 `makeMessage` 第二个参数临时传成字符串，`typecheck` 应报参数类型错误；修复后重新检查。

| 现象 | 原因与修复 |
| --- | --- |
| `Cannot use import statement` | Node 按 CommonJS 读取了 ESM；核对 `type` 或文件扩展名 |
| 开发正常，CI 安装失败 | 清单和锁文件漂移；本地安装并审查锁文件变更 |
| 环境变量是 `undefined` | 前缀、模式、文件位置不对，或尚未重启 |
| 直接双击产物 HTML 白屏 | 模块 URL 与部署路径不是 `file:` 路径；使用静态 HTTP 服务 |

遇到故障先检查终端、控制台、Network 中失败资源，再决定是否处理缓存。
删除锁文件或重装一切会改变依赖图，可能掩盖根因，不是默认修复步骤。

## 练习与验收

新增 `.env.staging`，设置名称为“验收环境”、上限为 8。
执行 `npm run build -- --mode staging` 后在练习项目预览，记录页面文字与 `mode`。
验收：锁文件只有一份；`typecheck` 通过；staging 显示 8；无效配置有明确错误；产物不包含秘密。
另外解释一次：为什么“环境变量有 TS 类型”仍需要 `Number` 转换和范围检查。

## 官方资料

- [npm package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json) 与 [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci)
- [pnpm 安装与冻结锁文件](https://pnpm.io/cli/install)
- [Vite 入门](https://vite.dev/guide/) 与 [环境变量和模式](https://vite.dev/guide/env-and-mode)
- [Node.js 模块系统](https://nodejs.org/api/packages.html#type)

下一节：[TypeScript 与运行时边界](../typescript/types.md)。
