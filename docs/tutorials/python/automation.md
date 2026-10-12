---
title: Python 标准库自动化：安全路径、CSV、JSON 与子进程
description: 构建默认预览的本地转换器，验证文件范围、结构化数据、写入确认和命令超时。
type: tutorial
topic: python
section: intelligence
order: 20
level: intermediate
status: published
tags: [Python, 自动化, pathlib, subprocess]
prerequisites: [/tutorials/python/fundamentals.html]
comments: true
---

# Python 标准库自动化：安全路径、CSV、JSON 与子进程

自动化最危险的错误往往不是程序崩溃，而是“成功地修改了错误文件”。路径相对位置、CSV 引号、重复运行覆盖，以及命令拼接都需要明确契约。本篇使用 Python 3.11 标准库写一个 CSV 转 JSON 的本地工具：默认只预览结果，显式确认才新建文件，并用固定子进程验证输出格式。

## 前置条件与实验目标

先完成[Python 基础](/tutorials/python/fundamentals.html)。准备 Python 3.11 和独立实验目录，创建只由你控制的 `lab` 文件夹。示例只处理自建合成数据，不遍历家目录、不删除文件、不联网。先确认输入和输出路径，再启用写入，不把默认预览视为完整安全沙箱。

目标是正确处理带引号的 CSV、拒绝缺失或多余字段、限制读取大小、保护已存在输出，以及使用参数数组执行子进程。不同操作系统的路径和命令行为不同，示例通过 `sys.executable` 使用当前 Python，避免意外调用另一套解释器。

## 核心原理：结构化数据必须用结构化解析

CSV 不等于“按逗号分割的行”。字段可以用引号包裹，其中允许逗号、换行和引号转义，所以应使用 `csv.DictReader`。文件以 `newline=""` 打开，让 CSV 模块负责换行语义；`utf-8-sig` 可以接受 UTF-8 BOM。JSON 输出则使用 `json.dump`，不能手工拼接引号和反斜线。

路径由运行目录解释，`Path("lab")` 不是固定项目根。解析根目录后，再把相对路径组合进去，并确认最终位置仍属于根目录。`resolve` 可以处理常见符号链接逃逸，但在检查与打开之间仍可能发生修改；对敌对本地用户需要更强的系统隔离，本篇只面向独占实验目录。

默认预览减少误写，但真正安全还要拒绝覆盖。使用独占创建模式 `x`，已存在文件会报错，不能把异常改成覆盖模式 `w` 来让第二次运行“成功”。输出文件不存在时也不能无条件信任其父目录，必须检查目录范围和链接政策。

执行外部命令时使用参数列表，默认 `shell=False`，避免用户内容成为 shell 语法。`timeout` 限制等待时间，`check=True` 让非零退出码成为异常；捕获输出也有内存成本，只有可信且有限输出的命令才适合直接 `capture_output=True`。本篇固定执行 JSON 检查，不接受任意命令字符串。

## 实操：完整转换器

把以下代码保存为 `convert.py`。`--apply` 是对本次输出路径的显式写入选择，不是批量授权。读取上限按实际字节控制，解析后还限制行数和字段长度；这些是实验预算，可依据明确业务需求调整。

