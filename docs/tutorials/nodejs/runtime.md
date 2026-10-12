---
title: Node.js 运行时实践：事件循环、文件流与可取消管道
description: 通过完整文件压缩程序理解异步调度、文件路径、背压、流错误和 AbortSignal。
type: tutorial
topic: nodejs
section: platform
order: 20
level: intermediate
status: published
tags:
  - Node.js
  - 事件循环
  - Stream
  - 文件系统
prerequisites:
  - /tutorials/nodejs/environment.html
comments: true
---

# Node.js 运行时实践：事件循环、文件流与可取消管道

Node 可以同时等待很多 I/O，但这不代表任意 JavaScript 工作都会自动并行。一个很长的同步循环仍会阻塞请求处理，一个把大文件一次性读入内存的程序仍会耗尽内存。本篇通过两个独立实验，建立事件循环和文件处理模型，再实现具有背压、错误处理和取消入口的压缩管道。

示例面向 Node 22 与 Node 24 的受支持版本，全部使用稳定的内置 API，无需第三方依赖。先完成[环境搭建](/tutorials/nodejs/environment.html)，了解 `.mjs`、当前工作目录和退出码。所有文件在新的学习目录创建，避免覆盖真实数据；输出采用排他创建，不允许静默覆盖现有文件。

## 事件循环不是万能并行器

一个 Node 进程通常在主线程执行 JavaScript，异步文件操作、网络等待和部分底层工作通过操作系统与 libuv 配合推进。事件循环把已经就绪的回调安排给主线程执行。Promise 回调也要等当前同步执行结束，不会把耗时计算自动搬到另一个 CPU 核心。

把同步工作包进 `async` 函数，不会让它消失；它在首次真正让出执行权之前仍然占用当前线程。`await Promise.resolve()` 通常只进入微任务调度，也不能保证给所有 I/O 足够执行机会。大规模 CPU 任务需要评估工作线程、分块或独立服务，不能仅通过多写几个 `await` 修复。

Node 有定时器、I/O 轮询和检查等调度阶段，但不要为顶层 `setTimeout(..., 0)` 与 `setImmediate` 写死统一顺序。定时器参数表示最早等待条件，不是精确执行时间；系统负载与调用上下文会影响观察。ESM 顶层执行和 CommonJS 的微任务上下文也有差异，不能直接套用没有注明模块格式的顺序图。

## 第一步：观察可解释的调度

在学习目录创建 `loop.mjs`。这个实验只观察相对边界，不依赖一个脆弱的全局输出顺序。

```js
import { readFile } from 'node:fs';

console.log('同步开始');
Promise.resolve().then(() => console.log('Promise 回调'));
queueMicrotask(() => console.log('微任务回调'));
setTimeout(() => console.log('顶层定时器'), 0);
setImmediate(() => console.log('顶层 immediate'));

readFile(new URL('./loop.mjs', import.meta.url), error => {
  if (error) {
    console.error(error.code);
    process.exitCode = 1;
    return;
  }
  console.log('文件读取回调');
  setTimeout(() => console.log('I/O 内定时器'), 0);
  setImmediate(() => console.log('I/O 内 immediate'));
});

const start = performance.now();
while (performance.now() - start < 80) {
  // 故意阻塞主线程，用于观察异步回调不能打断同步工作。
}
console.log('同步结束');
```

运行：

```bash
node loop.mjs
```

预期“同步开始”和“同步结束”先输出，其他回调不会插入同步循环中。顶层定时器与 immediate 的先后不作为统一断言；在这个文件 I/O 回调里安排的 immediate 通常先于其中的零延迟定时器。重点是记录调用上下文，理解就绪回调仍受同步阻塞影响。

这里八十毫秒忙循环仅用于教学，不应复制到服务端主路径。递归 `process.nextTick` 或持续制造微任务同样可能饿死 I/O，所谓“优先级高”不是可以无限调度的理由。性能排查应测量实际延迟与 CPU 时间，而不是根据日志里回调出现次数判断吞吐。

## 文件读取的路径与资源模型

`readFile` 将整个文件读入内存，适合小配置或明确限制大小的数据。读取很大日志时，应使用流逐块处理。相对路径基于 `process.cwd()`，启动目录一变路径就变；`new URL('./file.txt', import.meta.url)` 则基于当前模块位置。二者分别适合用户输入文件与程序自带资源，不应混为一谈。

