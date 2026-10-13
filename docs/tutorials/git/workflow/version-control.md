---
title: 提交、差异与撤销
description: 用快照理解工作区、暂存区和历史，选择可恢复的撤销方式。
---

# 提交、差异与撤销

## 学习目标

创建三次有清楚目的的提交，区分尚未提交的修改与历史提交，学会在保留证据的前提下恢复错误。

## Git 保存的是快照

提交记录完整项目树、父提交、作者信息和消息。修改后的文件不会自动进入历史，`git add` 把当前文件内容写入暂存区，`git commit` 再将暂存区组成一个快照。

如果 `git add` 后继续编辑同一个文件，暂存区和工作区就包含两个版本。`git diff` 比较工作区与暂存区，`git diff --staged` 比较暂存区与 HEAD。

<ConceptFlow :steps="['工作区', 'git add', '暂存区', 'git commit', '提交历史']" caption="提交保存的是暂存区的版本；每个箭头都需要显式操作。" />

## 建立练习项目

使用新的练习目录，避免把实验混入真实项目：

```bash
mkdir git-snapshots
cd git-snapshots
git init
git config user.name "Learning Developer"
git config user.email "learner@example.com"
```

这两条配置只作用于当前仓库，示例邮箱不要用于需要真实身份的签名或业务系统。

创建下列文件：

::: code-group
```md [README.md]
# Git 快照实验

每次提交只记录一个可以解释的改动。
```
```text [.gitignore]
node_modules/
dist/
.env
.env.local
*.log
```
:::

忽略规则只影响尚未跟踪的文件。已经提交的 `.env` 不会因为新增忽略规则从历史中消失；若误提交凭据，应立即撤销凭据并处理历史，不能只删除当前文件。

```bash
git status --short
git add README.md .gitignore
git diff --staged
git commit -m "docs: initialize snapshot exercise"
```

## 观察暂存区的独立性

在 README 末尾加 `第一步：观察差异。`，执行：

```bash
git add README.md
```

再追加 `第二步：保存快照。`，执行：

```bash
git diff
git diff --staged
git status --short
```

第一条只显示“第二步”，第二条只显示“第一步”。短状态的第一列是暂存区，第二列是工作区，`MM` 表示两边都被修改。

现在重新暂存最新内容并提交：

```bash
git add README.md
git commit -m "docs: describe snapshot workflow"
git log --oneline --decorate -3
```

## 撤销必须先判断改动在哪里

| 目的 | 操作 | 影响 |
| --- | --- | --- |
| 从暂存区拿回文件 | `git restore --staged README.md` | 工作区修改保留 |
| 保存临时改动再切任务 | `git stash push -u -m "work in progress"` | 临时收起跟踪与未跟踪文件 |
| 恢复临时改动 | `git stash apply` | 应用后 stash 记录仍保留 |
| 撤销已提交的错误 | `git revert <commit-id>` | 新建反向提交，历史保留 |
| 查看旧版本 | `git show HEAD~1:README.md` | 只读取，不修改工作区 |

不要把 `git reset --hard` 当作日常撤销：它会丢弃工作区与暂存区的修改。`git restore README.md` 同样会覆盖该文件尚未暂存的内容。先查看差异并保存重要内容，再选择操作。

## 用 revert 保留错误与修复过程

在 README 写一行“临时错误说明”，提交后执行：

```bash
git add README.md
git commit -m "docs: add temporary incorrect note"
git revert HEAD --no-edit
git log --oneline -4
```

这里 `HEAD` 指刚提交的错误。`revert` 应删除错误行并增加一条 `Revert` 提交。多人协作时历史保留有助于追踪，也不需要强制推送。

如果工作区还有未提交修改，先处理它们。Revert 遇到冲突时也会暂停；确认冲突来源再解决，不能为“成功”而丢掉其他内容。

## 效果验证

1. 日志包含初始化、描述工作流、错误、Revert 四个提交。
2. README 包含两步说明，不包含临时错误。
3. `git status --short` 没有输出。
4. `git show HEAD` 可看到反向差异；不用猜 Git 做了什么。

## 常见错误

“提交之后文件还显示修改”：检查是否在 `git add` 后再次编辑。提交记录的是暂存版本。

“忽略文件仍然被跟踪”：先确认是否已经进入历史。只在当前版本解除跟踪可用 `git rm --cached 文件名`，但敏感信息的历史问题仍然存在。

“revert 提示本地修改会被覆盖”：停止操作，查看 `git diff`。保存或先提交自己的工作，再继续。

## 练习与验收

只暂存 README 的一部分，分别解释 `git diff` 和 `git diff --staged`；然后取消暂存，确认内容没有丢失。验收标准：可以在不运行破坏性命令的情况下恢复练习错误，并由日志说明全过程。

## 延伸阅读

- [Git：记录每次更新](https://git-scm.com/book/zh/v2/Git-基础-记录每次更新到仓库)
- [git restore](https://git-scm.com/docs/git-restore)
- [git revert](https://git-scm.com/docs/git-revert)
