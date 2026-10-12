---
title: Git 冲突处理、撤销边界与历史恢复
description: 从冲突现场出发，安全选择 restore、revert、reset 与 reflog，避免二次丢失。
type: tutorial
topic: git
section: foundation
order: 30
level: advanced
status: published
tags:
  - Git
  - 冲突
  - 恢复
prerequisites:
  - /tutorials/git/workflow.html
comments: true
---

# Git 冲突处理、撤销边界与历史恢复

恢复操作的第一原则是先停止扩大现场，而不是立即寻找一条“万能撤销”命令。Git 能帮助恢复仍存在于对象库中的提交，却不保证找回从未提交的编辑、被清理的未跟踪文件或外部工具覆盖的内容。明确这条边界，才能把撤销用在正确区域。

## 前置条件与恢复决策

本文面向已经理解[分支协作](/tutorials/git/workflow.html)的读者，使用 Git 2.28 及以上。所有写操作只在新建临时仓库运行，不涉及生产分支或远程推送。遇到真实事故时，先记录 `pwd`、`git status`、近期日志和刚执行的命令；磁盘空间允许时保留独立副本，不要马上运行清理或垃圾回收。

先回答四个问题：内容是否提交过，提交是否共享，当前是否处于 merge 或 rebase 中，未提交内容是否需要保留。已经共享的错误通常用新增反向提交处理；私人提交可以考虑整理历史，但要先建立备份引用。未提交编辑应先另存，不能只靠分支备份，因为分支只指向提交。

| 目标 | 常用选择 | 主要影响 |
| --- | --- | --- |
| 取消暂存、保留编辑 | `restore --staged` | 暂存区 |
| 从指定提交取回单个文件 | `restore --source` | 指定目标区域 |
| 撤销共享提交的效果 | `revert` | 新增反向提交 |
| 移动私人分支、保留编辑 | `reset --soft` 或默认 mixed | 引用，可能包括暂存区 |
| 找到引用过去的位置 | `reflog` | 读取本地历史记录 |

这张表不是自动执行清单。尤其 `restore` 写工作区时会覆盖内容，`reset` 的模式决定是否覆盖工作区；名字里有“恢复”并不意味着不会丢东西。

## 构造并阅读合并冲突

下面在同一行制造两个不同修改。最后一次 merge 应报告冲突并返回非零，这是故意建立的失败现场，不是实验需要立即隐藏的错误。

```bash
lab=$(mktemp -d)
cd "$lab"
git init -b main
git config user.name "Recovery Learner"
git config user.email "recovery@example.invalid"
git config commit.gpgsign false
printf 'mode=basic\n' > settings.txt
git add settings.txt
git commit -m "chore: add initial mode"
git switch -c feature/mode
printf 'mode=feature\n' > settings.txt
git add settings.txt
git commit -m "feat: propose feature mode"
git switch main
printf 'mode=stable\n' > settings.txt
git add settings.txt
git commit -m "fix: choose stable mode"
git merge feature/mode
```

先不要继续提交，用只读命令检查现场：

```bash
git status
git diff -- settings.txt
git ls-files -u
git show :1:settings.txt
git show :2:settings.txt
git show :3:settings.txt
```

预期状态标明未合并路径，`ls-files -u` 列出暂存区冲突阶段。第一阶段是共同基线，第二阶段是 ours，第三阶段是 theirs。在本次普通 merge 中，ours 是当前 `main` 的 `mode=stable`，theirs 是正在合入的功能分支。不要把“ours 永远是我写的代码”当定律。

冲突标记只告诉你机械合并失败的区域，不会替你决定业务正确性。相邻配置、调用点和测试都可能受到影响，即使最后文本没有冲突标记，也可能组合成错误逻辑。查看双方提交目的，再选择最终语义，是解决冲突的核心工作。

## 解决、验证或退出冲突

实验决定保留稳定模式，并把功能提案改成单独的开关。这里显式重写的只是实验文件，真实代码应结合上下文编辑。

```bash
printf 'mode=stable\nfeature_enabled=true\n' > settings.txt
git add settings.txt
git diff --cached
git diff --cached --check
git status
git commit -m "merge: keep stable mode with feature flag"
git log --oneline --graph --decorate -6
git show HEAD:settings.txt
git status --short
```

