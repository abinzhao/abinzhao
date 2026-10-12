---
title: AI Agent 工具：Schema、最小权限与人工确认
description: 用标准库实现受限文件工具，验证参数、固定执行范围、绑定确认并限制执行时间。
type: tutorial
topic: ai-agent
section: intelligence
order: 20
level: intermediate
status: published
tags: [AI Agent, 工具调用, 权限, Schema]
prerequisites: [/tutorials/ai-agent/foundations.html]
comments: true
---

# AI Agent 工具：Schema、最小权限与人工确认

模型一旦拥有工具，错误就不再只是回答不准确，而可能成为读取错误目录、覆盖文件或向外发送数据。工具层要把“模型提出什么”与“程序允许什么”分开。本篇用 Python 3.11 标准库实现两个固定工具：读取一份本地笔记，以及在指定输出目录新建一份摘要。模型接入不是本篇重点，任何候选调用都必须经过相同的执行器。

## 前置条件与完成目标

先阅读[Agent 基础](/tutorials/ai-agent/foundations.html)，理解模型输入输出与授权的区别。准备 Python 3.11 或兼容后续版本，在独立实验目录运行，不把家目录或业务工作区作为工具根目录。示例只使用虚构笔记，输出也只进入实验目录。

完成后，你应能拒绝多余字段、路径穿越、未知工具和未经确认的写入；执行超时后应停止子进程，并知道超时不代表副作用不存在。本例不调用模型、不发送网络请求，也不继承“任意命令执行”能力。后续将笔记内容交给云模型时，仍必须单独取得数据发送授权，本地读取权限不能自动转化为外部发送权限。

## 核心原理：Schema 是接口，权限是执行政策

工具 schema 描述名称、参数类型、必填项和范围约束，帮助模型形成合法候选。但模型可能输出非法字段，也可能完全绕过预期结构，所以执行前必须再次验证。`additionalProperties: false` 表示不接受暗藏的参数，不能仅在文档中声明而在运行时忽略。

权限判断与参数判断不同。`name` 是合法字符串，并不意味着可以读取任意目录。本篇只允许单层 `.txt` 文件名，执行器自己拼接固定目录，不让模型传入绝对路径、环境变量、工作目录或 Python 表达式。固定工具注册表也不等于动态加载插件，候选里没有出现过的工具名直接拒绝。

写操作的确认应绑定具体参数。本例把工具名和参数规范序列化后计算摘要，展示规范内容给人查看；确认摘要与执行摘要必须一致。如果确认后文本变化，原确认失效。摘要不是数字签名，也不能证明操作者身份，在 Web 产品中还要把确认绑定到已认证用户、任务和有效期，不能让模型把 `approved: true` 放进参数来冒充确认。

超时是执行期限，不是撤销机制。线程等待超时后，后台线程可能继续写文件，所以这里使用可终止子进程。即使进程被终止，也可能已经创建部分文件；正式系统需要临时文件、状态记录或可恢复操作。调用外部付款等不可撤销工具时，不能通过“再试一次”盲目重做。

## 实操：受限工具执行器

保存下面完整代码为 `tools.py`。Schema 与手写验证器覆盖同一组固定字段，生产工具较多时可使用可信 JSON Schema 校验库，但引入库前仍要明确 schema 方言与执行政策。这里不用依赖避免把校验机制隐藏在安装步骤里。

