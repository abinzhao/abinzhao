---
title: Python 3.11 基础：类型、集合、函数与可靠输入
description: 用预算统计程序学习 Python 基础类型、可变对象、函数契约和异常处理。
type: tutorial
topic: python
section: intelligence
order: 10
level: beginner
status: published
tags: [Python, 基础类型, 函数, 异常]
prerequisites: []
comments: true
---

# Python 3.11 基础：类型、集合、函数与可靠输入

Python 语法简洁，不代表输入和状态会自动正确。字符串里的数字、布尔值和整数的关系、共享列表的修改，都可能让一个看似正常的小程序产生意外结果。本篇以预算记录为例，使用 Python 3.11 标准库编写完整程序，把基础类型、集合、函数和异常放进可检查的流程。目标是建立可解释的代码，而不是记住所有语法。

## 前置条件与完成目标

准备 Python 3.11 或兼容后续版本，执行 `python3 --version`。系统中可能有多个解释器，后续安装与运行应使用同一个解释器；不要根据终端提示符推断版本。本篇没有第三方依赖，创建独立实验目录即可。

完成后，你应能解析格式固定的记录，拒绝非法金额和类别，按类别累计并输出确定结果。金额使用整数分表示，避免二进制浮点误差；输入文件、网络和真实财务数据不在本篇范围。示例金额属于合成教学数据，不代表任何真实账户信息。

## 核心原理：类型表达值，变量绑定对象

常见类型包括 `int`、`float`、`bool`、`str`、`None` 和集合。`str` 是 Unicode 文本，`bytes` 是原始字节，两者通过明确编码转换。`None` 表示缺失，不等于空字符串、零或 False。把这些值统统放进 `if not value` 会丢失差异，输入校验应根据字段契约判断。

Python 中变量名绑定到对象，不是固定类型存储格。列表和字典可变，多个名字可能引用同一个对象；对其中一个名字执行列表修改，另一个也能看到。字符串和整数不可变，操作通常返回新对象。理解这个模型可以解释为什么函数修改传入列表会影响调用方，而重新给局部变量赋值不会替换调用方绑定。

`==` 比较值，`is` 比较对象身份。判断是否为 None 使用 `is None`，比较普通字符串和数字使用 `==`。不要因小整数或短字符串的实现缓存而使用 `is` 比较值，那是实现细节，不是语言级业务契约。

布尔值是整数的子类，所以 `isinstance(True, int)` 为真。需要拒绝布尔数量时，可使用 `type(value) is int` 或显式排除 bool；这不是否定继承，而是该输入契约要求真正整数。字符串 `"false"` 也不是 False，非空字符串在布尔上下文中为真，不能靠 `bool(text)` 解析布尔字段。

列表保持顺序，字典映射键和值，集合用于去重和成员检查，元组通常表达固定组合。选择集合不是个人偏好：输出需要稳定顺序时不能直接依赖集合迭代；字典键应使用不可变可哈希值，不能用列表。函数输入和返回值可以加类型注解，但 Python 运行时不会自动执行类型检查。

## 实操：完整预算记录程序

把下面代码放入 `budget.py`。输入格式为 `类别,金额`，金额最多两位小数且不接受负数、指数或千分位。这里不是通用 CSV 解析器，只解析固定的两字段教学文本；有引号和字段内逗号的文件应交给下一篇的 `csv` 模块。

