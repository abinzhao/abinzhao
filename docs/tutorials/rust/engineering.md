---
title: Rust 工程交付：受限并发、性能测量与发布验证
description: 用作用域线程实现确定性并行统计，理解 Send、Sync、错误传播和发布预算。
type: tutorial
topic: rust
section: intelligence
order: 30
level: advanced
status: published
tags: [Rust, 并发, 性能, 发布]
prerequisites: [/tutorials/rust/cli.html]
comments: true
---

# Rust 工程交付：受限并发、性能测量与发布验证

Rust 能在类型层面阻止很多数据竞争，但不能自动保证程序更快、没有死锁或适合上线。工程交付需要把正确性、资源预算、性能测量和产物验证分开。本篇实现一个使用作用域线程的并行字符统计器，先保证与串行结果一致，再讨论何时值得并发以及发布前必须检查什么。

## 前置条件与完成目标

先完成[CLI 教程](/tutorials/rust/cli.html)，准备支持 `std::thread::scope` 的稳定版 Rust。运行 `rustc --version` 并核对本地文档；不使用 nightly，不新增并行库。在独立目录创建 `engineering_lab`，显式使用 2021 edition，示例只处理固定合成字符串，不读取真实业务数据。

```bash
cargo new engineering_lab --edition 2021
cd engineering_lab
```

目标是实现有工作线程上限、输入预算、确定性合并顺序和显式错误的并行处理。你应能验证任意允许的工作线程数得到相同结果，非法预算被拒绝，线程失败不会被忽略。性能部分只提供测量方法，不给出未经运行的加速比例；固定教学输入也不代表真实工作负载。

## 核心原理：Send、Sync 与所有权跨线程

`Send` 表示值可以安全地在线程间转移，`Sync` 表示共享引用可以安全地跨线程使用。它们描述类型能力，不是“有这个标记就运行很快”。例如 `Rc` 的引用计数不是线程安全的，不能直接跨线程；`Arc` 提供原子引用计数，但只保证共享所有权，不自动让内部可变数据安全。

共享可变状态通常需要 `Mutex` 等同步设施，锁粒度、获取顺序和持有时间仍由程序设计。多个锁以不同顺序获取会死锁，类型检查不会替你证明锁顺序。对于能拆分成互不影响的任务，优先让每个工作线程拥有自己的输出，最后由父线程合并，通常比共享一个大锁更容易验证。

普通 `thread::spawn` 往往要求闭包拥有足够长寿命的数据。作用域线程允许借用当前作用域里的输入，父作用域在离开前等待线程结束，因此借用不会逃逸。本例把字符串切片按批次借给线程，每个线程只读，返回拥有的计数向量，不共享可变结果。

并发预算要限制线程数和输入总量。为每行输入启动一个线程会把调度、栈空间和系统资源消耗放大。可用并行度只是参考，容器 CPU 配额、其他服务负载和任务性质都可能改变最优值。I/O 密集任务与 CPU 密集任务的调度策略也不同，不能用一个线程数覆盖所有情况。

## 实操：完整的受限并行实现

将下面代码放入 `src/main.rs`。输入预算按 UTF-8 字节计算，每次最多八个线程；返回值按原输入顺序合并，避免结果顺序依赖调度。字符数量统计的含义与前篇一致，是 Unicode 标量值，不是字形数量。

