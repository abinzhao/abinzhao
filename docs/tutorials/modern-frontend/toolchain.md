---
title: 现代前端工具链：Vite、TypeScript 与资源边界
description: 从完整预算页面建立 Vite 项目，明确类型检查、路径别名、静态资源和客户端环境变量。
type: tutorial
topic: modern-frontend
section: platform
order: 10
level: beginner
status: published
tags:
  - Vite
  - TypeScript
  - 工具链
  - 环境变量
prerequisites: []
comments: true
---

# 现代前端工具链：Vite、TypeScript 与资源边界

前端工具链负责把源代码变成浏览器能加载的产物，但它并不自动保证类型正确、资源安全或部署路径正确。本篇建立一个完整的预算计算页面，逐步理解开发服务器、TypeScript 检查、模块别名、公共文件和客户端环境变量。示例使用原生 TypeScript，便于观察工具本身；同样的边界适用于 React 18+ 和 Vue 3 项目。

你需要能阅读模块导入、函数和基本 DOM 操作。推荐 Node 24 的受支持补丁版本，也可以使用满足具体依赖要求的 Node 22。当前 Vite 文档列出 Node 22.12+ 等最低要求；不能把“安装了 Node 22”直接等同于满足所有工具的引擎要求。后续质量篇与交付篇会沿用这个独立实验项目。

## 创建项目并认识三个执行阶段

在新的目录创建 TypeScript 模板：

```bash
node --version
npm --version
npm create vite@latest frontend-budget-lab -- --template vanilla-ts
cd frontend-budget-lab
npm install
npm run dev
```

开发阶段，Vite 以项目根目录中的 `index.html` 为入口，提供模块转换、开发服务与热更新。生产构建阶段，会生成适合静态托管的 HTML、JavaScript 和资源文件。预览阶段只用于本地检查构建产物，不是具有生产运维能力的服务，也不会替你配置缓存、安全响应头和访问控制。

开发服务器能显示 TypeScript 页面，不代表类型检查通过。Vite 负责转换 TypeScript 语法，但类型检查需要单独运行 TypeScript 编译器。项目应把“能转换”“类型正确”“行为正确”作为三个不同标准。框架模板还会增加 JSX 或单文件组件处理，不会因此消除类型检查责任。

脚手架依赖会随时间变化。首次安装后记录版本、保留锁文件；后续通过 `npm ci` 按锁重建，而不是每次用最新版重建项目。不要在复制教程时混合多个版本的底层打包选项。本篇只使用 Vite 稳定的公共配置，不依赖实验 API 或特定打包内核的分块细节。

## 配置最小 TypeScript 与别名

在实验项目中将 `tsconfig.json` 替换为以下完整配置。它面向浏览器代码，采用由打包器解析模块的模式，不将源文件输出到工作目录。

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "types": ["vite/client"],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

`strict` 让不明确的类型更早暴露，`noEmit` 将编译器定位为检查器，真正的产物由 Vite 生成。`lib` 提供浏览器 API 类型，不会给旧浏览器安装这些 API 的实现。把目标设低主要涉及语法转换，不能替代运行时 polyfill 和目标浏览器验证。

TypeScript 的 `paths` 告诉类型系统如何理解导入，但不是独立的浏览器运行时重写机制。为避免只在编辑器里成功、打包时找不到模块，本篇同时给 Vite 明确别名。新增 `vite.config.mjs`：

```js
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
```

文件 URL 通过标准 API 转成本地绝对路径，不手工切掉前缀，也不假定操作系统的路径分隔符。两份别名要表达同一个目录。模板如果使用多个 tsconfig，React 的应用代码应配置在实际应用 tsconfig 中，Node 配置脚本则放在对应 Node tsconfig；不能只修改一个未被使用的根文件。

## 实现可运行的预算页面

先创建 `src/budget.ts`。所有金额用整数“分”计算，参数无效时抛出明确错误，显示格式留给视图层处理。

```ts
export function calculateBudget(priceCents: number, quantity: number): number {
  if (!Number.isSafeInteger(priceCents) || priceCents < 0) {
    throw new Error('单价必须是非负安全整数分');
  }
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
    throw new Error('数量必须是一到九十九之间的整数');
  }
  const total = priceCents * quantity;
  if (!Number.isSafeInteger(total)) {
    throw new Error('总金额超出安全整数范围');
  }
  return total;
}
```

