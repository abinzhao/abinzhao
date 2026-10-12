---
title: Node.js 工具开发：参数解析、退出码、测试与本地打包
description: 编写完整文件统计 CLI，建立标准输出协议、失败退出码、内置测试和可审查的 npm 包。
type: tutorial
topic: nodejs
section: platform
order: 30
level: advanced
status: published
tags:
  - Node.js
  - CLI
  - 测试
  - npm
prerequisites:
  - /tutorials/nodejs/runtime.html
comments: true
---

# Node.js 工具开发：参数解析、退出码、测试与本地打包

一个命令行工具不仅要在正常输入下打印结果，还要让调用者明确知道如何传参、结果能否被机器解析、错误从哪里读取，以及失败后是否还能继续流水线。本篇实现文件字节数与行数统计工具，将参数、核心逻辑、可执行入口与测试分开，最后打成本地 npm 包，不执行发布。

示例面向 Node 22 和 24 的受支持版本，只依赖稳定内置模块。行数定义为以 LF 分隔的文本记录数：末尾没有 LF 的非空片段也算一行，空文件为零行，CRLF 的 LF 仍只计一次。工具统计的是字节，不是中文字符数；单独的 CR 不作为换行。明确这样的协议，比“统计文本”四个字更容易形成可靠测试。

## 前置环境与完整目录

先完成[文件与流](/tutorials/nodejs/runtime.html)。在新的空目录创建 `package.json`、`bin/linecount.js`、`src/args.js`、`src/stats.js` 和 `test/linecount.test.js`，组成独立的命令行练习项目。

`package.json` 完整内容：

```json
{
  "name": "lesson-linecount",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": "^22.0.0 || ^24.0.0"
  },
  "bin": {
    "lesson-linecount": "./bin/linecount.js"
  },
  "files": [
    "bin",
    "src"
  ],
  "scripts": {
    "test": "node --test",
    "start": "node bin/linecount.js"
  }
}
```

`bin` 为安装后的命令映射入口，`files` 限制发布包中的业务目录，`private` 防止误发布。本地 `npm pack` 仍可用于验证包内容。这里没有第三方依赖，不必为解析几个参数引入庞大 CLI 框架；复杂交互、补全和子命令增多时再评估成熟库。

在该目录运行 `npm install` 生成锁文件。安装脚本具有执行能力，即使是工具练习也要理解来源和权限，不应把未知包的全局安装作为默认步骤。

## 第一步：定义参数与错误协议

创建 `src/args.js`。使用 `node:util` 的结构化参数解析，不自己通过字符串拆分猜测引号、等号和未知选项。允许 `--file`、`--json` 和 `--help`，不接受位置参数。

```js
import { parseArgs } from 'node:util';

export class UsageError extends Error {}

export function parseCli(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        file: { type: 'string', short: 'f' },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    throw new UsageError(error.message);
  }
  if (values.help) return { help: true, json: false };
  if (!values.file?.trim()) {
    throw new UsageError('必须提供 --file 或 -f 指定输入文件');
  }
  return { help: false, file: values.file, json: values.json };
}
```

合法帮助请求退出零；使用错误退出二；运行失败退出一。这些是本工具约定，不是所有 CLI 的强制标准。调用者依赖非零结果判断失败，不能把错误打印后仍返回零。参数校验也不应读写文件，因此解析逻辑可以快速独立测试。

文件名带空格时由 shell 引号保护，解析器接收到的已经是一个参数值。路径若以短横线开头，可以用 `--file=路径` 形式消除歧义。不要把用户路径拼进 shell 命令字符串；本篇直接交给文件 API，不启动 shell，也不需要通过转义来绕开命令注入。

## 第二步：实现流式统计

创建 `src/stats.js`。管道将错误统一传播，统计接收 Buffer，避免 UTF-8 字符跨块时被重复解码。每个块只检查字节，所以块边界不会改变 LF 计数。

```js
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export async function inspectFile(file, signal) {
  if (!(await stat(file)).isFile()) {
    throw new Error('输入必须是普通文件');
  }
  let bytes = 0;
  let newlineCount = 0;
  let lastByte = null;

  const counter = new Writable({
    write(chunk, _encoding, callback) {
      bytes += chunk.length;
      for (const byte of chunk) {
        if (byte === 10) newlineCount += 1;
      }
      lastByte = chunk[chunk.length - 1] ?? lastByte;
      callback();
    },
  });

  await pipeline(createReadStream(file), counter, { signal });
  const lines = newlineCount + (bytes > 0 && lastByte !== 10 ? 1 : 0);
  return { bytes, lines };
}
```

先检查普通文件，再读取；两次操作之间文件仍可能变化或消失，因此读取阶段必须保留异常传播，不能认为一次 `stat` 就锁定了资源。同步逐字节计数只处理当前块，没有整文件缓存，但非常大的块或额外复杂处理仍会占用主线程；流解决内存与背压，不自动让 CPU 计算并行。

