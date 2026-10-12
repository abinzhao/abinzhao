---
title: Git 基础与工作模型
description: 从工作区、暂存区和提交历史理解 Git，再建立可验证的日常工作流。
type: tutorial
topic: git
section: foundation
order: 10
level: beginner
status: published
tags:
  - Git
  - 工程基础
prerequisites: []
comments: true
---

# Git 基础与工作模型

Git 的命令并不难，真正容易混乱的是命令背后的状态变化。本篇先建立工作模型，再把 `add`、`commit` 和 `restore` 放回正确的位置。目标不是背下所有选项，而是能够在执行前说明影响范围，执行后用差异和历史检查自己的判断。

## 前置条件与实验边界

本文使用 Git 2.28 及以上版本：`switch`、`restore` 从 2.23 提供，初始化时指定分支的 `git init -b` 从 2.28 提供。先执行 `git --version` 确认版本。终端示例适用于 macOS、Linux 或 Windows 的 Git Bash，不要求连接 GitHub，也不会推送远程仓库。

请在新建的临时目录练习，不要把实验命令粘贴到工作项目。示例中的姓名和邮箱只是演示身份，配置限定在当前仓库；真实协作时应使用团队认可的身份。Git 提交需要身份，但不需要事先登录代码托管平台，本地提交与远程认证是两件事。

```bash
git --version
lab=$(mktemp -d)
cd "$lab"
git init -b main
git config --local user.name "Tutorial Learner"
git config --local user.email "learner@example.invalid"
git config --local commit.gpgsign false
pwd
git status
```

这里关闭的只是实验仓库的提交签名，避免机器已有签名设置阻断练习，不是建议团队关闭签名。预期 `status` 显示当前分支为 `main`、尚无提交，目录路径应是刚生成的临时路径。保留这个路径，后续所有写文件操作都发生在里面。完成后可保留实验目录，不必立刻删除。

## 四个区域与快照模型

| 区域 | 保存什么 | 常用命令 |
| --- | --- | --- |
| 工作区 | 当前正在编辑的文件 | `git diff` |
| 暂存区 | 下一次提交准备包含的快照 | `git add`、`git diff --staged` |
| 本地对象库与引用 | 提交对象、文件内容及分支指针 | `git commit`、`git log` |
| 远程仓库 | 另一份用于共享历史的仓库 | `git fetch`、`git push` |

工作区是磁盘上的可编辑文件；暂存区又叫 index，它记录下一次提交准备使用的内容，而不是一份“等待上传的文件名清单”。提交对象引用文件树、父提交和提交说明，历史因此形成图。Git 通常用差异展示变化，但概念上提交保存的是项目快照，不能把一次提交理解成只保存了几行补丁。

分支是指向提交的可移动引用，`HEAD` 通常指向当前分支。提交后，当前分支向新提交移动，其他分支不自动改变。远程不是第五步自动发生的动作：在本地提交一百次，也不会自行把内容上传。`origin/main` 通常是本地保存的远程跟踪引用，只代表上次同步时看到的状态，不能把它当成服务器实时视图。

`git add` 也不是“把文件交给 Git 管理”的一次性动作。每次执行时，它把指定文件当时的内容写进暂存区。之后继续编辑，工作区可以比暂存区更新。这种独立性让你把混在一起的工作拆成有意义的提交，但也意味着提交前必须审查暂存差异。

## 创建并检查第一次提交

```bash
printf '# demo\n\nA local Git exercise.\n' > README.md
git status --short
git add README.md
git diff --staged
git commit -m "docs: add project readme"
git status --short
git log --oneline --decorate -5
git show --stat HEAD
```

第一次 `status --short` 应出现 `?? README.md`，表示未跟踪文件；执行 `add` 后，暂存差异应包含整个新文件。`commit` 创建历史后，最后一次短状态应没有输出，日志应包含提交说明。提交哈希由内容、时间等决定，不应拿教程中的固定哈希作为验证标准。

提交说明要解释这次快照解决了什么问题。示例使用 `docs:` 只是常见习惯，不是 Git 强制格式。一个提交应尽量围绕一个可审查目标，例如“补充运行说明”，而不是把文档、样式和接口修改都放在“update”里。是否足够小取决于语义闭环，不是机械限制行数。

干净状态表示工作区、暂存区与当前提交之间没有 Git 报告的待处理变化，不表示代码已经通过测试，也不表示所有被忽略的文件都消失了。Git 管历史，运行正确性仍要用程序测试或人工验证证明。

## 用两份差异理解暂存

在同一个实验仓库继续执行：

```bash
printf '\nFirst change.\n' >> README.md
git add README.md
printf '\nSecond change.\n' >> README.md
git status --short
git diff
git diff --staged
```

短状态应出现 `MM README.md`。两列分别描述暂存区相对于 `HEAD` 的变化、工作区相对于暂存区的变化。左侧的 `M` 表示已经暂存了一次修改，右侧的 `M` 表示暂存之后又编辑了文件。`git diff` 应只显示第二次追加；`git diff --staged` 应只显示第一次追加。

如果此时提交，只有第一次追加进入历史，第二次仍留在工作区。下面选择把两次变化合并成一个文档目标，所以再次暂存并检查：

```bash
git add README.md
git diff --staged --check
git diff --staged
git commit -m "docs: record two local changes"
git show HEAD -- README.md
```

`--check` 会检查差异中的部分空白错误，不能替代语法检查和内容审查。预期最后的 `show` 同时包含两次追加。如果只想提交某些段落，可用 `git add -p -- README.md` 交互选择，但要逐块阅读上下文，避免选中一半逻辑形成不可运行的快照。新文件的交互暂存另有步骤，初学时先显式暂存完整文件。

