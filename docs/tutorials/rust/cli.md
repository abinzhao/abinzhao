---
title: Rust 命令行实战：文件统计、退出码与集成测试
description: 编写受限文本统计 CLI，分离核心逻辑与进程入口，并测试真实命令行为。
type: tutorial
topic: rust
section: intelligence
order: 20
level: intermediate
status: published
tags: [Rust, CLI, 测试, 错误处理]
prerequisites: [/tutorials/rust/ownership.html]
comments: true
---

# Rust 命令行实战：文件统计、退出码与集成测试

命令行程序的接口不只有函数，还包括参数顺序、标准输出、标准错误和退出码。一个程序在终端里看似能用，接入流水线却可能因为错误时仍返回零而产生错误结果。本篇编写一个文本统计工具，明确输入上限、UTF-8 规则和错误出口，用单元测试与真正启动程序的集成测试检查这些契约。

## 前置条件与目标

先完成[所有权与 Result](/tutorials/rust/ownership.html)，准备稳定版 Rust 与 Cargo。使用独立实验目录创建包，不为本文安装额外依赖。文本统计按“行”与 Unicode 标量值计数，不声称统计用户感知字形或自然语言词数。输入是读者自己创建的普通 UTF-8 文件，不应指向私人文档。

```bash
cargo new textstat --edition 2021
cd textstat
```

完成后，正常统计返回零，参数错误返回 2，文件读取或解码失败返回 1。标准输出只有结果，诊断进入标准错误，便于其他程序读取。示例最多接收 1 MiB 内容，这是本地工具的教学预算；更大的数据应使用流式算法，而不是无限增大读入缓冲区。

## 核心原理：库逻辑与进程边界分离

把纯逻辑放进库，可以直接用内存数据测试，不需要每次都准备文件。命令入口处理参数、文件和退出码，并将读取结果交给库。这个分层只有两个文件，不是通用 CLI 框架；它解决的是测试与错误责任明确的问题。

命令参数在操作系统层面未必是有效 Unicode，尤其是文件路径。`args_os` 返回 `OsString`，让路径不因为 UTF-8 转换而损坏。内容是否要求 UTF-8 则是业务规则，本篇明确要求。不要将路径强制转换成字符串后再重新构造，否则部分平台文件名会失真。

统计“行”的定义要写清楚。Rust 的 `str::lines` 处理常见换行方式，末尾单个换行不会额外生成空行；空字符串为零行。字符数量使用 `chars().count()`，包含换行字符。定义可能不同于某些系统工具，测试应验证本程序契约，而不是拿其他工具结果强行套用。

文件大小检查不能只看元数据，因为读取过程中内容可能改变，特殊文件也可能没有可信长度。这里使用 `Read::take` 最多读取上限加一字节，超过上限就拒绝；普通文件检查只是排除常见目录和设备，不是针对恶意文件系统竞争的安全沙箱。

## 实操一：可独立测试的库

保存为 `src/lib.rs`。统计函数不做 I/O，因此错误类型只表达解码问题。字节长度在解码前就已知；数字输出使用 `usize`，适合本进程内的缓冲区长度。

```rust
#[derive(Debug, PartialEq, Eq)]
pub struct Stats {
    pub bytes: usize,
    pub lines: usize,
    pub characters: usize,
}

pub fn summarize(bytes: &[u8]) -> Result<Stats, std::str::Utf8Error> {
    let text = std::str::from_utf8(bytes)?;
    Ok(Stats {
        bytes: bytes.len(),
        lines: text.lines().count(),
        characters: text.chars().count(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_input_has_no_lines() {
        assert_eq!(
            summarize(b""),
            Ok(Stats { bytes: 0, lines: 0, characters: 0 })
        );
    }

    #[test]
    fn unicode_characters_are_not_bytes() {
        assert_eq!(
            summarize("学习\nRust\n".as_bytes()),
            Ok(Stats { bytes: 12, lines: 2, characters: 8 })
        );
    }

    #[test]
    fn invalid_utf8_is_an_error() {
        assert!(summarize(&[0xff]).is_err());
    }
}
```

这里的 12 字节来自两个中文字符各占三字节、四个 ASCII 字母和两个换行；8 个 Unicode 标量值则来自两个中文字符、四个字母和两个换行。数字是明确 fixture 的可推导预期，不是泛化性能数据。改变样例后应重新推导断言，不要凭直觉修改数字。

## 实操二：完整的命令入口

保存为 `src/main.rs`。程序不输出输入文件内容，错误只显示固定类别，避免无意把私人路径或文本送进流水线日志。只有诊断需要时才考虑显式开启详细路径，并说明日志边界。