函数接收可选信号，便于未来由调用层决定取消，不在核心逻辑里自行注册进程信号。核心模块也不打印日志，否则 JSON 模式会被调试文字污染。输入输出协议属于入口，统计规则属于核心，这个划分降低测试与复用成本。

## 第三步：完成可执行入口

创建 `bin/linecount.js`，第一行 shebang 必须是文件第一行：

```js
#!/usr/bin/env node
import { parseCli, UsageError } from '../src/args.js';
import { inspectFile } from '../src/stats.js';

const usage = '用法：lesson-linecount --file 路径 [--json]';

try {
  const options = parseCli(process.argv.slice(2));
  if (options.help) {
    console.log(usage);
  } else {
    const result = await inspectFile(options.file);
    if (options.json) {
      console.log(JSON.stringify(result));
    } else {
      console.log(`字节：${result.bytes}\n行数：${result.lines}`);
    }
  }
} catch (error) {
  const isUsageError = error instanceof UsageError;
  const code = error && typeof error === 'object' ? error.code : undefined;
  console.error(isUsageError
    ? `${error.message}\n${usage}`
    : `统计失败${code ? `（${code}）` : ''}`);
  process.exitCode = isUsageError ? 2 : 1;
}
```

标准输出只承载成功结果或帮助文字；标准错误承载失败说明。JSON 模式只打印一个 JSON 值，不先输出“开始统计”，便于下一段程序解析。运行失败只给出简洁错误类别，避免把敏感文件内容或不必要环境信息写进日志。

使用 `process.exitCode` 让进程在已安排的输出完成后自然退出，而不是立即 `process.exit` 造成缓冲输出被截断。长期任务还需要明确的 SIGINT 处理与资源取消，本篇核心已经支持信号，可将前章的控制器模型接入；不应该捕获中断后继续假装成功。

在 macOS 或 Linux 的学习目录设置可执行位，再检查帮助与参数：

```bash
chmod +x bin/linecount.js
node bin/linecount.js --help
node bin/linecount.js --unknown
```

第二条预期显示用法并退出零，第三条预期在标准错误显示参数问题并退出二。直接运行 `node` 不依赖可执行位，而安装后的命令映射需要正确入口与 shebang。

## 第四步：写可运行的内置测试

创建 `test/linecount.test.js`。测试临时目录完全由当前用例创建，结束时清理它，不扫描或删除项目之外的已有目录。

```js
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parseCli, UsageError } from '../src/args.js';
import { inspectFile } from '../src/stats.js';

const entry = fileURLToPath(new URL('../bin/linecount.js', import.meta.url));

test('参数协议拒绝未知选项并允许帮助', () => {
  assert.throws(() => parseCli(['--unknown']), UsageError);
  assert.throws(() => parseCli([]), UsageError);
  assert.equal(parseCli(['--help']).help, true);
  assert.equal(parseCli(['-f', 'a.txt', '--json']).json, true);
});

test('统计空文件、末尾换行和 UTF-8 字节', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lesson-linecount-'));
  try {
    const file = join(directory, 'sample.txt');
    for (const [content, lines] of [
      ['', 0], ['a\n', 1], ['a\nb', 2], ['中文\r\n第二行', 2],
    ]) {
      await writeFile(file, content);
      assert.deepEqual(await inspectFile(file), {
        bytes: Buffer.byteLength(content),
        lines,
      });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('命令入口输出 JSON 并给出失败退出码', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lesson-linecount-cli-'));
  try {
    const file = join(directory, 'sample.txt');
    await writeFile(file, 'a\nb');
    const success = spawnSync(process.execPath, [entry, '-f', file, '--json'], {
      encoding: 'utf8',
    });
    assert.equal(success.status, 0);
    assert.equal(success.stderr, '');
    assert.deepEqual(JSON.parse(success.stdout), { bytes: 3, lines: 2 });
    const invalid = spawnSync(process.execPath, [entry], { encoding: 'utf8' });
    assert.equal(invalid.status, 2);
    assert.equal(invalid.stdout, '');
    const missing = spawnSync(process.execPath, [
      entry, '-f', join(directory, 'missing.txt'),
    ], { encoding: 'utf8' });
    assert.equal(missing.status, 1);
    assert.equal(missing.stdout, '');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
```

执行 `npm test`，预期三个测试全部通过。这里既测试纯参数规则，也测试流式逻辑，还通过子进程验证真实入口的输出与退出码；只测试内部函数不能证明 CLI 契约正确。使用 `process.execPath` 启动测试进程，避免 PATH 恰好解析到另一版本 Node。

## 命令行协议如何被其他程序使用

命令行也是接口，调用方可能是人，也可能是自动化脚本。人类模式可以有标签和说明，机器模式则应稳定且简洁。新增 JSON 字段通常比改变已有字段含义更兼容，但也应记录协议版本策略；将 `bytes` 突然改成中文字符串，会让原来进行数值计算的消费者失败，即使终端看起来更友好。