```rust
use std::fmt;
use std::thread;
use std::time::Instant;

#[derive(Debug, PartialEq, Eq)]
enum BatchError {
    InvalidWorkers,
    InputTooLarge,
    WorkerUnavailable,
    WorkerPanicked,
}

impl fmt::Display for BatchError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let text = match self {
            Self::InvalidWorkers => "workers must be in 1..=8",
            Self::InputTooLarge => "batch exceeds 4 MiB",
            Self::WorkerUnavailable => "cannot start worker thread",
            Self::WorkerPanicked => "worker thread panicked",
        };
        write!(f, "{text}")
    }
}

fn parallel_counts(lines: &[String], workers: usize) -> Result<Vec<usize>, BatchError> {
    if !(1..=8).contains(&workers) {
        return Err(BatchError::InvalidWorkers);
    }
    let total = lines.iter().try_fold(0_usize, |sum, line| sum.checked_add(line.len()));
    if total.is_none_or(|bytes| bytes > 4 * 1024 * 1024) {
        return Err(BatchError::InputTooLarge);
    }
    if lines.is_empty() {
        return Ok(Vec::new());
    }
    let count = workers.min(lines.len());
    let chunk_size = lines.len().div_ceil(count);
    thread::scope(|scope| {
        let mut handles = Vec::new();
        let mut failure = None;
        for (index, chunk) in lines.chunks(chunk_size).enumerate() {
            match thread::Builder::new()
                .name(format!("counter-{index}"))
                .spawn_scoped(scope, move || {
                    chunk.iter().map(|line| line.chars().count()).collect::<Vec<_>>()
                }) {
                Ok(handle) => handles.push(handle),
                Err(_) => {
                    failure = Some(BatchError::WorkerUnavailable);
                    break;
                }
            }
        }
        let mut result = Vec::with_capacity(lines.len());
        for handle in handles {
            match handle.join() {
                Ok(part) => result.extend(part),
                Err(_) => failure = Some(BatchError::WorkerPanicked),
            }
        }
        match failure {
            Some(error) => Err(error),
            None => Ok(result),
        }
    })
}

fn main() -> Result<(), String> {
    let lines = vec!["学习并发".repeat(64); 4096];
    let workers = thread::available_parallelism()
        .map(|value| value.get().min(8))
        .unwrap_or(1);
    let start = Instant::now();
    let parallel = parallel_counts(&lines, workers).map_err(|error| error.to_string())?;
    let elapsed = start.elapsed();
    let serial: Vec<_> = lines.iter().map(|line| line.chars().count()).collect();
    if parallel != serial {
        return Err("parallel and serial results differ".to_owned());
    }
    println!("items={} workers={} elapsed={elapsed:?}", parallel.len(), workers);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parallel_result_matches_serial_in_input_order() {
        let lines: Vec<String> = ["", "a", "中文", "a\nb", "combining: e\u{301}"]
            .iter().map(|value| (*value).to_owned()).collect();
        let expected: Vec<_> = lines.iter().map(|line| line.chars().count()).collect();
        for workers in 1..=8 {
            assert_eq!(parallel_counts(&lines, workers), Ok(expected.clone()));
        }
    }

    #[test]
    fn rejects_invalid_resource_budgets() {
        assert_eq!(parallel_counts(&[], 0), Err(BatchError::InvalidWorkers));
        assert_eq!(parallel_counts(&[], 9), Err(BatchError::InvalidWorkers));
        let lines = vec!["x".repeat(4 * 1024 * 1024 + 1)];
        assert_eq!(parallel_counts(&lines, 1), Err(BatchError::InputTooLarge));
    }

    #[test]
    fn empty_batch_is_valid() {
        assert_eq!(parallel_counts(&[], 1), Ok(Vec::new()));
    }
}
```

`Option::is_none_or` 和整数 `div_ceil` 都是稳定 API，但有各自的稳定版本起点。如果本地工具链缺少前者，可以在实验代码中使用显式 `match total` 表达相同逻辑，或按项目政策升级稳定工具链；不要因此切到 nightly。本篇的工程练习要求你在项目中声明最低支持 Rust 版本，而不只写“稳定版”三个字。

所有已经启动的线程都会被 join，即使后续线程创建失败。若忽略 join 的结果，工作线程 panic 可能被误当作成功。这里不故意引入 panic，不吞掉部分结果；失败时整个批次返回错误。线程调度顺序不影响合并顺序，因为父线程按输入分块顺序等待句柄并拼接。

## 预期检查与正确性回归

执行下面命令，测试应覆盖工作线程数变化、空输入和预算拒绝。运行程序时会输出当前机器实际耗时，不要求某个固定数字，也不能将其当作可靠基准。格式检查失败时先在实验包格式化，然后复查，不能修改无关仓库文件。

```bash
cargo test
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo run --release
```

优化构建与调试构建的性能不同，所以基准应使用一致的 release 配置。但 release 并不允许改变业务语义，应保留串行结果对照和边界测试。涉及整数运算时要明确检查溢出，不能依赖某个构建配置是否会 panic。

本例的输入规模很小，线程启动开销可能大于计算收益。观察到并行更慢是合理结果，不是要修正的测试错误。正确性测试不应断言“并行必须更快”，否则机器负载和系统调度会造成脆弱测试。性能回归需要独立、可重复的测量环境。

## 性能测量：先定位瓶颈再优化