预期新提交有两个父提交，最终文件有两行且不含冲突标记，短状态为空。`git add` 在此表示“把这个路径标记为已解决并暂存结果”，不是证明内容正确。实验文件是配置文本，所以查看内容即可验证示例；真实程序还需运行相关测试，本章不能替你宣称那些测试通过。

如果尚未解决且决定退出，使用 `git merge --abort`。它针对正在进行的 merge，不能用来撤销已经完成的合并提交。合并前若有复杂的未提交修改，abort 未必能完整恢复所有编辑，因此更可靠的流程是在开始合并前整理或备份工作区。退出之前产生的重要人工解决内容也要另存。

rebase 冲突则使用 `git rebase --continue`、`git rebase --abort`，不是 merge 的命令。解决路径后先 `add`，再继续。`--skip` 会跳过当前正在重放的整个提交，不只是跳过冲突行，必须确认这正是期望。变基期间 ours 通常表示已重建的新基线，theirs 表示被重放的提交，容易与开发者直觉相反。与其盲选整份 ours/theirs，不如读取阶段内容和当前提交说明。

## 不丢编辑的撤销与反向提交

先用最安全的取消暂存展示区域边界：

```bash
printf '\nreview_note=keep\n' >> settings.txt
git add settings.txt
git restore --staged -- settings.txt
git diff -- settings.txt
git status --short
git add settings.txt
git commit -m "docs: keep recovery review note"
```

预期取消暂存后 `review_note` 仍在工作区。默认 `restore --staged` 从 `HEAD` 恢复暂存区，默认不带 `--staged` 的 restore 则从暂存区恢复工作区。两者恢复来源与目标都不同，所以操作前一定要明确想保留哪份内容。

接着把一次已经提交的实验错误用 revert 撤销：

```bash
printf 'temporary_debug=true\n' > debug.txt
git add debug.txt
git commit -m "chore: add temporary debug flag"
git revert --no-edit HEAD
git log --oneline -3
git status --short
git ls-tree --name-only HEAD
```

预期历史中同时存在错误提交和反向提交，当前树不再包含 `debug.txt`。revert 不抹除历史，也不保证无冲突；错误之后如果又有依赖修改，反向应用可能需要人工处理。撤销合并提交还需要指定主线父提交，并影响未来再次合并的行为，不应随手把普通提交的示例套上去。

`git commit --amend` 可以修改最近私人提交的内容或说明，但会生成新提交身份。`git reset --soft HEAD~1` 则移动当前引用，保留暂存区和工作区；默认 mixed reset 还重置暂存区，工作区通常保留。它们不是共享分支的默认修复方式。`reset --hard` 会重置工作区，并可能覆盖阻碍恢复的未跟踪路径；本文只说明危险，不提供一键执行块。

`git clean` 针对未跟踪文件，不是撤销提交。`git clean -n` 是预览，但带删除选项后会实际移除文件，通常不能靠 reflog 找回。不要把 `reset --hard` 加 `clean` 包装成通用“修复环境”步骤，这会把有价值的事故证据一并清掉。

## 用 Reflog 找回被改写的提交

reflog 记录本地引用曾经指向哪里，包括提交、切换、变基和重置带来的变化。它不等于远程审计日志，不会自动包含另一台电脑的所有操作，也不是无限期备份。下面用 amend 制造一个容易恢复的旧提交：

```bash
git switch -c recovery/reflog-demo
printf 'first version\n' > rescue.txt
git add rescue.txt
git commit -m "docs: add first rescue version"
git branch backup/rescue-original
printf 'revised version\n' > rescue.txt
git add rescue.txt
git commit --amend -m "docs: revise rescue version"
git reflog show --date=iso HEAD
git show 'HEAD@{1}:rescue.txt'
git branch rescue/from-reflog 'HEAD@{1}'
git show rescue/from-reflog:rescue.txt
git log --oneline --decorate --all -8
```

