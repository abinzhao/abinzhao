---
title: Git 分支、远程同步与团队协作
description: 在本地模拟两名协作者，理解分支、远程跟踪、合并与变基的协作边界。
type: tutorial
topic: git
section: foundation
order: 20
level: intermediate
status: published
tags:
  - Git
  - 分支
  - 协作
prerequisites:
  - /tutorials/git-basics.html
comments: true
---

# Git 分支、远程同步与团队协作

团队协作的难点不是“把文件上传”，而是在不同开发者各自推进历史时，仍能知道谁基于哪个版本工作，哪些变化已经整合，以及谁有权改写共享历史。本文把远程仓库也放在临时目录中，用两个克隆模拟协作者，不需要真实账号或网络推送。

## 前置条件与分支模型

先完成[Git 基础与工作模型](/tutorials/git-basics.html)，能区分工作区、暂存区和提交。示例要求 Git 2.28 及以上，终端使用 Bash 或兼容的交互环境。所有提交身份和签名设置只限定在实验克隆中，代码里的 `push` 目标是本机临时裸仓库，不是团队服务器。

分支不是复制整个目录，而是一个指向提交的引用。`git switch -c feature/readme` 从当前提交建立分支并切换到它，此后提交只推进这个分支。多个分支可以指向同一提交；删除分支名称不等于立即删除提交对象。分支便宜，但不意味着可以忽略分支上的工作归属。

推荐把 `main` 理解成团队约定的整合入口，把功能分支理解成可审查的改动单元。Git 本身不规定哪条分支能发布，也不提供业务审批；保护分支、评审和持续集成是托管平台与团队流程补充的约束。开始工作前，要知道主分支名、合并策略和评审要求，不能仅凭教程替团队制定规则。

## 搭建完全本地的协作实验

裸仓库没有日常编辑用的工作区，适合作为共享对象和引用的接收端。下面生成三个目录：共享仓库、Alice 克隆、Bob 克隆。克隆空仓库时出现空仓库提示是预期现象。

```bash
lab=$(mktemp -d)
git init --bare -b main "$lab/remote.git"
git clone "$lab/remote.git" "$lab/alice"
git -C "$lab/alice" config user.name "Alice Tutorial"
git -C "$lab/alice" config user.email "alice@example.invalid"
git -C "$lab/alice" config commit.gpgsign false
printf '# Team demo\n\nShared starting point.\n' > "$lab/alice/README.md"
git -C "$lab/alice" add README.md
git -C "$lab/alice" commit -m "docs: establish shared starting point"
git -C "$lab/alice" push -u origin main
git clone "$lab/remote.git" "$lab/bob"
git -C "$lab/bob" config user.name "Bob Tutorial"
git -C "$lab/bob" config user.email "bob@example.invalid"
git -C "$lab/bob" config commit.gpgsign false
git -C "$lab/bob" remote -v
git -C "$lab/bob" branch -vv
```

预期 Bob 的远程地址是 `lab` 内的本地路径，当前分支是 `main`，跟踪 `origin/main`。`-u` 给本地分支设置 upstream，让后续命令知道默认比较和推送对象；它不是创建远程仓库的命令。真实项目应先审查 `remote -v`，避免把实验或私人内容发送到错误地址。

`git -C` 让命令在指定仓库运行，不改变当前终端目录。文件写入也使用完整实验路径，因此不依赖你此前在哪个项目中。不过变量只在当前终端会话里存在，换终端后不要直接继续，要先找回实验路径并重新设置 `lab`。

## 功能分支与提交审查

Alice 从共享起点创建功能分支，新增独立文档。这里不修改 Bob 之后要编辑的行，先观察无冲突的协作。

```bash
git -C "$lab/alice" switch -c feature/guide
printf 'Run the demo locally before requesting review.\n' > "$lab/alice/guide.md"
git -C "$lab/alice" add guide.md
git -C "$lab/alice" diff --staged
git -C "$lab/alice" commit -m "docs: add local review guide"
git -C "$lab/alice" log --oneline main..feature/guide
git -C "$lab/alice" diff main...feature/guide
git -C "$lab/alice" push -u origin feature/guide
```