再创建 `src/view.ts`。视图工厂返回元素与释放函数，调用者知道什么时候应该取消监听。这里不读取远端接口，不把输入放入 `innerHTML`，而是通过 `textContent` 写入结果。

```ts
import { calculateBudget } from '@/budget';

export function createBudgetView() {
  const form = document.createElement('form');
  const label = document.createElement('label');
  label.textContent = '数量 ';
  const input = document.createElement('input');
  input.type = 'number';
  input.name = 'quantity';
  input.value = '1';
  label.append(input);
  const button = document.createElement('button');
  button.type = 'submit';
  button.textContent = '计算预算';
  const output = document.createElement('p');
  output.setAttribute('role', 'status');
  form.noValidate = true;
  form.append(label, button, output);

  function submit(event: Event) {
    event.preventDefault();
    try {
      const total = calculateBudget(1200, Number(input.value));
      output.textContent = `预算：¥${(total / 100).toFixed(2)}`;
    } catch (error) {
      output.textContent = error instanceof Error ? error.message : '计算失败';
    }
  }

  form.addEventListener('submit', submit);
  return {
    element: form,
    dispose: () => form.removeEventListener('submit', submit),
  };
}
```

将 `src/main.ts` 替换为完整入口：

```ts
import { createBudgetView } from '@/view';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('缺少 #app 根节点');

const heading = document.createElement('h1');
heading.textContent = import.meta.env.VITE_APP_TITLE || '预算实验室';
const link = document.createElement('a');
link.href = `${import.meta.env.BASE_URL}guide.txt`;
link.textContent = '查看使用说明';
const view = createBudgetView();
app.replaceChildren(heading, view.element, link);

if (import.meta.hot) {
  import.meta.hot.dispose(() => view.dispose());
}
```

泛型只帮助 TypeScript理解预期节点类型，真正是否存在仍需要运行时检查。类型断言不能创造 DOM，也不能证明服务器返回了正确数据。热更新清理展示开发环境资源责任；在 React 或 Vue 中，组件卸载也应对应释放函数，不能仅因为开发页面能刷新就忽略监听。

## index.html、public 与环境变量

将实验项目 `index.html` 替换为以下内容，入口位于根目录而不是 `public`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>预算实验室</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

创建 `public/guide.txt`：

```text
单价为十二元，输入一到九十九之间的整数数量后计算预算。
示例只计算本地金额，不会提交订单或产生付款。
```

`public` 中的文件在开发时按根公共路径提供，构建时原样复制，不参与普通模块转换，也不默认加内容哈希。引用它时路径不包含 `public` 这一目录名。需要被打包器分析、重命名或生成哈希的资源通常应放在源目录并通过模块导入。

本例用 `BASE_URL` 拼接公共说明地址，为之后部署到子路径准备。Vite 能调整其处理的 HTML、CSS 和资源导入，但普通运行时字符串不会全部自动重写。硬编码 `/guide.txt` 会指向域名根目录，部署在子目录时可能找错资源；不能期待设置一次 base 就修复所有自己拼接的地址。

创建 `.env`：

```dotenv
VITE_APP_TITLE=预算实验室
```

环境文件修改后重启开发服务器。`VITE_` 前缀变量会进入客户端代码，构建时被替换，不能存放访问令牌、数据库密码或服务端私钥。没有前缀的变量也并非绝对安全：若配置脚本手动把它注入客户端，同样会泄漏。安全边界是“哪些值进入公开产物”，不是某个前缀的拼写。

Vite 会加载通用和对应 mode 的环境文件；mode 专属值优先于通用文件，启动 Vite 前已存在的进程环境值优先。`--mode staging` 改变加载模式，不等于把生产构建变成开发构建。变量通常是字符串，需要显式解析布尔值和数字；声明 TypeScript 接口也不能保证部署时一定提供这些值。

## 工具链与应用运行时的边界

Vite 配置在 Node 环境执行，页面模块在浏览器环境执行。前者可以读取构建所需的文件系统信息，后者不能直接调用 Node 文件 API。把一个模块同时导入两个环境时，必须明确它是否只包含纯逻辑。预算函数没有依赖 DOM 或进程状态，因此可以被测试复用；视图模块则明确需要浏览器元素。

