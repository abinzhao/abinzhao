---
title: 分支、冲突与协作
description: 在本地制造并解决一次冲突，理解分支、合并和远端同步。
---

# 分支、冲突与协作

## 学习目标

创建功能分支、制造文本冲突、解释合并结果，并掌握推送前的差异审查。先在新目录练习，远端部分仅在自己的实验仓库执行。

## 分支是移动的提交指针

分支不是复制一份目录。它为提交提供名字，新提交会使当前分支前进。`HEAD` 通常指向当前分支。两个分支修改同一区域，Git 不知道产品应该采用哪个版本，于是请求人工选择。

Fast-forward 合并表示目标分支没有独立的新提交，只需向前移动指针。双方都新增提交时，需要合并快照。Rebase 会重新生成提交，改变提交 ID；共享分支不应随意重写。

## 可重复的本地冲突实验

```bash
mkdir git-conflict-lab
cd git-conflict-lab
git init -b main
git config user.name "Learning Developer"
git config user.email "learner@example.com"
```

创建 `message.txt`：

```text [message.txt]
欢迎开始学习 Web。
```

```bash
git add message.txt
git commit -m "docs: add welcome"
git switch -c feature/greeting
```

把唯一一行改为：

```text [message.txt]
欢迎开始学习前端开发。
```

```bash
git add message.txt
git commit -m "docs: update frontend greeting"
git switch main
```

在 main 把相同行改为：

```text [message.txt]
欢迎开始学习全栈开发。
```

```bash
git add message.txt
git commit -m "docs: update fullstack greeting"
git merge feature/greeting
```

## 冲突标记表达什么

```text [message.txt]
[当前分支 HEAD]
欢迎开始学习全栈开发。
[冲突分隔线]
欢迎开始学习前端开发。
[来源分支 feature/greeting]
```

真实文件中的标记分别以 `<<<<<<<`、`=======`、`>>>>>>>` 开头。`HEAD` 是当前 main 内容，分隔线下方来自功能分支。解决冲突不是机械地删除其中一侧，而是确定最终含义。这里两句话可以结合成：

```text [message.txt]
欢迎从前端开始，学习完整的全栈开发。
```

```bash
git add message.txt
git diff --staged
git commit -m "docs: merge learning greetings"
git log --graph --oneline --all
```

提交之前检查文件没有 `<<<<<<<`、`=======`、`>>>>>>>`。真实代码冲突还要运行相关测试；没有冲突标记不代表逻辑正确。

如果暂时无法判断，`git merge --abort` 尝试回到合并前。合并前保持干净工作区，可以减少中断恢复的不确定性。

## 远端是共享提交的入口

在自己账号下创建空实验仓库，复制平台提供的地址，替换下方占位地址。不要把它原样执行：

```bash
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
git remote -v
git push -u origin main
```

HTTPS 身份验证按平台流程完成。不要把令牌写进 URL、代码或文档。`-u` 建立本地与远端跟踪关系，后续状态可以显示领先与落后。

```bash
git fetch origin
git log --oneline main..origin/main
git diff main..origin/main
```

`fetch` 取得远端提交但不修改当前文件。确认需要的变更后，在干净工作区用 `git merge origin/main` 合并；`git pull` 则组合了获取与集成，行为会受仓库配置影响。

`push rejected` 通常意味着远端有你尚未取得的提交。先 fetch 并检查，不要马上强制推送。

## 用评审缩小一次变更

在功能分支实现一个清楚目标，提交前核对：

```bash
git status --short
git diff
git diff --staged
```

提交后查看与基线差异：

```bash
git diff main...feature/greeting
```

三点比较使用共同祖先，适合观察功能分支做了什么。两点比较则比较两个快照本身。评审应写明问题、改动行为和验证结果，避免一个提交混入重命名、格式化与无关功能。

## 效果验证与练习

本地日志出现分叉与合并提交，`message.txt` 只有最终一句话，`git status` 干净。然后新建两个分支分别修改不同文件，验证是否能自动合并，并解释这次为什么没有文本冲突。

验收标准：能够区别“文本冲突”“逻辑冲突”和“远端拒绝推送”，知道应在何处看证据；不用强制推送完成同步。

## 延伸阅读

- [Git：分支与合并](https://git-scm.com/book/zh/v2/Git-分支-分支的新建与合并)
- [Git：远程仓库](https://git-scm.com/book/zh/v2/Git-基础-远程仓库的使用)