```python
import argparse
import csv
import io
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

MAX_BYTES = 1024 * 1024


def inside(root: Path, relative: str, must_exist: bool) -> Path:
    raw = Path(relative)
    if raw.is_absolute() or ".." in raw.parts or not raw.parts:
        raise ValueError("expected a relative path without parent traversal")
    current = root
    for part in raw.parts:
        current = current / part
        if current.is_symlink():
            raise ValueError("symbolic links are not allowed")
    resolved = current.resolve(strict=must_exist)
    if not resolved.is_relative_to(root) or resolved == root:
        raise ValueError("path leaves the allowed root")
    return resolved


def read_rows(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        raise ValueError("input must be a regular file")
    with path.open("rb") as handle:
        raw = handle.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError("input exceeds 1 MiB")
    text = raw.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text, newline=""))
    if reader.fieldnames != ["name", "hours"]:
        raise ValueError("expected the exact header name,hours")
    rows: list[dict[str, Any]] = []
    for number, row in enumerate(reader, 2):
        if len(rows) >= 1000:
            raise ValueError("row count exceeds budget")
        if set(row) != {"name", "hours"} or any(value is None for value in row.values()):
            raise ValueError(f"invalid fields at row {number}")
        name = row["name"].strip()
        raw_hours = row["hours"].strip()
        if not 1 <= len(name) <= 80 or any(ord(char) < 32 for char in name):
            raise ValueError(f"invalid name at row {number}")
        if not raw_hours.isascii() or not raw_hours.isdecimal():
            raise ValueError(f"invalid hours at row {number}")
        hours = int(raw_hours)
        if not 0 <= hours <= 1000:
            raise ValueError(f"hours outside range at row {number}")
        rows.append({"name": name, "hours": hours})
    return rows


def write_report(path: Path, rows: list[dict[str, Any]]) -> None:
    if not path.parent.is_dir():
        raise ValueError("output parent directory must already exist")
    with path.open("x", encoding="utf-8", newline="\n") as handle:
        json.dump({"records": rows}, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def check_report(path: Path) -> None:
    subprocess.run(
        [sys.executable, "-m", "json.tool", str(path)],
        check=True,
        timeout=5,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("lab"))
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    try:
        root = args.root.resolve(strict=True)
        if not root.is_dir() or args.root.is_symlink():
            raise ValueError("root must be a trusted directory")
        source = inside(root, args.input, True)
        target = inside(root, args.output, False)
        if source == target:
            raise ValueError("input and output must differ")
        rows = read_rows(source)
        print(f"rows={len(rows)} target={target.name} mode={'apply' if args.apply else 'preview'}")
        if not args.apply:
            print("No file was written.")
            return 0
        write_report(target, rows)
        check_report(target)
        print("Created and checked the JSON report.")
        return 0
    except (OSError, UnicodeError, ValueError, csv.Error,
            subprocess.SubprocessError) as error:
        print(f"conversion failed: {type(error).__name__}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
```

子进程仅检查已经由序列化器产生的 JSON，作用是演示固定命令、退出码和超时。它不是额外的业务校验，更不能证明记录内容准确。错误只输出类型，避免泄露输入名称和内容；在受控调试环境可以增加行号和类别，但不要打印原始数据。

`write_report` 完成后检查失败时，文件仍可能存在，因为检查并不会回滚写入。重复运行会拒绝覆盖，应先由操作者检查文件状态。正式系统若要求完整发布，应考虑同目录临时文件、受控的提交步骤和恢复记录；不能把所有失败都用“删除输出再重试”处理。

## 预期检查：先预览，再写入

在 `lab/input.csv` 放入下面内容。这是两条合成教学记录，第一条使用包含逗号的名字来验证引号解析。输出应保留完整名字，而不是分成多列。

```csv
name,hours
"reading, notes",2
练习自动化,3
```

执行预览命令应显示两条记录且不创建文件。确认目标后执行带 `--apply` 的命令，应新建 `report.json`，内容含两个对象和整数工时。再次执行写入应失败，原文件内容不应改变。

```bash
python3 convert.py --root lab input.csv report.json
python3 convert.py --root lab input.csv report.json --apply
python3 -m json.tool lab/report.json
```

保存以下代码为 `convert_test.py`，执行 `python3 -m unittest convert_test.py`。测试使用标准库临时目录并检查实际文件内容，既验证解析，也验证拒绝覆盖。

```python
import json
import tempfile
import unittest
from pathlib import Path
from convert import inside, read_rows, write_report


class ConversionTests(unittest.TestCase):
    def test_csv_json_and_no_overwrite(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            source = root / "input.csv"
            source.write_text('name,hours\n"reading, notes",2\n练习,3\n', encoding="utf-8")
            rows = read_rows(source)
            self.assertEqual(rows[0]["name"], "reading, notes")
            target = inside(root, "report.json", False)
            write_report(target, rows)
            self.assertEqual(json.loads(target.read_text(encoding="utf-8"))["records"], rows)
            with self.assertRaises(FileExistsError):
                write_report(target, rows)
            with self.assertRaises(ValueError):
                inside(root, "../outside.json", False)

    def test_invalid_header_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "bad.csv"
            source.write_text("name,hours,extra\nx,1,y\n", encoding="utf-8")
            with self.assertRaises(ValueError):
                read_rows(source)


if __name__ == "__main__":
    unittest.main()
```

本文说明的是预期检查方法，不宣称读者的文件系统或子进程已经通过验证。还应人工检查预览状态下目标确实不存在，以及失败时已有文件未被覆盖。真实批量任务需要先在少量隔离样本运行，再获得批量写入授权。

## 排错：路径、格式与进程分开看

找不到文件时先检查当前工作目录和 `--root`，不要让程序自动搜索整个磁盘。权限错误应确认目录所有者与目标权限，不要通过全局放宽权限解决。符号链接被拒绝属于政策行为，如果确需支持，必须重新设计范围检查，不是删除一行限制。