`main..feature/guide` 在日志中表示能从功能分支到达、但不能从 `main` 到达的提交。`git diff main...feature/guide` 则比较两分支共同祖先与功能分支端点，常用于理解功能分支贡献。日志的双点和差异的三点不是随意替换的标点，它们解决不同问题。

在真实平台中，接下来发起合并请求，写清目的、验证结果和已知限制。评审重点是这组提交是否形成可理解的行为变化，而不是只检查文件名。构建未运行就写“未运行”，不能因为 Git 提交成功就把测试状态写成通过。

## Fetch、远程跟踪与显式整合

Bob 在 `main` 上补充说明，然后推送到实验共享仓库。Alice 此时的本地 `main` 和 `origin/main` 都不会自动知道这个变化。

```bash
printf '\nBob adds a shared note.\n' >> "$lab/bob/README.md"
git -C "$lab/bob" add README.md
git -C "$lab/bob" commit -m "docs: add team note"
git -C "$lab/bob" push origin main
git -C "$lab/alice" fetch origin
git -C "$lab/alice" log --oneline --graph --decorate --all
git -C "$lab/alice" status --short --branch
git -C "$lab/alice" merge origin/main
git -C "$lab/alice" push origin feature/guide
```

`fetch` 下载对象并更新远程跟踪引用，通常不修改当前工作区和本地功能分支。图中应能看到 Bob 的提交和 Alice 的功能提交分叉。`merge origin/main` 才把整合分支的变化引入当前功能分支，这里通常会形成合并提交。如果进入提交说明编辑器，确认默认说明并正常退出即可；不同机器的默认编辑器可能不同。

`pull` 可以理解成先获取再按配置整合，但整合可能采用 merge、rebase 或仅允许快进。教程采用 `fetch` 后显式选择，是为了让影响可见。真实日常工作中可用团队认可的 `git pull --ff-only` 更新整合分支：只有本地分支能直接前移时才成功，发生分叉则拒绝，不会帮你悄悄决定如何改写历史。

此刻 Alice 的功能分支包含两人的改动，检查文件和历史后，再模拟评审批准后的合并。下面的推送仍然只是本地实验；真实团队应经保护分支流程，不照抄直接推主分支。

```bash
git -C "$lab/alice" switch main
git -C "$lab/alice" merge --ff-only origin/main
git -C "$lab/alice" merge --no-ff feature/guide -m "merge: integrate reviewed guide"
git -C "$lab/alice" push origin main
git -C "$lab/bob" fetch origin
git -C "$lab/bob" merge --ff-only origin/main
git -C "$lab/bob" log --oneline --graph --decorate -8
git -C "$lab/bob" status --short
```

预期 Bob 的工作区同时有 `README.md` 和 `guide.md`，短状态为空。`--no-ff` 即使能快进，也保留明确的合并节点；是否使用它取决于团队历史策略，并不是比快进普遍更好。

## Merge 与 Rebase 的选择边界

merge 保留已有提交及其关系，通过合并节点表达历史汇合。rebase 则把一组提交在新基点上重新应用，通常生成新的提交哈希。变化内容可能看似相同，但历史身份已经不同。它适合整理尚未共享的个人分支，不应随意用于多人依赖的分支。

在实验中创建尚未推送的私人分支，再让 Bob 推进主分支。两人修改不同文件，便于观察变基本身：

```bash
git -C "$lab/alice" switch -c feature/private
printf 'A private checklist.\n' > "$lab/alice/checklist.md"
git -C "$lab/alice" add checklist.md
git -C "$lab/alice" commit -m "docs: add private checklist"
git -C "$lab/alice" branch backup/private-before-rebase
printf '\nAnother team note.\n' >> "$lab/bob/README.md"
git -C "$lab/bob" add README.md
git -C "$lab/bob" commit -m "docs: extend team note"
git -C "$lab/bob" push origin main
git -C "$lab/alice" fetch origin
git -C "$lab/alice" rebase origin/main
git -C "$lab/alice" log --oneline --graph --decorate --all -12
```

预期私人提交位于新的 `origin/main` 之后，备份分支仍指向旧提交。备份引用让你能比较变基前后，不是让你在共享分支上无视风险。发生冲突时，每个被重放的提交可能各自停一次，要理解当前步骤，不能盲目重复 `continue`。