## 文件选择、忽略规则与撤销边界

明确文件名通常比直接使用 `git add .` 更可控。后者覆盖当前目录范围内的多类变化，容易把临时输出或无关编辑一起暂存；`git add -A` 则默认更新整个工作树范围内的新增、修改和删除。两者不是危险命令，但都需要先查看状态，尤其在多人共享工作区或生成文件较多时。

```bash
printf 'scratch output\n' > notes.tmp
printf '*.tmp\n' > .gitignore
git status --short
git check-ignore -v notes.tmp
git add .gitignore
git commit -m "chore: ignore temporary notes"
printf '\nKeep this draft.\n' >> README.md
git add README.md
git restore --staged -- README.md
git status --short
git diff -- README.md
```

预期忽略规则命中 `notes.tmp`，短状态不列出它；最后 `README.md` 显示为尚未暂存的修改，追加内容仍在磁盘上。`.gitignore` 只影响未跟踪文件的默认发现，不会让已经跟踪的文件停止跟踪，更不是敏感信息保护机制。密码一旦进入提交，之后加入忽略规则也不会移除历史中的泄漏内容。

这里的 `git restore --staged` 默认从 `HEAD` 恢复暂存区，保留工作区。与之不同，`git restore -- README.md` 默认从暂存区覆盖工作区，会丢弃尚未暂存的内容，因此本文不把它作为默认清理步骤。想“取消暂存”和想“删除修改”必须分别表达。尚未提交的文字未必能由 Git 找回，应先另存或提交到临时分支。

## 读历史与定位常见错误

`git log --oneline` 适合快速浏览，`git show` 适合查看某个提交实际改了什么，`git diff HEAD -- README.md` 则比较当前工作区和最近提交。使用路径前的 `--` 可以区分路径与选项或提交名称，不是多余装饰。较长输出可能进入分页器，按 `q` 退出；不要把分页器等待输入误认为命令卡死。

遇到 `Author identity unknown`，检查当前仓库的 `user.name` 与 `user.email`，不需要为了实验改全局配置。遇到 `not a git repository`，先用 `pwd` 确认目录，再用 `git rev-parse --show-toplevel` 检查仓库根。不要看见报错就反复执行 `git init`，这可能把不相关目录意外变成仓库。

“提交成功但遗漏文件”通常来自未跟踪或未暂存内容，先看两列状态，再看两份差异。“提交了旧版本”通常来自暂存后又编辑文件。`git commit -a` 只自动处理已跟踪文件的修改和删除，不能自动加入所有新文件；初学时显式 `add` 更容易解释结果。

“撤销以后文件不见了”则需要判断撤销改变了哪个区域，不能马上继续执行更多清理命令。先停止写入，保留日志和终端输出，再阅读本组的[冲突与历史恢复](/tutorials/git/recovery.html)。Git 不是任意磁盘操作的时光机，这个边界比多记一个命令更重要。

## 提交对象、路径与可复查记录

文件内容对象、目录树对象和提交对象承担不同职责。相同内容可以复用同一个内容对象，目录树把名称、模式和对象关联起来，提交再指向树与父提交。因此文件重命名通常不是单独保存一条“移动指令”，差异展示会根据内容相似性判断重命名；不要把界面识别到的 rename 当成某个永久独立历史对象。

```bash
git rev-parse --show-toplevel
git rev-parse --verify HEAD
git cat-file -t HEAD
git show HEAD:README.md
git log --oneline -- README.md
```

预期对象类型为 `commit`，历史文件内容不包含最后尚未提交的 `Keep this draft`。冒号形式读取指定提交树里的路径，不会覆盖工作区；它适合在修改文件前对照旧版本。路径日志是定位线索，但复杂重命名或多分支历史仍需结合完整日志，不把某一视图当成绝对完整审计。

检查时尽量记录具体提交哈希和命令，而不是只写“最新版本”。`HEAD` 会随提交移动，同事明天看到的 HEAD 可能不同。哈希能标识对象，但对象必须在对方仓库可获得；只发送一串哈希并不等于已经共享代码。稳定记录与明确同步范围，是后续协作的基础。

## 练习与完成标准

在实验仓库创建 `plan.md`，写入两段文字，只把第一版暂存，然后追加第三段。先不提交，用自己的话预测短状态和两份差异，再运行命令核对。取消暂存后确认三段文字仍在文件中，重新暂存并提交，最后用 `git show` 确认提交只涉及预期文件。

完成标准是你能指出每段内容目前位于哪里，能解释干净状态的含义，并能在取消暂存前后证明工作区没有丢失文字。不要仅以“命令没有红字”作为完成依据。保留忽略的 `notes.tmp`，检查它为什么不出现在状态中，这会帮助你区分版本管理与磁盘管理。

继续学习[分支与团队协作](/tutorials/git/workflow.html)时，仍然沿用同一个判断顺序：先确认当前位置和状态，再预测命令的影响，最后观察实际差异。也可返回[教程目录](/tutorials/)选择学习路径。

## 官方参考

- [Git 官方教程](https://git-scm.com/docs/gittutorial)：初始化、暂存和提交的完整说明。
- [git-status](https://git-scm.com/docs/git-status)：短状态两列的定义。
- [git-add](https://git-scm.com/docs/git-add)：暂存路径、交互模式与范围。
- [git-restore](https://git-scm.com/docs/git-restore)：恢复来源与目标区域。
- [gitignore](https://git-scm.com/docs/gitignore)：忽略规则及已跟踪文件的边界。
