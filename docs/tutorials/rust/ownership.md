---
title: Rust 所有权入门：移动、借用与 Result 错误传播
description: 用稳定版 Rust 编写任务解析器，理解资源归属、借用规则与可恢复错误。
type: tutorial
topic: rust
section: intelligence
order: 10
level: beginner
status: published
tags: [Rust, 所有权, 借用, Result]
prerequisites: []
comments: true
---

# Rust 所有权入门：移动、借用与 Result 错误传播

Rust 的所有权不是要求你手工释放每一块内存，而是让编译器检查资源在什么位置被拥有、谁可以借用、借用持续多久。理解这些问题之后，很多看似奇怪的编译错误会变成可解释的设计反馈。本篇使用稳定版工具链写一个任务记录解析器，把字符串、结构体、借用和 `Result` 放进完整程序，而不是只看互不相干的语法片段。

## 前置条件与实验目标

通过 rust-lang 官方安装入口准备 `rustup`，确认 `rustup show active-toolchain` 显示稳定工具链，并运行 `rustc --version` 与 `cargo --version`。本文不宣称某个小版本是最新版本，示例使用稳定能力，不需要 nightly 或不稳定特性。在独立目录执行以下命令，生成实验包：

```bash
cargo new ownership_lab --edition 2021
cd ownership_lab
```

本篇显式选择 2021 edition 以便教学环境一致；edition 是语言兼容规则，不等于编译器发布日期。完成实验后，你应能解释为什么 `String` 被移动后不能再访问，为什么只读函数适合接收 `&str`，以及为什么解析用户输入应该返回错误而非直接 panic。示例只有内存数据，不访问私人文件，也没有额外依赖。

## 核心原理：所有者、移动与借用

每个普通值在某一时刻有负责释放它的所有者。所有者离开作用域，值会被清理；包含堆分配的 `String` 会释放其缓冲区。把一个 `String` 赋给另一变量，通常发生所有权移动，旧变量不再可用，避免两个位置都释放同一资源。移动并不意味着必然复制整个字符串内容，只是转移管理它的责任。

整数等实现 `Copy` 的类型在赋值时可复制，所以旧变量仍可用。不能由“变量看起来很小”判断是否可复制，应查看类型语义。`String::clone` 会复制拥有的数据，适合确实需要两个独立所有者时使用；为了消除编译错误到处添加 clone，可能掩盖不合理的接口并增加分配成本。

借用允许访问资源而不转移所有权。共享借用 `&T` 适合读取，可以同时存在多个；独占借用 `&mut T` 适合修改，使用期间不能有其他冲突访问。编译器按实际使用范围分析借用，因此一个只读引用最后使用结束后，可能就允许后续修改，不一定要等整个代码块结束。

`&str` 是对一段有效 UTF-8 字符串的视图，`String` 是拥有字符串缓冲区的类型。函数只需要阅读文字时接收 `&str`，既可借用 `String`，也可接收字符串字面量。函数需要返回独立保存的文字时返回 `String`。不能返回指向函数内部局部 `String` 的引用，因为函数结束后对应存储已经被释放。

生命周期标注表达引用之间的关系，不会延长资源寿命，也不是运行时计时器。初学者遇到引用返回困难时，应先判断结果是否应该拥有数据，而不是急着把所有引用标成 `'static`。本例解析后保存任务标题，所以明确创建一个拥有标题的 `String`，不把短期输入借用带到长期结构体中。

## 实操：完整任务解析器

替换实验包中的 `src/main.rs` 为以下代码。输入格式为 `标题|分钟数`，分钟数是正整数。标题按 Unicode 标量值计数，不按字节长度计数；这仍不同于用户感知字形，例如组合字符，因此产品若要求字形长度，还需要专门的规则。

