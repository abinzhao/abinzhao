---
title: Shell 自动化、幂等执行与定时任务
description: 从只读扫描器建立自动化契约，处理重复执行、互斥、日志、调度环境与失败恢复。
type: tutorial
topic: shell
section: foundation
order: 30
level: advanced
status: published
tags:
  - Shell
  - 自动化
  - 定时任务
prerequisites:
  - /tutorials/shell/scripting.html
comments: true
---

# Shell 自动化、幂等执行与定时任务

自动化不是让终端命令“自己跑”，而是让它在无人值守、重复触发、环境不完整和中途失败时仍有可解释的行为。手工执行成功一次，只能证明某次输入和某个交互环境可用，不能证明放进调度器后可靠。

## 前置条件与自动化契约

本文使用 Bash 3.2 及以上，以及 `find`、`wc`、`mktemp` 等常见工具，适用于 macOS 和 Linux 的本地练习。先完成[脚本与错误传播](/tutorials/shell/scripting.html)。不同系统的调度器不一样：Linux 可使用 cron 或 systemd timer，macOS 通常用 launchd；本章只给调度配置示例，不安装任务，不执行外部写操作。

把自动化契约写在脚本之前：输入是一个已存在且可读的目录，输出是找到的 `.txt` 普通文件数；源目录始终只读；并发运行时只有一个实例工作；错误输出到标准错误；失败可由退出状态判断。它不读取文件内容、不上传路径、不删除源文件，因此可以安全地反复练习。

幂等指同一目标状态下重复执行不产生额外业务副作用，不等于每次日志完全相同。时间戳会变化，但只读扫描不会让文件越扫越多。若任务是生成文件，应把输出放在扫描范围外，避免下一次把自己的输出又当输入。

## 一个带互斥与清理的只读扫描器

在新实验目录创建脚本。状态目录由调用者指定，应是当前用户拥有、非共享的目录；默认权限掩码用于保护运行状态，不试图修复任意用户目录的权限。

```bash
lab=$(mktemp -d)
mkdir -p "$lab/source" "$lab/state"
printf 'one\n' > "$lab/source/one.txt"
printf 'two\n' > "$lab/source/two notes.txt"
cat > "$lab/scan-text.sh" <<'BASH'
#!/usr/bin/env bash
set -u
set -o pipefail
umask 077

fail() {
  printf 'error: %s\n' "$1" >&2
  exit "$2"
}

[[ $# -eq 2 ]] || fail "usage: scan-text.sh SOURCE_DIR STATE_DIR" 2
source_dir=$(cd "$1" && pwd -P) || fail "invalid source directory" 3
state_dir=$(cd "$2" && pwd -P) || fail "invalid state directory" 3
[[ -r "$source_dir" && -x "$source_dir" ]] || fail "source is not accessible" 3
[[ -w "$state_dir" && -x "$state_dir" ]] || fail "state is not writable" 3

lock_dir="$state_dir/scan.lock"
if ! mkdir "$lock_dir" 2>/dev/null; then
  fail "lock unavailable; another run or stale lock may exist" 4
fi

tmp=''
cleanup() {
  local status=$?
  trap - EXIT
  if [[ -n "$tmp" ]]; then
    rm -f -- "$tmp"
  fi
  rmdir "$lock_dir" || printf 'warning: lock not removed\n' >&2
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

printf '%s\n' "$$" > "$lock_dir/pid" || fail "cannot record owner" 5
tmp=$(mktemp "$state_dir/scan.XXXXXX") || fail "cannot create temporary file" 5
if find "$source_dir" -type f -name '*.txt' -exec printf '.\n' \; > "$tmp"; then
  :
else
  fail "directory scan failed" 6
fi
count=$(wc -l < "$tmp") || fail "cannot read scan result" 6
count=${count//[[:space:]]/}
printf 'text_files=%s\n' "$count"
rm -f -- "$lock_dir/pid" || fail "cannot remove owner record" 5
BASH
bash -n "$lab/scan-text.sh"
bash "$lab/scan-text.sh" "$lab/source" "$lab/state"
bash "$lab/scan-text.sh" "$lab/source" "$lab/state"
find "$lab/source" -type f -print
```