```rust
use std::ffi::OsString;
use std::fs::File;
use std::io::Read;
use std::process::ExitCode;

const LIMIT: u64 = 1024 * 1024;

fn execute(args: Vec<OsString>) -> Result<String, (u8, &'static str)> {
    if args.len() == 1 && args[0] == "--help" {
        return Ok("usage: textstat FILE\n".to_owned());
    }
    if args.len() != 1 {
        return Err((2, "expected exactly one file path"));
    }
    let file = File::open(&args[0]).map_err(|_| (1, "cannot open input file"))?;
    let metadata = file.metadata().map_err(|_| (1, "cannot inspect input file"))?;
    if !metadata.is_file() {
        return Err((1, "input must be a regular file"));
    }
    let mut bytes = Vec::new();
    file.take(LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| (1, "cannot read input file"))?;
    if bytes.len() as u64 > LIMIT {
        return Err((1, "input exceeds 1 MiB budget"));
    }
    let stats = textstat::summarize(&bytes)
        .map_err(|_| (1, "input is not valid UTF-8"))?;
    Ok(format!(
        "bytes={} lines={} characters={}\n",
        stats.bytes, stats.lines, stats.characters
    ))
}

fn main() -> ExitCode {
    match execute(std::env::args_os().skip(1).collect()) {
        Ok(output) => {
            print!("{output}");
            ExitCode::SUCCESS
        }
        Err((code, message)) => {
            eprintln!("textstat: {message}");
            ExitCode::from(code)
        }
    }
}
```

本例不支持任意选项组合，只把单独的 `--help` 作为帮助。名为 `--help` 的文件应通过 `./--help` 传入，避免与选项混淆。复杂 CLI 可以采用成熟解析库，但仍要清楚默认值、重复参数、路径编码和退出码；引入依赖不是省略接口设计的理由。

读取通过文件句柄完成，避免先检查路径元数据再重新打开造成更多竞争。但普通文件仍可能被其他进程并发写入，所以本程序不承诺一致快照。需要一致性时应读取不可变输入、使用协作锁或由上游提供快照。所有权检查不会自动解决文件系统外部修改。

## 实操三：真正启动二进制的集成测试

在实验包创建 `tests/cli.rs`，内容如下。Cargo 在集成测试中提供构建产物路径，不需要猜测 `target` 布局。临时文件名包含进程号和时间，独占创建避免覆盖；析构负责删除本测试拥有的文件，不涉及业务目录。

```rust
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

struct Fixture(PathBuf);

impl Fixture {
    fn new(content: &[u8]) -> Self {
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let path = std::env::temp_dir()
            .join(format!("textstat-test-{}-{nanos}.txt", std::process::id()));
        let mut file = OpenOptions::new().write(true).create_new(true).open(&path).unwrap();
        file.write_all(content).unwrap();
        Self(path)
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

#[test]
fn prints_result_and_succeeds() {
    let fixture = Fixture::new("学习\nRust\n".as_bytes());
    let output = Command::new(env!("CARGO_BIN_EXE_textstat"))
        .arg(&fixture.0).output().unwrap();
    assert!(output.status.success());
    assert_eq!(String::from_utf8(output.stdout).unwrap(),
               "bytes=12 lines=2 characters=8\n");
    assert!(output.stderr.is_empty());
}

#[test]
fn invalid_arguments_have_a_distinct_exit_code() {
    let output = Command::new(env!("CARGO_BIN_EXE_textstat")).output().unwrap();
    assert_eq!(output.status.code(), Some(2));
    assert!(output.stdout.is_empty());
}

#[test]
fn rejects_invalid_encoding_without_printing_content() {
    let fixture = Fixture::new(&[0xff]);
    let output = Command::new(env!("CARGO_BIN_EXE_textstat"))
        .arg(&fixture.0).output().unwrap();
    assert_eq!(output.status.code(), Some(1));
    assert!(output.stdout.is_empty());
    assert!(String::from_utf8(output.stderr).unwrap().contains("UTF-8"));
}
```

测试清理中的删除只针对本测试创建的临时文件，失败清理不改变断言结果；生产文件删除不应照搬这种忽略错误策略。测试里的 unwrap 代表环境或固定构造失败时立即失败，不能照搬到用户输入处理路径。

## 预期检查与排错

先在实验目录准备一份内容为“学习、换行、Rust、换行”的 `sample.txt`，再执行以下命令。正常输出应匹配前面的明确统计值，缺少参数时终端会显示诊断并产生退出码 2。运行单元与集成测试后，再执行格式和静态检查，具体结果以命令输出为准。

