---
title: Node.js 环境搭建：版本管理、锁文件与 ESM 配置
description: 建立可复现的 Node 22 与 24 环境，核对 PATH、npm 安装、模块格式和环境变量优先级。
type: tutorial
topic: nodejs
section: platform
order: 10
level: beginner
status: published
tags:
  - Node.js
  - npm
  - ESM
  - 环境配置
prerequisites: []
comments: true
---

# Node.js 环境搭建：版本管理、锁文件与 ESM 配置

“已经安装 Node”不足以说明一个项目能稳定运行。终端可能调用另一个版本，编辑器可能继承旧 PATH，npm 可能改变依赖树，运行时也可能用错误的模块格式解释文件。本篇建立一个不依赖第三方运行库的配置检查项目，从版本选择一路走到锁文件、ESM 和环境变量验证。

本篇以 Node 24 的受支持补丁版本为推荐环境，兼顾 Node 22。版本说明以 2026 年 10 月为时间边界：Node 24 和 22 属于受支持的 LTS 分支，Node 20 已结束官方支持。未来应重新查看官方发布表，不把“主版本数字更大”或“某个旧教程推荐”当作维护状态的证据。

## 版本边界与安装前检查

Node 22+ 不表示每个主版本或每个小版本都具有相同能力。当前 Vite 对 Node 22 有 22.12+ 等具体要求，而本文原生 `--env-file` 示例要求使用已将该选项稳定化的 Node 22.21+ 或 Node 24.10+。为减少补丁差异，选择相应 LTS 分支的最新受支持补丁，并记录实际版本。

Node 的运行支持还受操作系统、CPU 架构和原生扩展影响。在 Apple Silicon 上，混用 Rosetta 的 x64 Node 和 arm64 依赖可能出现二进制加载错误。不要在失败后反复复制 `node_modules`；先确认 `process.arch`、`process.platform` 和依赖是否提供对应二进制。

安装之前在终端执行只读检查：

```bash
node --version
npm --version
command -v node
command -v npm
type -a node
node -p "process.execPath"
node -p "process.arch + ' ' + process.platform"
```

`command -v` 告诉你命令解析结果，`process.execPath` 告诉你实际运行的 Node 路径，两者共同定位 PATH 和包装脚本问题。PATH 按顺序搜索，Homebrew、系统安装包、版本管理器和编辑器终端可能提供不同入口。不要仅凭一个目录存在就认定它正在生效。

## 使用 nvm 管理多个版本

macOS 和 Linux 可以使用 nvm。它是社区维护的版本管理器，不是 Node 内核的一部分；Windows 原生命令行通常需要另一套安装方案，不能直接照搬下面的 shell 初始化。首次安装请从项目官方仓库审查安装说明和脚本，不把来源不明的下载脚本直接交给 shell。

若已经安装 nvm，先在当前 shell 加载，再安装与选择版本：

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
command -v nvm
nvm install 24
nvm use 24
nvm current
node --version
```

`nvm` 通常是 shell 函数，不能只靠寻找可执行文件判断是否安装。长期使用时，将对应初始化放入适合当前 shell 的启动文件；zsh 的交互启动常涉及 `.zshrc`。不要同时在多个启动文件重复初始化不同管理器，否则 PATH 的结果容易被后续操作覆盖。

在学习项目根目录创建 `.nvmrc`，内容为 `24`，进入目录后执行 `nvm use`。写主版本便于跟随该分支补丁，严格可复现的 CI 则应记录或固定经过验证的完整版本。nvm 不保证所有终端自动读取 `.nvmrc`，自动切换需要另外配置，不能把文件存在等同于切换完成。

跨版本验证可以使用已安装的两个 LTS 分支：

```bash
nvm install 22
nvm use 22
node --version
nvm use 24
node --version
```

切换版本后核对 npm 路径与版本。全局安装的包往往按 Node 版本隔离，不能假定换版本后还能找到同一个全局工具。项目开发工具应放入本地依赖，并通过 npm script 调用，减少机器级全局状态对结果的影响。

## 建立完整 ESM 实验项目

在新的空目录创建项目，不需要先执行 `npm init` 再手工拼接字段。创建 `package.json`、`format.js`、`index.js` 和三个环境文件，下面给出完整内容。

`package.json`：

```json
{
  "name": "node-environment-lab",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": "^22.21.0 || >=24.10.0 <25"
  },
  "scripts": {
    "start": "node --env-file=.env --env-file=.env.local index.js",
    "check": "node --check index.js"
  }
}
```

`engines` 描述项目约定，但 npm 默认并不总是强制阻止不匹配版本，仍要在开发与 CI 中核对运行时。本例不声称支持 Node 23、25 或任意更高版本；扩大支持范围需要实际兼容验证。`private` 防止意外发布，不等于隐藏文件内容或自动保护秘密。

`format.js`：

```js
export function describeConfig({ name, port, debug }) {
  return `${name} | port=${port} | debug=${debug}`;
}
```

`index.js`：

```js
import { describeConfig } from './format.js';