异步 API 不保证所有操作都可以随时彻底撤销。例如文件读取的取消可能终止 Node 内部处理，而底层某些已发出的系统调用仍可能继续完成。取消是请求停止并进行资源收尾，不能被当成“从未产生副作用”。写出文件时还应考虑已经生成的部分产物。

流将数据分成块。块的边界不一定等于行边界，也不一定等于一个 UTF-8 字符边界，因此逐块 `toString` 后简单拼接处理可能损坏文本。文本逐行操作可以使用合适的解码器或 `readline`；本篇压缩处理原始字节，不需要解释字符，所以直接把 Buffer 传给压缩流。

## 第二步：生成独立样本

创建 `make-fixture.mjs`。它在模块所在目录创建专属样本，只允许创建新文件，避免覆盖已有内容。每次写入都等待完成，因此不会无上限地排队大量内存缓冲。

```js
import { open } from 'node:fs/promises';

const path = new URL('./runtime-sample.txt', import.meta.url);
const file = await open(path, 'wx');
try {
  for (let index = 0; index < 10000; index += 1) {
    await file.writeFile(`记录 ${index}：学习 Node 文件与流。\n`, 'utf8');
  }
} finally {
  await file.close();
}
console.log('样本已创建：runtime-sample.txt');
```

执行 `node make-fixture.mjs`。再次执行出现 `EEXIST` 是预期保护，不是需要绕过的错误。要重新实验，可在新的空目录创建同样文件；不要把排他模式改成覆盖模式来处理未知文件。

## 第三步：建立背压与取消管道

创建 `compress.mjs`。输入由用户参数提供，因此相对于当前工作目录解析；输出文件只有在本次成功取得文件句柄后才被认定为本次拥有的产物。

```js
import { createReadStream } from 'node:fs';
import { open, stat, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

const [sourceArg, outputArg, cancelArg] = process.argv.slice(2);

async function main() {
  if (!sourceArg || !outputArg) {
    throw new Error('用法：node compress.mjs 输入文件 输出文件 [cancel]');
  }
  if (cancelArg && cancelArg !== 'cancel') {
    throw new Error('第三个参数只能是 cancel');
  }
  const source = resolve(sourceArg);
  const output = resolve(outputArg);
  if (source === output) throw new Error('输入与输出不能相同');
  if (!(await stat(source)).isFile()) throw new Error('输入必须是普通文件');

  const controller = new AbortController();
  const onInterrupt = () => controller.abort();
  process.once('SIGINT', onInterrupt);
  let outputFile;
  let completed = false;

  try {
    outputFile = await open(output, 'wx');
    if (cancelArg === 'cancel') controller.abort();
    await pipeline(
      createReadStream(source),
      createGzip(),
      outputFile.createWriteStream(),
      { signal: controller.signal },
    );
    completed = true;
    console.log(`压缩完成：${output}`);
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    if (outputFile) {
      try {
        await outputFile.close();
      } finally {
        if (!completed) await unlink(output);
      }
    }
  }
}

try {
  await main();
} catch (error) {
  const aborted = error instanceof Error && error.name === 'AbortError';
  console.error(aborted ? '压缩已取消，未完成输出已清理。' : error.message);
  process.exitCode = aborted ? 130 : 1;
}
```

`pipeline` 将读取、压缩和写入连接起来，等待整个链路完成，并传播各阶段错误与背压。写流保留默认的 `autoClose: true`，完成或失败后由流关闭句柄；外层 `close()` 用于兜底未进入管道的分支。不要关闭自动收尾却同时等待仍被流持有的句柄关闭，否则可能产生悬而未决的等待。当下游写得慢，上游会暂停继续推送，避免把整个文件积压在应用内存中。`highWaterMark` 是缓冲阈值，不是一个绝对的内存总上限，也不是增大之后必然加速的参数。

如果手动调用可写流的 `write`，返回 false 时应暂停生产，等待 `drain` 后再继续；不能只在 `data` 回调里无条件写入。单独调用 `pipe` 也不自动提供和 promise `pipeline` 完全相同的错误收尾契约。本例优先使用标准管道，避免给每条流重复设计错误传播。

输出以 `wx` 打开，若已有同名文件，打开失败后 `outputFile` 仍未赋值，因此不会误删旧文件。若本次创建成功但管道失败，则关闭句柄并删除本次未完成输出。这样的所有权判断比仅检查“路径是否存在”更重要，否则失败清理可能损伤别人的产物。

## 验证与预期结果

先生成样本，然后执行正常和确定取消场景：