预期两次都输出 `text_files=2`，源目录仍有原来的两个文件。删除操作仅针对脚本自己创建的临时结果与锁内 PID 文件，源目录从不删除。`find` 每匹配一个文件就输出一个固定标记，不打印文件名，因此带空格、甚至带换行的名称不会破坏计数结构。

扫描结果先写入临时文件并检查 find 状态，再计数；这样避免生产者失败却被后面的 `wc` 成功掩盖。`-exec ... \;` 每个匹配启动一次命令，适合小实验但不适合超大目录的高效扫描。提升性能前应测量实际瓶颈，再选择专用程序或更合适的结构，不能为减少进程数牺牲记录边界。

## 互斥、信号与失败恢复

`mkdir` 对同一路径的创建具有原子竞争效果，两个进程不可能同时成功创建同一个锁目录。它比“先检测不存在，再写锁文件”少一个竞态窗口，但不是完整分布式锁。网络文件系统行为、状态目录被替换和跨机器协调需要另外设计。

PID 文件记录当前进程供人工诊断，不构成身份认证。进程号可能复用，看到某个 PID 存在不能直接认定它就是旧任务，更不能自动杀掉它。脚本如果在删除 PID 文件前失败，`rmdir` 会保留非空锁并打印警告，这是保守行为，避免把未知状态静默抹掉。

`EXIT` trap 保存原退出状态，清理之后再返回它，防止 `rm` 成功把真正失败覆盖成成功。INT 和 TERM 约定返回常见的 130、143 状态，强制终止、断电或系统崩溃不能保证执行清理。自动化必须预期陈旧锁，而不是假设 trap 永远运行。

可以在实验中手工制造锁，观察失败边界：

```bash
mkdir "$lab/state/scan.lock"
bash "$lab/scan-text.sh" "$lab/source" "$lab/state"
status=$?
printf 'blocked status: %s\n' "$status"
rmdir "$lab/state/scan.lock"
```

预期返回 4，不扫描、不修改源目录。最后的 `rmdir` 只移除刚刚手工创建且为空的实验锁；如果不为空就应失败。真实事故应先确认是否还有实例、查看锁记录和日志，再人工移除确定陈旧的状态，不能用递归删除强行解锁。

只读任务失败后重跑通常没有业务副作用。如果任务会上传、发邮件或写数据库，重试可能重复执行，应使用服务端幂等键或业务唯一标识；本地锁不能解决网络请求已成功但响应丢失的问题。对不可逆写入要先取得授权，不能把“自动重试”当默认策略。

## 调度环境与可复制的配置范例

调度器通常没有交互终端的当前目录、别名和完整 `PATH`。脚本中依赖 `cd` 的相对路径、用户 profile 和交互登录，到了凌晨就可能失败。使用绝对路径，明确解释器，检查所需工具，不要求读取个人终端初始化文件。

下面是 cron 格式的示例，不是安装命令。先在私人演示目录准备文件，再把实际绝对路径写进你自己的候选配置；`/home/demo` 仅表示假设存在的演示用户目录，不能原样认为可运行。

```bash
# Example crontab entry; do not install before checking every path.
SHELL=/bin/bash
PATH=/usr/bin:/bin
15 9 * * 1-5 /bin/bash /home/demo/jobs/scan-text.sh /home/demo/source /home/demo/state >> /home/demo/logs/scan.log 2>&1
```

这个配置表示工作日 09:15 运行，采用调度器所在系统的时区规则；夏令时跳变可能产生遗漏或重复，不同实现要查本机文档。cron 对百分号还有特殊处理，直接内嵌 `date` 格式时容易出错，复杂逻辑应放脚本中。不要运行 `crontab file` 作为练习，它可能替换现有任务。

macOS 的 launchd 应用属性列表表达程序参数、日历触发和输出路径，不能把 cron 行直接粘进去。Linux systemd timer 可把服务与触发分开，提供更明确的状态查询。无论选择哪一个，都先手工用相同用户、相同路径和尽量精简的环境运行，再注册任务；本章未执行任何调度器注册。

下面模拟精简环境，不改变系统配置：

```bash
env -i PATH=/usr/bin:/bin HOME="$HOME" \
  /bin/bash "$lab/scan-text.sh" "$lab/source" "$lab/state"
```