真正的基准先记录 CPU、内存、系统、编译器版本、编译选项和输入分布。分别测量读取、解析、计算与输出，避免把磁盘缓存效果误认成算法加速。重复运行，记录分布和异常值，说明冷启动与热运行的差异；没有测量就不提供吞吐和延迟数字。

固定合成字符串用于检查线程开销，不代表真实文本。真实业务可能有长短差异、编码变化和不同缓存命中率，均匀按行分块可能导致一个线程处理超长文本，其他线程提前空闲。优化前先收集经过授权且脱敏的代表输入，或者明确标注模拟负载的局限。

如果瓶颈是分配，可以检查是否反复创建字符串、是否需要保存全部中间结果；如果瓶颈是锁竞争，可以减少共享写入或缩小临界区；如果瓶颈是 I/O，增加计算线程可能没有帮助。更复杂的线程池、并行库或异步运行时都有成本，应在基线和测量证明必要后引入。

`black_box` 可以帮助基准避免某些优化消除，但不是完整基准框架，也不能阻止所有平台优化差异。不要为了得到更好数字删除正确性检查、改用更容易输入或忽略失败批次。性能报告应保留原始数据与方法，使其他人可以复核。

## 排错与并发边界

如果线程创建失败，检查资源限制、线程数量和容器政策；不应无限重试创建线程。线程 panic 时缩小输入并查看实际失败点，不要统一返回空结果。作用域线程不提供强制取消正在运行的任意代码，join 会等待完成；需要取消时应让任务合作检查取消标记，或使用可隔离工作进程。

有界输入让本例工作量可控，但不构成实时截止时间保证。操作系统调度、资源竞争和 I/O 都可能延长执行。若任务含锁，不能在持锁期间做无界网络等待；锁中毒也需要按照数据是否仍满足不变量决定恢复策略，而不是普遍 `unwrap` 或普遍忽略。

异步不是线程的更快版本。异步适合大量等待型任务，但 CPU 重活放在事件循环上仍会阻塞其他任务；阻塞工作池也需要上限。Rust 的 Send 和 Sync 能阻止一些不安全跨线程用法，不能替代取消、重试、授权和业务顺序设计。

## 发布与维护：产物必须在目标环境检查

应用应提交自身锁文件以固定依赖解析，使用 `cargo build --release --locked` 检查与锁一致。本文不要求修改你的其他项目依赖或 Git；这些是读者实验项目的交付原则。库项目对锁文件和兼容策略可能不同，应依据项目政策处理。

声明 edition、最低支持 Rust 版本、目标架构和系统依赖。交叉编译成功不能证明目标系统能运行，还要核对动态库、CPU 指令要求、路径权限与输入输出。正式产物以非特权身份运行，提供版本与完整性信息；签名、发布和上传属于需要独立授权的外部写操作。

发布检查先跑最小相关测试，再跑全部测试、格式、Clippy 和目标环境冒烟。对服务还要测试启动失败、关闭信号、资源清理和持久数据恢复。panic 策略、日志泄露和崩溃文件都需要明确，不应从“内存安全语言”推导出无需安全审查。

发布记录应说明实际验证过的平台与输入规模，不把一次开发机运行扩大成全平台保证。发现性能变化时先核对编译参数和工作负载是否一致，再判断代码是否回归。尚未运行的架构、长期稳定性和压力测试明确列为未验证项，使交付结论与证据保持一致。

练习一：给批次增加每项长度预算，并验证一个超长条目被拒绝。练习二：构造长短差异明显的数据，先记录串行与当前分块的真实耗时，再讨论调度改进。练习三：把线程工作提取成可注入函数，测试失败传播，但不要为单次测试建立庞大通用框架。练习四：写一份发布检查表，标明你真正运行的平台和未验证的平台。

## 官方来源

- [Rust Book 无畏并发](https://doc.rust-lang.org/book/ch16-00-concurrency.html)：线程、消息和共享状态。
- [Rust 标准库 thread::scope](https://doc.rust-lang.org/std/thread/fn.scope.html)：作用域借用与等待。
- [Rust 标准库 Send](https://doc.rust-lang.org/std/marker/trait.Send.html)与[Sync](https://doc.rust-lang.org/std/marker/trait.Sync.html)：跨线程类型能力。
- [Cargo 配置与构建 profile](https://doc.rust-lang.org/cargo/reference/profiles.html)：优化、调试和 panic 设置。
- [Cargo rust-version](https://doc.rust-lang.org/cargo/reference/rust-version.html)：最低工具链要求。
