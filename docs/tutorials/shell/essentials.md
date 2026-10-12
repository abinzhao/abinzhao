---
title: Shell 常用命令、引号与管道基础
description: 建立路径、参数、输入输出和权限模型，在隔离目录中练习日常终端操作。
type: tutorial
topic: shell
section: foundation
order: 10
level: beginner
status: published
tags:
  - Shell
  - Bash
  - 命令行
prerequisites: []
comments: true
---

# Shell 常用命令、引号与管道基础

终端是交互界面，shell 是解释命令的程序，命令行工具则负责具体工作。输入一行文字后，shell 会解析引号、展开变量、处理重定向，再把参数传给工具。因此同一个工具遇到不同引号，可能收到完全不同的参数。理解这个过程比积累一串命令缩写更有用。

## 前置条件与安全实验目录

本文以 Bash 3.2 及以上为范围，兼顾 macOS 自带 Bash 和常见 Linux Bash。macOS 默认交互 shell 可能是 zsh，本文涉及变量展开和管道实验时请先输入 `bash` 进入 Bash，完成后用 `exit` 返回。Windows 读者可使用 WSL 或 Git Bash，但文件权限和部分工具实现可能不同。

先检查实际解释器与工具，再创建独立实验目录。`SHELL` 环境变量常表示登录 shell，不一定表示当前正在运行的 shell；`BASH_VERSION` 更适合确认当前 Bash。

```bash
printf 'Bash version: %s\n' "$BASH_VERSION"
command -v bash
command -v find
lab=$(mktemp -d)
cd "$lab"
mkdir -p input output
printf 'alpha\nbeta\nalpha\n' > "input/sample notes.txt"
pwd
ls -la input
```

预期输出是临时目录路径，`input` 中存在名称带空格的文本文件。后续写文件都只针对这个目录。不要使用管理员权限运行这些练习，也不要在不确定当前位置时执行删除操作。命令可复制并不等于应该在任意目录执行。

## 路径、参数与常用文件命令

绝对路径从根目录开始，相对路径从当前目录开始，`..` 表示父目录，`.` 表示当前目录。`cd` 改变的是当前 shell 的目录，因此它通常是内建命令；外部程序不能替父进程修改目录。`pwd` 用于确认位置，`ls` 用于人工观察，不宜把 `ls` 输出当稳定的数据格式解析。

```bash
cd "$lab"
cat "input/sample notes.txt"
cp "input/sample notes.txt" output/copied.txt
mv output/copied.txt output/renamed.txt
wc -l "input/sample notes.txt" output/renamed.txt
find input output -type f -print
```

预期两个文件各有三行，`find` 列出两个普通文件。`cp` 复制内容，`mv` 改名或移动路径；目标已存在时可能被覆盖，所以示例选用实验中新名称。真实数据可先检查目标存在性，再考虑交互确认选项，不要认为不同系统的覆盖提示完全一致。

命令通常按“程序名、选项、参数”接收输入，但 shell 不理解每个工具的业务含义。以连字符开头的文件名可能被当成选项，很多工具支持 `--` 表示选项结束；并非所有工具都支持它。使用 `./-draft.txt` 这类显式相对路径，也能避免把文件名误当选项。

`type cd` 能查看命令是内建、别名还是外部程序；`command -v` 适合检查可调用工具。别名可能改变交互命令行为，脚本通常不会自动继承交互别名。遇到“同一命令在机器上不同”，先检查解析到的程序路径和实现，不要只看名字。

## 引号决定参数边界

单引号保留内部字符的字面值，不能直接在单引号中再放一个单引号。双引号保留空格边界，同时允许变量展开和命令替换。未加引号的变量展开在 Bash 中可能发生字段分割和路径名展开，这是处理带空格文件名时最常见的错误来源。

```bash
name="sample notes.txt"
printf '%s\n' '$name'
printf '%s\n' "$name"
printf '[%s]\n' $name
printf '[%s]\n' "$name"
pattern='*.txt'
printf '%s\n' "$pattern"
printf '%s\n' input/*.txt
```