```python
from dataclasses import dataclass
import re

CATEGORIES = frozenset({"food", "travel", "books"})


class RecordError(ValueError):
    pass


@dataclass(frozen=True)
class Expense:
    category: str
    cents: int


def parse_amount(text: str) -> int:
    if type(text) is not str:
        raise RecordError("amount must be text")
    match = re.fullmatch(r"(0|[1-9][0-9]{0,5})(?:\.([0-9]{1,2}))?", text.strip())
    if match is None:
        raise RecordError("amount must be a non-negative decimal with up to 2 places")
    whole = int(match.group(1))
    fraction = (match.group(2) or "").ljust(2, "0")
    cents = whole * 100 + int(fraction or "0")
    if cents > 10_000_000:
        raise RecordError("amount exceeds the per-record budget")
    return cents


def parse_record(line: str) -> Expense:
    if type(line) is not str or len(line) > 120:
        raise RecordError("invalid record text")
    parts = line.split(",")
    if len(parts) != 2:
        raise RecordError("expected category,amount")
    category = parts[0].strip()
    if category not in CATEGORIES:
        raise RecordError("unknown category")
    return Expense(category, parse_amount(parts[1]))


def totals(records: list[Expense]) -> dict[str, int]:
    result: dict[str, int] = {}
    for record in records:
        if record.category not in CATEGORIES:
            raise RecordError("unknown category")
        if type(record.cents) is not int or not 0 <= record.cents <= 10_000_000:
            raise RecordError("invalid integer cents")
        result[record.category] = result.get(record.category, 0) + record.cents
    return result


def format_cents(cents: int) -> str:
    if type(cents) is not int or cents < 0:
        raise RecordError("invalid total")
    whole, fraction = divmod(cents, 100)
    return f"{whole}.{fraction:02d}"


def main() -> int:
    source = ["food,12.50", "books,40", "food,2.5"]
    records: list[Expense] = []
    for number, line in enumerate(source, 1):
        try:
            records.append(parse_record(line))
        except RecordError as error:
            print(f"record {number}: {error}")
            return 1
    for category, cents in sorted(totals(records).items()):
        print(f"{category}: {format_cents(cents)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

金额解析先检查文本结构，再转换成整数分。字符串 `2.5` 的小数部分补成 `50`，不是把金额乘浮点 100 后四舍五入。整数在 Python 中可扩展，但这不代表资源无限，所以输入长度和每条金额仍有上限。真实财务系统还需要货币、舍入方式和账务规则，本例不能直接作为正式账本。

`dataclass(frozen=True)` 让记录字段不容易被意外重赋值，但它不自动验证类型，也不保证嵌套对象深度不可变。这里字段都是字符串和整数，适合表达已解析记录；累计函数仍检查边界，避免手工构造非法记录混进流程。注解 `list[Expense]` 是静态契约提示，不会在运行时拦住任意列表内容。

## 函数与状态：避免隐式共享

函数最好明确输入、返回和异常。`parse_record` 不修改调用方数据，成功返回新记录；`totals` 构造新字典，不把结果保存在全局变量中。这样重复调用不会累积上一次任务的状态，测试也不会互相影响。

可变默认参数会在函数定义时创建一次，而不是每次调用创建。下面是故意用于讨论的反例，不要放进正式程序作为正确实现。连续两次调用会共享同一个列表，导致记录残留。

```python
def collect(value, items=[]):
    items.append(value)
    return items
```

正确做法通常是默认值为 None，在函数内部创建列表，或者要求调用方显式传入要修改的列表。两者语义不同：前者每次拥有新状态，后者明确共享状态。不要只改语法而不说明函数是否应修改输入。

异常处理应围绕可恢复操作。这里只捕获领域输入错误，程序缺陷和其他异常不会被伪装成成功。`except Exception: pass` 会丢掉问题和证据，不适合作为“防崩溃”万能方案。后续文件自动化应分别处理 I/O、编码和输入格式错误，错误出口不打印真实敏感数据。

## 预期检查与测试

执行 `python3 budget.py`，预期按类别排序输出 `books: 40.00` 与 `food: 15.00`。这两个结果由固定合成输入推导得到，不是程序已经在你的环境运行的声明。保存以下代码为 `budget_test.py`，运行标准库测试命令。

```python
import unittest
from budget import Expense, RecordError, format_cents, parse_amount, parse_record, totals


class BudgetTests(unittest.TestCase):
    def test_valid_amounts_and_totals(self) -> None:
        self.assertEqual(parse_amount("2.5"), 250)
        self.assertEqual(parse_amount("0"), 0)
        records = [parse_record("food,12.50"), parse_record("food,2.5")]
        self.assertEqual(totals(records), {"food": 1500})
        self.assertEqual(format_cents(1500), "15.00")

    def test_rejects_bad_formats(self) -> None:
        for value in ["-1", "1e3", "1.234", "01", "", "NaN"]:
            with self.subTest(value=value):
                with self.assertRaises(RecordError):
                    parse_amount(value)
        with self.assertRaises(RecordError):
            parse_record("unknown,3")
        with self.assertRaises(RecordError):
            totals([Expense("food", True)])

    def test_calls_do_not_share_results(self) -> None:
        first = totals([Expense("books", 100)])
        second = totals([])
        self.assertEqual(first, {"books": 100})
        self.assertEqual(second, {})


