---
title: Python 工程组织：venv、pyproject、Typing 与测试交付
description: 将标准库工具组织成可安装包，建立隔离环境、类型边界、单元测试和发布检查。
type: tutorial
topic: python
section: intelligence
order: 30
level: advanced
status: published
tags: [Python, venv, pyproject, Typing, 测试]
prerequisites: [/tutorials/python/automation.html]
comments: true
---

# Python 工程组织：venv、pyproject、Typing 与测试交付

脚本能够运行之后，下一步不是立刻加入大量框架，而是固定解释器、依赖、包入口和测试契约。否则开发机能导入的模块，在另一台机器可能找不到；类型注解看似完整，外部 JSON 却仍可能传入错误类型。本篇用 Python 3.11 建立一个小型可安装包，让环境隔离、运行时校验与自动测试各自承担明确职责。

## 前置条件与目录结构

先完成[标准库自动化](/tutorials/python/automation.html)。准备 Python 3.11 和独立实验目录。运行依赖只有标准库，构建使用 setuptools，静态类型检查使用可选 mypy；这些依赖只安装在本篇实验环境，不修改其他项目。Python 3.11 虚拟环境通常包含 pip，但具体发行版可能需要单独安装相应组件。

创建下列结构，文件内容将在后面完整给出。使用 `src` 布局让代码不能仅凭当前目录就意外导入，测试需要安装包后再运行，有助于发现“源码可用但打包遗漏”的问题。目录不必照搬到只有一份一次性脚本的任务，当前结构是为可安装包建立清晰边界。

```text
taskkit-lab/
  pyproject.toml
  src/
    taskkit/
      __init__.py
      core.py
      cli.py
  tests/
    test_core.py
```

在包根目录创建虚拟环境。以下激活命令适用于 macOS 与常见 Unix shell；Windows 激活方式按官方 venv 文档选择。更稳妥的自动化方式是直接调用 `.venv/bin/python`，不依赖 shell 是否已经激活。

```bash
python3 -m venv .venv
source .venv/bin/activate
python -c "import sys; print(sys.version); print(sys.executable)"
```

这条检查只打印解释器，不打印整个环境，避免把秘密注入值暴露到日志。虚拟环境隔离依赖，不隔离文件权限、网络或操作系统进程，也不是安全沙箱。不要将 `.venv` 复制到另一台机器作为正式发布方式，环境路径和平台二进制可能不同。

## 核心原理：配置、类型和测试分别保证什么

`pyproject.toml` 的构建系统声明告诉安装工具如何构建包，项目元数据声明名称、版本、Python 版本和入口。它不是通用锁文件，也不会自动让所有构建可复现。生产依赖需要项目规定的固定版本与校验策略，升级构建工具同样应经过验证，不能因为它不在运行时就忽略风险。

类型注解描述开发契约，静态检查能发现函数调用、返回类型和可空值使用上的问题，但 JSON 解析结果仍是不可信运行时对象。外部输入应先通过校验构造领域对象，再交给有类型的核心逻辑。不要用 `cast` 将不合法数据“变成”合法类型，cast 只是告诉检查器相信你，不会转换或校验。

测试验证具体行为，不证明所有输入都正确。核心规则适合纯函数单元测试，路径、CLI 和打包适合集成测试。Mock 应用于难以控制的边界，例如外部服务，不能把核心函数本身替换成预期结果后声称业务通过。本篇核心只用内存对象，直接测真实函数。

异常分类应让调用方知道什么可以恢复。用户格式错误返回清晰的错误出口，程序缺陷保留异常证据，外部资源不可用需要超时和明确重试政策。日志与诊断不能默认包含原始输入、令牌或绝对私人路径。配置错误最好在启动时暴露，不要等处理了一半任务才发现缺少环境。

## 实操一：完整项目配置

创建 `pyproject.toml`。构建依赖采用明确范围以表达兼容需求，不宣称这是最新版本组合；实际复现环境还应固定解析结果。本包无运行时第三方依赖，开发工具放进可选组，正常安装者不必安装 mypy。