```rust
use std::error::Error;
use std::fmt;

#[derive(Debug, PartialEq, Eq)]
struct Task {
    title: String,
    minutes: u32,
}

#[derive(Debug, PartialEq, Eq)]
enum TaskError {
    MissingSeparator,
    InvalidTitle,
    InvalidMinutes,
    TotalOverflow,
}

impl fmt::Display for TaskError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            Self::MissingSeparator => "expected title|minutes",
            Self::InvalidTitle => "title must contain 1..80 characters",
            Self::InvalidMinutes => "minutes must be an integer in 1..1440",
            Self::TotalOverflow => "total minutes overflowed",
        };
        write!(f, "{message}")
    }
}

impl Error for TaskError {}

fn parse_task(line: &str) -> Result<Task, TaskError> {
    let (title, raw_minutes) = line
        .split_once('|')
        .ok_or(TaskError::MissingSeparator)?;
    let title = title.trim();
    if title.is_empty()
        || title.chars().count() > 80
        || title.chars().any(char::is_control)
    {
        return Err(TaskError::InvalidTitle);
    }
    let minutes = raw_minutes
        .trim()
        .parse::<u32>()
        .map_err(|_| TaskError::InvalidMinutes)?;
    if !(1..=1440).contains(&minutes) {
        return Err(TaskError::InvalidMinutes);
    }
    Ok(Task {
        title: title.to_owned(),
        minutes,
    })
}

fn total_minutes(tasks: &[Task]) -> Result<u32, TaskError> {
    tasks.iter().try_fold(0_u32, |sum, task| {
        sum.checked_add(task.minutes).ok_or(TaskError::TotalOverflow)
    })
}

fn rename(task: &mut Task, title: &str) -> Result<(), TaskError> {
    let validated = parse_task(&format!("{title}|{}", task.minutes))?;
    task.title = validated.title;
    Ok(())
}

fn first_title(tasks: &[Task]) -> Option<&str> {
    tasks.first().map(|task| task.title.as_str())
}

fn main() -> Result<(), Box<dyn Error>> {
    let input = ["学习借用|25", "处理错误|15"];
    let mut tasks: Vec<Task> = input
        .iter()
        .map(|line| parse_task(line))
        .collect::<Result<_, _>>()?;
    println!("first: {}", first_title(&tasks).unwrap_or("(empty)"));
    rename(&mut tasks[0], "复习所有权")?;
    println!("total: {}", total_minutes(&tasks)?);
    for task in &tasks {
        println!("{}: {} min", task.title, task.minutes);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_trims_title() {
        assert_eq!(
            parse_task("  学习  |25"),
            Ok(Task { title: "学习".to_owned(), minutes: 25 })
        );
    }

    #[test]
    fn rejects_invalid_input() {
        assert_eq!(parse_task("missing"), Err(TaskError::MissingSeparator));
        assert_eq!(parse_task("|10"), Err(TaskError::InvalidTitle));
        assert_eq!(parse_task("x|-1"), Err(TaskError::InvalidMinutes));
        assert_eq!(parse_task("x|0"), Err(TaskError::InvalidMinutes));
        assert_eq!(parse_task("x|1441"), Err(TaskError::InvalidMinutes));
    }

    #[test]
    fn rename_does_not_modify_on_failure() {
        let mut task = parse_task("original|10").unwrap();
        assert_eq!(rename(&mut task, ""), Err(TaskError::InvalidTitle));
        assert_eq!(task.title, "original");
    }

    #[test]
    fn total_checks_overflow_and_empty_input() {
        assert_eq!(total_minutes(&[]), Ok(0));
        let tasks = [
            Task { title: "a".into(), minutes: u32::MAX },
            Task { title: "b".into(), minutes: 1 },
        ];
        assert_eq!(total_minutes(&tasks), Err(TaskError::TotalOverflow));
    }
}
```

解析函数先借用输入的两个片段，检查完成后再为标题分配空间。即使输入数组后来离开作用域，`Task` 仍拥有自己的标题。`rename` 先得到完整合法的新值，再修改原任务，因此失败时不会留下标题已变、时间未变的半更新状态。

`first_title` 返回与传入任务切片相关的借用，编译器能用生命周期省略规则推断关系。调用方在引用仍被使用时不能修改相关任务；最后一次读取完成后，修改才可能被允许。这种约束阻止了“保存指向可扩容容器元素的引用，再扩容容器”的悬垂引用问题。

## Result 与 Option：把失败写进类型

`Result` 的两个类型参数分别表示成功值和错误，`Option` 的类型参数表示可能存在的值。空列表没有首项是正常缺失，适合 Option；输入包含非法分钟数是解析失败，适合 Result。不要把所有失败都返回空字符串，否则调用者无法区分真正为空与处理失败。

`?` 在成功时取出值，在错误时提前返回，并在允许时转换错误类型。它不是吞异常，也不会自动重试。`map_err` 将底层数字解析错误转成领域错误，让调用方不必依赖标准库内部错误措辞。对诊断要求更高的库可以保留底层 source，但不应把敏感输入直接嵌进错误信息。

测试中 `unwrap` 用于明确应成功的固定样例，失败时测试立即失败；用户输入路径不应普遍使用 unwrap。`main` 返回 `Result` 是小程序的简化错误出口，后续 CLI 教程会明确错误文字与退出码。panic 适合无法继续维持不变量的缺陷，不适合用户输错一个数字。