模块解析方式同样依赖执行环境。TypeScript 的 Bundler 模式适合由构建工具处理的浏览器代码，不能据此认为 Node 直接执行时会接受所有相同导入形式。配置脚本使用完整扩展名和标准文件 URL，客户端源码使用显式配置的别名，二者分别由各自工具理解，不需要假装存在一个覆盖所有平台的解析规则。

热更新能保留部分页面状态，却也可能掩盖初始化问题。开发中只改一个函数后成功，不代表全新页面加载时也正常；每次验收应至少做一次完整刷新和一次生产预览。监听清理尤其要注意，重复热更新可能累积事件处理器，让一个点击执行多次，排查时先确认资源建立与释放是否配对。

构建目标也不是浏览器能力清单。语法转换可以降低某些语言语法要求，但不会自动实现缺少的 API。使用 `AbortController`、加密 API 或新的数组方法时，仍要根据目标浏览器核对支持，并以项目已有的兼容策略解决。不要为了一个未确认的旧浏览器需求随意增加整套兼容依赖。

公开目录应保持小而明确。任何放入其中的文件都可能在部署后被直接下载，所以不能放环境秘密、私有报告和源码备份。文件无需被页面链接就可以被访问，隐藏导航不是访问控制。资源是否公开由托管路径和产物决定，而不是用户是否能在菜单中看到入口。

依赖增加也应对应实际责任。别名可以用现有 Vite 配置解决，不需要为一个目录映射引入插件；纯金额函数不需要额外状态库。只有真实复杂度出现时再扩大工具集合，并同时说明版本、运行成本和验证方式，避免让初学者把安装工具数量误认为工程成熟度。

## 验证与检查顺序

在实验项目 `package.json` 的现有 `scripts` 中保留其他字段，并配置下面四项：

```json
{
  "dev": "vite",
  "typecheck": "tsc --noEmit",
  "build": "npm run typecheck && vite build",
  "preview": "vite preview"
}
```

这是 `scripts` 对象内容，不是完整包清单，合并时不要删除依赖字段。依次执行：

```bash
npm run typecheck
npm run build
npm run preview
```

预期类型检查无错误，构建生成 `dist/index.html` 与资源目录，预览中标题来自无秘密环境变量。输入二点击计算应显示二十四元；输入零应出现范围错误；点击说明链接应读取公共文本。查看浏览器网络面板，确认没有请求 `/public/guide.txt` 或未转换的 TypeScript 源文件。

在开发与预览各做一次验证，不把热更新缓存中的成功当作最终产物成功。关闭服务器后应无法继续从同一个服务端口请求页面，避免把另一个占用端口的服务误认成本项目。

## 排错、练习与官方来源

编辑器识别别名但浏览器报错，检查 Vite 别名是否存在并指向同一绝对目录。构建正常却类型报错，确认检查命令确实包含源文件，以及类型检查是否被从脚本中删掉。公共文件 404，检查 URL 是否包含错误的 `public` 段、部署 base 和实际文件大小写。

环境标题不变，先重启 Vite，再检查 mode 与外部变量，不反复刷新期待构建时常量改变。真实接口地址也应区分公开配置和秘密认证信息；公开 API 地址可以进入客户端，服务端凭据不可以。

练习一：把单价改成参数并增加边界校验，避免浮点元直接参与乘法。练习二：使用 `--mode staging` 和对应环境文件改变无秘密标题，记录 `MODE` 与生产构建的区别。练习三：把 base 设为 `/budget-lab/`，检查入口、说明链接与资源地址，继续阅读[质量检查与测试分层](/tutorials/modern-frontend/quality.html)。

- [Vite：开始使用](https://vite.dev/guide/)
- [Vite：功能与 TypeScript](https://vite.dev/guide/features)
- [Vite：静态资源](https://vite.dev/guide/assets)
- [Vite：环境变量与模式](https://vite.dev/guide/env-and-mode)
- [Vite：共享配置与别名](https://vite.dev/config/shared-options)
- [TypeScript：paths](https://www.typescriptlang.org/tsconfig/paths.html)