```bash
cargo run -- sample.txt
cargo run -- --help
cargo test
cargo fmt --check
cargo clippy --all-targets -- -D warnings
```

若提示“找不到 crate”，核对包名是否为 `textstat`，以及库文件是否在 `src/lib.rs`。Cargo 包名、库名和二进制名有命名转换规则，本文固定名称以降低干扰。若 `CARGO_BIN_EXE_textstat` 不存在，检查测试是不是放进 `tests/` 集成测试目录，而非库内部模块。

若统计结果与编辑器显示不同，先检查编辑器是否自动追加换行，以及文件采用的换行符和编码。UTF-8 的 BOM 也是字符数据，当前实现不会自动去除；若产品要求忽略 BOM，应明确加规则和测试。不要把解码失败替换成损坏字符后仍宣称原始文件统计准确。

读取失败需要区分路径错误、权限不足、目录和超限输入。CLI 返回固定类别保护日志，调试时可以在隔离环境查看底层 I/O 错误。不要在生产流水线为排错打印整份文件。接收来自用户的路径时，还应考虑可访问目录和符号链接政策，本篇只面向可信本地操作者。

## 工程讨论：稳定输出与资源预算

一旦其他脚本依赖输出格式，字段名和换行就成为兼容契约。增加 JSON 模式时应显式提供参数，使用正确序列化器并保证错误仍进入 stderr，不要把调试日志混进 JSON。输出也可能失败，例如管道下游提前关闭；正式工具应使用可返回 I/O 错误的写入方式，决定如何处理 BrokenPipe，而不是任由打印宏 panic。

读取上限只是内存预算，无法防止普通文件所在网络文件系统长时间阻塞。需要严格截止时间时，应考虑操作系统能力或独立工作进程，不能用一个计时变量保证阻塞调用可取消。流式统计还需要处理跨块 UTF-8 字符和跨块换行，算法复杂度会变高，必须用不同分块方式测试相同输入。

发布工具时应提供支持的平台与架构、版本信息和完整性校验，不把开发机编译产物称为跨平台通用二进制。路径行为、权限和终端编码存在平台差异；在目标系统运行集成测试是交付的一部分。下一篇[并发与发布](/tutorials/rust/engineering.html)将进一步解释性能测量和发布边界。

## 从人工运行到流水线契约

人工查看一条正常输出只是开始。流水线会根据退出码决定后续步骤，所以错误时不能输出一个默认零统计并返回成功。若某个批次包含多个文件，应明确是遇到首个失败停止，还是继续处理并汇总失败；无论哪种策略，都不能让部分失败在总结果中消失。

帮助文本、诊断文字与机器输出的稳定性要求不同。面向人的错误说明可以逐步改善，供脚本解析的字段则应版本化或明确承诺。不要让下游脚本通过匹配英文错误句子判断类型；需要机器诊断时可以提供专门结构，保留人类可读错误出口。

集成测试还应检查读取失败后没有泄露内容，参数带空格时没有被拆开，输出顺序不依赖文件系统枚举。可以为帮助、目录输入和不存在文件分别增加小案例。测试范围与工具承诺对应，不需要为了小工具引入复杂系统，但每个公开行为都应有可观察的预期。

目标系统冒烟应使用无敏感合成文件，记录版本、命令和结果。文件读取权限来自操作者身份，不来自 CLI 参数本身；部署成服务后若接收不可信用户路径，必须再加入范围与授权，不能把本地可信操作者假设偷偷沿用到公网服务。

## 练习与官方来源

练习一：增加超限文件集成测试，断言拒绝且 stdout 为空。练习二：支持标准输入时明确等待终止的方式、字节上限和空输入行为，避免管道永远等待。练习三：为带空格文件名增加测试，验证参数数组没有被二次 shell 解释。练习四：加入可测试的输出函数，模拟写入错误，检查错误出口不制造成功结果。

- [Rust Book 命令行项目](https://doc.rust-lang.org/book/ch12-00-an-io-project.html)：参数、文件与职责分离。
- [Rust Book 测试组织](https://doc.rust-lang.org/book/ch11-03-test-organization.html)：单元与集成测试。
- [Rust 标准库 Read](https://doc.rust-lang.org/std/io/trait.Read.html)：take 与读取行为。
- [Rust 标准库 ExitCode](https://doc.rust-lang.org/std/process/struct.ExitCode.html)：进程退出状态。
- [Cargo 集成测试环境变量](https://doc.rust-lang.org/cargo/reference/environment-variables.html)：构建产物路径。
