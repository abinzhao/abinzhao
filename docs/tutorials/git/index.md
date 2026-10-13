---
title: 00 开发环境与 Git
description: 从命令行、Git 初始化到发布第一个远程仓库。
---

# 00 开发环境与 Git

<p class="content-lead">
这一阶段解决一个最基础也最重要的问题：如何稳定地创建、保存、撤销和发布自己的代码。完成后，你会拥有一个规范的本地项目和一个公开的 GitHub 仓库。
</p>

## 章节目录

1. [终端、路径与开发环境](./setup/terminal)：从文件、进程和端口建立运行环境。
2. [提交、差异与撤销](./workflow/version-control)：理解快照与暂存区，安全恢复错误。
3. [分支、冲突与协作](./workflow/branches)：制造并解决一次冲突，理解远端同步。

每次实验使用独立目录。以下快速体验可以先建立直觉，再按章节深入；不要在已有工作仓库中执行练习。

## 本章目标

- 知道终端、目录和文件路径分别是什么。
- 能够初始化 Git 仓库并完成第一次提交。
- 理解工作区、暂存区和提交历史的关系。
- 把本地代码推送到 GitHub 或 Gitee。

## 第一次提交

新建一个空目录，并在终端进入这个目录：

```bash
mkdir hello-fullstack
cd hello-fullstack
git init
```

创建 README：

```md
# Hello Fullstack

这是我的第一个 Git 项目。
```

查看当前状态：

```bash
git status
```

将文件加入暂存区并提交：

```bash
git add README.md
git commit -m "docs: add project readme"
```

## 为什么要有暂存区

工作区表示你正在修改的内容，暂存区表示你准备放进下一次提交的内容。两者分开后，一次提交可以只包含一个清楚的目的，而不是把所有改动混在一起。

## 效果验证

执行：

```bash
git log --oneline
```

输出中应出现刚才的提交：

```text
<commit-id> docs: add project readme
```

## 常见错误

### Git 不知道你的身份

首次提交可能提示缺少用户名和邮箱。只对当前项目配置：

```bash
git config user.name "你的名字"
git config user.email "you@example.com"
```

### 提交了不需要的文件

在项目根目录创建 `.gitignore`，先排除依赖、构建产物和本地配置，再进行提交。

## 阶段练习

1. 创建 `index.html`。
2. 在 README 中写明项目目标。
3. 分别提交文档和页面，保持每次提交只做一件事。
4. 在 GitHub 创建空仓库，并按照页面提示添加远程地址和推送。

下一步：[进入前端三剑客](../frontend-basics/)