```python
import hashlib
import json
import multiprocessing as mp
import re
from pathlib import Path
from typing import Any

SCHEMAS = {
    "read_note": {
        "type": "object",
        "properties": {
            "name": {"type": "string", "pattern": r"^[a-z0-9_-]{1,40}\.txt$"}
        },
        "required": ["name"],
        "additionalProperties": False,
    },
    "write_summary": {
        "type": "object",
        "properties": {
            "name": {"type": "string", "pattern": r"^[a-z0-9_-]{1,40}\.txt$"},
            "text": {"type": "string", "minLength": 1, "maxLength": 2000},
        },
        "required": ["name", "text"],
        "additionalProperties": False,
    },
}


def validate(call: Any) -> dict[str, Any]:
    if type(call) is not dict or set(call) != {"tool", "arguments"}:
        raise ValueError("invalid call envelope")
    tool = call["tool"]
    if type(tool) is not str or tool not in SCHEMAS:
        raise ValueError("unknown tool")
    args = call["arguments"]
    expected = {"name"} if tool == "read_note" else {"name", "text"}
    if type(args) is not dict or set(args) != expected:
        raise ValueError("invalid argument fields")
    name = args["name"]
    if type(name) is not str or not re.fullmatch(r"[a-z0-9_-]{1,40}\.txt", name):
        raise ValueError("invalid file name")
    if tool == "write_summary":
        text = args["text"]
        if type(text) is not str or not 1 <= len(text) <= 2000:
            raise ValueError("invalid summary text")
        if len(text.encode("utf-8")) > 8192:
            raise ValueError("summary byte budget exceeded")
    return json.loads(json.dumps(call, ensure_ascii=False))


def canonical(call: dict[str, Any]) -> str:
    return json.dumps(call, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def approval_id(call: dict[str, Any]) -> str:
    return hashlib.sha256(canonical(validate(call)).encode("utf-8")).hexdigest()


def worker(root: str, call: dict[str, Any], connection: Any) -> None:
    try:
        base = Path(root).resolve(strict=True)
        directory = base / ("notes" if call["tool"] == "read_note" else "summaries")
        if directory.is_symlink() or directory.resolve(strict=True).parent != base:
            raise ValueError("unsafe tool directory")
        path = directory / call["arguments"]["name"]
        if path.is_symlink():
            raise ValueError("symbolic links are forbidden")
        if call["tool"] == "read_note":
            if not path.is_file():
                raise ValueError("note not found")
            with path.open("rb") as handle:
                data = handle.read(8193)
            if len(data) > 8192:
                raise ValueError("note byte budget exceeded")
            result = {"text": data.decode("utf-8")}
        else:
            with path.open("x", encoding="utf-8") as handle:
                handle.write(call["arguments"]["text"])
            result = {"created": path.name}
        connection.send({"ok": True, "result": result})
    except Exception as error:
        connection.send({"ok": False, "error": type(error).__name__})
    finally:
        connection.close()


def execute(root: Path, proposed: Any, approved: str | None = None,
            timeout: float = 3.0) -> dict[str, Any]:
    call = validate(proposed)
    if call["tool"] == "write_summary" and approved != approval_id(call):
        raise PermissionError("human approval required for this exact call")
    if not 0 < timeout <= 10:
        raise ValueError("invalid timeout")
    base = root.resolve(strict=True)
    context = mp.get_context("spawn")
    receive, send = context.Pipe(duplex=False)
    process = context.Process(target=worker, args=(str(base), call, send))
    process.start()
    send.close()
    try:
        if not receive.poll(timeout):
            raise TimeoutError("tool execution deadline exceeded")
        message = receive.recv()
        if not message["ok"]:
            raise RuntimeError(f"tool failed: {message['error']}")
        return message["result"]
    finally:
        if process.is_alive():
            process.terminate()
        process.join()
        receive.close()


def main() -> None:
    root = Path("agent-lab")
    root.mkdir(exist_ok=True)
    for directory in ("notes", "summaries"):
        (root / directory).mkdir(exist_ok=True)
    fixture = root / "notes" / "lesson.txt"
    if not fixture.exists():
        fixture.write_text("合成教学笔记：写入前必须确认。\n", encoding="utf-8")
    read_call = {"tool": "read_note", "arguments": {"name": "lesson.txt"}}
    print(execute(root, read_call))
    proposal = {"tool": "write_summary",
                "arguments": {"name": "summary.txt", "text": "本地工具写入需要人工确认。"}}
    print("Proposed call:", canonical(proposal))
    answer = input("Type APPROVE to create this exact file, otherwise deny: ")
    if answer != "APPROVE":
        print("Denied; no summary was created.")
        return
    print(execute(root, proposal, approved=approval_id(proposal)))


if __name__ == "__main__":
    main()
```

子进程只接受规范化后的副本，避免主流程在确认后继续修改同一个字典。写入采用独占创建模式，已存在的摘要不会被覆盖。目录在调用端固定，文件名正则不允许斜线，因此模型无法把正常参数变成跨目录命令。工具返回的文本仍是不可信内容，接入模型时应标明它是资料，不能把里面的命令提升为系统规则。

## 预期检查：拒绝行为也是功能

执行 `python3 tools.py`，首次应读出合成笔记，并显示完整写入提案。直接回车应拒绝写入；再次运行输入 `APPROVE` 才创建摘要。第三次试图写同名文件应得到 `FileExistsError` 类别的工具错误，不应该覆盖原文件。

将以下代码保存为 `tools_test.py`，使用 `python3 -m unittest tools_test.py`。临时目录由测试自己拥有，测试结束由标准库清理。断言关注路径、字段和确认绑定，不宣称已经完成安全沙箱认证。

```python
import tempfile
import unittest
from pathlib import Path
from tools import approval_id, execute, validate


class ToolTests(unittest.TestCase):
    def test_validation_and_confirmation(self) -> None:
        with self.assertRaises(ValueError):
            validate({"tool": "read_note", "arguments": {"name": "../secret.txt"}})
        with self.assertRaises(ValueError):
            validate({"tool": "read_note",
                      "arguments": {"name": "a.txt", "approved": True}})
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "notes").mkdir()
            (root / "summaries").mkdir()
            call = {"tool": "write_summary",
                    "arguments": {"name": "a.txt", "text": "first"}}
            with self.assertRaises(PermissionError):
                execute(root, call)
            approved = approval_id(call)
            changed = {"tool": "write_summary",
                       "arguments": {"name": "a.txt", "text": "changed"}}
            with self.assertRaises(PermissionError):
                execute(root, changed, approved)
            self.assertEqual(execute(root, call, approved), {"created": "a.txt"})
            self.assertEqual((root / "summaries" / "a.txt").read_text(), "first")


if __name__ == "__main__":
    unittest.main()
```