if __name__ == "__main__":
    unittest.main()
```

```bash
python3 budget.py
python3 -m unittest budget_test.py
```

`subTest` 让多个非法值分别报告，不因第一条失败掩盖其他输入。测试重复调用检查状态隔离，布尔数量检查 Python 的类型边界。测试没有覆盖所有数值与文本，但它们建立了清晰的拒绝规则；新增规则时应补对应案例，不能让测试迁就错误实现。

## 排错：先看类型和缩进

`TypeError` 通常来自操作数类型不匹配。字符串 `"2"` 与整数 2 不会自动相加，应该在输入边界明确转换，而不是到处加 `str` 或 `int`。`ValueError` 往往表示转换形式合法但内容不符合要求，本篇将其转换成领域错误，以便调用方处理。

缩进决定代码块，混用制表符和空格会造成错误或误读。统一四空格，使用编辑器可视化缩进；不要通过随意删掉缩进让解释器“能运行”，应确认分支与循环实际包含哪些语句。列表迭代中删除元素会改变后续位置，筛选通常用新列表或显式索引策略。

遇到输出顺序变化，核对是否使用集合，或者是否明确定义排序。本篇用 `sorted` 稳定类别输出。遇到浮点误差，先检查业务是否要求十进制精确数值；整数分适合本例，通用十进制计算可以使用标准库 Decimal，但仍要明确舍入与输入限制。

模块文件不要命名为 `json.py`、`csv.py` 等标准库名称，否则同目录导入可能遮蔽真正模块。执行脚本与通过模块方式运行也会影响导入路径，后续工程篇会用包结构固定入口。遇到多解释器问题，应记录实际 `sys.executable`，不要凭安装成功推断当前运行环境一致。

## 从输入到输出追踪数据

调试时先检查数据在哪一层发生变化。本例源文本先被拆成两字段，类别经过白名单，金额经过格式校验并转换成整数，再构造成记录。累计阶段只处理结构化记录，输出阶段只格式化整数。这样的顺序能定位是文本不合法、类型不正确还是累计逻辑错误，而不是把所有错误归结为“Python 自动转换”。

列表推导式适合简短转换和筛选，但不应为了压缩行数隐藏复杂异常处理。输入可能失败时，显式循环可以记录行号并决定停止或继续。生成器适合延迟处理，但延迟也意味着错误可能直到迭代时才出现，调用方要知道执行时机，不能以创建生成器没有报错证明输入有效。

值相等与对象共享也值得在测试中检查。两个字典内容相同，不代表它们是同一个对象；返回新的结果字典可以减少调用方误改共享状态。浅拷贝只复制外层容器，内部可变对象仍可能共享。需要复制时先理解嵌套结构，不要机械使用深拷贝来掩盖状态设计。

错误诊断保留必要上下文即可，例如失败行号和字段类别，不需要打印整条记录。未来接入文件和真实数据时，这个习惯可以减少隐私泄露。教学样例虽不敏感，日志策略仍应从一开始按实际使用边界设计。

## 练习与下一步

练习一：增加按月分类，先定义日期格式和无效日期行为，不要用字符串前七位冒充完整日期校验。练习二：增加预算上限，明确总额达到上限是否允许，并写边界值测试。练习三：改成返回所有非法行的编号，确保不会把原始敏感行写进错误日志。

练习四：为零金额和空记录列表设计输出契约，说明“没有记录”与“总额为零”的区别。完成后继续阅读[标准库自动化](/tutorials/python/automation.html)，把解析逻辑接入路径、CSV、JSON 和子进程；最后学习[工程组织](/tutorials/python/engineering.html)，让实验变成可维护包。

## 官方来源

- [Python 3.11 教程](https://docs.python.org/3.11/tutorial/)：类型、控制流、函数和异常。
- [Python 3.11 数据模型](https://docs.python.org/3.11/reference/datamodel.html)：对象、身份和可变性。
- [Python 3.11 dataclasses](https://docs.python.org/3.11/library/dataclasses.html)：数据类与字段行为。
- [Python 3.11 unittest](https://docs.python.org/3.11/library/unittest.html)：断言与子测试。
- [Python 3.11 Decimal](https://docs.python.org/3.11/library/decimal.html)：十进制运算的适用方式。
