---
title: Node 运行时、事件循环与文件流
description: 用 Node 22.13+ 的 ESM 和内置模块理解异步执行、背压与错误传播。
---

# Node 运行时、事件循环与文件流

## 学习目标与准备

本章面向会写函数和 Promise、尚未写过服务端程序的读者。
完成后应能解释“异步不等于并行”，并用有界内存复制文件。
统一使用 Node **22.13+**；生产应选择受支持版本的最新安全补丁。
`.mjs` 明确表示 ESM，不依赖上层 `package.json` 的模块设置。

```sh
node --version
mkdir node-runtime-lab
cd node-runtime-lab
```

输出必须为 `v22.13.0` 或更新版本。下面两个文件放在同一目录。
本章只使用内置模块，无需 `npm install`。

## 机制：JavaScript 与 I/O 各做什么

Node 不是浏览器：没有 `document`，但能操作进程、网络和文件。
V8 执行 JavaScript，libuv 协调事件循环、操作系统 I/O 与线程池。
一个线程执行当前 JavaScript 回调，不意味着所有 I/O 都只用一个线程。
文件系统操作通常借助线程池；网络 I/O 通常依赖操作系统事件通知。
`await` 暂停当前异步函数，不会把循环中的 CPU 运算移到其他线程。
因此异步函数里长时间计算仍会推迟其他请求，重计算应考虑 Worker。

事件循环有 timers、poll、check 等阶段；`setImmediate` 在 check 阶段运行。
微任务会在相关执行边界被清空，不是“每个阶段只执行一个 Promise”。
`process.nextTick` 有独立队列，滥用它或递归微任务会饿死 I/O。
Node 20 起 libuv 对 timers 的安排有变化，不要靠老文章背诵全局顺序。
顶层 `setTimeout(0)` 与 `setImmediate` 的相对先后不能作为业务契约。
ESM 顶层本身处于模块异步求值中，与 CommonJS 的 nextTick 演示可能不同。
下面只断言稳定局部顺序，不断言所有任务的完整排列。

## 操作：观察局部顺序和复制文件

`import` 的相对路径写完整扩展名；内置模块用 `node:` 前缀。
相对文件 URL 基于脚本位置，不受从哪个目录启动影响。
复制目标使用 `wx`：已有文件时失败，避免无意覆盖。

::: code-group
```js{13-16} [runtime.mjs]
import { writeFile, readFile } from 'node:fs/promises';
import { copyFileStream } from './copy.mjs';

const source = new URL('./source.txt', import.meta.url);
const target = new URL('./copy.txt', import.meta.url);
console.log('A: sync');
queueMicrotask(() => console.log('C: microtask'));
setTimeout(() => console.log('timer: ordering not asserted'), 0);
setImmediate(() => console.log('immediate: ordering not asserted'));
console.log('B: sync');

try {
  await writeFile(source, 'Node streams\n', { flag: 'wx' });
  const bytes = await copyFileStream(source, target);
  const content = await readFile(target, 'utf8');
  console.log({ bytes, content });
} catch (error) {
  console.error('operation failed:', error.code ?? error.message);
  process.exitCode = 1;
}
```

```js [copy.mjs]
import { createReadStream, createWriteStream } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export async function copyFileStream(source, target) {
  let bytes = 0;
  const counter = new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      callback(null, chunk);
    },
  });
  await pipeline(
    createReadStream(source),
    counter,
    createWriteStream(target, { flags: 'wx' }),
  );
  return bytes;
}
```
:::

```sh
node runtime.mjs
node --check runtime.mjs
node --input-type=module -e "import { copyFileStream } from './copy.mjs'; try { await copyFileStream('missing.txt', 'failed-copy.txt'); } catch (e) { console.log(e.code); }"
```

首次运行先看到 `A: sync`、`B: sync`，之后才有 `C: microtask`。
成功结果包含 `bytes: 13` 与 `content: 'Node streams\n'`。
最后一条命令打印 `ENOENT`，说明输入流错误变成被捕获的 Promise 拒绝。
`node --check` 只检查语法，不能证明路径、权限或 I/O 成功。
重复运行 `runtime.mjs` 会打印 `EEXIST` 并返回非零退出状态，这是保护行为。

## 深入：背压与错误边界

`readFile` 适合小配置，但会把整个文件读入内存。
流逐块消费；`highWaterMark` 是缓冲阈值，不是整个进程内存的硬上限。
写入端处理较慢时，背压让读取端暂缓生产，避免无界排队。
裸 `readable.pipe(writable)` 不等于完整错误管理。
`pipeline` 负责连接背压，传播错误，并销毁链路中的流。
一个异步函数只有等待 `pipeline`，才知道复制是否真正完成。

失败可能留下部分目标文件，本例不承诺原子复制，也不自动删除未知文件。
可靠替换应写唯一临时文件、确认完成后 rename，并规划失败清理。
读写成功也不等于掉电后一定落盘；需要更强持久性时考虑 fsync 与存储语义。
错误处理应放在拥有恢复决策的边界，而不是每层都记录同一个错误。
`process.exitCode = 1` 允许日志和待完成工作自然结束。
直接 `process.exit(1)` 可能截断尚未刷出的输出。

## 常见错误

| 现象 | 原因与处理 |
| --- | --- |
| `require is not defined` | `.mjs` 是 ESM，改用 import，不混用示例格式 |
| `ERR_MODULE_NOT_FOUND` | 检查 `./copy.mjs`、扩展名与相对位置 |
| `EACCES` | 路径权限问题，不要用提升权限掩盖目录设计错误 |
| `EEXIST` | 示例拒绝覆盖，换一个全新实验目录 |
| 服务卡顿但有 await | CPU 运算仍在主线程；先测耗时再决定 Worker |
| 未处理的拒绝 | 调用者没有 await 或 catch，别通过空 catch 吞掉 |

## 标准练习

1. 将源内容改为 `你好\n`，在新目录运行。
   验收：UTF-8 字节数是 7，不是 JavaScript 字符串长度 3。
2. 把输入改成不存在的文件，保留 catch。
   验收：得到 `ENOENT`，程序没有假装复制成功。
3. 在计数 Transform 中遇到某个字节后用 callback 传入 Error。
   验收：`pipeline` 拒绝，成功结果不打印；记录可能存在的部分输出。
4. 用逐次增加的输入文件比较流复制与 readFile 的内存。
   验收：报告文件大小、峰值内存和测量方法，不把单次采样当峰值。

## 官方来源与下一步

- [Node ESM](https://nodejs.org/download/release/v22.13.0/docs/api/esm.html)
- [Node 事件循环](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick)
- [Stream 与 pipeline](https://nodejs.org/download/release/v22.13.0/docs/api/stream.html)
- [文件系统 API](https://nodejs.org/download/release/v22.13.0/docs/api/fs.html)

下一章：[HTTP 与 REST](../http/rest)。