```toml
[build-system]
requires = ["setuptools>=68,<81"]
build-backend = "setuptools.build_meta"

[project]
name = "tutorial-taskkit"
version = "0.1.0"
description = "A local tutorial package with validated task records"
requires-python = ">=3.11"
dependencies = []

[project.optional-dependencies]
dev = ["mypy>=1.10,<2"]

[project.scripts]
taskkit = "taskkit.cli:main"

[tool.setuptools.packages.find]
where = ["src"]

[tool.mypy]
python_version = "3.11"
strict = true
files = ["src/taskkit"]
```

构建工具安装可能访问包索引，虽然程序运行不联网，依赖获取本身仍有网络和供应链边界。若环境禁止外部网络，应使用组织允许的镜像或离线 wheel，并验证来源，不要随意更换到未知下载地址。

## 实操二：领域对象与运行时校验

创建 `src/taskkit/__init__.py`，用于标明包边界，并创建完整的 `core.py`。接收 `object` 强制先检查未知输入，再获得结构化字段。任务标题不允许控制字符，分钟数拒绝 bool；不可变记录降低意外修改，但不是安全授权机制。

```python
"""Validated local task records."""
```

```python
from dataclasses import dataclass


class TaskError(ValueError):
    pass


@dataclass(frozen=True)
class Task:
    title: str
    minutes: int


def parse_task(value: object) -> Task:
    if not isinstance(value, dict) or set(value) != {"title", "minutes"}:
        raise TaskError("expected exactly title and minutes")
    title = value["title"]
    minutes = value["minutes"]
    if not isinstance(title, str):
        raise TaskError("title must be text")
    title = title.strip()
    if not 1 <= len(title) <= 80 or any(ord(char) < 32 for char in title):
        raise TaskError("invalid title")
    if type(minutes) is not int or not 1 <= minutes <= 1440:
        raise TaskError("minutes must be an integer in 1..1440")
    return Task(title=title, minutes=minutes)


def total_minutes(tasks: list[Task]) -> int:
    return sum(task.minutes for task in tasks)
```

解析器校验字段完整性，拒绝额外属性，防止未来某层误以为额外字段已经被处理。`total_minutes` 接收已验证任务，不再次解析 JSON，这样核心逻辑不与传输格式耦合。需要在包内手工构造 Task 时，应遵守其不变量，或把构造校验集中进工厂和数据类策略；本例只通过解析器构造业务输入。

## 实操三：命令入口

创建 `src/taskkit/cli.py`。输入通过一条 JSON 参数提供，最多四千字符；这只适合无敏感内容的小实验，真实密码和私人数据不应通过命令参数传入，因为其他进程和历史记录可能看到。正式工具可以使用标准输入或受限文件，并继续保持体积预算。

```python
import argparse
import json
import sys
from .core import TaskError, parse_task, total_minutes


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("record", help="one non-sensitive JSON task record")
    args = parser.parse_args()
    if len(args.record) > 4000:
        print("taskkit: input exceeds budget", file=sys.stderr)
        return 1
    try:
        value: object = json.loads(args.record)
        task = parse_task(value)
    except (ValueError, TaskError):
        print("taskkit: invalid task record", file=sys.stderr)
        return 1
    print(json.dumps({"title": task.title, "minutes": total_minutes([task])},
                     ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

入口返回整数，安装工具生成的 `taskkit` 命令会以该结果退出；模块直接运行则通过 `SystemExit` 显式传播。核心错误继承 ValueError，因此当前捕获列表可以简化为 ValueError；保留两者写法用于说明领域错误和解码错误来自不同阶段，不表示必须重复罗列子类。

## 测试、安装与预期检查

创建 `tests/test_core.py`。先验证普通对象，再验证非法类型、多余字段和重复调用。测试不依赖外部 API，也不读取真实数据。

```python
import unittest
from taskkit.core import Task, TaskError, parse_task, total_minutes


class TaskTests(unittest.TestCase):
    def test_parse_and_sum(self) -> None:
        task = parse_task({"title": " 学习 ", "minutes": 25})
        self.assertEqual(task, Task("学习", 25))
        self.assertEqual(total_minutes([task]), 25)
        self.assertEqual(total_minutes([]), 0)

    def test_rejects_untrusted_types_and_fields(self) -> None:
        for value in [
            {"title": "x", "minutes": True},
            {"title": "x", "minutes": "25"},
            {"title": "", "minutes": 25},
            {"title": "x", "minutes": 0},
            {"title": "x", "minutes": 25, "admin": True},
            ["x", 25],
        ]:
            with self.subTest(value=value):
                with self.assertRaises(TaskError):
                    parse_task(value)


