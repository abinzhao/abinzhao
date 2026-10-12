---
title: Bash 脚本结构、参数校验与错误传播
description: 编写可解释的文本统计脚本，理解函数、数组、退出状态、pipefail 与清理陷阱。
type: tutorial
topic: shell
section: foundation
order: 20
level: intermediate
status: published
tags:
  - Bash
  - 脚本
  - 错误处理
prerequisites:
  - /tutorials/shell/essentials.html
comments: true
---

# Bash 脚本结构、参数校验与错误传播

交互命令由人在旁边判断结果，脚本则要把这些判断写成明确契约：需要几个参数、允许哪些输入、成功输出是什么、失败返回什么，以及清理哪些自己创建的资源。把几条命令放进文件只是起点，可靠脚本还必须把失败路径纳入设计。

## 前置条件与解释器范围

本文基于 Bash 3.2 及以上，不使用关联数组、`mapfile` 或较新版本专有特性。需要先理解[引号、路径与标准流](/tutorials/shell/essentials.html)。macOS 上可显式执行 `bash script.sh`；Linux 上也应检查 `bash --version`。不要用 `sh script.sh` 运行包含 Bash 数组和 `[[ ]]` 的文件，因为 `sh` 不保证支持这些语法。

shebang 的 `#!/usr/bin/env bash` 通过当前 `PATH` 找到 Bash，适合教学和便携工具，但自动任务中要确认实际解析到哪一个解释器。执行位决定能否直接运行文件，显式传给 Bash 则不依赖执行位。文件应使用正常的 Unix 换行，Windows CRLF 可能让 shebang 或参数带入不可见回车。

本章脚本只读输入并输出统计结果，不删除文件、不访问网络，也不需要管理员权限。实验在新临时目录进行，后面会故意制造错误输入，因此非零退出并不等于教程失败。

## 写一个完整的文本记录统计器

这里把一行非空文本当作一条记录，空白字符行仍计为记录；输入限定普通文本文件，不处理含 NUL 的二进制内容。脚本接收一个或多个文件，全部验证通过后才统计，避免第二个文件不存在时已经输出第一份“成功结果”。

```bash
lab=$(mktemp -d)
cd "$lab"
cat > count-records.sh <<'BASH'
#!/usr/bin/env bash
set -u
set -o pipefail

die() {
  printf 'error: %s\n' "$1" >&2
  exit "$2"
}

if (( $# == 0 )); then
  die "usage: bash count-records.sh FILE..." 2
fi

files=("$@")
for file in "${files[@]}"; do
  [[ -f "$file" ]] || die "not a regular file: $file" 3
  [[ -r "$file" ]] || die "file is not readable: $file" 3
done

count_file() {
  local file=$1
  local line=''
  local count=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ -n "$line" ]]; then
      count=$((count + 1))
    fi
  done < "$file" || return 1
  printf '%s\t%s\n' "$count" "$file"
}

for file in "${files[@]}"; do
  if count_file "$file"; then
    :
  else
    die "could not count file: $file" 4
  fi
done
BASH
printf 'alpha\n\nbeta' > "first notes.txt"
printf 'gamma\n' > second.txt
bash -n count-records.sh
bash count-records.sh "first notes.txt" second.txt
```

预期语法检查没有输出，统计分别是 2 和 1，文件名与数字由制表符分隔。第一份文件最后没有换行，因此循环使用 `read ... || [[ -n "$line" ]]` 保留尾部数据；如果只用 `while read`，最后一个不完整行可能遗漏。这里的逻辑适用于普通文本，不能宣称它能准确检测所有底层读取故障；需要二进制或强 I/O 完整性保证时应使用专门语言和库。

`IFS=` 防止 `read` 自动裁掉行首尾的分隔空白，`-r` 防止反斜线被当作转义。函数中的 `local` 把临时变量限制在函数调用范围内，避免统计一个文件后污染另一个。所有文件名都双引号引用，数组用 `"${files[@]}"` 展开，每个元素保持一个参数。