`checked_add` 让溢出成为显式错误，避免依赖调试与优化构建可能不同的算术行为。虽然本例合法单条时间较小，函数接受任意任务切片，所以仍保护总和。测试手工构造超大值是为了覆盖函数边界，不是假造性能结果。

## 预期检查与编译错误练习

执行以下命令。运行结果应先显示原始首项，再显示总时长 40 和重命名后的任务。测试应覆盖解析、拒绝输入、失败不修改和总和边界；具体通过数量以你实际命令输出为准，本文不预先宣称你的环境已验证。

```bash
cargo run
cargo test
cargo fmt --check
cargo clippy -- -D warnings
```

为了理解移动，在独立临时片段中写出下面代码并尝试编译。它是故意不能编译的教学反例，不能放进正式 `main.rs` 后期待测试成功。`text` 已移动给 `moved`，旧变量不再拥有字符串。

```rust
fn main() {
    let text = String::from("owned");
    let moved = text;
    println!("{text} {moved}");
}
```

修复前先说明需求：如果只读，借用 `&text`；如果需要转移，后面只用 `moved`；如果确实需要独立副本，才使用 clone。三种方法表达不同语义，不能把 clone 视为所有权错误的通用消音器。

## 排错：从使用位置理解借用期限

遇到“值已移动”时，查看首次转移的位置，尤其是函数参数是否接收 `String` 而非 `&str`。遇到“无法同时可变与不可变借用”时，定位旧引用的最后使用位置；必要时缩小其作用域或把所需结果转换成独立值，而不是强行关闭检查。

不能按整数索引获取 `String` 的第几个字符，因为 UTF-8 是变长编码。按字节范围切片也必须落在字符边界上，否则可能 panic。对于按字符处理的任务使用 `chars`，对格式解析使用 `split_once` 等结构化操作，避免把字符位置与字节位置混淆。

如果 `?` 报类型不兼容，检查函数返回类型是否能够接收该错误，以及是否需要显式 `map_err`。不要为了省事把所有错误转成成功默认值，这会让坏输入混入正常结果。格式检查失败只需要在实验包执行格式化，不意味着要改写无关项目。

## 接口选择与资源责任

设计函数签名时，先问它是否需要保存输入。只阅读标题就借用字符串，保存到任务就取得拥有的数据，修改任务就明确接收独占借用。签名展示这些责任后，调用方可以理解哪些值仍可使用，哪些已经转移；不需要通过注释猜测函数是否偷偷保留引用。

容器迭代也有相同区别：借用迭代让原容器继续存在，消耗迭代会转移元素所有权。循环内需要得到独立任务时，应明确选择移动或复制，而不是碰到报错才改成任意 clone。对文件、锁和连接等资源，这种归属关系还影响何时关闭与释放，内存模型会自然延伸为资源生命周期模型。

测试合法行为变化时，应同时审查调用点。例如把解析结果从拥有标题改成借用标题，会改变调用方能否长期保存任务，也会引入输入寿命约束。编译器能帮助发现部分调用不兼容，但接口意图和业务使用方式仍需要人判断，不能仅以编译成功作为设计合理的证据。

## 练习与适用边界

练习一：增加完成状态，设计只有两种合法值的枚举，再验证未知值被拒绝。练习二：写一个借用任务切片的过滤函数，先决定返回引用列表还是拥有数据的列表，解释两者对调用方修改和存储的影响。

练习三：让批量解析返回首个失败的行号，但不把整行内容写进错误。练习四：为总和增加更多边界测试，确认空列表、单项和溢出都有明确行为。完成后继续阅读[CLI 与测试](/tutorials/rust/cli.html)，学习如何把类型层面的错误映射成命令行契约。

所有权保证大量内存安全问题在编译期被阻止，但不保证业务规则、权限或性能正确。安全 Rust 仍可能发生死锁、逻辑错误和资源耗尽，`unsafe` 还需要额外审查。本篇不提供跨线程或系统接口的完整保证，不应从“编译通过”推导出“可以发布”。

## 官方来源

- [Rust Book 所有权](https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html)：移动、借用与切片。
- [Rust Book 错误处理](https://doc.rust-lang.org/book/ch09-00-error-handling.html)：panic 和 Result。
- [Rust 标准库 String](https://doc.rust-lang.org/std/string/struct.String.html)：UTF-8 与拥有字符串。
- [Rust 标准库 Result](https://doc.rust-lang.org/std/result/enum.Result.html)：组合方法与错误传播。
- [Cargo Book](https://doc.rust-lang.org/cargo/)：构建和测试命令。