在这个紧接 amend 的连续步骤中，`HEAD@{1}` 预期指向 amend 前的提交，文件内容是 `first version`。如果你额外切换过分支、提交或执行了会移动引用的命令，序号会改变；真实恢复必须先读 reflog，再选对应哈希。使用单引号保护带花括号的表达式，避免 shell 解释。

创建 `rescue/from-reflog` 是为了让旧提交重新有可达引用，而不是立即重置当前工作。之后可以从该分支取出特定文件、比较差异或 cherry-pick 所需提交，选择哪一种取决于目标。先建立救援分支，再决定如何整合，比直接把当前分支重置到猜测的位置更稳妥。

对象可能受 reflog 过期和垃圾回收影响，因此不要在事故后主动运行 `gc` 或 prune。默认保留期限可以配置，不能把“通常还有记录”当作长期保障。对于从未提交的代码，优先查编辑器本地历史、备份和文件系统快照；Git 不能保证恢复，已经 add 过的对象也不等于有方便可靠的恢复入口。

## 单文件找回与整条历史恢复

找回旧文件不一定要移动当前分支。先读取历史内容，再把需要的版本输出到仓库外的临时文件，人工比较，能降低覆盖当前工作的风险。下面从已建立的救援分支读取，不修改当前 `rescue.txt`：

```bash
recovered=$(mktemp)
git show rescue/from-reflog:rescue.txt > "$recovered"
printf 'Recovered copy: %s\n' "$recovered"
cat "$recovered"
git diff rescue/from-reflog HEAD -- rescue.txt
```

预期临时文件包含第一版，差异显示它与当前修订版不同。输出重定向会写文件，因此仍要使用新建路径；如果 `git show` 找不到提交或路径，应检查退出状态，不能把空输出误认成旧版本本来为空。

只需要一处内容时可以编辑当前文件并提交新修复，不必重放整条历史。需要完整提交时，cherry-pick 会在当前分支应用那个提交的变化并生成新的身份，可能发生冲突；它不是把分支整体替换过去。恢复包含多个提交的功能时，还要检查提交依赖和顺序，单独拿最后一次修复未必能运行。

恢复结束后记录事故前引用、救援引用、整合提交和未找回范围，保留备份直到验证完成。若提交对象已经不在本机，且其他克隆也没有，就不能保证从哈希重建原内容；哈希是标识，不是可以解码出文件的压缩包。及时保存可达引用与异地备份，才是长期恢复能力。

## Stash 边界、常见错误与练习

暂时离开工作时，可先检查差异，再用 `git stash push -m "before review"` 保存已跟踪的改动；未跟踪文件默认不包含，使用 `-u` 才包含未跟踪文件，忽略文件另有范围。stash 也在本地，不自动推到远程。恢复优先 `git stash apply`，核对后再决定是否 drop；`pop` 成功时会移除记录，冲突时需要读状态确认，不应连着重复恢复。

常见二次损失来自把“冲突”当成命令未执行，然后再次 merge 或 reset；来自没看当前操作类型就用错误的 abort；也来自把 `HEAD@{1}` 当固定含义。每次恢复只做一个可解释步骤，随即检查状态和差异，发现结果不符就停下来。

练习在另一个临时仓库制造同一行冲突，记录三个阶段内容，先尝试 abort，再重新合并并手工解决。然后 amend 一个私人提交，通过 reflog 创建救援分支，确认旧文件仍可读取。最后写出“未暂存编辑、已暂存编辑、未共享提交、已共享提交”四种情形的保留策略。

完成标准不是会背四种撤销命令，而是能在执行前说清来源、目标和损失边界，执行后展示文件内容与历史证据。真实敏感信息泄漏属于安全事件，删除最新文件或 revert 都不会移除旧历史中的秘密，应立即撤销凭据并遵循团队事故流程。

## 官方参考

- [git-merge](https://git-scm.com/docs/git-merge)：冲突阶段、解决与 abort 限制。
- [git-revert](https://git-scm.com/docs/git-revert)：反向提交和合并主线。
- [git-reset](https://git-scm.com/docs/git-reset)：各模式影响区域。
- [git-reflog](https://git-scm.com/docs/git-reflog)：本地引用日志及过期。
- [git-stash](https://git-scm.com/docs/git-stash)：保存范围和恢复行为。