CSV 表头不匹配时核对大小写、BOM 和额外列。重复表头可能让映射丢失字段，因此本例要求完整精确表头。缺失字段会出现 None，多余字段可能出现额外键，这些都被拒绝。文件使用其他编码时应先确认来源约定，不能用 `errors="ignore"` 静默丢字后宣称转换准确。

子进程非零退出码与超时不同。前者可能是 JSON 格式错误或模块不可用，后者表示检查未在预算内结束。`subprocess.run` 在超时时会终止并等待直接子进程，但复杂命令启动的后代进程需要额外进程组策略。不要将用户内容拼接进 shell 命令，也不要只捕获异常而忽略退出码。

捕获 stderr 可能包含诊断信息，本例不原样打印。对不可信外部程序还需要输出大小限制，因为超时只限制时间，不限制单位时间产生的日志量。当前固定 Python JSON 检查输出有限，并不代表所有命令都可以套用相同设置。

## 自动化的工程边界

路径检查只限制范围，不能识别内容是否允许处理。个人信息、业务数据和密钥都应由数据政策决定是否读取和存储。程序默认不联网，但运行环境的挂载、备份和同步服务可能把文件送到外部；“本地目录”不是充分的数据隔离证据。

幂等性也要具体定义。本例重复写入被拒绝，不是自动覆盖为相同结果。若要支持覆盖，应先比较原结果版本、展示差异并确认；若要支持批处理，应记录每个文件状态，避免某个失败后盲目重跑全部任务。不要用一个成功计数掩盖部分失败。

## 批处理前的检查方法

扩大到多个文件前，先固定一个成功、一个格式错误和一个路径错误的样本，检查每个样本产生什么结果。预览报告应同时展示将读取的范围、目标数量和拒绝原因，不只显示一个总计。真实批次可能包含重复文件名、空文件和已经存在的结果，必须事先定义策略。

读取与写入分成两个阶段有助于避免部分任务已经修改后才发现其余输入不合法。但一次性读取所有数据也会增加内存成本，需要结合批次预算选择。小批次可以先全部校验，大批次可以记录逐项状态并提供恢复入口；不能为了追求“原子”而无限缓存整个目录。

恢复时先核对当前文件和记录状态是否一致。某个输出已创建但校验失败，可能需要人工检查；某个任务尚未写入则可以重新执行。删除和覆盖都属于新的副作用，应单独确认，不能把清理当作失败后自动允许的动作。备份也必须确认存放位置和敏感数据保留政策。

对 CSV 转 JSON 的结果，应至少检查记录条数、字段类型和必要值。JSON 语法正确只能证明文件能解析，不能证明输入没有漏行或语义正确。可以在测试中比较结构化对象，而不是只检查文件存在；将来增加汇总字段还要推导明确预期，避免凭目测认定转换成功。

## 子进程与部署环境

自动化运行在定时任务或服务中时，工作目录和环境通常不同于交互终端。显式配置根目录、解释器和必要参数，不依赖个人 shell 的别名。传入子进程的环境应按需保留，避免工具无意继承云密钥、代理或调试选项；修改环境前也要保证程序需要的系统变量仍然存在。

外部命令的信任范围要说明。即使使用参数列表，某些工具自身也可能把参数解释为脚本或选项，因此仍要限制允许参数。可执行文件来源、版本和工作目录同样重要，不应从可写目录寻找任意同名程序。本文使用当前解释器的固定模块，不能推导出任意第三方命令都安全。

## 练习与官方来源

练习一：增加重复名字策略，明确拒绝、合并还是保留，补充相应测试。练习二：添加批次汇总，但保持默认预览，不因为文件数量多就自动授权写入。练习三：测试带空格和中文目录，确认参数数组没有二次解释。练习四：模拟 JSON 检查失败，记录残留文件和恢复步骤。继续阅读[Python 工程组织](/tutorials/python/engineering.html)。

- [Python 3.11 pathlib](https://docs.python.org/3.11/library/pathlib.html)：路径解析与相对范围。
- [Python 3.11 csv](https://docs.python.org/3.11/library/csv.html)：换行、引号与字典读取。
- [Python 3.11 json](https://docs.python.org/3.11/library/json.html)：结构化序列化。
- [Python 3.11 subprocess](https://docs.python.org/3.11/library/subprocess.html)：参数、超时、退出码与安全考虑。
- [Python 3.11 tempfile](https://docs.python.org/3.11/library/tempfile.html)：隔离测试文件。