if __name__ == "__main__":
    unittest.main()
```

在虚拟环境中执行下列命令。可编辑安装适合开发，源码变更会立即影响导入；它不代表已经测试构建后的正式产物。类型检查工具若无法安装，应报告未运行，而不是用解释器能执行替代静态检查。

```bash
python -m pip install -e '.[dev]'
python -m unittest discover -s tests -v
python -m mypy
taskkit '{"title":"学习工程组织","minutes":25}'
python -m taskkit.cli '{"title":"错误类型","minutes":true}'
```

正常命令应返回 JSON，分钟数为 25；最后一条应输出固定诊断并以非零退出。测试和 mypy 的实际结果以运行输出为准，本文不宣称它们已在读者环境通过。再执行 `python -m pip wheel --no-deps . --wheel-dir dist` 可以构建本实验包；这可能为隔离构建下载构建工具，并只在实验项目产生文件。

发布前在新的虚拟环境安装生成的 wheel，离开源码目录后调用入口和运行已声明的冒烟用例。这样能发现包遗漏、错误入口和仅在源码路径下存在的导入。可编辑安装通过不等于 wheel 安装通过，构建成功也不等于业务验收完成。

## 排错：解释器、导入与类型错误

安装成功却导入失败，先确认安装时和运行时的解释器路径一致，使用 `python -m pip` 比直接调用某个 pip 更明确。`ModuleNotFoundError` 也可能来自忘记安装 src 布局的包，而不是 Python 搜索路径损坏。不要随意把整个项目加入全局 `PYTHONPATH` 来掩盖打包问题。

相对导入应通过包入口运行，不要直接执行 `src/taskkit/cli.py` 再删除导入中的点。模块运行和安装入口都建立包上下文。文件名遮蔽标准库也是常见问题，检查当前目录是否有 `json.py` 或同名包；更换安装环境不会自动解决源码命名冲突。

mypy 报可空值或类型不匹配时，回到数据流判断可能输入，不要普遍添加 ignore。JSON 字段必须运行时校验，静态检查只能验证你对校验结果的使用是否一致。第三方库缺类型信息时，应选择局部明确边界，不把全项目变成 Any。

依赖安装失败可能是网络、索引、平台 wheel 或版本范围问题，不能把失败自动归因于程序。记录实际解析版本，在隔离环境调整并重新测试；主要升级和生产依赖变化需要独立审查。项目声明 Python 3.11 起步，还应在承诺支持的其他版本实际运行测试，不宣称所有后续版本天然兼容。

## 工程交付与练习

配置与秘密分开，环境变量只用于明确的部署参数，真实凭据不能进入 pyproject、源码或示例参数。日志使用固定事件和脱敏字段，错误堆栈仅在受控环境保存。后台任务和外部调用要有超时、取消与重试上限，不能因为脚本运行时间短就忽略资源生命周期。

持续集成可以按单元测试、类型检查、构建、干净环境安装和入口冒烟的顺序进行。发布到包索引、推送代码或修改远端配置属于外部写操作，需要独立授权；本教程不要求执行这些动作。记录支持平台、Python 版本和未验证内容，保留可以复核的命令结果。

练习一：增加批量输入解析器，返回具体失败编号但不泄露原始记录。练习二：为 CLI 加集成测试，检查 stdout、stderr 和退出码，而不仅是函数返回。练习三：在新虚拟环境安装 wheel，验证源码目录不存在时入口仍可运行。练习四：为项目写出支持版本和依赖升级政策，列出已测与未测组合。

## 官方来源

- [Python 3.11 venv](https://docs.python.org/3.11/library/venv.html)：虚拟环境与平台差异。
- [Python 3.11 typing](https://docs.python.org/3.11/library/typing.html)：注解与运行时行为。
- [Python 3.11 unittest](https://docs.python.org/3.11/library/unittest.html)：测试发现与断言。
- [Python Packaging pyproject 指南](https://packaging.python.org/en/latest/guides/writing-pyproject-toml/)：元数据和构建系统。
- [Python Packaging 项目打包教程](https://packaging.python.org/en/latest/tutorials/packaging-projects/)：构建产物与安装检查。