`push` 被拒绝为 non-fast-forward 通常表示远程已经有本地没有的历史，或者本地改写了已推送历史。先 `fetch`、检查分叉和所有者，不要直接强推。`--force-with-lease` 比普通强推多了一层远程引用期望检查，但依然会改写共享历史；背景 fetch 还可能影响默认租约依据。必须取得协作者同意并明确目标，本文不提供默认执行的强推步骤。

## 合并请求、压缩提交与版本标记

真实评审常允许 merge、squash 或 rebase merge，最终历史形状不同。squash 把功能分支的变化组合成一个新的整合提交，不保留原提交之间的父子关系；原分支因此不一定被 Git 判断为按历史完整合入。评审页面显示已合并，与本地 `branch -d` 的可达性检查可能不一致，先比较内容与目标提交，再决定是否保留备份。

更新评审分支时说明新增内容与验证范围，避免评审者读完后又悄悄替换所有提交。评审通过绑定的是特定内容状态，不是永久认可某个分支名称。若平台规定新推送撤销审批或重新运行检查，应遵守该策略；本地提交和推送没有提供等价保障。

可以用只读比较确认整合提交包含哪些文件：

```bash
git -C "$lab/alice" log --oneline origin/main..feature/private
git -C "$lab/alice" diff --stat origin/main...feature/private
git -C "$lab/alice" show --name-status origin/main
git -C "$lab/alice" branch --contains origin/main
```

前两条预期只列私人清单的贡献，后两条帮助核对共享端点及本地包含关系。包含关系基于历史图，不是逐行内容相等，因此不能用它证明 squash 后两分支完全相同。内容是否相符还需比较树与差异。

发布标记通常用 tag 固定一个提交，与会继续前移的分支区分。轻量标签与附注标签有不同对象结构，签名标签还依赖团队信任体系。标签名称不是版本代码自动生成器，创建本地标签也不自动发送远程。真正标记发布前要确认提交、构建产物与批准状态一致，本章没有执行任何真实发布。

远程连接方面，SSH 密钥或 HTTPS 凭据解决的是认证与传输，不决定代码评审是否合格。不要把 Token 写进 remote URL、提交说明或示例命令，也不应在终端截图中展示完整认证信息。排查连接时提供脱敏地址、错误类别和工具版本通常足够，权限失败要由仓库管理员确认而不是绕过。

团队交接还应记录尚未合并的分支与依赖，避免只留下本地目录。分支已推送也不表示评审已完成，发布状态应单独确认。

## 常见错误与练习

切换分支失败时，先查看未提交内容是否会被覆盖。不能为了切换方便就丢弃工作；可以先完成提交，或在明确范围后使用 stash。发现“分支怎么一样”，通常是它们目前仍指向同一个提交，不是创建失败。`branch -vv` 和 `log --decorate` 比猜测目录变化可靠。

推送后看不到新文件时，先核对当前分支、远程地址和推送的引用；工作区文件存在，不代表已经提交。发现 `origin/main` 陈旧，先确认是否 fetch。删除本地功能分支前应确认整合结果，`git branch -d` 有历史检查，`-D` 绕过检查，不应成为默认习惯。

练习在新实验目录重复协作，把 Alice 的功能拆成两次提交，预测 `fetch` 前后哪几个引用改变。再让 Bob 与 Alice 同时修改 `README.md` 同一行，先保留现场，不进行强推，进入[冲突、撤销与历史恢复](/tutorials/git/recovery.html)处理。

完成标准是能画出两次分叉和汇合，能说明 fetch 不等于合并、变基为何改变提交身份，并能从日志确认功能已经进入共享历史。练习没有访问真实平台，不能据此声称团队权限、评审或 CI 流程已经验证。

## 官方参考

- [Git 分支基础](https://git-scm.com/book/en/v2/Git-Branching-Branches-in-a-Nutshell)：分支与引用模型。
- [git-fetch](https://git-scm.com/docs/git-fetch)：对象获取和远程跟踪更新。
- [git-merge](https://git-scm.com/docs/git-merge)：快进、合并及冲突行为。
- [git-rebase](https://git-scm.com/docs/git-rebase)：重放提交与共享历史风险。
- [git-push](https://git-scm.com/docs/git-push)：快进限制和租约语义。