`"$@"` 表示逐个保留所有位置参数；`"$*"` 在双引号中通常把它们合成一个字符串，不适合作为文件列表。列表如果只存进一个普通字符串，再靠空格拆开，遇到带空格文件名就会失去原始边界。数组不是为了复杂化脚本，而是为了忠实保存参数结构。

## 退出状态是程序接口

脚本规定 0 为成功，2 为参数数量错误，3 为输入不可接受，4 为统计执行阶段失败。数字的具体选择是这个工具的接口约定，不是 Bash 强制标准。错误说明写到标准错误，统计结果写到标准输出，调用者因此可以分别处理。

```bash
bash count-records.sh
status=$?
printf 'missing arguments status: %s\n' "$status"

bash count-records.sh "first notes.txt" missing.txt
status=$?
printf 'missing file status: %s\n' "$status"
```

预期第一组返回 2，第二组返回 3，并且第二组不会输出第一份文件的统计行。运行脚本前可先手工预测结果，再读取状态。状态必须立即保存，不能先执行别的命令再读取 `$?`。

函数最后一条命令的状态通常成为函数状态，`return` 可显式返回；`exit` 则终止当前脚本进程。对需要保留原始失败码的场景，可以使用 `command || status=$?`。注意 `if ! command; then` 内的 `$?` 反映的是取反后的状态，不能在里面直接当原命令错误码。

错误检查与实际使用之间仍可能发生文件变化，例如另一个进程删除输入。这叫检查与使用的时间差。前置检查能提供友好说明，但不消除并发风险，执行阶段仍需处理失败。更强的契约也需要更强的 I/O 设计，不能靠多写几条 `test` 就得到事务保证。

## Pipefail 与 Set -e 的真实边界

默认管道状态是最后一段命令的状态。左侧失败、右侧正常结束时，整个管道可能显示成功。下面在独立 Bash 子进程里对比，不改变当前终端设置：

```bash
bash -c 'false | cat; printf "default status: %s\n" "$?"'
bash -c 'set -o pipefail; false | cat; printf "pipefail status: %s\n" "$?"'
bash -c 'false | true; printf "parts: %s\n" "${PIPESTATUS[*]}"'
```

预期默认状态为 0，启用 `pipefail` 后为非零，分段状态包含左边失败和右边成功。`pipefail` 返回最右侧非零状态，而不是最左侧错误。`PIPESTATUS` 会随下一条命令变化，需要立即保存数组，不能过几步才查。

`set -e` 并不是“所有错误都会自动停止”。条件测试、部分 `&&` / `||` 列表、管道位置、被取反的命令，以及函数或子 shell 的调用上下文，都影响其行为。下面的 `false` 作为 `if` 条件不会让脚本直接结束：

```bash
bash -c 'set -e; if false; then printf "never\n"; fi; printf "still running\n"'
```

预期打印 `still running`。这不是漏洞，而是 shell 对条件判断的正常处理。对关键操作用明确的 `if` 或错误分支，比依赖隐式退出更容易审查。`set -u` 会在某些未设置变量展开时失败，必要默认值可写 `${OUTPUT_DIR:-./output}`；它不能检查变量内容是否符合业务规则。

命令替换 `value=$(command)` 会去掉结尾换行，适合短标量，不适合保存完整文件结构。`local value=$(command)` 还可能让声明命令的成功状态遮住子命令失败，应先声明，再单独赋值并检查。不要为了消除失败把所有命令追加 `|| true`，那只会让调用者失去事实。

## 循环、子进程与清理策略

`producer | while read ...` 中的循环通常在子 shell 运行，循环里修改的计数不一定能保留到父 shell。统计示例使用输入重定向 `done < "$file"`，让循环在当前函数环境中运行。进程替换也是 Bash 能力，但生产者失败状态不容易自动传给外层，不能把它当成免费的错误处理。

对文件遍历，优先让 `find` 直接传递路径，而不是解析它打印的文本：

```bash
find . -type f -name '*.txt' -exec bash "$lab/count-records.sh" {} +
```

`{}` 由 find 替换为路径，`+` 按系统参数上限分批调用。名称带空格仍能完整传入。这里的统计输出为方便人阅读，文件名包含换行或制表符时就不再是稳定表格；如果输出要作为另一个程序输入，应定义更严谨的记录格式，不要解析显示文本。