function readConfig(env) {
  const name = env.APP_NAME?.trim() || 'environment-lab';
  const port = Number(env.PORT ?? '3000');
  const debug = env.DEBUG === 'true';
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT 必须是一到六万五千五百三十五之间的整数');
  }
  return { name, port, debug };
}

try {
  const config = readConfig(process.env);
  console.log(describeConfig(config));
  console.log(`runtime=${process.version}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : '配置读取失败');
  process.exitCode = 1;
}
```

包中的 `.js` 通过 `"type": "module"` 按 ESM 解释，`.mjs` 则明确为 ESM，`.cjs` 明确为 CommonJS。ESM 相对导入写出实际扩展名，不依赖打包器替你补齐。也不要在 ESM 中直接使用 CommonJS 的 `require` 或 `__dirname`；需要模块相对文件路径时优先 `new URL('./file.txt', import.meta.url)`。

示例只解析并输出无敏感性的配置，不启动服务，避免让端口冲突掩盖环境问题。真实系统不要把整个 `process.env` 打印到日志，里面可能包含凭据、代理配置和服务地址。错误输出也应经过边界设计，而不是把秘密值拼进异常。

## npm install、lock 与 ci

在实验目录执行安装与检查：

```bash
npm install
npm run check
npm start
```

即使示例没有第三方依赖，npm 也可以生成锁文件，帮助观察项目安装入口。`package.json` 描述直接依赖的允许范围，`package-lock.json` 记录具体解析树、版本和完整性信息。开发中有意改变依赖时使用 `npm install`，然后审查清单与锁文件的共同变化；不要靠手工修改锁文件修复解析结果。

已拥有一致锁文件时执行：

```bash
npm ci
```

`npm ci` 要求锁文件与清单一致，不会替你悄悄更新锁文件，并会重建安装目录。因此不要在唯一一份带本地调试改动的 `node_modules` 上把它当作无副作用检查。CI 采用它是为了按约定重建依赖，不是因为命令名称里有 CI 就能保证所有构建环境完全相同。

锁文件不能抹平操作系统、原生模块和 npm 版本差异，也不能自动保证依赖安全。安装可能执行生命周期脚本，来源与权限仍要审查。`npx` 或 `npm exec` 在本地没有对应工具时可能下载临时包，所以关键流程优先使用已声明的本地工具，不让临时“最新版”改变执行结果。

## 环境变量优先级与验证

创建 `.env`：

```dotenv
APP_NAME=environment-lab
PORT=3000
DEBUG=false
```

创建 `.env.local`：

```dotenv
PORT=4000
DEBUG=true
```

再创建 `.env.example`，仅作为无秘密的字段示例：

```dotenv
APP_NAME=environment-lab
PORT=3000
DEBUG=false
```

原生 `--env-file` 不会自动寻找 `.env.local`，示例是脚本显式传入两次参数。文件路径相对于启动时的当前工作目录，文件缺失会报错。多个文件中，后读取文件覆盖前面文件中的同名值；但进程启动前已经存在的外部环境变量优先于这些文件。不能把“后一个文件覆盖前一个”错误扩大为“覆盖外部环境”。

在 macOS 或 Linux shell 验证：

```bash
npm start
PORT=5000 npm start
PORT=wrong npm start
```

第一条预期输出端口四千、调试为 true；第二条预期端口五千；第三条预期输出配置错误并以非零码结束。Windows PowerShell 设置进程环境变量的语法不同，应按 shell 使用对应写法。环境变量值是字符串，`Boolean('false')` 仍为 true，因此示例显式比较字符串而不是直接转换。

这些结果是读者应执行的预期，本文未运行实验。不要给 `.env` 放真实秘密再加入版本控制；正式密钥通过受控环境注入，示例文件只保留占位或无秘密默认值。Node 不会自动展开任意 shell 表达式，也不应该把环境文件当成可信的可执行脚本。

## 在团队与 CI 中保持同一运行契约

开发机、编辑器和 CI 是三个独立启动环境。交互 shell 中加载 nvm，不代表 CI 会读取同一启动文件；从图形界面启动的编辑器，也可能不继承你刚修改的 shell 环境。每个入口都应显式选择或核对版本，而不是依赖某个终端此前已经切换成功。

最小的环境记录可以包含实际 Node、npm、系统架构和锁文件版本，不记录整个环境变量集合。排错时比较这些无敏感信息，通常就能解释“我的机器可以”的差异。完整可复现还要考虑外部服务、原生依赖和安装时脚本，但本篇不引入这些额外系统，避免把简单学习环境变成部署平台。

Node 与浏览器的模块环境也不同。Vite 项目可以使用别名导入、资源导入和客户端环境变量，是因为构建工具提供转换；直接 `node index.js` 并不会理解这些项目约定。遇到导入错误，先确认文件到底由 Node 直接执行还是经过打包器，不为了让两个环境都能运行而随意增加兼容层。

运行时支持边界应由项目声明和验证共同构成。`engines` 可以表达意图，锁文件可以记录解析结果，检查命令可以验证当前机器，但任意一项都不能单独证明所有受支持平台都正常。需要多版本支持时，至少在每个声明的 LTS 分支执行关键测试；只有试过 Node 24，就不应声称其他任意版本已经兼容。

依赖升级也要区分目的。跟随安全补丁与直接跨主版本升级的兼容风险不同，安装警告应该成为核对依据，不是自动要求使用最新一切。一个老项目如果锁定旧工具链，先判断维护状态和升级成本，再制定独立变更，不在环境排错时顺带替换所有依赖。

环境变量读取最好集中在启动边界，并立即转换和校验。业务函数接收已经解释好的数字和布尔值，不在每次计算时重新读取字符串；这样测试可以直接传配置对象，运行结果也不会因为某处临时改变 `process.env` 而悄悄漂移。需要动态配置的系统应有另外的更新协议，而不是把环境变量当作实时数据库。

## 排错、练习与官方来源

切换 Node 后仍是旧版本，先检查 shell 是否加载 nvm，再比较 PATH 与 `process.execPath`，重启继承旧环境的编辑器终端。不要先用 `sudo npm install -g` 处理权限错误，那可能把文件所有权弄乱并继续使用错误 Node。

导入报错时检查模块格式、文件扩展名与大小写；`npm ci` 失败时检查清单和锁文件是否来自同一次依赖变更，不删除锁文件掩盖不一致。环境值不符合预期时检查是否存在外部变量，以及命令执行目录是否正确，再检查文件顺序。

练习一：在 Node 22.21+ 和 Node 24.10+ 的受支持补丁上运行同一检查，记录实际版本。练习二：增加 `LOG_LEVEL` 允许值校验，并测试非法输入返回非零码。练习三：把默认配置输出拆到独立模块，说明 ESM 导入为什么要写文件扩展名。

下一篇继续[事件循环、文件与流](/tutorials/nodejs/runtime.html)。

- [Node：发布与支持状态](https://nodejs.org/en/about/previous-releases)
- [Node 22：命令行与 env-file](https://nodejs.org/docs/latest-v22.x/api/cli.html#--env-filefile)
- [Node 24：命令行 API](https://nodejs.org/docs/latest-v24.x/api/cli.html)
- [Node：包与模块格式](https://nodejs.org/api/packages.html)
- [npm：ci](https://docs.npmjs.com/cli/v11/commands/npm-ci)
- [nvm：官方项目说明](https://github.com/nvm-sh/nvm)