标准错误与标准输出可以分别重定向。成功 JSON 应只出现在标准输出，警告和诊断不能混入；失败时标准输出保持为空，调用者先检查退出码，再解析成功结果。错误提示不应因为使用 JSON 模式就自动消失，因为失败协议仍需要让操作者知道问题类别。

非零退出码也需要保持可解释。参数错误代表调用方式不正确，文件缺失代表运行资源失败，两者可以触发不同处理。测试应覆盖退出码和输出通道，不只检查某段文字包含“失败”。如果未来处理多文件，要定义部分成功是否整体失败，以及结果是否按输入顺序返回，不能由循环中碰巧出现的异常决定。

运行输入应当被视为不可信数据，而不是执行指令。用户提供的文件名直接传入文件 API，不交给 shell 拼接，也不使用动态代码求值。工具如果以后需要调用外部程序，优先使用程序路径与参数数组，并明确工作目录、超时和输出上限。一个文件统计工具没有理由获取网络凭据或执行用户文件中的脚本。

本例统计字节与 LF 记录，不验证文件一定是有效 UTF-8。因此二进制文件也可能得到字节和行数结果，这符合当前算法但可能不符合未来“文本分析”的业务期待。若需要拒绝二进制，应另行定义编码识别和失败规则，再增加测试；不能只根据文件扩展名推断内容可信。

## 测试隔离与边界用例设计

测试使用临时目录而不是仓库中的固定样本路径，减少并行执行时互相覆盖。清理只删除本用例创建的目录，目录创建失败时不应继续清理未知位置。需要测试权限错误时，先确认操作系统和执行身份的差异；管理员身份下的读权限测试可能无法模拟普通用户行为，不要把这种差异归因于统计逻辑。

子进程测试也要考虑环境。通过当前 Node 路径启动可以保证版本一致，但进程仍继承部分环境与当前目录。本篇入口使用模块相对导入，因此不依赖工作目录找到核心模块；用户文件路径则按当前目录解析。测试时可额外改变工作目录，验证这两种路径责任没有混淆。

取消和超大文件测试应采用确定条件。小文件可能在用户按下中断前已经完成，所以不能把一次手动中断成功当作完整证明。可传入已取消信号验证拒绝契约，或用受控慢源验证中途清理。生产性能测试再使用真实规模，记录机器和输入，避免把单元测试变成随机负载实验。

包级验收与源码测试同样重要。源码导入成功可能依赖未打包的文件，安装后却找不到模块；入口在源码目录直接运行成功，也可能掩盖错误的 `bin` 映射。打包清单和临时消费者验收能覆盖这些风险，是发布前必要的一层，而不是重复执行同一套函数测试。

## 本地打包、核对与排错

先执行以下命令，只在独立学习项目生成本地产物，不发布远端包：

```bash
npm test
npm pack --dry-run
npm pack
```

预期 dry-run 清单包括入口、核心模块和包元信息，不包含临时样本、真实环境文件或测试目录。实际打包生成 `lesson-linecount-1.0.0.tgz`。`files` 是包清单边界，不是安全保证，npm 还会自动包含某些元信息文件；必须检查实际清单，不能假定隐藏文件永远不会进入产物。

再在另一个空目录创建临时消费者，初始化后安装该本地 tarball，执行 `npx --no-install lesson-linecount --help`。验收真正安装后的命令映射、文件路径和模块加载，而不是只证明源码目录能运行。示例中的 tarball 路径要按实际学习目录填写；不需要 `npm publish` 或全局安装。

遇到 `EACCES` 先检查入口可执行位与安装位置；`MODULE_NOT_FOUND` 检查包是否遗漏核心文件以及 ESM 扩展名；JSON 无法解析先检查标准输出是否混入日志。退出零但结果为空则检查入口是否把异常吞掉。

## 练习与官方来源

练习一：增加 `--max-bytes`，使用字符串解析并验证正整数，超过上限时返回运行失败，测试零值、非法值和边界值。练习二：接入 SIGINT 取消，清理监听并采用明确中断退出码。练习三：增加目录输入的失败测试，确认不会错误地把目录当成空文件。

每次扩展都先更新协议与边界用例，再改变实现。测试不是对当前代码截图，而是对调用者可观察行为的承诺。

- [Node：parseArgs](https://nodejs.org/docs/latest-v24.x/api/util.html#utilparseargsconfig)
- [Node：测试运行器](https://nodejs.org/docs/latest-v24.x/api/test.html)
- [Node：进程与退出码](https://nodejs.org/docs/latest-v24.x/api/process.html)
- [Node：流 API](https://nodejs.org/docs/latest-v24.x/api/stream.html)
- [npm：package.json 与 bin](https://docs.npmjs.com/cli/v11/configuring-npm/package-json)
- [npm：pack](https://docs.npmjs.com/cli/v11/commands/npm-pack)