第一条打印字面量 `$name`，第二条打印变量值。未引用的 `$name` 通常变成 `sample` 与 `notes.txt` 两个参数，因此格式会重复输出两行；双引号版本只传一个参数。最后一条把通配符交给 shell 展开，当前实验应匹配一个文件。如果没有匹配，Bash 默认可能把模式原样传给命令，不能假设自动得到空列表。

不要把所有东西都双引号包住而不理解目的。`"input/*.txt"` 是字面路径，不会展开通配符；`input/"$name"` 则保留变量的参数边界，同时允许前面的固定路径片段。基本规则是引用数据变量，只有确实需要 shell 展开时才保留对应语法。

输出用户输入时用固定格式的 `printf '%s\n' "$value"`，不要把不可信数据当成格式字符串。`echo` 对选项和反斜线的处理在不同实现中有差异，脚本中需要准确输出时 `printf` 更可预测。反斜线换行只是把物理多行拼成同一条命令，行尾不能再混入不可见空格。

## 标准流、重定向与管道

每个进程通常拥有标准输入、标准输出和标准错误，常用描述符分别是 0、1、2。管道默认把左侧标准输出连接到右侧标准输入，不自动包括标准错误。文本工具因此可以组合，但每一段仍有独立的失败状态。

```bash
sort "input/sample notes.txt" | uniq -c
grep -n 'alpha' "input/sample notes.txt"
grep 'alpha' "input/sample notes.txt" > output/matches.txt
cat output/matches.txt
printf 'gamma\n' >> output/matches.txt
cat output/matches.txt
wc -l < "input/sample notes.txt"
```

预期计数中 `alpha` 有两次、`beta` 有一次；`grep -n` 显示第一与第三行。`uniq` 只合并相邻重复行，所以前面先排序。`>` 在工具运行前创建或截断目标，`>>` 追加内容。不要执行 `sort file > file`，shell 会先截断输入文件；安全转换应写到新文件，核对后再决定替换。

下面故意读取不存在的实验文件，观察错误流。该命令会失败，错误进入文件，而不是消失：

```bash
cat input/missing.txt > output/stdout.txt 2> output/stderr.txt
status=$?
printf 'exit status: %s\n' "$status"
cat output/stderr.txt
wc -c output/stdout.txt
```

预期退出状态非零，错误文件说明路径不存在，标准输出文件为空。`$?` 只表示上一条命令的状态，应立即保存，否则后面的 `printf` 会覆盖它。`2>&1` 表示把标准错误连接到当时的标准输出，因此 `> log 2>&1` 与 `2>&1 > log` 的结果不相同。

`grep` 返回 0 表示匹配到内容，1 表示未匹配，较大的错误状态表示工具错误。没有匹配在业务上可能正常，不能把任何非零状态都当灾难，也不能把非零都吞掉。默认管道状态取最后一段，前段失败可能被后段成功遮住，下一章会介绍错误传播。

## 权限、进程与环境

`ls -l` 显示所有者、所属组和其他用户的读写执行权限。对普通文件，执行位允许按系统规则执行；对目录，执行位主要表示能穿越该目录查找路径，读权限表示能列出名称，两者并不等同。文件可写也不意味着能在父目录删除它，目录权限参与决定路径操作。

```bash
printf '#!/usr/bin/env bash\nprintf "hello from script\\n"\n' > output/hello.sh
chmod u+x output/hello.sh
ls -l output/hello.sh
./output/hello.sh
bash output/hello.sh
```

预期两种运行方式都打印问候。直接执行依赖可执行权限和 shebang；显式 `bash file` 则由 Bash 读取文件，不要求同样的执行位，但仍需读取权限。不要为了解决一个权限错误就使用 `chmod 777`，那会把修改权限扩大给所有人；先确定具体文件、所有者和需要的权限。