预期仍输出 2。如果找不到某个命令，说明脚本依赖超出这个 PATH，应明确配置或替换，不要把整个个人 PATH 和所有环境变量无差别复制给自动任务。

## 日志、发布结果与超时

日志至少应说明开始时间、任务标识、结果状态和错误原因；不要记录完整环境、凭据或敏感文件内容。示例只输出文件数，真实路径可能也敏感，应按需要脱敏。日志轮转要有容量上限，不能让一个每天成功的任务最后填满磁盘。

生成报告时常见做法是先写同一文件系统中的临时文件，核对成功后 rename 到最终路径，避免读者看到半份文件。但 rename 只处理路径切换，不自动提供数据落盘、跨文件事务和远程服务一致性。跨文件系统移动可能变成复制，不能宣称始终原子。

重试应限定次数、间隔和总耗时，并区分暂时性网络失败与参数错误。GNU `timeout` 并非 macOS 默认工具，不能直接假设跨平台存在。需要严格超时时，应选用调度器或明确的运行时能力，并验证信号处理和子进程退出；简单 `sleep` 加后台命令可能留下孤儿进程。

## 计划模式与受控范围

只读扫描本身可以安全重跑，但未来加入整理、复制或删除操作时，应先把“计划”和“执行”分开。计划模式列出匹配条件、目标数量与允许根目录，执行模式再次确认范围并逐项记录结果。计划不是永久授权，计划后文件可能变化，执行时仍需检查。

对目录输入可以先解析真实路径并要求位于允许根目录内，但字符串前缀比较要注意分隔边界：`/data/jobs-old` 不是 `/data/jobs` 的子目录。符号链接可能把表面路径指向范围外，脚本中的 `pwd -P` 只解析当前目录，后续遍历是否跟随链接也要明确。示例 find 默认不跟随遇到的目录符号链接，不提供完整沙箱。

下面仅检查状态目录里是否留下本任务的锁和临时文件，不删除它们：

```bash
find "$lab/state" -maxdepth 1 -name 'scan*' -print
find "$lab/source" -type f -name '*.txt' -print
```

两次正常运行后，第一条预期没有本脚本残留，第二条仍列出源文件。`-maxdepth` 在常见 GNU 和 macOS find 可用，但并非所有 POSIX 实现都保证支持；跨更广平台前应查目标工具手册。检查没有输出也只说明所选模式未匹配，不证明状态目录绝对为空。

自动化发布前把输入范围、运行账号、文件权限、日志位置和停止方式交给维护者。出了问题谁能暂停任务、如何确认还有没有运行实例，也是完成标准。一个没有停用入口的任务即使每次返回成功，也很难安全维护；本章不注册调度器，故不存在已启用任务需要停用。

## 常见错误、练习与完成标准

最常见错误是输出目录放在输入目录里，导致每次生成更多待处理文件；或者任务同时触发，把同一份结果覆盖多次。另一个常见问题是只记录最后一条 `echo` 的成功，而前面的实际任务已经失败。使用显式错误分支和独立结果发布，能让这些事实更容易看见。

练习新增一个 `.txt` 文件并重跑，预期数量增加到 3；新增 `.log` 文件则数量不变。再传不存在目录，要求退出 3 且不创建锁；模拟陈旧空锁，要求退出 4 且不删源文件。检查精简环境执行结果，把你实际运行的命令与状态记录下来，未运行就不写通过。

完成标准是重复执行不改变源数据、并发被拒绝、失败可见、清理范围固定、精简环境行为明确。本章只建立本地自动化能力，不证明任何服务器部署或定时注册已经完成。可返回[教程目录](/tutorials/)整理后续学习计划。

## 官方参考

- [Bash 手册](https://www.gnu.org/software/bash/manual/bash.html)：环境、信号、trap 和退出状态。
- [GNU Findutils](https://www.gnu.org/software/findutils/manual/html_mono/find.html)：执行动作与文件遍历。
- [GNU Coreutils 的 mktemp](https://www.gnu.org/software/coreutils/manual/html_node/mktemp-invocation.html)：临时文件创建。
- [systemd.timer 官方手册](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html)：Linux 定时触发语义。
- [Apple launchd 编程指南](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html)：macOS 任务结构；具体支持情况以本机手册为准。