## 排错与安全沙箱的真实边界

在 Windows 或使用 spawn 的系统上，必须保留主程序入口守卫，否则子进程导入脚本可能再次启动子进程。工具挂起时检查超时是否走进 `finally`，不能只让调用方停止等待。进程提前退出可能产生 EOF 错误，这应被记录为执行失败，而不是编造一个成功结果。

本例限制目录和文件名，但没有构建操作系统安全沙箱。检查符号链接与打开文件之间仍存在竞争窗口，硬链接也可能引用其他文件；因此实验目录必须由当前可信用户独占，不能允许其他不可信进程同时改动。面对敌对本地用户，应使用平台特定的安全文件打开方式、隔离账户、容器或系统沙箱，并限制网络与可见文件系统。

工具超时可能留下已经创建的摘要。恢复时先检查结果文件和任务状态，不能自动删除未知文件或无条件重试。文件工具的“失败类型”可以公开，内部绝对路径不必公开给模型。生产诊断可记录脱敏后的错误类别、调用摘要、批准者和时间，不记录密钥、整份笔记或全部输出。

扩展到 HTTP 工具时还要处理 SSRF：域名白名单、私网地址策略、DNS 解析变化和重定向都需要控制。扩展到命令工具时，不要接收任意字符串并使用 shell 执行；应提供固定可执行程序和参数白名单。一个万能工具通常意味着一个很难验证的权限边界。

## 确认交互与执行记录

人工确认界面必须展示人能判断的具体影响：读取哪类文件、写到哪个受限位置、是否覆盖、是否联网，以及大致的数据范围。仅显示工具名或一串摘要，用户无法判断提案内容。摘要用于绑定内容，规范提案用于阅读，两者同时存在才有意义；敏感原文不应出现在公共确认日志中。

确认后执行前仍要检查权限和资源状态。用户可能撤销权限，文件可能已经存在，目录也可能变化；批准一次不代表永久授权。正式服务应将待确认、已批准、执行中、完成和失败作为不同状态，并记录单次调用标识，避免页面重复点击导致同一个写操作执行多次。

工具返回要区分业务拒绝与环境故障。文件不存在可以是正常的业务失败，磁盘不可用属于环境问题，未知工具则是提案格式或策略问题。模型收到失败后只能在剩余预算内提出新的合法候选，不能自动请求更大权限。增加权限需要用户再次看到具体变化，不应隐藏在“自动修复”按钮里。

## 工具组合与数据去向

读取工具和写入工具组合起来可能形成新的风险。允许读取一份笔记，不代表允许将整份笔记复制到公共目录；允许写摘要，也不代表摘要可以包含凭据。多步任务要检查来源与目的地，必要时对输出做规则校验或人工复核，而不只检查每个工具单独是否属于白名单。

工具输出接入云端 BYOK 时，应展示实际将发送的字段和目标服务。拒绝发送后可以保留本地结果或暂停任务，但不能切换另一个外部提供商继续发送。模型密钥和工具凭据应分别管理，工具实现不接受模型建议的新密钥或新服务地址，避免把资料内容变成运行配置。

执行记录优先保存工具名、参数摘要、批准状态、耗时和结果类别。需要复现内容时，使用经过授权的受限 fixture，而不是默认保存全部文件。测试应覆盖确认后参数改变、重复执行、超时和输出超限，成功样例只能证明正常路径可用，不能替代拒绝路径。

## 练习与验收思路

练习一：加入只读“列出笔记名称”工具，限制返回条数和名称长度，不返回绝对路径。先同步更新 schema 和验证器，再补未知字段测试。练习二：给确认增加过期时间和单次使用标记，确保同一摘要不能无限复用；这需要服务端保存状态，而不是让模型提交当前时间。

练习三：模拟执行过程中断，写出恢复流程，区分“尚未执行”“执行成功但结果丢失”“部分执行”三种状态。练习四：设计工具结果进入远程模型前的预览与脱敏页面，说明数据去向，并验证拒绝发送时任务暂停。下一篇[评测与 fixture](/tutorials/ai-agent/evaluation.html)会把这些拒绝规则转成可重复回归的用例。

## 官方来源

- [Python 3.11 pathlib](https://docs.python.org/3.11/library/pathlib.html)：路径解析与文件操作。
- [Python 3.11 multiprocessing](https://docs.python.org/3.11/library/multiprocessing.html)：spawn、进程终止与通信。
- [JSON Schema 对象参考](https://json-schema.org/understanding-json-schema/reference/object)：必填项与额外属性。
- [OWASP 授权指南](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)：最小权限与逐次授权。
- [OWASP SSRF 防护](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)：网络工具的目标限制。