变量在当前 shell 中存在，`export` 才使它进入之后启动的子进程环境。`PATH` 决定程序查找范围，自动化场景常和交互终端不同。环境变量不是安全保险箱，进程、调试工具或日志可能暴露它们，不要把真实凭据写入教程命令或 shell 历史。

长时间运行的前台命令通常可以用 Ctrl+C 请求中断；程序如何响应取决于实现。`kill` 默认发送终止信号，不等于立即强制销毁；不应把强制信号当第一步。终端关闭、后台进程和作业控制是不同概念，简单加一个 `&` 不能让任务成为可靠服务。

## 搜索、抽取与不执行数据

查文本时先确定要找字面字符串还是正则表达式。`grep -F` 把模式当固定文本，`grep -E` 使用扩展正则；日志里的点号、括号和星号如果没区分语义，可能匹配到意外内容。搜索结果只说明文本出现，不证明对应程序逻辑已经执行。

```bash
printf 'user=alice status=ok\nuser=bob status=failed\n' > input/events.log
grep -F 'status=failed' input/events.log
sed -n '1,2p' input/events.log
awk '{print $1}' input/events.log
```

预期过滤得到 Bob 的那行，sed 显示前两行，awk 抽取每行第一个空白分隔字段。这些命令只读文件，没有原地修改。awk 的默认字段规则适合这个简单演示，不是 CSV 或 JSON 解析器；字段可带引号、逗号或转义时应使用对应结构化解析工具。

不要把文件内容拼成命令后交给 `eval`。数据中包含分号、命令替换或重定向时，重新解释会把原本的文本变成操作。需要调用程序时直接传递参数并保持引号边界，不把“shell 能解释”误当“输入值得信任”。

命令替换可用于取得短结果，例如 `count=$(wc -l < input/events.log)`，但会去掉末尾换行。它不适合保存任意二进制数据或完整路径列表。只想看大文件开头可用 `head`，交互浏览可用 `less`；减少输出能避免终端被大量日志淹没，但读取范围也要在结论中说明。

## 常见错误、练习与验证

路径不存在时先查 `pwd` 和路径拼写，不要立即 sudo。文件名含空格导致参数错误时先查引号，而不是给文件改名掩盖问题。管道没有结果时逐段运行，判断是输入为空、过滤条件不对还是工具失败。输出文件突然变空时回忆重定向发生在命令执行之前。

macOS 的 `sed`、`date`、`stat` 和 Linux GNU 实现存在差异。看到网上的 `sed -i` 或 `date` 特定参数时，应查本机手册；本篇避免依赖这些差异较大的选项。不要根据一台机器的输出就宣称脚本跨平台。

练习创建三个带空格的文本文件，通过 `find` 观察路径，选择一个文件复制到新名称；再用 `grep` 过滤、`sort` 排序、`uniq -c` 计数，把结果写入新文件。故意输入一个错误路径，分别保存标准输出和错误，确认退出状态非零且原输入内容没变。

完成标准是能解释每个命令实际收到多少参数，知道管道连接哪条流，能证明重定向没有覆盖源文件，并能区分“无匹配”与“执行错误”。之后进入[Shell 脚本与错误传播](/tutorials/shell/scripting.html)，或返回[教程目录](/tutorials/)。

## 官方参考

- [Bash 引号规则](https://www.gnu.org/software/bash/manual/html_node/Quoting.html)：单引号、双引号和转义。
- [Bash 重定向](https://www.gnu.org/software/bash/manual/html_node/Redirections.html)：文件描述符与处理顺序。
- [Bash 管道](https://www.gnu.org/software/bash/manual/html_node/Pipelines.html)：数据连接及退出状态。
- [GNU Coreutils 手册](https://www.gnu.org/software/coreutils/manual/coreutils.html)：常用文件工具；macOS 仍需核对本机实现。
- [GNU Findutils 手册](https://www.gnu.org/software/findutils/manual/html_mono/find.html)：文件查找与安全传参。