需要临时文件时，可用 `mktemp` 创建，并通过 `trap` 在退出时清理自己拥有的路径。清理不能扩大到用户输入的任意目录。下面只演示生命周期，不执行删除：

```bash
bash -c '
set -u
tmp=$(mktemp)
trap '\''printf "owned temporary file: %s\n" "$tmp" >&2'\'' EXIT
printf "temporary content\n" > "$tmp"
cat "$tmp"
'
```

预期退出时打印临时路径；这个示例刻意保留文件，便于检查。生产脚本若删除临时资源，应先确认路径由当前运行创建，并处理信号与原退出状态。`EXIT` trap 不意味着程序被强制杀死或机器断电时仍能执行，清理机制不能代替持久状态设计。

## 条件、输入与测试用例的边界

`[[ ... ]]` 是 Bash 条件语法，适合文件和字符串判断，内部通常不进行普通的字段分割与路径名展开；它仍有模式匹配规则，不能因此完全忽略引号。`[[ "$value" == "$expected" ]]` 适合按字面值比较，右侧不引用时可能被当作模式。算术比较则用整数表达式，不把任意用户输入直接当算术代码。

```bash
expected='alpha*'
value='alphabet'
if [[ "$value" == "$expected" ]]; then
  printf 'literal match\n'
else
  printf 'literal mismatch\n'
fi
if [[ "$value" == $expected ]]; then
  printf 'pattern match\n'
fi
```

预期先显示字面不匹配，再显示模式匹配。这说明“工具内部解释模式”与“shell 在执行前展开文件名”是不同阶段。需要严格字段值时明确限制字符集合、长度与允许值，不通过一次非空检查就把输入当可信。

为统计器增加行为时，先定义预期再修改代码。例如只允许 `.txt` 后缀属于业务约束，不是读取文本的技术必需；拒绝符号链接也是安全策略，应解释原因而不是悄悄改变可接受文件范围。练习样本既要有成功路径，也要有拒绝路径，测试失败不能靠去掉检查来消除。

较长脚本可以把纯计算函数与命令入口分开，但不必为一次小工具建立通用框架。函数的输入、输出和退出状态清楚，比函数数量多更重要。脚本如果被 `source` 到当前 shell，`exit` 会影响调用环境，变量和 trap 也可能泄漏；本文按独立进程执行，不建议把这些文件直接 source 到工作终端。

## 常见错误、练习与完成标准

脚本出现 `bad interpreter` 时先查解释器路径和换行，出现 `unbound variable` 时查参数和默认值，出现“文件明明存在”时查引号和当前目录。用 `bash -n` 只能证明语法可解析，不能证明逻辑正确。`bash -x` 会打印展开后的命令，可能暴露凭据和真实数据，调试时只能使用脱敏输入。

练习给统计器加一个 `--help` 分支，要求只打印用法并返回 0；再增加空文件、无末尾换行、带空格文件名和不存在文件四组输入。明确当前定义只排除完全空行，不排除空格行，再决定是否改变行为，并同时更新预期结果。

完成标准是参数边界不丢失、错误码可解释、没有错误输入时部分输出的误导、管道前段失败可被观察。不要把本章代码当作通用日志解析框架，它只是展示契约与错误传播。下一章[Shell 自动化与定时任务](/tutorials/shell/automation.html)会把这些原则放进可重复执行的文件扫描任务。

## 官方参考

- [Bash 参数](https://www.gnu.org/software/bash/manual/html_node/Shell-Parameters.html)：位置参数和特殊参数。
- [Bash 数组](https://www.gnu.org/software/bash/manual/html_node/Arrays.html)：元素展开的差异。
- [Bash Set 内建命令](https://www.gnu.org/software/bash/manual/html_node/The-Set-Builtin.html)：`errexit`、`nounset` 与 `pipefail`。
- [Bash 执行环境](https://www.gnu.org/software/bash/manual/html_node/Command-Execution-Environment.html)：子 shell 与状态。
- [Bash Trap 内建命令](https://www.gnu.org/software/bash/manual/html_node/Bourne-Shell-Builtins.html)：退出和信号处理。