```bash
node make-fixture.mjs
node compress.mjs runtime-sample.txt runtime-sample.txt.gz
node compress.mjs runtime-sample.txt cancelled.txt.gz cancel
```

第一条只应执行一次；正常压缩退出码应为零；取消场景预期非零，且不保留 `cancelled.txt.gz`。同名输出再次压缩应得到 `EEXIST`，原 gzip 不应被覆盖或删除。不存在的输入应失败，不能留下空输出。

创建 `verify.mjs` 检查解压内容与原始内容一致，仅用于本篇小样本：

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';

const unzip = promisify(gunzip);
const source = await readFile(new URL('./runtime-sample.txt', import.meta.url));
const archive = await readFile(new URL('./runtime-sample.txt.gz', import.meta.url));
assert.deepEqual(await unzip(archive), source);
console.log('内容一致');
```

执行 `node verify.mjs`，预期输出“内容一致”。此验证会整文件读入内存，只适用于小样本，大文件应通过流与哈希比对。检查实际文件、退出码和取消结果，不能只依据“压缩完成”的日志判断。

## 从实验扩大到长期运行程序

内存有界不代表资源数量有界。即使每个文件使用流，同时开启几千个管道仍可能耗尽文件描述符或压缩资源。批量处理时要设置明确并发上限，并统计等待与执行中的任务；不要把整个目录直接交给没有限制的 Promise 集合。并发量应根据实际资源和测量调整，而不是越大越好。

管道成功表示当前写入流程完成，不等于机器断电后一定持久保存。对有严格持久性要求的业务，需要另外理解文件同步、文件系统与存储的保证。本文只是本地压缩练习，不提供事务或持久化承诺。临时文件加成功后重命名可以改善可见性，但跨文件系统和覆盖目标的行为仍需要明确。

取消过程中最重要的是保持资源所有权。输入文件不是本次创建的，所以不能在错误处理里删除；输出只有排他打开成功后才是本次拥有的未完成产物。目标文件已存在时应直接失败，不能在清理时删除它来“恢复环境”。同样原则适用于临时目录、下载文件和生成报告，不只适用于压缩。

信号处理也需要生命周期。若在模块导入时全局注册监听，每次重复调用可能不断积累处理器。本文在一次操作开始时注册、结束时移除；封装成库后，应让调用者传入信号，不在库内部决定整个进程的退出策略。核心逻辑与进程入口分开，测试才不会因为一次取消影响其他用例。

错误排查可以按阶段记录无敏感上下文：输入检查失败、输出创建失败、读取失败、转换失败和写入失败。不要只打印一个“操作失败”而丢失阶段，也不要把文件内容或秘密路径无差别输出。诊断信息应帮助定位责任，但不应扩大数据暴露范围。

测量性能时至少区分冷缓存与热缓存、输入大小、压缩级别和并发量。小样本上的一次耗时通常主要由启动和文件系统缓存影响，不能据此决定生产参数。先确保内容正确、资源释放和取消行为，再优化时间；一个快但会覆盖已有文件的工具并不满足完成标准。

## 排错、练习与官方来源

内存快速增长时，检查是否先 `readFile` 大文件，或手动写流时忽略背压。程序一直不退出，检查未关闭文件句柄、未清除的定时器和事件监听。取消后出现部分输出，检查输出所有权和失败清理；清理失败也属于真实错误，不能一概忽略。

文件路径错误时先输出无敏感的当前工作目录与解析路径，区分模块资源和用户文件。事件循环输出顺序不同，先核对模块格式和调用位置，不靠增加随机延时“修复”示例。真实服务中的超时还要区分读取、连接、总耗时等阶段，不能只设置一个计时器然后假定所有资源都会自动停止。

练习一：增加 `Transform` 统计通过的字节数，确保统计不改变内容。练习二：把压缩结果写到独立临时文件，成功后再发布最终产物，并说明目标存在时的策略。练习三：比较小文件 `readFile` 与流处理，记录时间和内存，避免仅凭一次运行得出普遍性能结论。

下一篇实现[命令行工具与打包](/tutorials/nodejs/tools.html)。

- [Node：事件循环说明](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick)
- [Node：不要阻塞事件循环](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop)
- [Node：文件系统 API](https://nodejs.org/docs/latest-v24.x/api/fs.html)
- [Node：流与 pipeline](https://nodejs.org/docs/latest-v24.x/api/stream.html)
- [Node：流中的背压](https://nodejs.org/en/learn/modules/backpressuring-in-streams)
